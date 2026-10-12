/**
 * Kilometres or miles for the distance slider and messages. Searches are always in metres underneath (the slider
 * keeps its 250 m steps); this only changes how a distance is written. The default follows the device's region
 * (miles in the US, UK, Liberia and Myanmar), and a choice made with the button is remembered.
 */

export type Unit = "km" | "mi";

const KEY = "wsg-units";
const METRES_PER_MILE = 1609.344;
const MILE_REGIONS = new Set(["US", "GB", "LR", "MM"]);

/** "en-US" gives "mi"; "en-IN", "hi" or anything unrecognised gives "km". */
export function defaultUnit(language: string | undefined): Unit {
  const region = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(language ?? "")?.[1]?.toUpperCase();
  return region && MILE_REGIONS.has(region) ? "mi" : "km";
}

/** "500 m", "1 km", "1.5 km"; or "0.3 mi", "1 mi", "3.1 mi". */
export function formatDistance(metres: number, unit: Unit): string {
  if (unit === "mi") {
    const miles = Math.round((metres / METRES_PER_MILE) * 10) / 10;
    return `${miles} mi`;
  }
  return metres < 1000 ? `${metres} m` : `${metres / 1000} km`;
}

// --- The remembered choice (a tiny external store, like lib/sound.ts) -------------------

let unit: Unit | null = null;
const listeners = new Set<() => void>();

export function getUnit(): Unit {
  if (unit === null) {
    try {
      const stored = window.localStorage.getItem(KEY);
      unit = stored === "km" || stored === "mi" ? stored : defaultUnit(navigator.language);
    } catch {
      unit = defaultUnit(navigator.language);
    }
  }
  return unit;
}

export function setUnit(next: Unit): void {
  unit = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // not remembered across visits, which is fine
  }
  listeners.forEach((l) => l());
}

export function subscribeUnit(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
