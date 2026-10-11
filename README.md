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

## More ways to decide

- **Open at…**: check opening hours for tonight or tomorrow, not just now (the place's own clock).
- **Cuisine, diet and access filters** from OpenStreetMap tags (vegetarian, vegan, outdoor seating, wheelchair access, takeaway). Places with no tag stay in, marked "unconfirmed", never silently dropped.
- **Walking time** on every option and the result, plus **directions** (Google, Apple, OpenStreetMap) and **Add to calendar** (an `.ics` file made in the browser).
- **Weather** from [Open-Meteo](https://open-meteo.com/) (free, no key): a chip with the temperature, and "Indoor places first" when it is raining or about to.

## Your picks (no account)

Everything here is stored in **this browser only** (`localStorage`, key `wsg-prefs`) and never sent anywhere. Open **My picks and preferences** under the wheel to see it all, and **Clear my data** to wipe it.

- **★ Favourite** a place (on its chip or the result card): it gets a **slice twice as big**, so it is twice as likely to win, and it is kept on the wheel ahead of nearer places.
- **🚫 Never show again** hides a place from every future wheel; "Show again" undoes it.
- **Recent winners are skipped**: a place that won in the last 14 days (choose 7, 14, 30 or never) stays off the next wheel, so you don't eat at the same place twice.
- The wheel, the winner and the tick sound all use the same slice edges, so uneven slices still land under the pointer and tick as each edge passes. Shared links carry places, not preferences, and shared wheels do not offer favourites.


## My own list

The **✏️ My own list** switch turns the wheel into a general decision spinner: movies, chores, team lunch, anything. Type or paste options (one per line, or comma-separated), and add `x2` to `x5` after a name to give it a bigger slice. Up to 12 options of 40 characters; repeats and extras are dropped with a plain-language note. There is no map, search or place link in this mode, and nothing is remembered. Your places wheel is kept while you are away and comes back when you switch back.

Custom lists share as `#c=1.<checksum>.<payload>`, where the payload is base64url JSON of `[[name, weight], ...]`. Opening one fills the editor and the wheel, with no API calls. Every link is checked for the checksum, length, weight range and name content, and a broken or tampered link falls back to the normal screen with a message.

## Deciding together

Two helpers sit under the Spin button (and work on any wheel, places or your own list):

- **🙈 Take turns vetoing** (3 or more options): pass the phone around; each of 2 to 6 people removes the one option they want least, or passes. It never vetoes below two options, and Spin is disabled until it ends.
- **🏆 Head-to-head instead** (2 or more options): a knockout tournament, two options at a time, you pick, until one is left. Any number of options works (2 to 16): extra slots are byes, so nobody votes more than they need to, and exactly *n − 1* choices decide it. The wheel then turns (without spinning) to show the same winner. The pure logic is in `lib/bracket.ts` with its own tests.

## Install it, and use it offline

The app is an installable PWA: **Add to Home Screen** (iPhone) or **Install** (Chrome, Edge, Android) gives it its own icon and a full-screen window. There is deliberately no custom "Install" button, because the install prompt is not available in every browser.

- `app/manifest.ts` is the web app manifest. The icons are drawn in code (`lib/iconArt.tsx`, rendered by `next/og` `ImageResponse` as PNG at `/pwa-icon/192`, `/pwa-icon/512` and a padded `/pwa-icon/maskable`; `app/icon.tsx` and `app/apple-icon.tsx` use the same artwork), so there are no image files to maintain.
- `public/sw.js` is a small service worker, registered in production only: the page is network-first (a new deploy shows straight away) with the last copy as the offline fallback; hashed build files are cache-first; `/api/*` and other origins (map tiles, weather) are never stored.
- Offline, the app opens, says so, and offers **Open my last wheel**. The last wheel is kept in this browser as the same share link a friend would get (`wsg-last-wheel`), and **Clear my data** deletes it. Spinning the wheel and your own lists work offline; searching and the map need a connection, and if the map's code never downloaded, a short message replaces it instead of an error.

## The spin: sound and celebration

- **Ticking sound**, generated in the browser with the Web Audio API (no audio files): a short filtered-noise click plus a soft knock for each slice that passes the pointer. The wheel spins with a CSS cubic-bezier; `lib/ticks.ts` holds that same curve and works out when each slice boundary crosses the pointer, and the ticks are scheduled on the audio clock at exactly those moments, so they slow down with the wheel. The 🔊/🔇 button next to Spin mutes it, and the choice is remembered. Browsers only allow sound after a tap, so audio starts from the Spin tap.
- **On landing:** confetti (`canvas-confetti`, loaded on demand), the winning slice pops outward and is outlined, its map pin bounces as the map arrives, and the result card springs in. On a phone the result card is scrolled into view if it landed below the fold.
- **Reduced motion** (the device's "reduce motion" setting): the spin is shortened to about a second, and there is no confetti, no bounce and no card animation. The winner is still shown with a static outline, and the sound still follows the mute button.
- iPhones silence Web Audio when the ringer switch is on silent.

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
npm run test:ticks     # easing curve vs CSS, tick schedule (count, slowing gaps, alignment with the wheel)
npm run test:spin      # weighted picks (20,000 spins), landing under the pointer, ticks on uneven wheels
npm run test:prefs     # remembered favourites, hidden places and history: validation, limits, clearing
npm run test:custom    # custom lists: parsing, weights, limits, share links (valid, tampered, forged)
npm run test:bracket   # head-to-head: byes, n-1 votes for any size, immutability, every option can win
npm run test:attrs     # tags, cuisine and diet filters, wheel selection
npm run test:links     # walking time, directions links, calendar file
npm run test:weather   # weather codes and rain-soon logic
npm run build        # production build (also catches browser-only code running on the server)
```

## Tests and CI

```bash
npm run test:unit   # share links, filters + opening hours (across time zones), tick timing
npm run e2e         # builds, then runs the Playwright suite on a desktop and a phone profile
```

The end-to-end suite (`e2e/`) drives the real production build in Chromium with the OpenStreetMap services **mocked**, so it is fast, offline and deterministic. It covers search and categories, spinning (the result must be the slice under the pointer), removing options, the distance slider and Open now, a big-radius timeout, the "too few results" path, a share-link round trip in a fresh page (with no new searches), a broken link, ticking sound and mute, and confetti versus reduced motion.

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, lint, the unit tests, a production build and the end-to-end suite on every push and pull request.

## Deploy

Import the repo on Vercel. No environment variables are needed.

## Layout

- `app/page.tsx`: the page (search, categories, wheel, options, map, sharing)
- `components/Wheel.tsx`: SVG wheel
- `components/PlacesMap.tsx`: Leaflet map (browser-only)
- `lib/spin.ts`: picks the winner first (weighted), then computes the rotation that lands on it
- `lib/prefs.ts`, `components/PrefsPanel.tsx`: favourites, hidden places and history, kept in this browser
- `lib/share.ts`: share-link encode, decode and validation
- `app/manifest.ts`, `public/sw.js`, `lib/iconArt.tsx`, `lib/lastWheel.ts`, `components/OfflineBanner.tsx`: installable app and offline support
- `lib/bracket.ts`, `components/Duel.tsx`, `components/VetoRound.tsx`: head-to-head tournament and pass-the-phone vetoes
- `lib/custom.ts`, `components/CustomEditor.tsx`: the "My own list" mode and its share links
- `lib/ticks.ts`, `lib/sound.ts`, `lib/celebrate.ts`: tick timing, synthesized sound and mute switch, confetti
- `lib/overpass.ts`, `lib/geo.ts`: ring query builder and nearest-first candidate parsing
- `lib/hours.ts`: opening-hours evaluation in the place's time zone
- `lib/rateLimit.ts`: best-effort per-IP rate limit for the API routes
- `components/FiltersPanel.tsx`: distance slider and Open now toggle
- `lib/maps.ts`: Google Maps link builder
- `lib/categories.ts`: category to OpenStreetMap tag mapping
- `app/api/geocode`, `app/api/places`: the OSM proxies

Place data © OpenStreetMap contributors.
