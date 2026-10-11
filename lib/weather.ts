/** What the weather means for choosing where to go. Built from Open-Meteo's forecast answer (free, no key). */
export interface WeatherNow {
  tempC: number;
  /** WMO weather code, see https://open-meteo.com/en/docs */
  code: number;
  label: string;
  emoji: string;
  raining: boolean;
  /** Rain looks likely within the next few hours. */
  rainSoon: boolean;
  /** Raining or about to: outdoor places are best avoided. */
  wet: boolean;
}

interface Described {
  label: string;
  emoji: string;
}

/** WMO codes grouped the way people talk about them. */
export function describeCode(code: number): Described {
  if (code === 0) return { label: "Clear", emoji: "☀️" };
  if (code === 1 || code === 2) return { label: "Mostly clear", emoji: "🌤️" };
  if (code === 3) return { label: "Cloudy", emoji: "☁️" };
  if (code === 45 || code === 48) return { label: "Fog", emoji: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", emoji: "🌦️" };
  if (code >= 61 && code <= 67) return { label: "Rain", emoji: "🌧️" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Snow", emoji: "🌨️" };
  if (code >= 80 && code <= 82) return { label: "Showers", emoji: "🌦️" };
  if (code >= 95 && code <= 99) return { label: "Thunderstorm", emoji: "⛈️" };
  return { label: "Unsettled", emoji: "🌥️" };
}

/** Rain, drizzle, showers, snow or thunder: weather you would rather not be outdoors in. */
export function isWetCode(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 71 && code <= 77) || (code >= 80 && code <= 86) || code >= 95;
}

const RAIN_SOON_PERCENT = 50;
const HOURS_AHEAD = 3;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Open-Meteo's `current` values plus the next hours' rain probability. Returns null if the answer is not
 * recognisable, so a changed or broken service just means no weather is shown.
 */
export function parseForecast(json: unknown): WeatherNow | null {
  if (typeof json !== "object" || json === null) return null;
  const root = json as { current?: Record<string, unknown>; hourly?: Record<string, unknown> };
  const temp = num(root.current?.temperature_2m);
  const code = num(root.current?.weather_code);
  if (temp === null || code === null) return null;

  const precipitation = num(root.current?.precipitation) ?? 0;
  const probabilities = Array.isArray(root.hourly?.precipitation_probability)
    ? (root.hourly!.precipitation_probability as unknown[]).slice(0, HOURS_AHEAD + 1).map(num).filter((n): n is number => n !== null)
    : [];

  const raining = precipitation >= 0.1 || isWetCode(code);
  const rainSoon = !raining && probabilities.some((p) => p >= RAIN_SOON_PERCENT);
  const { label, emoji } = describeCode(code);
  return {
    tempC: Math.round(temp),
    code,
    label: rainSoon ? "Rain likely soon" : label,
    emoji: rainSoon ? "🌦️" : emoji,
    raining,
    rainSoon,
    wet: raining || rainSoon,
  };
}
