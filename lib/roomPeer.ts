/**
 * The network side of live rooms, using PeerJS (WebRTC with a free public "broker" that only introduces
 * devices to each other; the messages themselves go device to device). Loaded on demand, so people who
 * never open a room never download it. The message rules are in lib/room.ts.
 */
import type { DataConnection, Peer as PeerType } from "peerjs";
import { MAX_ROOM_GUESTS, newRoomCode, peerIdFor, type GuestMessage, type HostMessage } from "./room";

export type RoomErrorKind =
  | "no-room" // nobody is hosting that code (any more)
  | "unreachable" // the broker or the host could not be reached in time
  | "broker"; // the broker refused or failed

export class RoomError extends Error {
  kind: RoomErrorKind;
  constructor(kind: RoomErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

interface PeerConfig {
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
}

const BROKER_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 12_000;

async function loadConfig(): Promise<PeerConfig> {
  try {
    const res = await fetch("/api/peer-config", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    return res.ok ? ((await res.json()) as PeerConfig) : {};
  } catch {
    return {};
  }
}

type PeerConstructor = new (id?: string, options?: Record<string, unknown>) => PeerType;

/** Open a peer and wait until the broker has accepted it. */
function openPeer(Peer: PeerConstructor, id: string | undefined, config: PeerConfig): Promise<PeerType> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, { ...config, debug: 0 }) : new Peer(undefined, { ...config, debug: 0 });
    const timer = setTimeout(() => {
      peer.destroy();
      reject(new RoomError("unreachable", "The room service didn't answer."));
    }, BROKER_TIMEOUT_MS);
    peer.on("open", () => {
      clearTimeout(timer);
      peer.off("error", onError);
      resolve(peer);
    });
    const onError = (err: Error & { type?: string }) => {
      clearTimeout(timer);
      peer.destroy();
      const taken = err.type === "unavailable-id";
      reject(Object.assign(new RoomError("broker", err.message), { taken }));
    };
    peer.on("error", onError);
  });
}

// --- Host --------------------------------------------------------------------------------

export interface HostHandlers {
  onJoin(guestId: string): void;
  onLeave(guestId: string): void;
  onMessage(guestId: string, raw: unknown): void;
}

export interface HostHandle {
  code: string;
  send(guestId: string, message: HostMessage): void;
  broadcast(message: HostMessage): void;
  close(): void;
}

export async function openHost(handlers: HostHandlers): Promise<HostHandle> {
  const [{ Peer }, config] = await Promise.all([import("peerjs"), loadConfig()]);

  let peer: PeerType | null = null;
  let code = "";
  for (let attempt = 0; attempt < 4 && !peer; attempt++) {
    code = newRoomCode();
    try {
      peer = await openPeer(Peer as unknown as PeerConstructor, peerIdFor(code), config);
    } catch (err) {
      if (!(err as { taken?: boolean }).taken) throw err; // only a clash of codes is worth retrying
    }
  }
  if (!peer) throw new RoomError("broker", "Couldn't find a free room code. Please try again.");

  const open = peer;
  const connections = new Map<string, DataConnection>();
  open.on("connection", (conn) => {
    const id = conn.peer;
    conn.on("open", () => {
      if (connections.size >= MAX_ROOM_GUESTS) {
        conn.close();
        return;
      }
      connections.set(id, conn);
      handlers.onJoin(id);
    });
    conn.on("data", (data) => {
      if (connections.get(id) === conn) handlers.onMessage(id, data);
    });
    const left = () => {
      if (connections.get(id) === conn) {
        connections.delete(id);
        handlers.onLeave(id);
      }
    };
    conn.on("close", left);
    conn.on("error", left);
  });

  const sendTo = (conn: DataConnection, message: HostMessage) => {
    try {
      conn.send(message);
    } catch {
      // that guest is gone; its close event will clean up
    }
  };

  return {
    code,
    send: (guestId, message) => {
      const conn = connections.get(guestId);
      if (conn) sendTo(conn, message);
    },
    broadcast: (message) => connections.forEach((conn) => sendTo(conn, message)),
    close: () => {
      connections.forEach((conn) => sendTo(conn, { t: "closed" }));
      setTimeout(() => open.destroy(), 300); // let the goodbye go out first
    },
  };
}

// --- Guest -----------------------------------------------------------------------------

export interface GuestHandlers {
  onMessage(raw: unknown): void;
  onClose(): void;
}

export interface GuestHandle {
  send(message: GuestMessage): void;
  close(): void;
}

export async function joinRoom(code: string, handlers: GuestHandlers): Promise<GuestHandle> {
  const [{ Peer }, config] = await Promise.all([import("peerjs"), loadConfig()]);
  const peer = await openPeer(Peer as unknown as PeerConstructor, undefined, config);

  return new Promise<GuestHandle>((resolve, reject) => {
    const conn = peer.connect(peerIdFor(code), { reliable: true, serialization: "json" });
    let opened = false;
    const fail = (error: RoomError) => {
      peer.destroy();
      reject(error);
    };
    const timer = setTimeout(
      () => fail(new RoomError("unreachable", "Couldn't connect to that room. Your network may block direct connections between devices.")),
      CONNECT_TIMEOUT_MS,
    );
    peer.on("error", (err: Error & { type?: string }) => {
      clearTimeout(timer);
      if (opened) return handlers.onClose();
      fail(
        err.type === "peer-unavailable"
          ? new RoomError("no-room", "That room doesn't exist (any more).")
          : new RoomError("broker", err.message),
      );
    });
    conn.on("open", () => {
      opened = true;
      clearTimeout(timer);
      resolve({
        send: (message) => {
          try {
            conn.send(message);
          } catch {
            // the host is gone; onClose will follow
          }
        },
        close: () => peer.destroy(),
      });
    });
    conn.on("data", (data) => handlers.onMessage(data));
    conn.on("close", () => handlers.onClose());
    conn.on("error", () => handlers.onClose());
  });
}
