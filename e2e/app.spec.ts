import {
  expect, mockApis, openApp, optionNames, optionUnderPointer, removeButtons, search, spinAndWait, spinButton, test,
} from "./fixtures";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test.describe("search and categories", () => {
  test("a search fills the wheel, the option list and the map", async ({ page, api }) => {
    await openApp(page);
    await search(page);
    await expect(page.locator(".pin")).toHaveCount(8);
    await expect(page.getByText("Near: Shoreditch")).toBeVisible();
    expect(api.places[0].searchParams.get("category")).toBe("restaurants");
    expect(api.places[0].searchParams.get("radius")).toBe("1000");
  });

  test("switching category searches the same place again", async ({ page, api }) => {
    await openApp(page);
    await search(page);
    await page.getByRole("button", { name: /Cafés/ }).click();
    await expect(page.getByText("Beans & Beyond")).toBeVisible();
    expect(api.places.at(-1)!.searchParams.get("category")).toBe("cafes");
    expect(api.geocode).toHaveLength(1); // the place was not looked up again
  });

  test("an unknown place shows a friendly message", async ({ page }) => {
    await openApp(page);
    await page.getByLabel("Neighbourhood or city").fill("nowhere at all");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Couldn't find" })).toBeVisible();
  });
});

test.describe("spinning", () => {
  test("the result is the option under the pointer, with a Maps link and a highlighted pin and slice", async ({ page }) => {
    await openApp(page);
    await search(page);
    const winner = await spinAndWait(page);
    expect(winner).toBe(await optionUnderPointer(page));
    await expect(page.getByRole("link", { name: /Open in Google Maps/ })).toHaveAttribute("href", /google\.com\/maps\/search/);
    await expect(page.locator(".pin--winner")).toHaveCount(1);
    await expect(page.locator("g.slice-bounce")).toHaveCount(1);
  });

  test("removing options shrinks the wheel and map; below two the spin is disabled; reset restores them", async ({ page }) => {
    await openApp(page);
    await search(page);
    for (let i = 0; i < 6; i++) await removeButtons(page).first().click();
    await expect(removeButtons(page)).toHaveCount(2);
    await expect(page.locator(".pin")).toHaveCount(2);
    await expect(spinButton(page)).toBeEnabled();
    await removeButtons(page).first().click();
    await expect(spinButton(page)).toBeDisabled();
    await expect(page.getByText("Only one option left")).toBeVisible();
    await page.getByRole("button", { name: "Reset options" }).first().click();
    await expect(removeButtons(page)).toHaveCount(8);
    await expect(spinButton(page)).toBeEnabled();
  });
});

test.describe("filters", () => {
  test("the distance slider searches once after it settles", async ({ page, api }) => {
    await openApp(page);
    await search(page);
    const slider = page.getByRole("slider", { name: "Distance" });
    await slider.fill("1500");
    await slider.fill("2000"); // two quick moves
    await expect.poll(() => api.places.length, { timeout: 5000 }).toBe(2);
    await page.waitForTimeout(1000);
    expect(api.places).toHaveLength(2); // still just one extra search
    expect(api.places[1].searchParams.get("radius")).toBe("2000");
    await slider.fill("500");
    await expect(removeButtons(page)).toHaveCount(6); // only places within 500 m
  });

  test("Open now hides closed places and labels the rest, with no new search", async ({ page, api }) => {
    await openApp(page);
    await search(page);
    expect(await optionNames(page)).toContain("Bone Daddies");
    const before = api.places.length;
    await page.getByRole("switch", { name: /Open now/ }).click();
    await expect(page.getByText("Bone Daddies")).toHaveCount(0); // "off" opening hours: closed
    await expect(page.getByText("open", { exact: true })).toHaveCount(1); // "24/7"
    await expect(page.getByText("hours unknown").first()).toBeVisible();
    await expect(removeButtons(page)).toHaveCount(8); // the wheel refills from the pool
    expect(api.places).toHaveLength(before);
  });

  test("a timeout on a big radius keeps the previous wheel and offers a smaller radius", async ({ page, api }) => {
    await openApp(page);
    await search(page);
    const before = await optionNames(page);
    api.failRadius = 5000;
    await page.getByRole("slider", { name: "Distance" }).fill("5000");
    await expect(page.getByRole("alert").filter({ hasText: "took too long" })).toBeVisible();
    expect(await optionNames(page)).toEqual(before);
    await expect(page.getByRole("slider", { name: "Distance" })).toHaveValue("1000"); // snapped back
    await page.getByRole("button", { name: "Try 2.5 km" }).click();
    await expect.poll(() => api.places.at(-1)!.searchParams.get("radius")).toBe("2500");
  });

  test("too few results shows a friendly message and a one-tap wider search", async ({ page, api }) => {
    await openApp(page);
    await search(page);
    api.limit = 1;
    await page.getByRole("slider", { name: "Distance" }).fill("750");
    await expect(page.getByText(/Only 1 place matches/)).toBeVisible();
    await expect(spinButton(page)).toBeDisabled();
    api.limit = null;
    await page.getByRole("button", { name: /^Widen to/ }).click();
    await expect.poll(() => api.places.at(-1)!.searchParams.get("radius")).toBe("1500");
    await expect(removeButtons(page)).toHaveCount(8);
  });
});

test.describe("sharing", () => {
  test("a copied link opens the same wheel in a fresh page without searching again", async ({ page, context }) => {
    await openApp(page);
    await search(page);
    await removeButtons(page).first().click(); // 7 options: removed ones are not shared
    await page.getByRole("button", { name: /^Copy (share )?link$/ }).click();
    await expect(page.getByText("Link copied")).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain("#s=1.");

    const friend = await context.newPage();
    const api = await mockApis(friend);
    await openApp(friend, link);
    await expect(friend.getByText("Shared wheel")).toBeVisible();
    await expect(removeButtons(friend)).toHaveCount(7);
    expect(await optionNames(friend)).toEqual((await optionNames(page)).slice(0));
    expect(api.geocode).toHaveLength(0);
    expect(api.places).toHaveLength(0);
    const winner = await spinAndWait(friend);
    expect(winner).toBe(await optionUnderPointer(friend));
  });

  test("a broken or tampered link falls back to the search screen with a friendly message", async ({ page }) => {
    await openApp(page, "/#s=1.zzzz.not-a-real-payload");
    await expect(page.getByRole("alert").filter({ hasText: "looks broken" })).toBeVisible();
    await expect(page.getByLabel("Neighbourhood or city")).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
  });
});

test.describe("sound", () => {
  test.beforeEach(async ({ page }) => {
    // count the click sounds the wheel schedules
    await page.addInitScript(() => {
      (window as unknown as { __ticks: number }).__ticks = 0;
      const Real = window.AudioContext;
      window.AudioContext = class extends Real {
        createBufferSource() {
          (window as unknown as { __ticks: number }).__ticks++;
          return super.createBufferSource();
        }
      } as typeof AudioContext;
    });
  });
  const ticks = (page: import("@playwright/test").Page) =>
    page.evaluate(() => (window as unknown as { __ticks: number }).__ticks);

  test("the spin schedules ticks, and muting silences them and is remembered", async ({ page }) => {
    await openApp(page);
    await search(page);
    await spinAndWait(page);
    expect(await ticks(page)).toBeGreaterThan(5);

    await page.getByRole("button", { name: "Turn sound off" }).click();
    const before = await ticks(page);
    await spinAndWait(page);
    expect(await ticks(page)).toBe(before);

    await page.reload();
    await page.waitForFunction(() => document.body.dataset.hydrated === "true");
    await expect(page.getByRole("button", { name: "Turn sound on" })).toBeVisible();
  });
});

test.describe("celebration", () => {
  const confetti = (page: import("@playwright/test").Page) =>
    page.evaluate(() => [...document.querySelectorAll("canvas")].some((c) => getComputedStyle(c).position === "fixed"));

  test.describe("with normal motion", () => {
    test.use({ reducedMotion: "no-preference" });
    test("confetti fires when the wheel lands", async ({ page }) => {
      await openApp(page);
      await search(page);
      await spinAndWait(page);
      await expect.poll(() => confetti(page), { timeout: 3000 }).toBe(true);
    });
  });

  test("reduced motion gets no confetti, but still a result", async ({ page }) => {
    await openApp(page);
    await search(page);
    await spinAndWait(page);
    await page.waitForTimeout(800);
    expect(await confetti(page)).toBe(false);
  });
});
