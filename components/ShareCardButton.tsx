"use client";

import { useState } from "react";
import { cardFileName, renderCard, shareOrSaveCard } from "@/lib/resultCard";

interface Props {
  name: string;
  details: string[];
  colors: string[];
}

/** "Share as picture": draws the result as an image, then opens the share sheet (phones) or downloads it. */
export default function ShareCardButton({ name, details, colors }: Props) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    setNote(null);
    try {
      const blob = await renderCard({
        heading: "Let's go to",
        name,
        details,
        colors,
        footer: `Spun on ${window.location.host}`,
      });
      const outcome = await shareOrSaveCard(blob, cardFileName(name), `We're going to ${name}!`);
      setNote(outcome === "saved" ? "Picture saved ✓" : outcome === "shared" ? "Shared ✓" : null);
    } catch {
      setNote("Couldn't make the picture on this device.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={busy}
        className="min-h-11 rounded-full border-2 border-indigo-300 px-4 text-sm font-semibold text-white hover:bg-indigo-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
      >
        🖼️ Share as picture
      </button>
      <p aria-live="polite" className={note ? "mt-1 text-sm text-indigo-200" : "sr-only"}>
        {note}
      </p>
    </div>
  );
}
