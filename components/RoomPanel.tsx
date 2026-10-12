import { useState } from "react";
import type { RoomView } from "@/lib/useRoom";
import { roomHash } from "@/lib/room";

interface Props {
  room: RoomView;
  canNativeShare: boolean;
  onLeave: () => void;
  /** After the host has gone: keep the wheel on screen as an ordinary one. */
  onKeep: () => void;
  onRetry: () => void;
}

const primary =
  "min-h-11 rounded-xl bg-indigo-600 px-4 font-semibold text-white shadow hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";
const secondary =
  "min-h-11 rounded-xl border-2 border-indigo-600 bg-white px-4 font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";

/** The live room's status: link and people for the host; "joining", "connected" and problems for a guest. */
export default function RoomPanel({ room, canNativeShare, onLeave, onKeep, onRetry }: Props) {
  const [note, setNote] = useState<string | null>(null);

  if (room.role === "host") {
    const link = room.code ? `${window.location.origin}${window.location.pathname}${roomHash(room.code)}` : "";
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(link);
        setNote("Room link copied ✓");
      } catch {
        setNote("Couldn't copy automatically. Select the link and copy it.");
      }
    };
    const share = async () => {
      try {
        await navigator.share({ title: "Join my wheel", text: "Join my room and help us pick:", url: link });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) await copy();
      }
    };
    return (
      <section aria-label="Live room" className="flex flex-col gap-3 rounded-3xl bg-indigo-950 p-4 text-white shadow-lg sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-200">👥 Live room</h2>
          {room.status === "live" && (
            <p role="status" className="text-sm font-semibold">
              {room.people} {room.people === 1 ? "person" : "people"} here
            </p>
          )}
        </div>

        {room.status === "starting" && <p role="status">Opening the room…</p>}
        {room.status === "error" && (
          <>
            <p role="alert" className="text-amber-200">
              {room.error}
            </p>
            <div className="flex gap-2">
              <button type="button" className={primary} onClick={onRetry}>
                Try again
              </button>
              <button type="button" className="min-h-11 px-3 font-semibold text-indigo-200 underline" onClick={onLeave}>
                Close
              </button>
            </div>
          </>
        )}
        {room.status === "live" && (
          <>
            <p className="text-sm text-indigo-100">
              Send this link. Friends see this wheel as it changes, can veto one option each, and watch your spin land on the
              same result. Nothing is stored: the room ends when you leave.
            </p>
            <input
              readOnly
              value={link}
              aria-label="Room link"
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-xl bg-white px-3 py-2 text-sm text-indigo-950"
            />
            <div className="flex flex-wrap gap-2">
              {canNativeShare && (
                <button type="button" className={primary} onClick={() => void share()}>
                  Share room link
                </button>
              )}
              <button type="button" className={canNativeShare ? secondary : primary} onClick={() => void copy()}>
                Copy room link
              </button>
              <button type="button" className="min-h-11 px-3 font-semibold text-indigo-200 underline" onClick={onLeave}>
                End room
              </button>
            </div>
            <p aria-live="polite" className={note ? "text-sm text-indigo-100" : "sr-only"}>
              {note}
            </p>
          </>
        )}
      </section>
    );
  }

  // guest
  return (
    <section aria-label="Live room" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-indigo-950 px-4 py-3 text-white shadow-lg">
      {room.status === "joining" && <p role="status">👥 Joining the room…</p>}
      {room.status === "live" && (
        <>
          <p role="status" className="text-sm">
            <span className="font-bold">👥 Live room</span> · {room.people} {room.people === 1 ? "person" : "people"} here · the host spins
          </p>
          <button type="button" className="min-h-11 px-3 text-sm font-semibold text-indigo-200 underline" onClick={onLeave}>
            Leave
          </button>
        </>
      )}
      {room.status === "ended" && (
        <>
          <p role="status">The host ended the room.</p>
          <div className="flex gap-2">
            <button type="button" className={secondary} onClick={onKeep}>
              Keep this wheel
            </button>
            <button type="button" className="min-h-11 px-3 text-sm font-semibold text-indigo-200 underline" onClick={onLeave}>
              Close
            </button>
          </div>
        </>
      )}
      {room.status === "error" && (
        <>
          <p role="alert" className="text-amber-200">
            {room.error}
          </p>
          <button type="button" className={secondary} onClick={onLeave}>
            Close
          </button>
        </>
      )}
    </section>
  );
}
