import { CATEGORIES, MAX_PLACES } from "./categories";
import type { CategoryId, Place } from "./types";

/**
 * Share links live in the URL hash: `#s=1.<checksum>.<payload>`.
 *
 * payload = base64url(UTF-8 JSON) of a positional array, no key names:
 *   [centreLat1e5, centreLon1e5, categoryIndex, label, [[name, dLat1e5, dLon1e5], ...]]
 * Coordinates are integers at 1e-5 degrees (about 1 m); each place is stored as an
 * offset from the search centre, so it takes only a few digits. The Google Maps link
 * is not stored: it is rebuilt from name + coordinates (lib/maps.ts) when opened.
 *
 * CATEGORIES is append-only: the category is stored as an index into it.
 */

export interface ShareState {
  center: { lat: number; lon: number };
  label: string;
  category: CategoryId;
  places: Place[];
}

const PREFIX = "#s=";
const VERSION = "1";
const SCALE = 1e5;
/** Shared centres are rounded to 1/CENTRE_SNAP degrees. */
const CENTRE_SNAP = 1000;

/** Whole-hash budget. Every browser and chat app handles ~2,000 character URLs. */
export const MAX_HASH_CHARS = 1900;
const MAX_NAME = 80;
const MAX_LABEL = 120;
const SHARE_LABEL = 60;
// The search radius goes up to 5 km (see lib/categories.ts), plus the ~110 m centre snap.
const MAX_DISTANCE_M = 5500;

// Control characters, line separators and bidi overrides (used to spoof text).
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

export function clean(text: string): string {
  return text.replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim();
}

export function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(payload: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error("bad payload");
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** FNV-1a: catches truncated or garbled links, not a security measure. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function shortLabel(label: string): string {
  return clean(label.split(",").slice(0, 3).join(", "));
}

export function encodeShare(state: ShareState): string {
  const categoryIndex = CATEGORIES.findIndex((c) => c.id === state.category);
  // Snap the centre to 0.001 degrees (~110 m). A link made from "Use my location" would
  // otherwise hand every recipient the sender's exact position. Places are stored as
  // offsets from this snapped centre, so they keep their full precision.
  const centreLat = Math.round(state.center.lat * CENTRE_SNAP) * (SCALE / CENTRE_SNAP);
  const centreLon = Math.round(state.center.lon * CENTRE_SNAP) * (SCALE / CENTRE_SNAP);

  const build = (labelMax: number, nameMax: number): string => {
    const rows = state.places.slice(0, MAX_PLACES).map((p) => [
      clean(p.name).slice(0, nameMax),
      Math.round(p.lat * SCALE) - centreLat,
      Math.round(p.lon * SCALE) - centreLon,
    ]);
    const label = shortLabel(state.label).slice(0, labelMax);
    const payload = toBase64Url(JSON.stringify([centreLat, centreLon, categoryIndex, label, rows]));
    return `${PREFIX}${VERSION}.${checksum(payload)}.${payload}`;
  };

  // Shrink only if needed: first the label, then very long names.
  let hash = build(SHARE_LABEL, MAX_NAME);
  if (hash.length > MAX_HASH_CHARS) hash = build(40, MAX_NAME);
  if (hash.length > MAX_HASH_CHARS) hash = build(40, 40);
  return hash;
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function metresBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * 111_320;
  const dLon = (bLon - aLon) * 111_320 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

/** Returns null for anything missing, broken, tampered with or out of range. */
export function decodeShare(hash: string): ShareState | null {
  try {
    if (!hash.startsWith(PREFIX)) return null;
    // Chat apps sometimes append punctuation after a link; tolerate that.
    const body = hash.slice(PREFIX.length).replace(/[^A-Za-z0-9_-]+$/, "");
    const parts = body.split(".");
    if (parts.length !== 3) return null;
    const [version, check, payload] = parts;
    if (version !== VERSION || checksum(payload) !== check) return null;

    const data: unknown = JSON.parse(fromBase64Url(payload));
    if (!Array.isArray(data) || data.length !== 5) return null;
    const [centreLat, centreLon, categoryIndex, label, rows] = data as unknown[];

    if (!isInt(centreLat) || !isInt(centreLon)) return null;
    if (Math.abs(centreLat) > 90 * SCALE || Math.abs(centreLon) > 180 * SCALE) return null;
    if (!isInt(categoryIndex) || !CATEGORIES[categoryIndex]) return null;
    if (typeof label !== "string" || label.length > MAX_LABEL) return null;
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_PLACES) return null;

    const center = { lat: centreLat / SCALE, lon: centreLon / SCALE };
    const places: Place[] = [];
    for (const row of rows as unknown[]) {
      if (!Array.isArray(row) || row.length !== 3) return null;
      const [rawName, dLat, dLon] = row as unknown[];
      if (typeof rawName !== "string" || !isInt(dLat) || !isInt(dLon)) return null;
      const name = clean(rawName);
      if (!name || name.length > MAX_NAME) return null;
      const lat = (centreLat + dLat) / SCALE;
      const lon = (centreLon + dLon) / SCALE;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
      if (metresBetween(center.lat, center.lon, lat, lon) > MAX_DISTANCE_M) return null;
      places.push({ id: `shared-${places.length}`, name, lat, lon });
    }

    return {
      center,
      label: clean(label),
      category: CATEGORIES[categoryIndex].id,
      places,
    };
  } catch {
    return null;
  }
}
