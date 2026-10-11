import { MAX_PLACES } from "./categories";
import type { OpenState, Place, PlaceAttrs } from "./types";

/**
 * Cuisine / diet / accessibility filters, applied on the client to the nearest places already fetched.
 * OpenStreetMap tags are patchy, so a place can be a confirmed match, untagged ("unknown"), or a confirmed
 * mismatch. Confirmed matches come first, untagged places follow (they might match), mismatches are dropped.
 */
export type Diet = "any" | "vegetarian" | "vegan";

export interface AttrFilters {
  diet: Diet;
  cuisines: string[];
  outdoor: boolean;
  wheelchair: boolean;
  takeaway: boolean;
}

export const NO_FILTERS: AttrFilters = { diet: "any", cuisines: [], outdoor: false, wheelchair: false, takeaway: false };

export function activeFilterCount(f: AttrFilters): number {
  return (f.diet !== "any" ? 1 : 0) + (f.cuisines.length ? 1 : 0) + Number(f.outdoor) + Number(f.wheelchair) + Number(f.takeaway);
}

export type Match = "match" | "unknown" | "mismatch";

const yes = (v: string | undefined) => v === "yes" || v === "only";

/** One yes/no criterion: match, unknown (not tagged) or mismatch (tagged otherwise). */
function criterion(value: boolean | undefined): Match {
  return value === undefined ? "unknown" : value ? "match" : "mismatch";
}

export function matchOf(place: Pick<Place, "attrs">, f: AttrFilters): Match {
  const a: PlaceAttrs = place.attrs ?? {};
  const results: Match[] = [];

  if (f.diet === "vegan") {
    results.push(a.vegan === undefined ? "unknown" : criterion(yes(a.vegan)));
  } else if (f.diet === "vegetarian") {
    // vegan places are vegetarian too
    if (yes(a.vegetarian) || yes(a.vegan)) results.push("match");
    else results.push(a.vegetarian === "no" ? "mismatch" : "unknown");
  }
  if (f.cuisines.length) {
    results.push(a.cuisine === undefined ? "unknown" : criterion(a.cuisine.some((c) => f.cuisines.includes(c))));
  }
  if (f.outdoor) results.push(criterion(a.outdoorSeating));
  if (f.wheelchair) results.push(a.wheelchair === undefined ? "unknown" : criterion(a.wheelchair === "yes"));
  if (f.takeaway) results.push(a.takeaway === undefined ? "unknown" : criterion(yes(a.takeaway)));

  if (results.includes("mismatch")) return "mismatch";
  return results.includes("unknown") ? "unknown" : "match";
}

/** Place kinds that are outdoors: pushed down the list when it is raining. */
export const OUTDOOR_KINDS = new Set([
  "park", "garden", "viewpoint", "playground", "pitch", "picnic_site", "nature_reserve", "marina", "golf_course",
]);

export interface WheelOptions {
  openNow: boolean;
  states: Record<string, OpenState>;
  filters: AttrFilters;
  /** When it is raining: outdoor kinds go after indoor ones (within the same match level). */
  preferIndoor: boolean;
  /** Places to leave out altogether (ones you hid, or that won recently). */
  exclude?: ReadonlySet<string>;
  /** Starred places: they get ahead of equally-ranked places, so they make it onto the wheel. */
  favourites?: ReadonlySet<string>;
}

/**
 * The wheel: drop closed places (when checking opening hours), drop confirmed mismatches, put confirmed matches
 * before untagged places, optionally indoor before outdoor, and keep nearest-first within each group.
 * Takes the first `limit`.
 */
export function selectWheel(candidates: Place[], o: WheelOptions, limit = MAX_PLACES): Place[] {
  const filtering = activeFilterCount(o.filters) > 0;
  const rows = candidates
    .filter((p) => !o.exclude?.has(p.id))
    .filter((p) => !o.openNow || o.states[p.id] !== "closed")
    .map((p, index) => ({ p, index, match: filtering ? matchOf(p, o.filters) : ("match" as Match) }))
    .filter((r) => r.match !== "mismatch");
  const rank = (r: (typeof rows)[number]) =>
    ((r.match === "match" ? 0 : 2) + (o.preferIndoor && OUTDOOR_KINDS.has(r.p.attrs?.kind ?? "") ? 1 : 0)) * 2 +
    (o.favourites?.has(r.p.id) ? 0 : 1);
  rows.sort((a, b) => rank(a) - rank(b) || a.index - b.index);
  return rows.slice(0, limit).map((r) => r.p);
}

/** Cuisines present in the pool, most common first (for the filter chips). */
export function cuisineOptions(candidates: Place[], max = 8): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of candidates) for (const c of p.attrs?.cuisine ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, max);
}

export function prettyCuisine(c: string): string {
  const s = c.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Short facts for a result card or popup, e.g. ["Italian", "Vegetarian options", "Outdoor seating"]. */
export function describeAttrs(a: PlaceAttrs | undefined): string[] {
  if (!a) return [];
  const out: string[] = [];
  if (a.cuisine?.length) out.push(a.cuisine.map(prettyCuisine).join(", "));
  if (a.vegan === "only") out.push("Vegan only");
  else if (a.vegan === "yes") out.push("Vegan options");
  if (a.vegetarian === "only") out.push("Vegetarian only");
  else if (a.vegetarian === "yes" && a.vegan !== "yes" && a.vegan !== "only") out.push("Vegetarian options");
  if (a.outdoorSeating) out.push("Outdoor seating");
  if (a.wheelchair === "yes") out.push("Wheelchair accessible");
  else if (a.wheelchair === "limited") out.push("Limited wheelchair access");
  if (a.takeaway === "only") out.push("Takeaway only");
  else if (a.takeaway === "yes") out.push("Takeaway");
  return out;
}
