import type { NextRequest } from "next/server";
import tzLookup from "tz-lookup";
import {
  DEFAULT_RADIUS,
  MAX_RADIUS,
  MIN_RADIUS,
  formatRadius,
  getCategory,
  snapRadius,
} from "@/lib/categories";
import { buildQuery, parseCandidates, type OverpassElement } from "@/lib/overpass";
import { rateLimit } from "@/lib/rateLimit";
import type { PlacesResponse } from "@/lib/types";

export const maxDuration = 45;

const USER_AGENT = "where-should-we-go/1.0 (decision spinner demo)";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/** Bigger areas get more time, but always stay inside maxDuration. */
function timeoutSeconds(radius: number): number {
  return radius <= 2000 ? 20 : 28;
}

function timeoutError(message: string): Error {
  const err = new Error(message);
  err.name = "TimeoutError";
  return err;
}

async function fetchOverpass(endpoint: string, query: string, seconds: number): Promise<OverpassElement[]> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout((seconds + 4) * 1000),
    cache: "no-store",
  });
  if (res.status === 504) throw timeoutError("Overpass gateway timeout");
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const json = (await res.json()) as { elements: OverpassElement[]; remark?: string };
  // Overpass reports a query that ran out of time or memory with a 200 and a remark.
  if (typeof json.remark === "string" && /timed out|out of memory/i.test(json.remark)) {
    throw timeoutError(json.remark);
  }
  return json.elements;
}

// Ask every mirror at once and take the first good answer.
function queryOverpass(query: string, seconds: number): Promise<OverpassElement[]> {
  return Promise.any(OVERPASS_ENDPOINTS.map((e) => fetchOverpass(e, query, seconds)));
}

// Tiny per-instance cache so repeat searches don't hammer the free servers.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; body: PlacesResponse }>();

function failure(radius: number, timedOut: boolean): Response {
  // A smaller radius is much more likely to finish on the free servers.
  const retryRadius = radius > 1000 ? Math.max(1000, snapRadius(radius / 2)) : undefined;
  const problem = timedOut
    ? `Searching ${formatRadius(radius)} took too long.`
    : "The places service is busy right now.";
  const hint = retryRadius ? ` Try ${formatRadius(retryRadius)}.` : " Try again in a moment.";
  return Response.json(
    { error: problem + hint, code: timedOut ? "timeout" : "busy", retryRadius },
    { status: timedOut ? 504 : 502 },
  );
}

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, "places", 30);
  if (limited) return limited;

  const sp = request.nextUrl.searchParams;
  // Round to 3 decimals (~110 m): near-identical requests then share one cache entry.
  const lat = Math.round(Number(sp.get("lat")) * 1000) / 1000;
  const lon = Math.round(Number(sp.get("lon")) * 1000) / 1000;
  const category = getCategory(sp.get("category"));
  const rawRadius = sp.get("radius");
  const radiusInput = rawRadius === null ? DEFAULT_RADIUS : Number(rawRadius);

  if (
    !sp.get("lat") ||
    !sp.get("lon") ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180 ||
    !category ||
    !Number.isFinite(radiusInput) ||
    radiusInput < MIN_RADIUS ||
    radiusInput > MAX_RADIUS
  ) {
    return Response.json({ error: "Invalid location, category or distance." }, { status: 400 });
  }
  const radius = snapRadius(radiusInput);

  const key = `${category.id}:${lat.toFixed(3)},${lon.toFixed(3)}:${radius}`;
  let body: PlacesResponse;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    body = hit.body;
  } else {
    const seconds = timeoutSeconds(radius);
    let elements: OverpassElement[];
    try {
      elements = await queryOverpass(buildQuery(lat, lon, category.filters, radius, seconds), seconds);
    } catch (err) {
      const errors = err instanceof AggregateError ? err.errors : [err];
      const timedOut = errors.some(
        (e) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"),
      );
      return failure(radius, timedOut);
    }

    let tz: string | null = null;
    try {
      tz = tzLookup(lat, lon);
    } catch {
      tz = null;
    }
    body = { places: parseCandidates(elements, { lat, lon }), tz };
    if (cache.size > 200) cache.clear();
    cache.set(key, { at: Date.now(), body });
  }

  return Response.json(body, {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
  });
}
