import type { nominatim_object } from "opening_hours";
import type { OpenState, Place } from "./types";

type OpeningHoursClass = new (
  value: string,
  nominatim?: nominatim_object | null,
) => {
  getState(date?: Date): boolean;
  getUnknown(date?: Date): boolean;
};

let loading: Promise<OpeningHoursClass> | null = null;

/**
 * Load the OSM opening_hours parser on demand (it is large, so only when "Open now" is
 * first used). At runtime the package exports just a default constructor (CommonJS gives
 * the constructor itself); its typings wrongly declare a named export, so don't use that.
 */
export function loadOpeningHours(): Promise<OpeningHoursClass> {
  loading ??= import("opening_hours").then((mod) => {
    const candidate = (mod as { default?: unknown }).default ?? mod;
    return candidate as OpeningHoursClass;
  });
  return loading;
}

/**
 * The parser reads the wall-clock fields of the Date it is given. To ask "is it open right
 * now *there*", build a Date whose local fields show the current time in the place's zone.
 */
export function placeLocalDate(now: Date, tz: string | null): Date {
  if (!tz) return now;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  } catch {
    return now; // unknown zone name: fall back to the viewer's own clock
  }
}

/** Open / closed / unknown for one place. Missing, unparsable or comment-only hours are unknown. */
export function openStateOf(
  OpeningHours: OpeningHoursClass,
  place: Pick<Place, "lat" | "lon" | "hours">,
  tz: string | null,
  now: Date,
): OpenState {
  if (!place.hours) return "unknown";
  try {
    // lat/lon let sunrise/sunset rules work. No country is known, so public-holiday rules
    // are treated like an ordinary day.
    const oh = new OpeningHours(place.hours, { lat: place.lat, lon: place.lon } as nominatim_object);
    const when = placeLocalDate(now, tz);
    if (oh.getUnknown(when)) return "unknown";
    return oh.getState(when) ? "open" : "closed";
  } catch {
    return "unknown";
  }
}

export async function openStates(
  places: Pick<Place, "id" | "lat" | "lon" | "hours">[],
  tz: string | null,
  now: Date = new Date(),
): Promise<Record<string, OpenState>> {
  const result: Record<string, OpenState> = {};
  const withHours = places.filter((p) => p.hours);
  // Skip loading the parser entirely when nothing has hours.
  const OpeningHours = withHours.length ? await loadOpeningHours() : null;
  for (const place of places) {
    result[place.id] = OpeningHours ? openStateOf(OpeningHours, place, tz, now) : "unknown";
  }
  return result;
}
