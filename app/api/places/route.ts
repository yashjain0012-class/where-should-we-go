import type { NextRequest } from "next/server";
import { MAX_PLACES, RADIUS_METERS, getCategory } from "@/lib/categories";
import { rateLimit } from "@/lib/rateLimit";
import type { Place } from "@/lib/types";

export const maxDuration = 45;

const USER_AGENT = "where-should-we-go/1.0 (decision spinner demo)";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: { name?: string };
}

function buildQuery(lat: number, lon: number, filters: string[]): string {
  const around = `(around:${RADIUS_METERS},${lat},${lon})`;
  const parts = filters.map((f) => `nwr${f}["name"]${around};`).join("\n  ");
  return `[out:json][timeout:25];\n(\n  ${parts}\n);\nout center 60;`;
}

async function fetchOverpass(endpoint: string, query: string): Promise<OverpassElement[]> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const json = (await res.json()) as { elements: OverpassElement[] };
  return json.elements;
}

// Ask every mirror at once and take the first good answer.
function queryOverpass(query: string): Promise<OverpassElement[]> {
  return Promise.any(OVERPASS_ENDPOINTS.map((e) => fetchOverpass(e, query)));
}

// Tiny per-instance cache so repeat searches don't hammer the free servers.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; elements: OverpassElement[] }>();

async function cachedQuery(key: string, query: string): Promise<OverpassElement[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.elements;
  const elements = await queryOverpass(query);
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), elements });
  return elements;
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, "places", 30);
  if (limited) return limited;

  const sp = request.nextUrl.searchParams;
  // Round to 3 decimals (~110 m): near-identical requests then share one cache entry.
  const lat = Math.round(Number(sp.get("lat")) * 1000) / 1000;
  const lon = Math.round(Number(sp.get("lon")) * 1000) / 1000;
  const category = getCategory(sp.get("category"));

  if (
    !sp.get("lat") ||
    !sp.get("lon") ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180 ||
    !category
  ) {
    return Response.json({ error: "Invalid location or category." }, { status: 400 });
  }

  let elements: OverpassElement[];
  try {
    const key = `${category.id}:${lat.toFixed(3)},${lon.toFixed(3)}`;
    elements = await cachedQuery(key, buildQuery(lat, lon, category.filters));
  } catch {
    return Response.json(
      { error: "The places service is busy right now. Try again in a moment." },
      { status: 502 },
    );
  }

  const seen = new Set<string>();
  const places: Place[] = [];
  for (const el of elements) {
    const name = el.tags?.name?.trim();
    const pLat = el.lat ?? el.center?.lat;
    const pLon = el.lon ?? el.center?.lon;
    if (!name || pLat === undefined || pLon === undefined) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({ id: `${el.type}/${el.id}`, name, lat: pLat, lon: pLon });
  }

  return Response.json(
    { places: shuffle(places).slice(0, MAX_PLACES) },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } },
  );
}
