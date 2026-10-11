import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { parseForecast } from "@/lib/weather";

const USER_AGENT = "where-should-we-go/1.0 (decision spinner demo)";

/** Current weather and the next few hours' rain chance, from Open-Meteo (free, no key; data CC BY 4.0). */
export async function GET(request: NextRequest) {
  const limited = rateLimit(request, "weather", 30);
  if (limited) return limited;

  const sp = request.nextUrl.searchParams;
  // Two decimals (about 1 km) is plenty for weather, shares cache entries, and keeps exact positions out of requests.
  const lat = Math.round(Number(sp.get("lat")) * 100) / 100;
  const lon = Math.round(Number(sp.get("lon")) * 100) / 100;
  if (!sp.get("lat") || !sp.get("lon") || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "Invalid location." }, { status: 400 });
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", "temperature_2m,precipitation,weather_code");
  url.searchParams.set("hourly", "precipitation_probability");
  url.searchParams.set("forecast_hours", "4");
  url.searchParams.set("timezone", "auto");

  let weather;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 600 },
    });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    weather = parseForecast(await res.json());
  } catch {
    return Response.json({ error: "The weather service didn't respond." }, { status: 502 });
  }
  if (!weather) return Response.json({ error: "The weather service sent something unexpected." }, { status: 502 });

  return Response.json(weather, {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" },
  });
}
