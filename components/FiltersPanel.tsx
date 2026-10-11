import { useState, type ReactNode } from "react";
import { MAX_RADIUS, MIN_RADIUS, RADIUS_STEP, formatRadius } from "@/lib/categories";
import { OPEN_AT_PRESETS, sameOpenAt, type OpenAt } from "@/lib/openAt";

interface FiltersPanelProps {
  radius: number;
  onRadiusChange: (meters: number) => void;
  openNow: boolean;
  onOpenNowChange: (next: boolean) => void;
  /** When to check opening hours: null = now, otherwise a time on the place's own clock. */
  openAt: OpenAt | null;
  onOpenAtChange: (next: OpenAt | null) => void;
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
  openAt,
  onOpenAtChange,
  disabled,
  children,
}: FiltersPanelProps) {
  const [custom, setCustom] = useState(false);
  const preset = OPEN_AT_PRESETS.find((p) => sameOpenAt(p.at, openAt));
  const selected = custom || !preset ? "custom" : preset.id;
  const pad = (n: number) => String(n).padStart(2, "0");

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
          <span className="block font-semibold text-indigo-950">{openAt ? "Open then" : "Open now"}</span>
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

      {openNow && (
        <div className="flex flex-col gap-2 rounded-xl bg-indigo-50 px-4 py-3">
          <label htmlFor="open-at" className="text-sm font-semibold text-indigo-950">
            Open when?
          </label>
          <select
            id="open-at"
            value={selected}
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value === "custom") {
                setCustom(true);
                onOpenAtChange(openAt ?? { dayOffset: 0, hour: 19, minute: 0 });
                return;
              }
              setCustom(false);
              onOpenAtChange(OPEN_AT_PRESETS.find((p) => p.id === e.target.value)?.at ?? null);
            }}
            className="min-h-11 rounded-lg border-2 border-indigo-200 bg-white px-3 text-indigo-950 focus:border-indigo-500 focus:outline-none disabled:opacity-60"
          >
            {OPEN_AT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom">Pick a time…</option>
          </select>
          {selected === "custom" && openAt && (
            <div className="flex gap-2">
              <input
                type="time"
                aria-label="Time"
                value={`${pad(openAt.hour)}:${pad(openAt.minute)}`}
                disabled={disabled}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  if (Number.isFinite(h) && Number.isFinite(m)) onOpenAtChange({ ...openAt, hour: h, minute: m });
                }}
                className="min-h-11 flex-1 rounded-lg border-2 border-indigo-200 bg-white px-3 text-indigo-950 focus:border-indigo-500 focus:outline-none"
              />
              <select
                aria-label="Day"
                value={openAt.dayOffset}
                disabled={disabled}
                onChange={(e) => onOpenAtChange({ ...openAt, dayOffset: Number(e.target.value) as 0 | 1 })}
                className="min-h-11 rounded-lg border-2 border-indigo-200 bg-white px-3 text-indigo-950 focus:border-indigo-500 focus:outline-none"
              >
                <option value={0}>Today</option>
                <option value={1}>Tomorrow</option>
              </select>
            </div>
          )}
          <p className="text-xs text-indigo-900/70">Checked on the place&apos;s own clock. A time that has passed means tomorrow.</p>
        </div>
      )}

      {children}
    </section>
  );
}
