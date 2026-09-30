"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Wheel, { SLICE_COLORS } from "@/components/Wheel";
import { CATEGORIES, getCategory } from "@/lib/categories";
import { pickIndex, targetRotation } from "@/lib/spin";
import type { CategoryId, GeocodeResult, Place } from "@/lib/types";

const SPIN_MS = 5000;
const SPIN_MS_REDUCED = 1200;

type Coords = { lat: number; lon: number; label: string };

function mapsUrl(place: Place): string {
  const query = encodeURIComponent(`${place.name} ${place.lat},${place.lon}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(50000) });
  } catch {
    throw new Error("That took too long or the connection dropped. Please try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Something went wrong. Please try again.");
  return data as T;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryId>("restaurants");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [fetched, setFetched] = useState<Place[]>([]);
  const [options, setOptions] = useState<Place[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [searched, setSearched] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [duration, setDuration] = useState(SPIN_MS);
  const [winner, setWinner] = useState<Place | null>(null);

  const requestId = useRef(0);
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (spinTimer.current) clearTimeout(spinTimer.current);
    },
    [],
  );

  const loadPlaces = useCallback(async (where: Coords, cat: CategoryId) => {
    const id = ++requestId.current;
    setLoading("Finding places within 1 km… busy free servers can take up to 30 seconds.");
    setError(null);
    setCanRetry(false);
    setWinner(null);
    try {
      const data = await fetchJson<{ places: Place[] }>(
        `/api/places?lat=${where.lat}&lon=${where.lon}&category=${cat}`,
      );
      if (id !== requestId.current) return;
      setFetched(data.places);
      setOptions(data.places);
      setSearched(true);
    } catch (e) {
      if (id !== requestId.current) return;
      setFetched([]);
      setOptions([]);
      setSearched(false);
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setCanRetry(true);
    } finally {
      if (id === requestId.current) setLoading(null);
    }
  }, []);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (spinning) return;
    const q = query.trim();
    if (!q) {
      setError("Type a neighbourhood or city first, or use your location.");
      return;
    }
    const id = ++requestId.current;
    setLoading("Looking up that location…");
    setError(null);
    setCanRetry(false);
    setWinner(null);
    try {
      const geo = await fetchJson<GeocodeResult>(`/api/geocode?q=${encodeURIComponent(q)}`);
      if (id !== requestId.current) return;
      const where = { lat: geo.lat, lon: geo.lon, label: geo.label };
      setCoords(where);
      await loadPlaces(where, category);
    } catch (err) {
      if (id !== requestId.current) return;
      setLoading(null);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function handleUseLocation() {
    if (spinning) return;
    if (!("geolocation" in navigator)) {
      setError("Your browser doesn't support location. Type a neighbourhood instead.");
      return;
    }
    setLoading("Getting your location…");
    setError(null);
    setCanRetry(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const where = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          label: "Your location",
        };
        setQuery("My location");
        setCoords(where);
        void loadPlaces(where, category);
      },
      (err) => {
        setLoading(null);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Type a neighbourhood instead."
            : "Couldn't get your location. Type a neighbourhood instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  }

  function handleCategory(next: CategoryId) {
    if (spinning || next === category) return;
    setCategory(next);
    if (coords) void loadPlaces(coords, next);
  }

  function removeOption(id: string) {
    if (spinning) return;
    setOptions((prev) => prev.filter((p) => p.id !== id));
    setWinner(null);
  }

  function handleSpin() {
    if (spinning || options.length < 2) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduced ? SPIN_MS_REDUCED : SPIN_MS;
    const index = pickIndex(options.length);
    const chosen = options[index];
    setWinner(null);
    setDuration(ms);
    setRotation((current) => targetRotation(current, index, options.length, reduced ? 2 : 5));
    setSpinning(true);
    spinTimer.current = setTimeout(() => {
      setSpinning(false);
      setWinner(chosen);
    }, ms + 60);
  }

  const cat = getCategory(category);
  const canSpin = options.length >= 2 && !spinning && !loading;
  const removedSome = fetched.length > options.length;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:py-12">
      <header className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-indigo-950 sm:text-5xl">
          Where should we go? 🎡
        </h1>
        <p className="mt-2 text-indigo-900/80">
          Pick a spot, pick a vibe, and let the wheel settle the argument.
        </p>
      </header>

      <form
        onSubmit={handleSearch}
        className="flex flex-col gap-4 rounded-3xl bg-white/80 p-4 shadow-lg backdrop-blur sm:p-6"
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="location">
            Neighbourhood or city
          </label>
          <input
            id="location"
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 120))}
            placeholder="Neighbourhood or city, e.g. Shoreditch, London"
            className="min-w-0 flex-1 rounded-xl border-2 border-indigo-200 bg-white px-4 py-3 text-indigo-950 placeholder:text-indigo-900/50 focus:border-indigo-500 focus:outline-none"
            autoComplete="off"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!!loading || spinning}
              className="flex-1 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white shadow transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              Search
            </button>
            <button
              type="button"
              onClick={handleUseLocation}
              disabled={!!loading || spinning}
              className="flex-1 rounded-xl border-2 border-indigo-600 bg-white px-4 py-3 font-semibold text-indigo-700 transition hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              📍 Use my location
            </button>
          </div>
        </div>

        <fieldset>
          <legend className="sr-only">Category</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => handleCategory(c.id)}
                disabled={spinning}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 ${
                  category === c.id
                    ? "bg-indigo-950 text-white shadow"
                    : "bg-indigo-100 text-indigo-900 hover:bg-indigo-200"
                }`}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </fieldset>

        {loading && (
          <p role="status" className="flex items-center gap-2 text-sm text-indigo-900">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            {loading}
          </p>
        )}
        {error && (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">
            <span>{error}</span>
            {canRetry && coords && (
              <button
                type="button"
                onClick={() => void loadPlaces(coords, category)}
                className="rounded-lg bg-red-100 px-3 py-1 font-semibold text-red-800 hover:bg-red-200"
              >
                Try again
              </button>
            )}
          </div>
        )}
        {coords && !loading && !error && (
          <p className="truncate text-xs text-indigo-900/70" title={coords.label}>
            Near: {coords.label}
          </p>
        )}
      </form>

      <section className="flex flex-col items-center gap-6 rounded-3xl bg-white/80 p-4 pt-8 shadow-lg backdrop-blur sm:p-6 sm:pt-10">
        <Wheel places={options} rotation={rotation} spinning={spinning} durationMs={duration} />

        <button
          type="button"
          onClick={handleSpin}
          disabled={!canSpin}
          className="rounded-full bg-gradient-to-r from-pink-500 via-orange-500 to-yellow-400 px-12 py-4 text-xl font-extrabold text-white shadow-lg transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          {spinning ? "Spinning…" : winner ? "Spin again" : "Spin!"}
        </button>

        {!options.length && !loading && !searched && (
          <p className="text-center text-sm text-indigo-900/70">
            Search a place above to fill the wheel with nearby {cat?.label.toLowerCase()}.
          </p>
        )}
        {searched && !loading && fetched.length === 0 && (
          <p className="text-center text-sm text-indigo-900">
            Nothing found within 1 km. Try another category or a busier area.
          </p>
        )}
        {options.length === 1 && !loading && (
          <p className="text-center text-sm text-indigo-900">
            Only one option left. Reset the options to spin again.
          </p>
        )}

        <div aria-live="polite" className="w-full">
          {winner && (
            <div className="result-pop mx-auto w-full max-w-md rounded-2xl bg-indigo-950 p-5 text-center text-white shadow-xl">
              <p className="text-sm uppercase tracking-widest text-indigo-200">
                {cat?.emoji} Let&apos;s go to
              </p>
              <p className="mt-1 text-2xl font-extrabold">{winner.name}</p>
              <a
                href={mapsUrl(winner)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block rounded-full bg-white px-5 py-2 font-semibold text-indigo-950 hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Open in Google Maps ↗
              </a>
            </div>
          )}
        </div>

        {options.length > 0 && (
          <div className="w-full">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-900">
                Options ({options.length})
              </h2>
              {removedSome && (
                <button
                  type="button"
                  disabled={spinning}
                  onClick={() => {
                    setOptions(fetched);
                    setWinner(null);
                  }}
                  className="text-sm font-semibold text-indigo-700 underline disabled:opacity-50"
                >
                  Reset options
                </button>
              )}
            </div>
            <ul className="flex flex-wrap gap-2">
              {options.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-full bg-white py-1 pl-3 pr-1 text-sm text-indigo-950 shadow-sm ring-1 ring-indigo-100"
                >
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                  />
                  <span className="max-w-[12rem] truncate">{p.name}</span>
                  <button
                    type="button"
                    onClick={() => removeOption(p.id)}
                    disabled={spinning}
                    aria-label={`Remove ${p.name}`}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-indigo-700 hover:bg-red-100 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {searched && options.length === 0 && fetched.length > 0 && (
          <button
            type="button"
            onClick={() => setOptions(fetched)}
            className="rounded-full bg-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-200"
          >
            Reset options
          </button>
        )}
      </section>

      <footer className="pb-4 text-center text-xs text-indigo-900/70">
        Place data © OpenStreetMap contributors · Geocoding by Nominatim · Search by Overpass
      </footer>
    </main>
  );
}
