/**
 * What this browser remembers about you, with no account: places you starred, places you never
 * want to see again, and where you went lately. It lives only in this browser's localStorage and
 * is never sent anywhere. Read it through `useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs)`.
 */

const KEY = "wsg-prefs";
const DAY_MS = 24 * 60 * 60 * 1000;

export const FAVOURITE_WEIGHT = 2; // a starred place gets a slice twice as big
export const DEFAULT_SKIP_DAYS = 14;
export const SKIP_DAY_CHOICES = [0, 7, 14, 30] as const; // 0 = never skip recent winners

const MAX_FAVOURITES = 100;
const MAX_HIDDEN = 200;
const MAX_HISTORY = 50;
const MAX_NAME = 120;

export interface HistoryEntry {
  id: string;
  name: string;
  /** When it won (ms since 1970). */
  at: number;
}

export interface Prefs {
  v: 1;
  /** place id -> name, so the list can be shown without searching again */
  favourites: Record<string, string>;
  hidden: Record<string, string>;
  /** Newest first. */
  history: HistoryEntry[];
  skipDays: number;
}

const DEFAULTS: Prefs = { v: 1, favourites: {}, hidden: {}, history: [], skipDays: DEFAULT_SKIP_DAYS };

const cleanName = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.replace(/\p{Cc}/gu, " ").trim().slice(0, MAX_NAME) : null;

function cleanNames(v: unknown, max: number): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof v !== "object" || v === null || Array.isArray(v)) return out;
  for (const [id, name] of Object.entries(v)) {
    const n = cleanName(name);
    if (n && id.length <= 64 && Object.keys(out).length < max) out[id] = n;
  }
  return out;
}

/** Turns whatever is in storage into valid prefs. Anything unrecognisable is dropped, never trusted. */
export function parsePrefs(raw: string | null): Prefs {
  if (!raw) return DEFAULTS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULTS;
  }
  if (typeof data !== "object" || data === null) return DEFAULTS;
  const d = data as Record<string, unknown>;
  if (d.v !== 1) return DEFAULTS;

  const history: HistoryEntry[] = [];
  if (Array.isArray(d.history)) {
    for (const e of d.history) {
      if (typeof e !== "object" || e === null) continue;
      const { id, name, at } = e as Record<string, unknown>;
      const n = cleanName(name);
      if (typeof id === "string" && id.length <= 64 && n && typeof at === "number" && Number.isFinite(at) && history.length < MAX_HISTORY) {
        history.push({ id, name: n, at });
      }
    }
  }
  history.sort((a, b) => b.at - a.at);

  const skip = d.skipDays;
  return {
    v: 1,
    favourites: cleanNames(d.favourites, MAX_FAVOURITES),
    hidden: cleanNames(d.hidden, MAX_HIDDEN),
    history,
    skipDays: typeof skip === "number" && (SKIP_DAY_CHOICES as readonly number[]).includes(skip) ? skip : DEFAULT_SKIP_DAYS,
  };
}

/** Places that should stay off the wheel: the ones you hid, and the ones that won in the last `skipDays` days. */
export function excludedIds(prefs: Prefs, now: number): Set<string> {
  const out = new Set(Object.keys(prefs.hidden));
  if (prefs.skipDays > 0) {
    const cutoff = now - prefs.skipDays * DAY_MS;
    for (const h of prefs.history) if (h.at >= cutoff) out.add(h.id);
  }
  return out;
}

/** Slice weights for a wheel: starred places are bigger. */
export function weightsFor(places: { id: string }[], prefs: Prefs): number[] {
  return places.map((p) => (p.id in prefs.favourites ? FAVOURITE_WEIGHT : 1));
}

export function hasAnyData(p: Prefs): boolean {
  return Object.keys(p.favourites).length + Object.keys(p.hidden).length + p.history.length > 0;
}

// --- The store (browser only) ---------------------------------------------------------

let current: Prefs | null = null;
const listeners = new Set<() => void>();

function read(): Prefs {
  try {
    return parsePrefs(window.localStorage.getItem(KEY));
  } catch {
    return DEFAULTS; // storage blocked (private window, etc.): nothing is remembered
  }
}

export function getPrefs(): Prefs {
  if (current === null) current = read();
  return current;
}

/** What the server renders (and the first client render): nothing remembered. */
export function getServerPrefs(): Prefs {
  return DEFAULTS;
}

function commit(next: Prefs): void {
  current = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // kept for this visit only, which is fine
  }
  listeners.forEach((l) => l());
}

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed them: pick that up.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      current = read();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const without = (rec: Record<string, string>, id: string) => {
  const copy = { ...rec };
  delete copy[id];
  return copy;
};

export function toggleFavourite(place: { id: string; name: string }): void {
  const p = getPrefs();
  const name = cleanName(place.name);
  if (place.id in p.favourites) commit({ ...p, favourites: without(p.favourites, place.id) });
  else if (name && Object.keys(p.favourites).length < MAX_FAVOURITES) {
    // A starred place is no longer hidden: the two would contradict each other.
    commit({ ...p, favourites: { ...p.favourites, [place.id]: name }, hidden: without(p.hidden, place.id) });
  }
}

export function hidePlace(place: { id: string; name: string }): void {
  const p = getPrefs();
  const name = cleanName(place.name);
  if (!name || Object.keys(p.hidden).length >= MAX_HIDDEN) return;
  commit({ ...p, hidden: { ...p.hidden, [place.id]: name }, favourites: without(p.favourites, place.id) });
}

export function unhidePlace(id: string): void {
  const p = getPrefs();
  if (id in p.hidden) commit({ ...p, hidden: without(p.hidden, id) });
}

export function recordWinner(place: { id: string; name: string }, now = Date.now()): void {
  const p = getPrefs();
  const name = cleanName(place.name);
  if (!name) return;
  commit({ ...p, history: [{ id: place.id, name, at: now }, ...p.history].slice(0, MAX_HISTORY) });
}

export function setSkipDays(days: number): void {
  const p = getPrefs();
  if ((SKIP_DAY_CHOICES as readonly number[]).includes(days)) commit({ ...p, skipDays: days });
}

/** "Clear my data": forget everything, including the stored copy. */
export function clearPrefs(): void {
  current = DEFAULTS;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing stored anyway
  }
  listeners.forEach((l) => l());
}
