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

/** A time to check opening hours for, on the place's own clock: today or tomorrow at hour:minute. */
export interface OpenAt {
  dayOffset: 0 | 1;
  hour: number;
  minute: number;
}

/**
 * The wall clock to check: right now at the place (`at` = null), or the chosen time there. A time today that has already
 * passed means the same time tomorrow (asking "open tonight at 7?" at 10 pm is about tomorrow's 7).
 */
export function wallClockFor(now: Date, tz: string | null, at: OpenAt | null = null): Date {
  const local = placeLocalDate(now, tz);
  if (!at) return local;
  const make = (extraDays: number) =>
    new Date(local.getFullYear(), local.getMonth(), local.getDate() + at.dayOffset + extraDays, at.hour, at.minute);
  const wall = make(0);
  return at.dayOffset === 0 && wall.getTime() < local.getTime() ? make(1) : wall;
}

/** Open / closed / unknown for one place at a place-local wall clock. Missing, unparsable or comment-only hours are unknown. */
export function openStateAtWallClock(
  OpeningHours: OpeningHoursClass,
  place: Pick<Place, "lat" | "lon" | "hours">,
  wall: Date,
): OpenState {
  if (!place.hours) return "unknown";
  try {
    // lat/lon let sunrise/sunset rules work. No country is known, so public-holiday rules
    // are treated like an ordinary day.
    const oh = new OpeningHours(place.hours, { lat: place.lat, lon: place.lon } as nominatim_object);
    if (oh.getUnknown(wall)) return "unknown";
    return oh.getState(wall) ? "open" : "closed";
  } catch {
    return "unknown";
  }
}

/** Open / closed / unknown for one place, right now or at a chosen time there. */
export function openStateOf(
  OpeningHours: OpeningHoursClass,
  place: Pick<Place, "lat" | "lon" | "hours">,
  tz: string | null,
  now: Date,
  at: OpenAt | null = null,
): OpenState {
  return openStateAtWallClock(OpeningHours, place, wallClockFor(now, tz, at));
}

export async function openStates(
  places: Pick<Place, "id" | "lat" | "lon" | "hours">[],
  tz: string | null,
  now: Date = new Date(),
  at: OpenAt | null = null,
): Promise<Record<string, OpenState>> {
  const result: Record<string, OpenState> = {};
  const withHours = places.filter((p) => p.hours);
  // Skip loading the parser entirely when nothing has hours.
  const OpeningHours = withHours.length ? await loadOpeningHours() : null;
  for (const place of places) {
    result[place.id] = OpeningHours ? openStateOf(OpeningHours, place, tz, now, at) : "unknown";
  }
  return result;
}
