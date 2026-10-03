import type { Place } from "./types";

/** Google Maps search link; needs no key. Always built from validated name + coordinates. */
export function mapsUrl(place: Pick<Place, "name" | "lat" | "lon">): string {
  const query = encodeURIComponent(`${place.name} ${place.lat},${place.lon}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
