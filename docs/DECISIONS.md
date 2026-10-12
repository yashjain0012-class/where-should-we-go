# Decisions

Short records of the choices that shaped the app: what was decided, why, and what it costs.

## 1. No backend, no account, no keys

**Decided:** every feature runs in the browser or through thin proxies to free public services (OpenStreetMap's Nominatim and Overpass, Open-Meteo). Preferences live in `localStorage`; rooms are peer-to-peer.
**Why:** it is a demo anyone can open and use at once, with nothing to sign up for, pay for, secure or keep running. Privacy comes for free: there is nothing of anyone's to store.
**Cost:** no sync between devices, and a dependence on services with no guarantees. Each has a fallback (see 7).

## 2. Next.js route handlers as proxies, not direct calls

**Decided:** `/api/geocode`, `/api/places` and `/api/weather` call the free services on the server.
**Why:** the services require a proper `User-Agent`; responses can be cached and shared; coordinates are rounded (about 110 m for places, 1 km for weather) so similar searches share a cache entry and exact positions never go upstream; a per-IP rate limit protects the free servers.
**Cost:** the in-memory rate limit and cache are per server instance. A Vercel Firewall rule would be the real control.

## 3. Overpass: a bounding-box scan with nested rings

**Decided:** one query scans a bounding box and splits the matches into rings (250 m up to the radius), with nearest-first inside each.
**Why:** Overpass cannot sort by distance, and `around:` scans of 2 km or more routinely time out on the public servers.
**Cost:** nearest-first is exact for rings with fewer than 80 matches and approximate within a denser ring.

## 4. Unknown is not "no"

**Decided:** missing opening hours or missing diet and accessibility tags keep a place on the wheel, marked "hours unknown" or "unconfirmed", after confirmed matches. Only a confirmed contradiction removes a place.
**Why:** OpenStreetMap is patchy; dropping every untagged place would empty most wheels and quietly hide good places.
**Cost:** a result can turn out not to match; the labels say so.

## 5. Pick the winner first, then animate to it

**Decided:** the winner is drawn at random (weighted by slice size), then the rotation that lands on it is computed. The tick sound is scheduled from the same cubic-bezier as the CSS animation.
**Why:** the result is exact and testable, ticks line up with the real slice edges and slow down with the wheel, and uneven slices (favourites, weights) need no special case: everything works from slice edges.
**Cost:** a little maths (`lib/spin.ts`, `lib/ticks.ts`) instead of letting physics decide.

## 6. The host spins; guests follow

**Decided:** in a live room only the host's device chooses the winner and tells guests which slice to land on.
**Why:** a single source of truth means everyone sees the same result and there is nothing to reconcile if two devices disagree. Guests can only veto, and the host enforces the rules (one veto each, never below two options).
**Cost:** the host must stay. If they leave, guests can keep the wheel as an ordinary list.

## 7. Free third-party services always have a way out

| Service | If it fails |
| --- | --- |
| Nominatim, Overpass | friendly message, "try a smaller radius" button, previous wheel kept |
| Open-Meteo | the weather chip is simply absent; the search is never held up (1.5 s at most) |
| PeerJS public broker | the room says it could not connect; "Copy link" on an ordinary wheel still works; a broker can be swapped with `PEER_HOST` and no rebuild |
| OSM map tiles | the wheel and options still work; the map can fail without taking the page down |
| No network at all | installed app opens from cache and offers the last wheel |

## 8. English text as the translation key

**Decided:** `t("Search")`, with `lib/hi.ts` mapping English to Hindi, and a test that scans the source.
**Why:** no library, nothing to thread through components beyond `t()`, English works if a key is missing, and the scanner makes it impossible to forget a text, leave a stale one, or break a `{placeholder}`.
**Cost:** changing an English sentence changes its key, so its Hindi must change with it (the test tells you).

## 9. Dark mode by mirroring the palette

**Decided:** a generated stylesheet swaps each Tailwind colour scale end for end (50 with 950, and so on) and white for deep indigo under `[data-theme="dark"]`.
**Why:** every light-on-dark and dark-on-light pairing in the design keeps its contrast without a `dark:` class on every element; the axe checks run in both themes.
**Cost:** the dark theme is a mirror, not a hand-tuned design; anything with a fixed colour (the wheel pointer) needs a variable.

## 10. Tests that cannot flake

**Decided:** end-to-end tests run against the production build with the OpenStreetMap and weather APIs mocked, and a **local** PeerJS server for rooms; time zones and clocks are explicit in unit tests.
**Why:** the suite is fast, offline and deterministic, so a red CI run always means something. A real check against the live services was done by hand when each was added.
**Cost:** the mocks must be kept honest (the weather and Overpass fixtures were taken from real responses).
