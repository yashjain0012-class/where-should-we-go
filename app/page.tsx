"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import FiltersPanel from "@/components/FiltersPanel";
import Wheel, { SLICE_COLORS } from "@/components/Wheel";
import {
  CATEGORIES,
  DEFAULT_RADIUS,
  MAX_RADIUS,
  formatRadius,
  getCategory,
  snapRadius,
} from "@/lib/categories";
import { fireConfetti, stopConfetti } from "@/lib/celebrate";
import {
  NO_FILTERS, activeFilterCount, cuisineOptions, describeAttrs, matchOf, prettyCuisine, selectWheel, type AttrFilters,
} from "@/lib/filters";
import { openStates, type OpenAt } from "@/lib/hours";
import { describeOpenAt } from "@/lib/openAt";
import { mapsUrl } from "@/lib/maps";
import { decodeShare, encodeShare } from "@/lib/share";
import { getMuted, playTicks, setMuted, stopTicks, subscribeMuted, unlockAudio } from "@/lib/sound";
import { pickIndex, targetRotation } from "@/lib/spin";
import { tickTimes } from "@/lib/ticks";
import type { CategoryId, GeocodeResult, OpenState, Place, PlacesResponse } from "@/lib/types";

// Leaflet only runs in the browser, so the map is never rendered on the server.
const PlacesMap = dynamic(() => import("@/components/PlacesMap"), {
  ssr: false,
  loading: () => (
    <div aria-hidden className="h-72 w-full animate-pulse rounded-2xl bg-indigo-100 sm:h-96" />
  ),
});

const SPIN_MS = 5000;
const SPIN_MS_REDUCED = 1200;

type Coords = { lat: number; lon: number; label: string };

const SHARE_HASH = "#s=";

/** Drop a share hash from the address bar so a reload doesn't restore an old shared wheel. */
function clearShareHash() {
  if (window.location.hash.startsWith(SHARE_HASH)) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

/** "Shoreditch, London Borough of Hackney, ..." becomes "Shoreditch, London Borough of Hackney". */
function areaName(label: string): string {
  return label.split(",").slice(0, 2).join(",").trim() || "this area";
}

/** An error from our own API, with the server's suggestion for a smaller radius if it sent one. */
class ApiError extends Error {
  retryRadius?: number;
  constructor(message: string, retryRadius?: number) {
    super(message);
    this.retryRadius = retryRadius;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(50000) });
  } catch {
    throw new ApiError("That took too long or the connection dropped. Please try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      data?.error ?? "Something went wrong. Please try again.",
      typeof data?.retryRadius === "number" ? data.retryRadius : undefined,
    );
  }
  return data as T;
}

/** The wheel: drop places known to be closed (when "Open now" is on), then the closest 8. */
function pickWheel(
  candidates: Place[],
  openNow: boolean,
  states: Record<string, OpenState>,
  filters: AttrFilters,
  preferIndoor = false,
): Place[] {
  return selectWheel(candidates, { openNow, states, filters, preferIndoor });
}

const NO_IDS: ReadonlySet<string> = new Set();

export default function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryId>("restaurants");
  const [coords, setCoords] = useState<Coords | null>(null);
  // Filters: the search radius, "Open now", and the pool of nearest places the API returned.
  // The wheel shows the first 8 of the pool that pass the filters; `options` is that list
  // minus anything the user removed.
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [shownRadius, setShownRadius] = useState(DEFAULT_RADIUS);
  const [openNow, setOpenNow] = useState(false);
  const [openAt, setOpenAt] = useState<OpenAt | null>(null); // null = check hours for right now
  const [filters, setFilters] = useState<AttrFilters>(NO_FILTERS); // cuisine, diet, accessibility
  const [candidates, setCandidates] = useState<Place[]>([]);
  const [tz, setTz] = useState<string | null>(null);
  const [openStateById, setOpenStateById] = useState<Record<string, OpenState>>({});
  const [notice, setNotice] = useState<{ text: string; radius: number; retryRadius?: number } | null>(
    null,
  );
  const [options, setOptions] = useState<Place[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [searched, setSearched] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [duration, setDuration] = useState(SPIN_MS);
  const [winner, setWinner] = useState<Place | null>(null);
  // Sharing: a wheel opened from a link, a broken-link notice, and copy/share feedback.
  const [sharedMode, setSharedMode] = useState(false);
  const [editing, setEditing] = useState(false);
  const [linkProblem, setLinkProblem] = useState(false);
  // Whether this browser has the native share sheet (phones). False on the server.
  const canNativeShare = useSyncExternalStore(
    () => () => {},
    () => typeof navigator.share === "function",
    () => false,
  );
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [shareFallbackUrl, setShareFallbackUrl] = useState<string | null>(null);

  // Sound on/off, remembered between visits. Always "on" for the server render.
  const muted = useSyncExternalStore(subscribeMuted, getMuted, () => false);

  const requestId = useRef(0);
  // The wheel's current rotation, mirrored so handleSpin can read it synchronously.
  const rotationRef = useRef(0);
  const wheelBox = useRef<HTMLDivElement>(null);
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const radiusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackInput = useRef<HTMLInputElement>(null);
  // Mirrors for async callbacks that must not see stale state.
  const openNowRef = useRef(false);
  const openAtRef = useRef<OpenAt | null>(null);
  const filtersRef = useRef<AttrFilters>(NO_FILTERS);
  const goodRadius = useRef(DEFAULT_RADIUS); // radius of the results currently on screen
  const hadResults = useRef(false);

  // What the wheel would show with no manual removals ("Reset options" restores this).
  const fetched = useMemo(
    () => pickWheel(candidates, openNow, openStateById, filters),
    [candidates, openNow, openStateById, filters],
  );
  const cuisineChips = useMemo(() => cuisineOptions(candidates), [candidates]);

  useEffect(
    () => () => {
      if (spinTimer.current) clearTimeout(spinTimer.current);
      if (noteTimer.current) clearTimeout(noteTimer.current);
      if (radiusTimer.current) clearTimeout(radiusTimer.current);
      stopTicks();
      stopConfetti();
    },
    [],
  );

  // Open a wheel from a share link (on load, and when only the #hash changes).
  // Everything is read in the browser, after hydration, so the server HTML never differs.
  useEffect(() => {
    function openSharedLink() {
      if (!window.location.hash.startsWith(SHARE_HASH)) return;
      const shared = decodeShare(window.location.hash);
      if (!shared) {
        clearShareHash();
        setLinkProblem(true);
        return;
      }
      requestId.current++; // ignore any search still in flight
      if (spinTimer.current) clearTimeout(spinTimer.current);
      stopTicks(); // a new wheel arrived mid-spin: cut the sound and any confetti
      stopConfetti();
      setSpinning(false);
      setLinkProblem(false);
      setCoords({ ...shared.center, label: shared.label });
      setCategory(shared.category);
      // A shared wheel carries only names and positions: no opening hours, so "Open now" resets.
      openNowRef.current = false;
      openAtRef.current = null;
      setOpenAt(null);
      filtersRef.current = NO_FILTERS;
      setFilters(NO_FILTERS);
      hadResults.current = true;
      setOpenNow(false);
      setOpenStateById({});
      setTz(null);
      setNotice(null);
      setCandidates(shared.places);
      setOptions(shared.places);
      setSearched(true);
      setQuery(areaName(shared.label).slice(0, 120));
      setLoading(null);
      setError(null);
      setCanRetry(false);
      setWinner(null);
      setShareNote(null);
      setShareFallbackUrl(null);
      setSharedMode(true);
      setEditing(false);
    }
    openSharedLink();
    window.addEventListener("hashchange", openSharedLink);
    return () => window.removeEventListener("hashchange", openSharedLink);
  }, []);

  // Lets end-to-end tests wait until React has taken over: a click before that would submit the form natively.
  useEffect(() => {
    document.body.dataset.hydrated = "true";
  }, []);

  // If the clipboard is blocked we show the link in a field; select it for the user.
  useEffect(() => {
    if (shareFallbackUrl) fallbackInput.current?.select();
  }, [shareFallbackUrl]);

  /**
   * Search around a point. With `keepOnError` (used when only the radius changed), a
   * failure leaves the previous wheel in place and puts the slider back, instead of
   * wiping the screen.
   */
  const loadPlaces = useCallback(
    async (where: Coords, cat: CategoryId, rad: number, keepOnError = false) => {
      if (radiusTimer.current) clearTimeout(radiusTimer.current); // this search supersedes any pending one
      clearShareHash();
      setSharedMode(false);
      setEditing(false);
      setShareNote(null);
      setShareFallbackUrl(null);
      const id = ++requestId.current;
      setLoading(`Finding places within ${formatRadius(rad)}… busy free servers can take up to 30 seconds.`);
      setError(null);
      setCanRetry(false);
      setNotice(null);
      setWinner(null);
      try {
        const data = await fetchJson<PlacesResponse>(
          `/api/places?lat=${where.lat}&lon=${where.lon}&category=${cat}&radius=${rad}`,
        );
        if (id !== requestId.current) return;
        let states: Record<string, OpenState> = {};
        if (openNowRef.current) {
          setLoading("Checking opening hours…");
          states = await openStates(data.places, data.tz, new Date(), openAtRef.current);
          if (id !== requestId.current) return;
        }
        setCandidates(data.places);
        setTz(data.tz);
        setOpenStateById(states);
        setOptions(pickWheel(data.places, openNowRef.current, states, filtersRef.current));
        setSearched(true);
        setShownRadius(rad);
        goodRadius.current = rad;
        hadResults.current = true;
      } catch (e) {
        if (id !== requestId.current) return;
        const message = e instanceof Error ? e.message : "Something went wrong.";
        if (keepOnError && hadResults.current) {
          setRadius(goodRadius.current);
          setNotice({
            text: message,
            radius: rad,
            retryRadius: e instanceof ApiError ? e.retryRadius : undefined,
          });
        } else {
          setCandidates([]);
          setOptions([]);
          setSearched(false);
          hadResults.current = false;
          setError(message);
          setCanRetry(true);
        }
      } finally {
        if (id === requestId.current) setLoading(null);
      }
    },
    [],
  );

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
      await loadPlaces(where, category, radius);
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
        void loadPlaces(where, category, radius);
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
    if (filtersRef.current.cuisines.length) {
      const cleared = { ...filtersRef.current, cuisines: [] };
      filtersRef.current = cleared;
      setFilters(cleared);
    }
    if (coords) void loadPlaces(coords, next, radius);
  }

  // Moving the slider updates the label at once and searches once it settles.
  function handleRadiusChange(value: number) {
    setRadius(value);
    setNotice(null);
    if (radiusTimer.current) clearTimeout(radiusTimer.current);
    if (!coords) return;
    radiusTimer.current = setTimeout(() => void loadPlaces(coords, category, value, true), 600);
  }

  // Search straight away with a specific radius (the "Widen" and "Try smaller" buttons).
  function commitRadius(value: number) {
    if (spinning) return;
    setRadius(value);
    if (coords) void loadPlaces(coords, category, value, true);
  }

  // "Open now" works on the pool we already have, so toggling never needs a new search.
  async function handleOpenNow(next: boolean) {
    if (spinning) return;
    setOpenNow(next);
    openNowRef.current = next;
    setWinner(null);
    if (loading) return; // a search is in flight and will apply the toggle when it lands
    if (!next) {
      setOptions(pickWheel(candidates, false, {}, filtersRef.current));
      return;
    }
    const id = ++requestId.current;
    setLoading("Checking opening hours…");
    const states = await openStates(candidates, tz, new Date(), openAtRef.current);
    if (id !== requestId.current) return;
    setOpenStateById(states);
    setOptions(pickWheel(candidates, true, states, filtersRef.current));
    setLoading(null);
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
    const from = rotationRef.current;
    const to = targetRotation(from, index, options.length, reduced ? 2 : 5);
    rotationRef.current = to;
    stopConfetti();
    setWinner(null);
    setDuration(ms);
    setRotation(to);
    setSpinning(true);
    // Schedule the ticks now, inside the tap (browsers only allow audio after a tap), from
    // the same curve the wheel animates with so they slow down together.
    playTicks(tickTimes(from, to, 360 / options.length, ms), ms / 1000);
    spinTimer.current = setTimeout(() => {
      setSpinning(false);
      setWinner(chosen);
      celebrate();
    }, ms + 60);
  }

  // Confetti from the wheel when it lands (skipped for reduced motion), and make sure the
  // result card is on screen: on a phone it sits below the fold. A short timeout (rather than
  // requestAnimationFrame, which pauses in background tabs) lets React render the card first.
  function celebrate() {
    setTimeout(() => {
      const box = wheelBox.current;
      if (box) {
        const r = box.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (r.left + r.width / 2) / window.innerWidth));
        const y = Math.min(1, Math.max(0, (r.top + r.height * 0.4) / window.innerHeight));
        void fireConfetti({ x, y }, SLICE_COLORS);
      }
      const card = document.querySelector(".result-pop");
      if (card && card.getBoundingClientRect().bottom > window.innerHeight) {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        card.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
      }
    }, 50);
  }

  // Cuisine / diet / accessibility filters work on the pool we already have, so changing them never needs a new search.
  function handleFilters(next: AttrFilters) {
    if (spinning) return;
    setFilters(next);
    filtersRef.current = next;
    setWinner(null);
    setOptions(pickWheel(candidates, openNowRef.current, openStateById, next));
  }

  // Change when "open" is checked (a time on the place's own clock); uses the pool we already have.
  async function handleOpenAt(next: OpenAt | null) {
    if (spinning) return;
    setOpenAt(next);
    openAtRef.current = next;
    setWinner(null);
    if (!openNowRef.current || loading) return; // a pending search will pick the new time up
    const id = ++requestId.current;
    setLoading("Checking opening hours…");
    const states = await openStates(candidates, tz, new Date(), next);
    if (id !== requestId.current) return;
    setOpenStateById(states);
    setOptions(pickWheel(candidates, true, states, filtersRef.current));
    setLoading(null);
  }

  function flashNote(message: string) {
    setShareNote(message);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setShareNote(null), 4000);
  }

  // Built synchronously from what's on screen right now (removed options are left out).
  function buildShareUrl(): string | null {
    if (!coords || options.length === 0 || loading) return null;
    const hash = encodeShare({
      center: { lat: coords.lat, lon: coords.lon },
      label: coords.label,
      category,
      places: options,
    });
    return `${window.location.origin}${window.location.pathname}${hash}`;
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setShareFallbackUrl(null);
      flashNote("Link copied ✓");
    } catch {
      // Clipboard blocked (permissions, insecure context): show the link to copy by hand.
      setShareFallbackUrl(url);
      flashNote("Couldn't copy automatically. Copy the link below.");
    }
  }

  function handleCopy() {
    const url = buildShareUrl();
    if (url) void copyLink(url);
  }

  async function handleShare() {
    // No await before navigator.share(): iOS Safari needs it called straight from the tap.
    const url = buildShareUrl();
    if (!url) return;
    const data = {
      title: "Where should we go?",
      text: `Help us pick! ${options.length} ${getCategory(category)?.label.toLowerCase()} near ${areaName(coords?.label ?? "")}. Spin the wheel:`,
      url,
    };
    if (canNativeShare && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return; // they cancelled
      }
    }
    await copyLink(url);
  }

  const cat = getCategory(category);
  // Stable identity, so the map doesn't re-fit its view on unrelated re-renders.
  const mapCenter = useMemo(
    () => (coords ? { lat: coords.lat, lon: coords.lon } : null),
    [coords],
  );
  const canSpin = options.length >= 2 && !spinning && !loading;
  const removedSome = fetched.length > options.length;

  // Filter feedback: too few places left after the radius and "Open now" are applied.
  const widerRadius = snapRadius(Math.min(MAX_RADIUS, shownRadius * 2));
  const fewMessage =
    candidates.length === 0
      ? `Nothing found within ${formatRadius(shownRadius)}. A wider radius or another category might help.`
      : `${
          fetched.length === 0 ? "No places match" : "Only 1 place matches"
        } these filters within ${formatRadius(shownRadius)}. Try a wider radius${
          openNow ? " or show closed places too" : ""
        }${activeFilterCount(filters) ? ", or clear the cuisine and dietary filters" : ""}.`;
  // With "Open now" on, anything not confirmed open has no usable hours.
  const unknownIds = useMemo<ReadonlySet<string>>(
    () =>
      openNow
        ? new Set(options.filter((p) => openStateById[p.id] !== "open").map((p) => p.id))
        : NO_IDS,
    [openNow, options, openStateById],
  );

  return (
    <main
      className={`mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 sm:gap-6 sm:py-12 ${
        sharedMode && !editing ? "gap-3 py-4" : "gap-6 py-8"
      }`}
    >
      <header className="text-center">
        <h1
          className={`font-extrabold tracking-tight text-indigo-950 sm:text-5xl ${
            sharedMode && !editing ? "text-2xl" : "text-4xl"
          }`}
        >
          Where should we go? 🎡
        </h1>
        <p
          className={`mt-2 text-indigo-900/80 ${sharedMode && !editing ? "hidden sm:block" : ""}`}
        >
          Pick a spot, pick a vibe, and let the wheel settle the argument.
        </p>
      </header>

      {linkProblem && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl bg-amber-100 p-4 text-sm text-amber-950 shadow"
        >
          <p className="flex-1">
            That share link looks broken or incomplete, so here&apos;s a fresh search instead.
          </p>
          <button
            type="button"
            onClick={() => setLinkProblem(false)}
            aria-label="Dismiss"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-amber-200 focus-visible:outline-2 focus-visible:outline-amber-700"
          >
            ✕
          </button>
        </div>
      )}

      {sharedMode && !editing && coords && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 px-4 py-3 shadow backdrop-blur">
          <p className="min-w-0 text-sm text-indigo-950">
            <span className="font-bold">🔗 Shared wheel</span>{" "}
            <span className="text-indigo-900/80">
              · {cat?.emoji} {cat?.label} near {areaName(coords.label)}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-11 shrink-0 rounded-xl border-2 border-indigo-600 bg-white px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            New search
          </button>
        </div>
      )}

      {(!sharedMode || editing) && (
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
                onClick={() => void loadPlaces(coords, category, radius)}
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
      )}

      {(!sharedMode || editing) && (
        <FiltersPanel
          radius={radius}
          onRadiusChange={handleRadiusChange}
          openNow={openNow}
          onOpenNowChange={(next) => void handleOpenNow(next)}
          openAt={openAt}
          onOpenAtChange={(next) => void handleOpenAt(next)}
          filters={filters}
          onFiltersChange={handleFilters}
          cuisineChips={cuisineChips}
          foodCategory={category !== "things"}
          disabled={spinning}
        >
          {notice && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-950"
            >
              <p>
                {notice.text} Your previous {formatRadius(shownRadius)} results are still on the wheel.
              </p>
              <div className="flex flex-wrap gap-2">
                {notice.retryRadius && (
                  <button
                    type="button"
                    onClick={() => commitRadius(notice.retryRadius!)}
                    className="min-h-11 rounded-xl bg-amber-800 px-4 font-semibold text-white hover:bg-amber-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800"
                  >
                    Try {formatRadius(notice.retryRadius)}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => commitRadius(notice.radius)}
                  className="min-h-11 rounded-xl border-2 border-amber-800 bg-white px-4 font-semibold text-amber-900 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800"
                >
                  Try again
                </button>
              </div>
            </div>
          )}
        </FiltersPanel>
      )}

      <section className="flex flex-col items-center gap-6 rounded-3xl bg-white/80 p-4 pt-8 shadow-lg backdrop-blur sm:p-6 sm:pt-10">
        <div ref={wheelBox} className="relative w-full" aria-busy={!!loading}>
          <div className={`transition-opacity ${loading && searched ? "opacity-50" : ""}`}>
            <Wheel
              places={options}
              rotation={rotation}
              spinning={spinning}
              durationMs={duration}
              winnerId={winner?.id ?? null}
            />
          </div>
          {loading && searched && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-indigo-950 px-4 py-2 text-sm font-semibold text-white shadow-lg">
                Updating…
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSpin}
            disabled={!canSpin}
            className="rounded-full bg-gradient-to-r from-pink-500 via-orange-500 to-yellow-400 px-12 py-4 text-xl font-extrabold text-white shadow-lg transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {spinning ? "Spinning…" : winner ? "Spin again" : "Spin!"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMuted(!muted);
              if (muted) unlockAudio(); // turning sound back on is a tap: prepare audio now
            }}
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            title={muted ? "Sound is off" : "Sound is on"}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-xl shadow ring-1 ring-indigo-100 transition hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <span aria-hidden>{muted ? "🔇" : "🔊"}</span>
          </button>
        </div>

        {options.length > 0 && (
          <div className="flex w-full max-w-md flex-col items-stretch gap-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              {canNativeShare && (
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  disabled={options.length < 2 || !!loading}
                  className="min-h-11 flex-1 rounded-xl bg-indigo-950 px-4 py-2 font-semibold text-white shadow transition hover:bg-indigo-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Share this wheel
                </button>
              )}
              <button
                type="button"
                onClick={handleCopy}
                disabled={options.length < 2 || !!loading}
                className={`min-h-11 flex-1 rounded-xl px-4 py-2 font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 ${
                  canNativeShare
                    ? "border-2 border-indigo-600 bg-white text-indigo-700 hover:bg-indigo-50"
                    : "bg-indigo-950 text-white shadow hover:bg-indigo-900"
                }`}
              >
                {canNativeShare ? "Copy link" : "Copy share link"}
              </button>
            </div>
            <p
              aria-live="polite"
              className={shareNote ? "text-center text-sm font-semibold text-indigo-900" : "sr-only"}
            >
              {shareNote}
            </p>
            {shareFallbackUrl && (
              <input
                ref={fallbackInput}
                readOnly
                value={shareFallbackUrl}
                aria-label="Share link"
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-xl border-2 border-indigo-200 bg-white px-3 py-2 text-xs text-indigo-950"
              />
            )}
          </div>
        )}

        {!options.length && !loading && !searched && (
          <p className="text-center text-sm text-indigo-900/70">
            Search a place above to fill the wheel with nearby {cat?.label.toLowerCase()}.
          </p>
        )}
        {searched && !loading && !sharedMode && fetched.length < 2 && (
          <div
            role="status"
            className="flex max-w-md flex-col items-center gap-3 text-center text-sm text-indigo-900"
          >
            <p>{fewMessage}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {shownRadius < MAX_RADIUS && (
                <button
                  type="button"
                  onClick={() => commitRadius(widerRadius)}
                  disabled={spinning}
                  className="min-h-11 rounded-xl bg-indigo-600 px-4 font-semibold text-white shadow hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
                >
                  Widen to {formatRadius(widerRadius)}
                </button>
              )}
              {openNow && (
                <button
                  type="button"
                  onClick={() => void handleOpenNow(false)}
                  disabled={spinning}
                  className="min-h-11 rounded-xl border-2 border-indigo-600 bg-white px-4 font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
                >
                  Show closed places too
                </button>
              )}
              {activeFilterCount(filters) > 0 && (
                <button
                  type="button"
                  onClick={() => handleFilters(NO_FILTERS)}
                  disabled={spinning}
                  className="min-h-11 rounded-xl border-2 border-indigo-600 bg-white px-4 font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}
        {options.length === 1 && !loading && (fetched.length >= 2 || sharedMode) && (
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
              {describeAttrs(winner.attrs).length > 0 && (
                <p className="mt-1 text-sm text-indigo-200">{describeAttrs(winner.attrs).join(" · ")}</p>
              )}
              {openNow && (
                <p className="mt-1 text-sm text-indigo-200">
                  {unknownIds.has(winner.id) ? "Hours unknown. Check before you go." : `Open ${describeOpenAt(openAt)}`}
                </p>
              )}
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
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                  >
                    {i + 1}
                  </span>
                  <span className="max-w-[12rem] truncate">{p.name}</span>
                  {p.attrs?.cuisine?.[0] && (
                    <span className="hidden shrink-0 text-[11px] text-slate-500 sm:inline">{prettyCuisine(p.attrs.cuisine[0])}</span>
                  )}
                  {activeFilterCount(filters) > 0 && matchOf(p, filters) === "unknown" && (
                    <span
                      title="Not tagged in OpenStreetMap, so it may or may not match"
                      className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                    >
                      unconfirmed
                    </span>
                  )}
                  {openNow &&
                    (unknownIds.has(p.id) ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        hours unknown
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">
                        open
                      </span>
                    ))}
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

        {(options.length > 0 || (searched && coords)) && (
          <div className="w-full">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-indigo-900">
              Map
            </h2>
            <PlacesMap
              places={options}
              winnerId={winner?.id ?? null}
              center={mapCenter}
              hoursUnknown={unknownIds}
            />
            <p className="mt-2 text-xs text-indigo-900/70">
              Tap a pin for its name and a Google Maps link. Pin colours and numbers match the wheel.
            </p>
          </div>
        )}
      </section>

      <footer className="pb-4 text-center text-xs text-indigo-900/70">
        Place data © OpenStreetMap contributors · Geocoding by Nominatim · Search by Overpass
      </footer>
    </main>
  );
}
