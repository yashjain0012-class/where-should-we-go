import { useState } from "react";
import { buildIcs, downloadIcs, icsFileName } from "@/lib/calendar";
import { appleDirections, googleDirections, osmPlace } from "@/lib/directions";
import { describeAttrs } from "@/lib/filters";
import { mapsUrl } from "@/lib/maps";
import type { Place } from "@/lib/types";
import { useT } from "@/lib/useT";
import { formatWalk } from "@/lib/walk";

/** 2026-10-07T19:00, the format a datetime-local input uses, from a Date's local fields. */
function toInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const pill =
  "inline-flex min-h-11 items-center rounded-full bg-indigo-800 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * What to do with the winner: how far it is on foot, directions in the map app of your choice, and a calendar file.
 * Render it with key={place.id} so a new winner starts from a fresh suggested time.
 */
export default function ResultActions({ place, suggestedStart }: { place: Place; suggestedStart: Date }) {
  const t = useT();
  const [when, setWhen] = useState(toInputValue(suggestedStart));

  function addToCalendar() {
    const start = new Date(when); // a datetime-local value is read as local time
    if (Number.isNaN(start.getTime())) return;
    const facts = describeAttrs(place.attrs, t).join(" · ");
    const ics = buildIcs({
      title: t("Let's go to {name}", { name: place.name }),
      start,
      durationMinutes: 90,
      location: place.name,
      description: [facts, t("Picked by the Where should we go? wheel.")].filter(Boolean).join("\n"),
      lat: place.lat,
      lon: place.lon,
      url: mapsUrl(place),
    });
    downloadIcs(icsFileName(place.name), ics);
  }

  return (
    <div className="mt-4 flex flex-col items-center gap-3 border-t border-white/15 pt-4">
      {place.distance !== undefined && (
        <p className="text-sm text-indigo-200">{t("About {walk} from where you searched", { walk: formatWalk(place.distance, t) })}</p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <a href={googleDirections(place)} target="_blank" rel="noopener noreferrer" className={pill}>
          {t("Directions on foot")} ↗
        </a>
        <a href={appleDirections(place)} target="_blank" rel="noopener noreferrer" className={pill}>
          {t("Apple Maps")}
        </a>
        <a href={osmPlace(place)} target="_blank" rel="noopener noreferrer" className={pill}>
          OpenStreetMap
        </a>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <label htmlFor="plan-time" className="sr-only">
          {t("Date and time to add to your calendar")}
        </label>
        <input
          id="plan-time"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="min-h-11 rounded-lg bg-white px-3 text-indigo-950"
        />
        <button type="button" onClick={addToCalendar} className={pill}>
          {t("Add to calendar")}
        </button>
      </div>
    </div>
  );
}
