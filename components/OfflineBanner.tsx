"use client";

import { useSyncExternalStore } from "react";
import { loadLastWheel } from "@/lib/lastWheel";

const subscribe = (listener: () => void) => {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
};

/** Shown only while the device has no connection. Offers the last wheel, which needs no network to open. */
export default function OfflineBanner({ onOpenLast, hasWheel }: { onOpenLast: (hash: string) => void; hasWheel: boolean }) {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  const last = hasWheel ? null : loadLastWheel();
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-800 px-4 py-3 text-sm text-white shadow">
      <p>
        <span aria-hidden>📴 </span>
        You&apos;re offline. Searching and the map need a connection, but spinning your current wheel and your own lists still work.
      </p>
      {last && (
        <button
          type="button"
          onClick={() => onOpenLast(last)}
          className="min-h-11 shrink-0 rounded-xl bg-white px-4 font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Open my last wheel
        </button>
      )}
    </div>
  );
}
