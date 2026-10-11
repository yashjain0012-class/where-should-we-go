/*
 * Service worker: lets the app open with no connection.
 *
 * - The page itself ("/") is network-first, so a new deploy shows up straight away; the last copy is the offline fallback.
 * - Build files under /_next/static/ never change once published (their names carry a hash), so they are cache-first.
 * - Icons and the manifest are served from cache and refreshed in the background.
 * - /api/* and everything on other origins (map tiles, weather) always go to the network, and are never stored.
 *
 * Searching needs a connection. Offline, the page says so and offers the last wheel (see lib/lastWheel.ts).
 */
const VERSION = "wsg-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const MAX_ASSETS = 150;

/** The hashed build files a page refers to. */
function assetUrls(html) {
  return [...new Set(html.match(/\/_next\/static\/[^"'\s\\)<>]+/g) || [])];
}

async function cacheShell(response) {
  const html = await response.clone().text();
  const shell = await caches.open(SHELL);
  await shell.put("/", response);
  const assets = await caches.open(ASSETS);
  await Promise.all(
    assetUrls(html).map(async (url) => {
      if (await assets.match(url)) return;
      try {
        await assets.add(url);
      } catch {
        // one missing file should not stop the rest
      }
    }),
  );
  // Old builds' files pile up otherwise: keep the newest ones.
  const keys = await assets.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await assets.delete(key);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch("/", { cache: "reload" });
      if (response.ok) await cacheShell(response);
      const shell = await caches.open(SHELL);
      await Promise.all(["/manifest.webmanifest", "/pwa-icon/192", "/pwa-icon/512"].map((u) => shell.add(u).catch(() => {})));
      await self.skipWaiting();
    })().catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (!name.startsWith(VERSION)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok && url.pathname === "/") event.waitUntil(cacheShell(response.clone()).catch(() => {}));
          return response;
        } catch {
          return (await caches.match("/")) || Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(ASSETS).then((c) => c.put(request, copy)));
        }
        return response;
      })(),
    );
    return;
  }

  if (url.pathname === "/manifest.webmanifest" || url.pathname.startsWith("/pwa-icon/") || url.pathname.startsWith("/icon") || url.pathname.startsWith("/apple-icon")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        const refresh = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              event.waitUntil(caches.open(SHELL).then((c) => c.put(request, copy)));
            }
            return response;
          })
          .catch(() => cached);
        return cached || refresh;
      })(),
    );
  }
});
