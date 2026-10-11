import { test as base, expect, type Page } from "@playwright/test";

/** Search centre every mocked geocode answer returns. */
export const CENTRE = { lat: 51.5266, lon: -0.0799 };

const NAMES: Record<string, string[]> = {
  restaurants: ["Hoxton Grill", "Bone Daddies", "Delamina East", "Kennedy's", "Burger & Beyond", "Indi Go",
    "Hopper's", "Maki", "Piccolino", "Boisdale", "Yanji BBQ", "Eyre Brothers"],
  cafes: ["Beans & Beyond", "Rise & Bloom", "Attendant", "Tsuru", "Barrio", "Leila's Cafe",
    "Coffee Shop", "Suba", "Olive", "Brick Lane Beigel", "Fix", "Lady Dinah's"],
  bars: ["The Alibi", "Found", "Star in Shoreditch", "Sake Collective", "Tayer + Elementary", "Whitecross Tap",
    "Exchange Square", "Sports Bar", "The Salt Point", "Callooh Callay", "Nightjar", "Redchurch Bar"],
  things: ["Geffrye Museum", "Columbia Road", "Sky Garden", "Hoxton Square", "Spitalfields Market", "Shoreditch Park",
    "Barbican", "Brick Lane", "Whitechapel Gallery", "Victoria Park", "Chisenhale", "Rich Mix"],
};

/** OpenStreetMap-style tags for some of the places (the rest are untagged, as most real places are). */
const ATTRS: Record<number, Record<string, unknown>> = {
  0: { kind: "restaurant", cuisine: ["italian"], vegetarian: "yes", outdoorSeating: true },
  1: { kind: "restaurant", cuisine: ["japanese"], vegetarian: "no" },
  2: { kind: "restaurant", cuisine: ["indian"], vegetarian: "only", vegan: "yes", wheelchair: "yes" },
  3: { kind: "restaurant", cuisine: ["italian"], vegetarian: "yes" },
  5: { kind: "restaurant", cuisine: ["burger"], vegetarian: "no" },
};

/** 12 places sorted by distance (40 m, 120 m, ... 920 m). The first is open 24/7, the second never, the third 9 to 5 daily. */
export function placesFor(category: string) {
  const names = NAMES[category] ?? NAMES.restaurants;
  return names.map((name, i) => ({
    id: `node/${category}-${i}`,
    name,
    lat: CENTRE.lat + (i - 6) * 0.0006,
    lon: CENTRE.lon + (((i * 7) % 5) - 2) * 0.0007,
    distance: 40 + i * 80,
    ...(ATTRS[i] ? { attrs: ATTRS[i] } : {}),
    ...(i === 0 ? { hours: "24/7" } : i === 1 ? { hours: "off" } : i === 2 ? { hours: "Mo-Su 09:00-17:00" } : {}),
  }));
}

// A 1x1 transparent PNG, so the map has "tiles" without touching the real OpenStreetMap servers.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export interface Api {
  geocode: URL[];
  places: URL[];
  /** Make /api/places time out for this radius, the way the free servers do on big areas. */
  failRadius: number | null;
  /** Return at most this many places (to test the "too few results" message). */
  limit: number | null;
}

export async function mockApis(page: Page): Promise<Api> {
  const api: Api = { geocode: [], places: [], failRadius: null, limit: null };
  await page.route("**/api/geocode**", (route) => {
    api.geocode.push(new URL(route.request().url()));
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    if (/nowhere|asdkj/i.test(q)) {
      return route.fulfill({ status: 404, json: { error: `Couldn't find "${q}". Try a nearby neighbourhood or city.` } });
    }
    return route.fulfill({
      json: { ...CENTRE, label: "Shoreditch, London Borough of Hackney, Greater London, England, United Kingdom" },
    });
  });
  await page.route("**/api/places**", (route) => {
    const url = new URL(route.request().url());
    api.places.push(url);
    const radius = Number(url.searchParams.get("radius") ?? 1000);
    if (api.failRadius !== null && radius === api.failRadius) {
      return route.fulfill({
        status: 504,
        json: { error: "Searching 5 km took too long. Try 2.5 km.", code: "timeout", retryRadius: 2500 },
      });
    }
    const category = url.searchParams.get("category") ?? "restaurants";
    return route.fulfill({
      json: { places: placesFor(category).filter((p) => p.distance <= radius).slice(0, api.limit ?? 99), tz: "Europe/London" },
    });
  });
  await page.route("**/tile.openstreetmap.org/**", (route) => route.fulfill({ contentType: "image/png", body: PNG_1PX }));
  return api;
}

// `auto`: the mocks are installed for every test, even one that never mentions `api`, so nothing can reach the real servers.
export const test = base.extend<{ api: Api }>({
  api: [
    async ({ page }, use) => {
      await use(await mockApis(page));
    },
    { auto: true },
  ],
});
export { expect };

/** Open the app and wait until React has taken over (a click before that would submit the form natively). */
export async function openApp(page: Page, path = "/") {
  await page.goto(path);
  await page.waitForFunction(() => document.body.dataset.hydrated === "true");
}

export const removeButtons = (page: Page) => page.getByRole("button", { name: /^Remove / });
export const spinButton = (page: Page) => page.getByRole("button", { name: /^Spin/ });

/** Type a place and search; resolves once the wheel is filled. */
export async function search(page: Page, query = "Shoreditch, London", expectedOptions = 8) {
  await page.getByLabel("Neighbourhood or city").fill(query);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(removeButtons(page)).toHaveCount(expectedOptions);
}

/** Option names in wheel order. */
export async function optionNames(page: Page): Promise<string[]> {
  return page.locator("ul li .truncate").allTextContents();
}

/** Which option is under the pointer, worked out from the wheel's real rotation. */
export async function optionUnderPointer(page: Page): Promise<string> {
  const { rotation, names } = await page.evaluate(() => {
    const wheel = document.querySelector("svg[role=img]")!.parentElement!;
    const rotation = parseFloat(wheel.style.transform.match(/rotate\(([-\d.]+)deg\)/)![1]);
    const names = [...document.querySelectorAll("ul li .truncate")].map((e) => e.textContent!);
    return { rotation, names };
  });
  const slice = 360 / names.length;
  const index = Math.floor((((-rotation % 360) + 360) % 360) / slice) % names.length;
  return names[index];
}

/** Spin and wait for the result card; returns the winner's name. */
export async function spinAndWait(page: Page): Promise<string> {
  await spinButton(page).click();
  const card = page.locator(".result-pop");
  await expect(card).toBeVisible({ timeout: 9000 });
  return (await card.locator("p.text-2xl").textContent())!;
}
