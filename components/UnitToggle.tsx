"use client";

import { useSyncExternalStore } from "react";
import { getUnit, setUnit, subscribeUnit, type Unit } from "@/lib/units";
import { useT } from "@/lib/useT";

/** km / mi. */
export default function UnitToggle() {
  const t = useT();
  const unit = useSyncExternalStore(subscribeUnit, getUnit, () => "km" as Unit);
  const next: Unit = unit === "km" ? "mi" : "km";
  return (
    <button
      type="button"
      onClick={() => setUnit(next)}
      // The visible text ("km" or "mi") is kept in the name, so voice control ("click km") works.
      aria-label={`${unit}. ${t("Distances in {current}. Switch to {next}", { current: unit === "km" ? t("kilometres") : t("miles"), next: next === "km" ? t("kilometres") : t("miles") })}`}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/70 px-3 text-sm font-semibold text-indigo-900 shadow-sm ring-1 ring-indigo-100 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
    >
      {unit}
    </button>
  );
}
