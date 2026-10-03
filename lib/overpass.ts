import { POOL_SIZE } from "./categories";
import { distanceMetres } from "./geo";
import type { Place } from "./types";

/**
 * Overpass can't sort by distance, and a capped `out` returns elements by id, so a plain
 * cap could return only far-away places on a big radius. Instead one request scans the
 * whole area once, then splits it into nested rings with cheap set operations and caps
 * each ring separately. Nearest-first is then exact for every ring with fewer than
 * RING_CAP matches, and approximate (but still within that ring) for denser ones.
 *
 * The scan uses a bounding box rather than `around`: on the public servers an `around`
 * scan of 2 km or more in a dense city routinely times out, while the box finishes in
 * seconds. The rings then trim the box to a true circle.
 */
export const RING_RADII = [250, 500, 1000, 1500, 2000, 3000, 4000, 5000];
export const RING_CAP = 80;

/** Ring boundaries for a search radius, ending exactly at the radius. */
export function ringsFor(radius: number): number[] {
  const rings = RING_RADII.filter((r) => r < radius);
  rings.push(radius);
  return rings;
}

/** Overpass bounding box "(south,west,north,east)" around a point. */
export function boundingBox(lat: number, lon: number, radius: number): string {
  const dLat = radius / 111_320;
  const dLon = radius / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const clamp = (v: number, max: number) => Math.min(max, Math.max(-max, v));
  const f = (v: number) => v.toFixed(5);
  return `(${f(clamp(lat - dLat, 90))},${f(clamp(lon - dLon, 180))},${f(clamp(lat + dLat, 90))},${f(clamp(lon + dLon, 180))})`;
}

export function buildQuery(
  lat: number,
  lon: number,
  filters: string[],
  radius: number,
  timeoutSeconds: number,
): string {
  const centre = `${lat},${lon}`;
  const box = boundingBox(lat, lon, radius);
  const scan = filters.map((f) => `  nwr${f}["name"]${box};`).join("\n");
  const rings = ringsFor(radius);
  const lines = [`[out:json][timeout:${timeoutSeconds}];`, "(", scan, ")->.all;"];

  rings.forEach((r, i) => lines.push(`nwr.all(around:${r},${centre})->.r${i + 1};`));
  rings.forEach((_, i) => {
    if (i > 0) lines.push(`(.r${i + 1}; - .r${i};)->.a${i + 1};`);
  });
  rings.forEach((_, i) => lines.push(`.${i === 0 ? "r1" : `a${i + 1}`} out center ${RING_CAP};`));
  return lines.join("\n");
}

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: { name?: string; opening_hours?: string };
}

const MAX_HOURS_CHARS = 400;

/** Named, de-duplicated places sorted nearest first (at most `limit`). */
export function parseCandidates(
  elements: OverpassElement[],
  centre: { lat: number; lon: number },
  limit = POOL_SIZE,
): Place[] {
  const byName = new Map<string, Place>();
  for (const el of elements) {
    const name = el.tags?.name?.trim();
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!name || lat === undefined || lon === undefined) continue;

    const hours = el.tags?.opening_hours?.trim();
    const place: Place = {
      id: `${el.type}/${el.id}`,
      name,
      lat,
      lon,
      distance: Math.round(distanceMetres(centre.lat, centre.lon, lat, lon)),
      // Over-long values are dropped rather than cut, since a cut rule would be misread.
      ...(hours && hours.length <= MAX_HOURS_CHARS ? { hours } : {}),
    };
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (!existing || (place.distance ?? 0) < (existing.distance ?? 0)) byName.set(key, place);
  }
  return [...byName.values()]
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit);
}
