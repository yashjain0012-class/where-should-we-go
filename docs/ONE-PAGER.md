# Where should we go? One-pager

Live: https://where-should-we-go-pink.vercel.app · Code: github.com/yashjain0012-class/where-should-we-go (private)

## The problem

Groups of friends, couples and colleagues lose a surprising amount of time to "where should we eat?" The answer is rarely hard to find; it is hard to **agree on**. One person suggests, others say "I don't mind", nobody commits, and the loudest or most patient person wins. People who feel unheard stay quiet. It matters because it happens every week for almost everyone, and it quietly wears on friendships and plans.

The app makes the decision **quick, fair and a bit fun**: nearby options come from a real map, everyone gets a say (a veto each, or a vote), and a wheel makes the call so nobody has to.

## How it works

1. **Search.** Type a neighbourhood (or use GPS), pick restaurants, cafés, bars or things to do. The nearest places fill a wheel, with matching pins on a map.
2. **Narrow it down.** Distance, Open now or at a chosen time (checked on the place's own clock), vegetarian/vegan, outdoor seating, wheelchair access. Rain? Indoor places move up.
3. **Decide together.** Pass the phone for one veto each, run a head-to-head knockout, or open a **live room**: friends join from their own phones, each vetoes one option, and the host's spin lands on the same result on every screen. Or spin **your own list** (movies, chores, team lunch).
4. **Act on it.** Walking time, directions, add to calendar, share as a picture. It installs as an app and reopens offline with the last wheel; English and Hindi, dark mode, km or miles.

**Screens:** one page, no accounts. **Rules:** unknown is not "no" (a place with no hours or tags stays on the wheel, labelled); favourites get a bigger slice; a place that just won is skipped for 14 days; vetoes never leave fewer than two options.
**Where the data lives:** favourites, history, settings and the last wheel live **only in the user's browser** (`localStorage`). Share links carry just place names, positions and weights, in the URL fragment. Live-room messages go device to device. There is no database of ours.

```
Browser (Next.js page, rules in lib/, localStorage, service worker)
   ├── our route handlers on Vercel ──► Nominatim · Overpass · Open-Meteo
   ├── map tiles ──► OpenStreetMap
   └── WebRTC ◄──► friends' browsers   (PeerJS broker only introduces them)
```

## Outside services

| Service | What it does for the app | If it is down |
| --- | --- | --- |
| **Vercel** | Hosts the site and the three small API routes | Nothing works; the code is on GitHub and deploys anywhere Next.js runs |
| **GitHub + Actions** | Source, and tests/lint/build on every push | Deploys still work; no automated checks |
| **OpenStreetMap Nominatim** | Turns "Shoreditch, London" into coordinates | Friendly error; "try again" |
| **OpenStreetMap Overpass** (several mirrors raced) | Finds the nearby places and their hours and tags | Friendly error, smaller-radius suggestion, previous wheel kept |
| **OpenStreetMap tiles** | The map images | Map shows a message; the wheel still works |
| **Open-Meteo** | Temperature and rain, for "indoor first" | The weather chip is simply missing |
| **PeerJS public broker** (free) | Introduces two phones in a live room | Room says it could not connect; ordinary share links still work |

No paid service, no API key, no AI service inside the app, and no account to create or pay for.

## Security

**What is worth protecting.** There are no passwords, accounts, payment details or API keys, and no server-side user data. What matters: (1) the free public services we depend on and could be blamed for abusing (cost to others, and our access being cut off); (2) people's **location** when they search; (3) the **integrity of what a shared link or a live-room message shows** (someone else's text appearing in your page); (4) the supply chain (dependencies).

**What I checked.** The official `/security-review` command needs to be run from inside the repository folder, so I ran an equivalent manual review of the whole codebase and recorded the result; **re-run `/security-review` from the `where-should-we-go` folder and paste its findings here before submitting.**

| Finding | Severity | Status |
| --- | --- | --- |
| Next.js 16.3.7 and `source-map-js` had known vulnerabilities (cache poisoning, SSRF in image optimisation, information disclosure) | High (`npm audit`) | **Fixed**: upgraded Next.js to 16.4, `npm audit` now reports 0 vulnerabilities, all tests re-run |
| No browser security headers (clickjacking, MIME sniffing, referrer leaks, unused powerful features) | Medium | **Fixed**: `X-Frame-Options`, `frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (camera, mic, payment off; location only for us), tested |
| In-memory rate limit is per server instance and trusts `X-Forwarded-For` | Low | **Accepted and documented**: Vercel sets that header itself; a Vercel Firewall rule is the real control |
| No full script-source CSP (Next.js and the theme script use inline scripts; PeerJS needs WebSocket/WebRTC) | Low | **Accepted**: no HTML-injection sinks exist (`innerHTML`, `eval` and `dangerouslySetInnerHTML` are not used for user data), which is the protection that matters |

**Built in from the start.** Everything from outside is treated as hostile: place names from OpenStreetMap, share links and live-room messages are validated strictly (length, type, control and bidi characters stripped, checksums, size budgets) and rendered as text only; calendar files escape their fields; API inputs are range-checked and coordinates rounded; share links snap the search centre to about 110 m so a link made from GPS does not reveal where you are; the live-room protocol ignores anything malformed and enforces vetoes on the host.

## Feedback

> **To fill in before submitting. This must be real feedback from someone who is not me.**
>
> - **Who:** (name or role; ideally someone who actually argues about where to eat, a friend group, flatmates, a team)
> - **What they said:** (their words, even if blunt)
> - **What I changed because of it:** (one concrete change, with the commit if you can)
>
> Easiest way to get it: have them open the live link and run `docs/DEMO.md` (about 6 minutes) while you stay quiet and watch where they hesitate. Demo Day counts too: note the question or reaction that surprised you.

## Working with AI

- **What the AI did:** wrote almost all the code, tests and documentation, in small steps with a commit after each working one (about 30 small commits, each built, tested and pushed before the next): the wheel and sound, the OpenStreetMap queries, filters, favourites, live rooms, the offline app, dark mode and Hindi. It also found and fixed its own bugs, for example a race in opening-hours loading that a CI run exposed, and a real contrast problem that the automated accessibility check found in dark mode. It wrote the tests alongside each feature (over 220 unit checks and 156 browser runs).
- **What I did:** (edit to be true) chose the idea and the scope, answered the planning questions (balanced features, free services only, a few days, minimal intervention), decided the rules (no accounts, no keys, privacy first), tried it, and approved each stage.
- **What I'd do differently:** (edit to be true) get a real person's feedback after the *first* working version instead of after everything was built; write the one-page description first so the scope stays smaller; and ask the AI to run `/security-review` from the repo folder at the start of each stage rather than once at the end.
