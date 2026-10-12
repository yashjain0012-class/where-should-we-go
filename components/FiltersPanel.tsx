import { useState, type ReactNode } from "react";
import { MAX_RADIUS, MIN_RADIUS, RADIUS_STEP, formatRadius } from "@/lib/categories";
import { useT } from "@/lib/useT";
import { useUnit } from "@/lib/useUnit";
import { NO_FILTERS, activeFilterCount, prettyCuisine, type AttrFilters, type Diet } from "@/lib/filters";
import { OPEN_AT_PRESETS, sameOpenAt, type OpenAt } from "@/lib/openAt";
import { formatWalk } from "@/lib/walk";
import type { WeatherNow } from "@/lib/weather";

interface FiltersPanelProps {
  radius: number;
  onRadiusChange: (meters: number) => void;
  openNow: boolean;
  onOpenNowChange: (next: boolean) => void;
  /** When to check opening hours: null = now, otherwise a time on the place's own clock. */
  openAt: OpenAt | null;
  onOpenAtChange: (next: OpenAt | null) => void;
  /** Cuisine, diet and accessibility choices. */
  filters: AttrFilters;
  onFiltersChange: (next: AttrFilters) => void;
  /** Cuisines found among the nearby places, for the chips. */
  cuisineChips: { name: string; count: number }[];
  /** Diet and cuisine only make sense for food and drink. */
  foodCategory: boolean;
  /** Today's weather where you searched (null when unavailable). */
  weather: WeatherNow | null;
  preferIndoor: boolean;
  onPreferIndoorChange: (next: boolean) => void;
  /** Disable the controls while the wheel is spinning. */
  disabled: boolean;
  /** Messages or actions that belong to the filters (for example a timeout notice). */
  children?: ReactNode;
}

function Chip({
  pressed,
  disabled,
  onClick,
  children,
}: {
  pressed: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 ${
        pressed ? "bg-indigo-950 text-white shadow" : "bg-white text-indigo-900 ring-1 ring-indigo-200 hover:bg-indigo-100"
      }`}
    >
      {children}
    </button>
  );
}

export default function FiltersPanel({
  radius,
  onRadiusChange,
  openNow,
  onOpenNowChange,
  openAt,
  onOpenAtChange,
  filters,
  onFiltersChange,
  cuisineChips,
  foodCategory,
  weather,
  preferIndoor,
  onPreferIndoorChange,
  disabled,
  children,
}: FiltersPanelProps) {
  const unit = useUnit();
  const t = useT();
  const [custom, setCustom] = useState(false);
  const preset = OPEN_AT_PRESETS.find((p) => sameOpenAt(p.at, openAt));
  const selected = custom || !preset ? "custom" : preset.id;
  const pad = (n: number) => String(n).padStart(2, "0");
  const chosen = activeFilterCount(filters);
  const toggleCuisine = (name: string) =>
    onFiltersChange({
      ...filters,
      cuisines: filters.cuisines.includes(name) ? filters.cuisines.filter((c) => c !== name) : [...filters.cuisines, name],
    });

  return (
    <section
      aria-label={t("Filters")}
      className="flex flex-col gap-3 rounded-3xl bg-white/80 p-4 shadow-lg backdrop-blur sm:p-6"
    >
      {weather && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sky-50 px-4 py-2">
          <p className="text-sm font-semibold text-sky-950">
            <span aria-hidden>{weather.emoji}</span> {weather.tempC}°C, {t(weather.label).toLowerCase()}
          </p>
          {weather.wet && (
            <button
              type="button"
              role="switch"
              aria-checked={preferIndoor}
              disabled={disabled}
              onClick={() => onPreferIndoorChange(!preferIndoor)}
              className={`min-h-11 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-60 ${
                preferIndoor ? "bg-sky-800 text-white shadow" : "bg-white text-sky-900 ring-1 ring-sky-200 hover:bg-sky-100"
              }`}
            >
              {t("Indoor places first")}
            </button>
          )}
        </div>
      )}

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="radius" className="text-sm font-bold uppercase tracking-wider text-indigo-900">
            {t("Distance")}
          </label>
          <output htmlFor="radius" className="text-lg font-extrabold text-indigo-950">
            {formatRadius(radius, unit)}
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
          aria-valuetext={formatRadius(radius, unit)}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          className="mt-1 h-11 w-full cursor-pointer accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <p className="text-xs text-indigo-900/70">{t("About {walk} to the edge, in a straight line", { walk: formatWalk(radius, t) })}</p>
        <div aria-hidden className="flex justify-between text-xs text-indigo-900/70">
          <span>{formatRadius(MIN_RADIUS, unit)}</span>
          <span>{formatRadius(MAX_RADIUS, unit)}</span>
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
          <span className="block font-semibold text-indigo-950">{openAt ? t("Open then") : t("Open now")}</span>
          <span className="block text-xs text-indigo-900/70">
            {t("Hides places that are closed. Places without listed hours stay in.")}
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
            {t("Open when?")}
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
                {t(p.label)}
              </option>
            ))}
            <option value="custom">{t("Pick a time…")}</option>
          </select>
          {selected === "custom" && openAt && (
            <div className="flex gap-2">
              <input
                type="time"
                aria-label={t("Time")}
                value={`${pad(openAt.hour)}:${pad(openAt.minute)}`}
                disabled={disabled}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  if (Number.isFinite(h) && Number.isFinite(m)) onOpenAtChange({ ...openAt, hour: h, minute: m });
                }}
                className="min-h-11 flex-1 rounded-lg border-2 border-indigo-200 bg-white px-3 text-indigo-950 focus:border-indigo-500 focus:outline-none"
              />
              <select
                aria-label={t("Day")}
                value={openAt.dayOffset}
                disabled={disabled}
                onChange={(e) => onOpenAtChange({ ...openAt, dayOffset: Number(e.target.value) as 0 | 1 })}
                className="min-h-11 rounded-lg border-2 border-indigo-200 bg-white px-3 text-indigo-950 focus:border-indigo-500 focus:outline-none"
              >
                <option value={0}>{t("Today")}</option>
                <option value={1}>{t("Tomorrow")}</option>
              </select>
            </div>
          )}
          <p className="text-xs text-indigo-900/70">{t("Checked on the place's own clock. A time that has passed means tomorrow.")}</p>
        </div>
      )}

      <details className="group rounded-xl bg-indigo-50 px-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-semibold text-indigo-950">
          <span>{t("More filters")}{chosen > 0 ? ` (${chosen})` : ""}</span>
          <span aria-hidden className="text-indigo-700 transition group-open:rotate-180">▾</span>
        </summary>
        <div className="flex flex-col gap-3 pb-3 pt-1">
          {foodCategory && (
            <fieldset>
              <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-indigo-900">{t("Diet")}</legend>
              <div className="flex flex-wrap gap-2">
                {(["any", "vegetarian", "vegan"] as Diet[]).map((d) => (
                  <Chip key={d} pressed={filters.diet === d} disabled={disabled} onClick={() => onFiltersChange({ ...filters, diet: d })}>
                    {d === "any" ? t("Any") : d === "vegetarian" ? t("Vegetarian") : t("Vegan")}
                  </Chip>
                ))}
              </div>
            </fieldset>
          )}
          {foodCategory && cuisineChips.length > 0 && (
            <fieldset>
              <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-indigo-900">{t("Cuisine nearby")}</legend>
              <div className="flex flex-wrap gap-2">
                {cuisineChips.map((c) => (
                  <Chip key={c.name} pressed={filters.cuisines.includes(c.name)} disabled={disabled} onClick={() => toggleCuisine(c.name)}>
                    {prettyCuisine(c.name)} ({c.count})
                  </Chip>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset>
            <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-indigo-900">{t("Good to know")}</legend>
            <div className="flex flex-wrap gap-2">
              <Chip pressed={filters.outdoor} disabled={disabled} onClick={() => onFiltersChange({ ...filters, outdoor: !filters.outdoor })}>
                {t("Outdoor seating")}
              </Chip>
              <Chip pressed={filters.wheelchair} disabled={disabled} onClick={() => onFiltersChange({ ...filters, wheelchair: !filters.wheelchair })}>
                {t("Wheelchair accessible")}
              </Chip>
              <Chip pressed={filters.takeaway} disabled={disabled} onClick={() => onFiltersChange({ ...filters, takeaway: !filters.takeaway })}>
                {t("Takeaway")}
              </Chip>
            </div>
          </fieldset>
          <p className="text-xs text-indigo-900/70">
            {t("Only places tagged in OpenStreetMap can be confirmed. Untagged places come after confirmed matches and are marked \"unconfirmed\"; places tagged the other way are left out.")}
          </p>
          {chosen > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onFiltersChange(NO_FILTERS)}
              className="min-h-11 self-start text-sm font-semibold text-indigo-700 underline disabled:opacity-60"
            >
              {t("Clear all")}
            </button>
          )}
        </div>
      </details>

      {children}
    </section>
  );
}
