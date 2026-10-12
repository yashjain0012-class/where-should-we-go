"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyVeto, isRoomCode, parseGuestMessage, parseHostMessage, stateFor, type RoomOption, type RoomState,
} from "./room";
import { msg } from "./i18n";
import { RoomError, joinRoom, openHost, type GuestHandle, type HostHandle } from "./roomPeer";

/** What the page needs to know about the room it is in. */
export type RoomView =
  | { role: "host"; status: "starting" | "live" | "error"; code: string; people: number; error?: string }
  | { role: "guest"; status: "joining" | "live" | "ended" | "error"; code: string; people: number; canVeto: boolean; error?: string };

/** What the page does when something arrives. Always called with the latest versions (see `latest` below). */
export interface RoomCallbacks {
  /** Host: the wheel as it is right now. */
  getOptions(): RoomOption[];
  /** Host: a guest vetoed this option, and the rules allow it. */
  onGuestVeto(optionId: string): void;
  /** Guest: the host's wheel changed (also the first thing a guest receives). */
  onState(state: RoomState): void;
  /** Guest: the host spun. */
  onSpin(winnerId: string, ms: number): void;
}

function describe(err: unknown): string {
  if (err instanceof RoomError) {
    if (err.kind === "no-room") return msg("That room doesn't exist any more. Ask the host for a new link.");
    if (err.kind === "unreachable") return msg("Couldn't connect. The room service didn't answer, or your network blocks direct connections between devices.");
    return msg("The room service had a problem. Please try again in a moment.");
  }
  return msg("Something went wrong with the room. Please try again.");
}

export function useRoom(callbacks: RoomCallbacks) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const host = useRef<HostHandle | null>(null);
  const guest = useRef<GuestHandle | null>(null);
  const guests = useRef(new Set<string>());
  const vetoed = useRef(new Set<string>());
  // The newest callbacks, so a message that arrives later still sees current state.
  const latest = useRef(callbacks);
  useEffect(() => {
    latest.current = callbacks;
  });
  // Which room this hook last started, so a slow connection that finishes after "leave" does nothing.
  const generation = useRef(0);

  const people = () => guests.current.size + 1;

  const publish = useCallback((options?: RoomOption[]) => {
    const h = host.current;
    if (!h) return;
    const current = options ?? latest.current.getOptions();
    for (const id of guests.current) h.send(id, stateFor(current, people(), vetoed.current.has(id)));
    setRoom((r) => (r && r.role === "host" ? { ...r, people: people() } : r));
  }, []);

  const leave = useCallback(() => {
    generation.current++;
    host.current?.close();
    guest.current?.close();
    host.current = null;
    guest.current = null;
    guests.current = new Set();
    vetoed.current = new Set();
    setRoom(null);
  }, []);

  const startHost = useCallback(async () => {
    leave();
    const mine = ++generation.current;
    setRoom({ role: "host", status: "starting", code: "", people: 1 });
    try {
      const handle = await openHost({
        onJoin: (id) => {
          if (generation.current !== mine) return;
          guests.current.add(id);
          publish();
        },
        onLeave: (id) => {
          if (generation.current !== mine) return;
          guests.current.delete(id);
          vetoed.current.delete(id);
          publish();
        },
        onMessage: (id, raw) => {
          if (generation.current !== mine) return;
          const message = parseGuestMessage(raw);
          if (!message) return; // anything else is ignored
          const options = latest.current.getOptions();
          const result = applyVeto(options, message.id, vetoed.current.has(id));
          if (result.ok) {
            vetoed.current.add(id);
            latest.current.onGuestVeto(message.id); // the page removes it, and publishes the new wheel
          } else {
            host.current?.send(id, stateFor(options, people(), vetoed.current.has(id)));
          }
        },
      });
      if (generation.current !== mine) {
        handle.close();
        return;
      }
      host.current = handle;
      setRoom({ role: "host", status: "live", code: handle.code, people: 1 });
    } catch (err) {
      if (generation.current === mine) setRoom({ role: "host", status: "error", code: "", people: 1, error: describe(err) });
    }
  }, [leave, publish]);

  const startGuest = useCallback(
    async (code: string) => {
      if (!isRoomCode(code)) return;
      leave();
      const mine = ++generation.current;
      setRoom({ role: "guest", status: "joining", code, people: 1, canVeto: false });
      try {
        const handle = await joinRoom(code, {
          onMessage: (raw) => {
            if (generation.current !== mine) return;
            const message = parseHostMessage(raw);
            if (!message) return;
            if (message.t === "state") {
              setRoom({ role: "guest", status: "live", code, people: message.people, canVeto: message.canVeto });
              latest.current.onState(message);
            } else if (message.t === "spin") {
              latest.current.onSpin(message.winnerId, message.ms);
            } else {
              setRoom({ role: "guest", status: "ended", code, people: 1, canVeto: false });
            }
          },
          onClose: () => {
            if (generation.current !== mine) return;
            setRoom((r) => (r && r.role === "guest" && r.status === "live" ? { ...r, status: "ended", canVeto: false } : r));
          },
        });
        if (generation.current !== mine) {
          handle.close();
          return;
        }
        guest.current = handle;
      } catch (err) {
        if (generation.current === mine) setRoom({ role: "guest", status: "error", code, people: 1, canVeto: false, error: describe(err) });
      }
    },
    [leave],
  );

  const broadcastSpin = useCallback((winnerId: string, ms: number) => {
    host.current?.broadcast({ t: "spin", winnerId, ms });
  }, []);

  const veto = useCallback((optionId: string) => {
    guest.current?.send({ t: "veto", id: optionId });
    // One veto each: switch the button off at once, the host's next state confirms it.
    setRoom((r) => (r && r.role === "guest" ? { ...r, canVeto: false } : r));
  }, []);

  // Closing the page ends the room (host) or says goodbye (guest), so the host's count drops at once
  // instead of waiting for the connection to time out.
  useEffect(() => leave, [leave]);
  useEffect(() => {
    const goodbye = () => {
      host.current?.close();
      guest.current?.close();
    };
    window.addEventListener("pagehide", goodbye);
    return () => window.removeEventListener("pagehide", goodbye);
  }, []);

  return { room, startHost, startGuest, publish, broadcastSpin, veto, leave };
}
