"use client";

// Leaflet touches `window` on import, so this module must only ever run in the
// browser: page.tsx loads it with next/dynamic({ ssr: false }), and Leaflet itself
// is imported inside an effect below.
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { SLICE_COLORS } from "@/components/Wheel";
import { mapsUrl } from "@/lib/maps";
import type { Place } from "@/lib/types";

interface PlacesMapProps {
  places: Place[];
  winnerId: string | null;
  center: { lat: number; lon: number } | null;
}

const WINNER_ZOOM = 17;
const FIT_MAX_ZOOM = 16;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function makeIcon(L: typeof Leaflet, index: number, winner: boolean): Leaflet.DivIcon {
  const color = SLICE_COLORS[index % SLICE_COLORS.length];
  // Only a number and a palette colour go into this HTML; no place data.
  return L.divIcon({
    className: "pin-wrap",
    html: `<div class="pin${winner ? " pin--winner" : ""}" style="background:${color}">${index + 1}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

// Place names are untrusted (OpenStreetMap, and later share links): DOM nodes + textContent only.
function buildPopup(place: Place): HTMLElement {
  const wrap = document.createElement("div");
  const name = document.createElement("strong");
  name.className = "maps-popup-name";
  name.textContent = place.name;
  const link = document.createElement("a");
  link.className = "maps-link";
  link.href = mapsUrl(place);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Open in Google Maps ↗";
  wrap.append(name, link);
  return wrap;
}

export default function PlacesMap({ places, winnerId, center }: PlacesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const markersRef = useRef(new Map<string, Leaflet.Marker>());
  const signaturesRef = useRef(new Map<string, string>());
  // Latest "fit all pins / zoom to winner" routine, and whether the user has moved the map since.
  const refitRef = useRef<((animate: boolean) => void) | null>(null);
  const userMovedRef = useRef(false);
  const [ready, setReady] = useState(false);

  // Create the map once, in the browser only.
  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | null = null;
    let observer: ResizeObserver | null = null;
    const markers = markersRef.current;
    const signatures = signaturesRef.current;

    (async () => {
      const mod = await import("leaflet");
      const L = ((mod as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
      if (cancelled || !containerRef.current) return;

      const start = center ?? (places[0] ? { lat: places[0].lat, lon: places[0].lon } : null);
      map = L.map(containerRef.current, {
        scrollWheelZoom: false,
        // On touch devices a one-finger swipe should scroll the page, not drag the map.
        // Pinch-zoom (which also pans) and tapping pins still work.
        dragging: !L.Browser.mobile,
      }).setView(start ? [start.lat, start.lon] : [0, 0], start ? 15 : 2);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);

      // When the container settles or resizes (rotation, late layout), fix the tiles and
      // re-fit the view, unless the user has already panned or zoomed.
      observer = new ResizeObserver(() => {
        map?.invalidateSize();
        if (!userMovedRef.current) refitRef.current?.(false);
      });
      observer.observe(containerRef.current);
      const markMoved = () => {
        userMovedRef.current = true;
      };
      for (const type of ["pointerdown", "wheel", "keydown"]) {
        containerRef.current.addEventListener(type, markMoved, { passive: true });
      }

      mapRef.current = map;
      leafletRef.current = L;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      refitRef.current = null;
      markers.clear();
      signatures.clear();
      setReady(false);
    };
    // The map is created once; later changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep pins in sync with the options, then fit the view or zoom to the winner.
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!ready || !map || !L) return;
    const markers = markersRef.current;
    const signatures = signaturesRef.current;
    const animate = !prefersReducedMotion();

    const live = new Set(places.map((p) => p.id));
    for (const [id, marker] of markers) {
      if (!live.has(id)) {
        marker.remove();
        markers.delete(id);
        signatures.delete(id);
      }
    }

    places.forEach((place, i) => {
      const isWinner = place.id === winnerId;
      const signature = `${i}|${isWinner}`;
      let marker = markers.get(place.id);
      if (!marker) {
        marker = L.marker([place.lat, place.lon], {
          icon: makeIcon(L, i, isWinner),
          title: `${i + 1}. ${place.name}`,
          alt: `${i + 1}. ${place.name}`,
          keyboard: true,
        })
          .bindPopup(buildPopup(place))
          .addTo(map);
        markers.set(place.id, marker);
        signatures.set(place.id, signature);
      } else if (signatures.get(place.id) !== signature) {
        // Number and colour follow the option's position, like the wheel slice.
        marker.options.title = `${i + 1}. ${place.name}`;
        marker.options.alt = `${i + 1}. ${place.name}`;
        marker.setIcon(makeIcon(L, i, isWinner));
        signatures.set(place.id, signature);
      }
      marker.setZIndexOffset(isWinner ? 1000 : 0);
    });

    const winner = winnerId ? places.find((p) => p.id === winnerId) : undefined;
    const applyView = (animateView: boolean) => {
      if (winner) {
        map.flyTo([winner.lat, winner.lon], WINNER_ZOOM, { animate: animateView, duration: 1.2 });
      } else if (places.length === 1) {
        map.setView([places[0].lat, places[0].lon], FIT_MAX_ZOOM, { animate: animateView });
      } else if (places.length > 1) {
        map.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lon] as [number, number])), {
          padding: [40, 40],
          maxZoom: FIT_MAX_ZOOM,
          animate: animateView,
        });
      } else if (center) {
        map.setView([center.lat, center.lon], 15, { animate: animateView });
      }
    };
    refitRef.current = applyView;
    userMovedRef.current = false;
    applyView(animate);
  }, [ready, places, winnerId, center]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Map of your options"
      className="relative z-0 h-72 w-full overflow-hidden rounded-2xl ring-1 ring-indigo-100 sm:h-96"
    />
  );
}
