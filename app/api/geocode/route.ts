import type { NextRequest } from "next/server";
import type { GeocodeResult } from "@/lib/types";

const USER_AGENT = "where-should-we-go/1.0 (decision spinner demo)";

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (!q) {
    return Response.json({ error: "Type a neighbourhood or city." }, { status: 400 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
  } catch {
    return Response.json(
      { error: "The location service didn't respond. Try again in a moment." },
      { status: 502 },
    );
  }

  if (!res.ok) {
    return Response.json(
      { error: "The location service is busy. Try again in a moment." },
      { status: 502 },
    );
  }

  const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  const hit = data[0];
  if (!hit) {
    return Response.json(
      { error: `Couldn't find "${q}". Try a nearby neighbourhood or city.` },
      { status: 404 },
    );
  }

  const result: GeocodeResult = {
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    label: hit.display_name,
  };
  return Response.json(result, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
