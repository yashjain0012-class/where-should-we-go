import type { ReactNode } from "react";
import { MAX_RADIUS, MIN_RADIUS, RADIUS_STEP, formatRadius } from "@/lib/categories";

interface FiltersPanelProps {
  radius: number;
  onRadiusChange: (meters: number) => void;
  openNow: boolean;
  onOpenNowChange: (next: boolean) => void;
  /** Disable the controls while the wheel is spinning. */
  disabled: boolean;
  /** Messages or actions that belong to the filters (for example a timeout notice). */
  children?: ReactNode;
}

export default function FiltersPanel({
  radius,
  onRadiusChange,
  openNow,
  onOpenNowChange,
  disabled,
  children,
}: FiltersPanelProps) {
  return (
    <section
      aria-label="Filters"
      className="flex flex-col gap-3 rounded-3xl bg-white/80 p-4 shadow-lg backdrop-blur sm:p-6"
    >
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="radius" className="text-sm font-bold uppercase tracking-wider text-indigo-900">
            Distance
          </label>
          <output htmlFor="radius" className="text-lg font-extrabold text-indigo-950">
            {formatRadius(radius)}
          </output>
        </div>
        <input
          id="radius"
          type="range"
          min={MIN_RADIUS}
          max={MAX_RADIUS}
          step={RADIUS_STEP}
          value={radius}
          disabled={disabled}
          aria-valuetext={formatRadius(radius)}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          className="mt-1 h-11 w-full cursor-pointer accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div aria-hidden className="flex justify-between text-xs text-indigo-900/70">
          <span>{formatRadius(MIN_RADIUS)}</span>
          <span>{formatRadius(MAX_RADIUS)}</span>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={openNow}
        disabled={disabled}
        onClick={() => onOpenNowChange(!openNow)}
        className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-indigo-50 px-4 py-2 text-left transition hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span>
          <span className="block font-semibold text-indigo-950">Open now</span>
          <span className="block text-xs text-indigo-900/70">
            Hides places that are closed. Places without listed hours stay in.
          </span>
        </span>
        <span
          aria-hidden
          className={`relative inline-block h-7 w-12 shrink-0 rounded-full transition-colors ${
            openNow ? "bg-indigo-600" : "bg-indigo-300"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
              openNow ? "left-6" : "left-1"
            }`}
          />
        </span>
      </button>

      {children}
    </section>
  );
}
