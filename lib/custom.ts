import { english, type Translate } from "./i18n";
import { checksum, clean, fromBase64Url, toBase64Url } from "./share";
import type { Place } from "./types";

/**
 * "My own list" mode: any options at all (movies, chores, team lunch), each with an optional weight.
 * The text format is one option per line; a trailing "x3" (or "*3", "×3") makes its slice three times as big.
 */

export const MAX_ITEMS = 12;
export const MAX_NAME = 40;
export const MAX_WEIGHT = 5;

export interface CustomItem {
  name: string;
  weight: number;
}

export interface ParsedCustom {
  items: CustomItem[];
  /** Plain-language things the person should know, such as "Dropped 3 beyond the first 12". */
  notes: string[];
}

const WEIGHT_SUFFIX = /\s*[x×*]\s*(\d{1,3})\s*$/i;

export function parseCustomText(text: string, t: Translate = english): ParsedCustom {
  let lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // "pizza, tacos, sushi" on one line is a list too.
  if (lines.length === 1 && lines[0].includes(",")) lines = lines[0].split(",").map((l) => l.trim()).filter(Boolean);

  const items: CustomItem[] = [];
  const seen = new Set<string>();
  const notes: string[] = [];
  let duplicates = 0;
  let cut = 0;
  let clamped = 0;
  let overflow = 0;

  for (const line of lines) {
    let name = line;
    let weight = 1;
    const m = WEIGHT_SUFFIX.exec(line);
    if (m && line.slice(0, m.index).trim()) {
      name = line.slice(0, m.index);
      weight = Number(m[1]);
      if (weight < 1) weight = 1;
      if (weight > MAX_WEIGHT) {
        weight = MAX_WEIGHT;
        clamped++;
      }
    }
    name = clean(name);
    if (!name) continue;
    if (name.length > MAX_NAME) {
      name = name.slice(0, MAX_NAME).trimEnd();
      cut++;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    if (items.length >= MAX_ITEMS) {
      overflow++;
      continue;
    }
    seen.add(key);
    items.push({ name, weight });
  }

  if (overflow) notes.push(t("Only the first {max} fit on the wheel; {n} left off.", { max: MAX_ITEMS, n: overflow }));
  if (duplicates) notes.push(duplicates === 1 ? t("1 repeated option was left out.") : t("{n} repeated options were left out.", { n: duplicates }));
  if (cut) notes.push(cut === 1 ? t("1 long name was shortened to {max} characters.", { max: MAX_NAME }) : t("{n} long names were shortened to {max} characters.", { n: cut, max: MAX_NAME }));
  if (clamped) notes.push(t("Weights go up to {max}.", { max: MAX_WEIGHT }));
  return { items, notes };
}

/** The editable text for a list (the reverse of parseCustomText). */
export function customToText(items: CustomItem[]): string {
  return items.map((i) => (i.weight > 1 ? `${i.name} x${i.weight}` : i.name)).join("\n");
}

/** Wheel entries for a list. They have no location, so the map and place links are not offered for them. */
export function customPlaces(items: CustomItem[]): Place[] {
  return items.map((item, i) => ({ id: `custom-${i}`, name: item.name, lat: 0, lon: 0 }));
}

// --- Share links for custom lists: #c=1.<checksum>.<payload> ---------------------------

const PREFIX = "#c=";
const VERSION = "1";
export const MAX_CUSTOM_HASH = 1900;

/** payload = base64url(UTF-8 JSON) of [[name, weight], ...] */
export function encodeCustom(items: CustomItem[]): string {
  const rows = items.slice(0, MAX_ITEMS).map((i) => [clean(i.name).slice(0, MAX_NAME), Math.min(MAX_WEIGHT, Math.max(1, Math.round(i.weight)))]);
  const payload = toBase64Url(JSON.stringify(rows));
  return `${PREFIX}${VERSION}.${checksum(payload)}.${payload}`;
}

/** Returns null for anything missing, broken, tampered with or out of range. */
export function decodeCustom(hash: string): CustomItem[] | null {
  try {
    if (!hash.startsWith(PREFIX)) return null;
    const body = hash.slice(PREFIX.length).replace(/[^A-Za-z0-9_-]+$/, "");
    if (body.length + PREFIX.length > MAX_CUSTOM_HASH + 100) return null;
    const parts = body.split(".");
    if (parts.length !== 3) return null;
    const [version, check, payload] = parts;
    if (version !== VERSION || checksum(payload) !== check) return null;

    const data: unknown = JSON.parse(fromBase64Url(payload));
    if (!Array.isArray(data) || data.length < 1 || data.length > MAX_ITEMS) return null;
    const items: CustomItem[] = [];
    for (const row of data as unknown[]) {
      if (!Array.isArray(row) || row.length !== 2) return null;
      const [rawName, weight] = row as unknown[];
      if (typeof rawName !== "string" || typeof weight !== "number" || !Number.isInteger(weight)) return null;
      const name = clean(rawName);
      if (!name || name.length > MAX_NAME || weight < 1 || weight > MAX_WEIGHT) return null;
      items.push({ name, weight });
    }
    return items;
  } catch {
    return null;
  }
}
