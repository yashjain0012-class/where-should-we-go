# Where should we go? 🎡

A one-page decision spinner. Type a neighbourhood or city (or tap "Use my location"), pick a category (restaurants, cafés, bars, things to do), and spin a wheel of up to 8 places within 1 km. The wheel lands on one and shows its name with a Google Maps link. You can remove options before spinning.

No login, no database, no paid APIs or keys. Uses free OpenStreetMap services:

- **Nominatim** turns the typed location into coordinates (`/api/geocode`)
- **Overpass** finds named places within 1 km (`/api/places`)
- **OpenStreetMap tiles + Leaflet** draw the map

Both APIs are called through Next.js route handlers so a proper `User-Agent` is sent, results are cached, and several Overpass mirrors are raced for reliability.

## Map

Under the wheel is a map with one numbered pin per option. Pin colours and numbers match the wheel slices and the option chips, and removing an option removes its pin. After a spin the winning pin is highlighted and the map zooms to it. Tapping any pin shows its name and a Google Maps link.

Leaflet only runs in the browser, so `PlacesMap` is loaded with `next/dynamic({ ssr: false })`. On touch devices a one-finger swipe scrolls the page (pinch to zoom the map).

## Sharing a wheel

**Share** opens the phone's native share sheet where available; **Copy link** works everywhere. Opening the link rebuilds the same wheel and map, ready to spin, without redoing any search (no API calls are made). A broken, truncated or tampered link shows a friendly message and falls back to the normal search screen.

The link lives in the URL hash, so the page stays static and nothing is sent to a server:

```
#s=1.<checksum>.<payload>
payload = base64url(UTF-8 JSON) of
  [centreLat1e5, centreLon1e5, categoryIndex, label, [[name, dLat1e5, dLon1e5], ...]]
```

- Coordinates are integers at 1e-5° (about 1 m), stored as offsets from the search centre.
- The Google Maps link is **not** stored: it is rebuilt from name + coordinates, so a link can never carry an arbitrary URL.
- A typical 8-place link is about 400 characters. The encoder keeps the whole hash under 1,900 characters even for 8 very long non-Latin names, by shortening the label and then the names.
- The checksum catches truncated or corrupted links (chat apps often cut them). It is not a security feature; everything decoded is validated, length-capped and rendered only as text.
- `CATEGORIES` in `lib/categories.ts` is **append-only**, because the category is stored as an index.

## Develop

```bash
npm install
npm run dev
```

Open http://localhost:3000.

```bash
npm run test:share   # encode/decode round trips, tampered links, link-length budget
npm run build        # production build (also catches browser-only code running on the server)
```

## Deploy

Import the repo on Vercel. No environment variables are needed.

## Layout

- `app/page.tsx`: the page (search, categories, wheel, options, map, sharing)
- `components/Wheel.tsx`: SVG wheel
- `components/PlacesMap.tsx`: Leaflet map (browser-only)
- `lib/spin.ts`: picks the winner first, then computes the rotation that lands on it
- `lib/share.ts`: share-link encode, decode and validation
- `lib/maps.ts`: Google Maps link builder
- `lib/categories.ts`: category to OpenStreetMap tag mapping
- `app/api/geocode`, `app/api/places`: the OSM proxies

Place data © OpenStreetMap contributors.
