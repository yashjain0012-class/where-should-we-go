export interface Destination {
  name: string;
  lat: number;
  lon: number;
}

const coords = (d: Destination) => `${d.lat.toFixed(6)},${d.lon.toFixed(6)}`;

/** Google Maps directions on foot, from wherever the person is (documented URL format, no key). */
export function googleDirections(d: Destination): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coords(d)}&travelmode=walking`;
}

/** Apple Maps walking directions (documented URL parameters). */
export function appleDirections(d: Destination): string {
  return `https://maps.apple.com/?daddr=${coords(d)}&dirflg=w&q=${encodeURIComponent(d.name)}`;
}

/** The place on OpenStreetMap, with a marker. */
export function osmPlace(d: Destination): string {
  const lat = d.lat.toFixed(6);
  const lon = d.lon.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;
}
