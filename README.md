# Where should we go? 🎡

A one-page decision spinner. Type a neighbourhood or city (or tap "Use my location"), pick a category (restaurants, cafés, bars, things to do), and spin a wheel of up to 8 places within 1 km. The wheel lands on one and shows its name with a Google Maps link. You can remove options before spinning.

No login, no database, no paid APIs or keys. Uses free OpenStreetMap services:

- **Nominatim** turns the typed location into coordinates (`/api/geocode`)
- **Overpass** finds named places within 1 km (`/api/places`)

Both are called through Next.js route handlers so a proper `User-Agent` is sent, results are cached, and several Overpass mirrors are raced for reliability.

## Develop

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy

Import the repo on Vercel. No environment variables are needed.

## Layout

- `app/page.tsx`: the page (search, categories, wheel, options, result)
- `components/Wheel.tsx`: SVG wheel
- `lib/spin.ts`: picks the winner first, then computes the rotation that lands on it
- `lib/categories.ts`: category to OpenStreetMap tag mapping
- `app/api/geocode`, `app/api/places`: the OSM proxies

Place data © OpenStreetMap contributors.
