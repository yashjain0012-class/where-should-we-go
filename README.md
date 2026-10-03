# Where should we go? 🎡

A one-page decision spinner. Type a neighbourhood or city (or tap "Use my location"), pick a category (restaurants, cafés, bars, things to do), and spin a wheel of up to 8 places within 1 km. The wheel lands on one and shows its name with a Google Maps link. You can remove options before spinning.

No login, no database, no paid APIs or keys. Uses free OpenStreetMap services:

- **Nominatim** turns the typed location into coordinates (`/api/geocode`)
- **Overpass** finds named places within your chosen distance, 500 m to 5 km (`/api/places`)
- **OpenStreetMap tiles + Leaflet** draw the map

Both APIs are called through Next.js route handlers so a proper `User-Agent` is sent, results are cached, and several Overpass mirrors are raced for reliability.

## Filters

Above the wheel:

- **Distance** slider, 500 m to 5 km (default 1 km). The label updates as you drag; the search reruns once you stop. If a big search times out on the free servers, the previous wheel stays, the slider snaps back, and you get a one-tap "Try a smaller radius" button.
- **Open now** toggle. Places closed right now are hidden; places with no listed hours stay in, marked "hours unknown", so the wheel doesn't empty out. If the filters leave fewer than 2 places, a message offers to widen the radius or show closed places too.

How the wheel picks places: the API returns the nearest ~32 matches, sorted by distance, and the page shows the 8 closest that pass the filters. Toggling "Open now" never needs a new search.

Notes and limits:

- Overpass can't sort by distance, so one request scans a bounding box and splits it into nested rings (250 m, 500 m, 1 km, ... up to the radius), capping each ring. Nearest-first is exact for any ring with fewer than 80 matches and approximate within a ring that is denser than that. A bounding-box scan is used because an `around` scan of 2 km or more routinely times out on the public servers.
- Opening hours are parsed with [`opening_hours`](https://github.com/opening-hours/opening_hours.js) (LGPL-3.0, loaded only when "Open now" is first used). They are evaluated in the **place's** time zone (looked up from the coordinates with `tz-lookup`), not the viewer's.
- Only some OpenStreetMap places have hours, so "hours unknown" is common. Public-holiday rules are treated like an ordinary day, and comment-only values such as "by appointment" count as unknown.
- The package's typings declare a named export that doesn't exist at runtime; `lib/hours.ts` uses the default export.
- The API validates the radius (500 to 5000 m), rounds coordinates to about 110 m so near-identical searches share a cache entry, and applies a best-effort per-IP rate limit (in-memory, so per server instance; a Vercel Firewall rate-limit rule is the real control).

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

- The search centre is rounded to about 110 m before it goes in the link, so a link made with "Use my location" doesn't reveal an exact position. Place coordinates are integers at 1e-5° (about 1 m), stored as offsets from that centre.
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
npm run test:share     # share links: round trips, tampered links, privacy snapping, link-length budget
npm run test:filters   # rings and query builder, candidate parsing, opening hours across time zones
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
- `lib/overpass.ts`, `lib/geo.ts`: ring query builder and nearest-first candidate parsing
- `lib/hours.ts`: opening-hours evaluation in the place's time zone
- `lib/rateLimit.ts`: best-effort per-IP rate limit for the API routes
- `components/FiltersPanel.tsx`: distance slider and Open now toggle
- `lib/maps.ts`: Google Maps link builder
- `lib/categories.ts`: category to OpenStreetMap tag mapping
- `app/api/geocode`, `app/api/places`: the OSM proxies

Place data © OpenStreetMap contributors.
