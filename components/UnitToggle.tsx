"use client";

import { useSyncExternalStore } from "react";
import { getUnit, setUnit, subscribeUnit, type Unit } from "@/lib/units";

/** km / mi. */
export default function UnitToggle() {
  const unit = useSyncExternalStore(subscribeUnit, getUnit, () => "km" as Unit);
  const next: Unit = unit === "km" ? "mi" : "km";
  return (
    <button
      type="button"
      onClick={() => setUnit(next)}
      aria-label={`Distances in ${unit === "km" ? "kilometres" : "miles"}. Switch to ${next === "km" ? "kilometres" : "miles"}`}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/70 px-3 text-sm font-semibold text-indigo-900 shadow-sm ring-1 ring-indigo-100 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
    >
      {unit}
    </button>
  );
}
