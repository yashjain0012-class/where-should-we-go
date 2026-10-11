import { readFileSync } from "node:fs";
import {
  RAINY_DAY, expect, mockApis, openApp, optionNames, optionUnderPointer, removeButtons, search, searchAgain, spinAndWait, spinButton, test,
} from "./fixtures";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/** An option in the list under the wheel (the name also appears on the wheel itself). */
const listed = (page: import("@playwright/test").Page, name: string) => page.locator("ul[aria-label=\"Wheel options\"] li .truncate", { hasText: name });

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

  test("the wheel never takes clicks away from the Spin button, whatever angle it stopped at", async ({ page }) => {
    await openApp(page);
    await search(page);
    // The wheel is a square box drawn as a circle and it rotates, so its invisible corners can reach the button below it.
    // A click that lands on the wheel instead of Spin was the cause of an intermittent end-to-end failure, so the wheel
    // is made non-interactive and this checks both that and the hit target at several angles.
    const wheelIgnoresPointer = await page.evaluate(() => {
      const wheel = document.querySelector("svg[role=img]")!.parentElement!;
      return getComputedStyle(wheel).pointerEvents === "none" && getComputedStyle(wheel.querySelector("svg")!).pointerEvents === "none";
    });
    expect(wheelIgnoresPointer).toBe(true);
    const covered = await page.evaluate(() => {
      const wheel = document.querySelector("svg[role=img]")!.parentElement!;
      const button = [...document.querySelectorAll("button")].find((b) => /^Spin/.test(b.textContent ?? ""))!;
      const problems: string[] = [];
      button.scrollIntoView({ block: "center" }); // elementFromPoint only sees what is on screen
      for (const angle of [0, 20, 45, 70, 90, 135, 200, 315]) {
        wheel.style.transform = `rotate(${angle}deg)`;
        const r = button.getBoundingClientRect();
        for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.15], [0.2, 0.5], [0.8, 0.5]]) {
          const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
          if (!hit || !button.contains(hit)) problems.push(`${angle} deg at ${fx},${fy}: ${hit?.tagName}`);
        }
      }
      return problems;
    });
    expect(covered).toEqual([]);
  });

  test("the result card shows the walk, directions links and a calendar file", async ({ page }) => {
    await openApp(page);
    await search(page);
    const winner = await spinAndWait(page);
    const card = page.locator(".result-pop");
    await expect(card.getByText(/About \d+ min walk from where you searched/)).toBeVisible();
    await expect(card.getByRole("link", { name: /Directions on foot/ })).toHaveAttribute(
      "href", /google\.com\/maps\/dir\/\?api=1&destination=51\.\d+,-0\.\d+&travelmode=walking/,
    );
    await expect(card.getByRole("link", { name: "Apple Maps" })).toHaveAttribute("href", /maps\.apple\.com\/\?daddr=/);
    await expect(card.getByRole("link", { name: "OpenStreetMap" })).toHaveAttribute("href", /openstreetmap\.org\/\?mlat=/);

    await card.getByLabel("Date and time to add to your calendar").fill("2026-12-24T20:30");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      card.getByRole("button", { name: "Add to calendar" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^where-should-we-go-[a-z0-9-]+\.ics$/);
    const ics = readFileSync((await download.path())!, "utf8").replace(/\r\n /g, "");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20261224T203000");
    expect(ics).toContain("DTEND:20261224T220000");
    expect(ics).toContain(`SUMMARY:Let's go to ${winner}`);
  });

  test("the distance slider says roughly how long that is on foot, and options show walking minutes", async ({ page }) => {
    await openApp(page);
    await search(page);
    await expect(page.getByText(/About 13 min walk to the edge/)).toBeVisible(); // 1 km
    await expect(page.locator("li").filter({ hasText: "Hoxton Grill" })).toContainText("1 min"); // 40 m away
    await expect(page.locator("li").filter({ hasText: "Maki" })).toContainText("8 min"); // 600 m away is 7.5 minutes, which rounds up
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
    await expect(page.locator("li").filter({ hasText: "Hoxton Grill" }).getByText("open", { exact: true })).toBeVisible(); // "24/7"
    await expect(page.getByText("hours unknown").first()).toBeVisible();
    await expect(removeButtons(page)).toHaveCount(8); // the wheel refills from the pool
    expect(api.places).toHaveLength(before);
  });

  test("Open when? checks a chosen time on the place's clock, with no new search", async ({ page, api }) => {
    await openApp(page);
    await search(page);
    const before = api.places.length;
    await page.getByRole("switch", { name: /Open now/ }).click();
    await page.getByLabel("Open when?").selectOption({ label: "Late, 11 pm" });
    await expect(listed(page, "Delamina East")).toHaveCount(0); // open 9 to 5 only
    await expect(page.getByRole("switch", { name: /Open then/ })).toBeVisible();
    await page.getByLabel("Open when?").selectOption({ label: "Tomorrow 1 pm" });
    await expect(listed(page, "Delamina East")).toHaveCount(1);
    await page.getByLabel("Open when?").selectOption({ label: "Pick a time…" });
    await page.getByLabel("Time").fill("23:30");
    await expect(listed(page, "Delamina East")).toHaveCount(0);
    expect(api.places).toHaveLength(before);
    const winner = await spinAndWait(page);
    await expect(page.locator(".result-pop")).toContainText(/Open (today|tomorrow) at 11:30 pm|Hours unknown/);
    expect(winner.length).toBeGreaterThan(0);
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

test.describe("weather", () => {
  test("a dry day shows the weather without the indoor switch", async ({ page }) => {
    await openApp(page);
    await search(page);
    await expect(page.getByText("18°C, clear")).toBeVisible();
    await expect(page.getByRole("switch", { name: "Indoor places first" })).toHaveCount(0);
  });

  test("when it rains, outdoor places go after indoor ones, and the switch turns that off", async ({ page, api }) => {
    api.weather = RAINY_DAY;
    await openApp(page);
    await search(page);
    await expect(page.getByText("9°C, rain")).toBeVisible();
    const indoorFirst = page.getByRole("switch", { name: "Indoor places first" });
    await expect(indoorFirst).toHaveAttribute("aria-checked", "true"); // on by default when it is wet
    await page.getByRole("button", { name: /Things to do/ }).click();
    await expect(listed(page, "Geffrye Museum")).toHaveCount(1);
    for (const outdoor of ["Sky Garden", "Shoreditch Park", "Victoria Park"]) await expect(listed(page, outdoor)).toHaveCount(0);

    await indoorFirst.click(); // back to nearest first
    await expect(indoorFirst).toHaveAttribute("aria-checked", "false");
    await expect(listed(page, "Sky Garden")).toHaveCount(1);
    await expect(listed(page, "Shoreditch Park")).toHaveCount(1);
  });

  test("if the weather service is down, nothing is shown and the search still works", async ({ page, api }) => {
    api.weather = null;
    await openApp(page);
    await search(page);
    await expect(page.getByText(/°C/)).toHaveCount(0);
    await expect(removeButtons(page)).toHaveCount(8);
  });
});

test.describe("cuisine and dietary filters", () => {
  const openMore = (page: import("@playwright/test").Page) => page.getByText(/^More filters/).click();

  test("vegetarian: confirmed places first, contradicting ones dropped, untagged ones labelled", async ({ page, api }) => {
    await openApp(page);
    await search(page);
    const before = api.places.length;
    await openMore(page);
    await page.getByRole("button", { name: "Vegetarian", exact: true }).click();
    const names = await optionNames(page);
    expect(names.slice(0, 3)).toEqual(["Hoxton Grill", "Delamina East", "Kennedy's"]); // tagged vegetarian-friendly
    expect(names).not.toContain("Bone Daddies"); // tagged "no"
    expect(names).not.toContain("Indi Go"); // tagged "no"
    expect(names).toHaveLength(8);
    await expect(page.locator("li").filter({ hasText: "Hoxton Grill" }).getByText("unconfirmed")).toHaveCount(0);
    await expect(page.getByText("unconfirmed").first()).toBeVisible();
    expect(api.places).toHaveLength(before); // no new search
  });

  test("cuisine chips come from the nearby places; vegan and clear all work", async ({ page }) => {
    await openApp(page);
    await search(page);
    await openMore(page);
    await expect(page.getByRole("button", { name: "Italian (2)" })).toBeVisible();
    await page.getByRole("button", { name: "Indian (1)" }).click();
    expect((await optionNames(page))[0]).toBe("Delamina East");
    await expect(page.getByText(/^More filters \(1\)/)).toBeVisible();

    await page.getByRole("button", { name: "Clear all" }).click();
    expect((await optionNames(page)).slice(0, 3)).toEqual(["Hoxton Grill", "Bone Daddies", "Delamina East"]); // nearest first again

    await page.getByRole("button", { name: "Vegan", exact: true }).click();
    expect((await optionNames(page))[0]).toBe("Delamina East"); // the only place tagged vegan
  });

  test("changing category clears the cuisine choice but keeps the other filters", async ({ page }) => {
    await openApp(page);
    await search(page);
    await openMore(page);
    await page.getByRole("button", { name: "Italian (2)" }).click();
    await page.getByRole("button", { name: "Takeaway", exact: true }).click();
    await page.getByRole("button", { name: /Cafés/ }).click();
    await expect(page.getByText("Beans & Beyond")).toBeVisible();
    await expect(page.getByRole("button", { name: "Takeaway", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /^Italian/ })).toHaveAttribute("aria-pressed", "false"); // no longer selected
  });
});

test.describe("favourites, hidden places and history", () => {
  const star = (page: import("@playwright/test").Page, name: string) => page.getByRole("button", { name: `Favourite ${name}` });

  test("a starred place gets a bigger slice and the pointer maths still agrees", async ({ page }) => {
    await openApp(page);
    await search(page);
    const names = await optionNames(page);
    await star(page, names[2]).click();
    await expect(star(page, names[2])).toHaveAttribute("aria-pressed", "true");
    // The slice is drawn twice as wide: measure its angle from the path's two arc end points.
    const angles = await page.evaluate(() =>
      [...document.querySelectorAll("svg[role=img] path")].map((p) => {
        const nums = p.getAttribute("d")!.match(/-?[\d.]+/g)!.map(Number);
        const [x1, y1, x2, y2] = [nums[2], nums[3], nums[nums.length - 2], nums[nums.length - 1]];
        const a1 = Math.atan2(x1 - 100, 100 - y1);
        const a2 = Math.atan2(x2 - 100, 100 - y2);
        return ((((a2 - a1) * 180) / Math.PI) + 360) % 360;
      }),
    );
    expect(angles).toHaveLength(8);
    expect(angles[2]).toBeCloseTo(2 * angles[0], 0);
    expect(angles[0]).toBeCloseTo(360 / 9, 0);
    for (let i = 0; i < 3; i++) {
      const winner = await spinAndWait(page);
      expect(await optionUnderPointer(page)).toBe(winner);
    }
  });

  test("favourites are remembered after a reload, and listed with a way to remove them", async ({ page }) => {
    await openApp(page);
    await search(page);
    const [first] = await optionNames(page);
    await star(page, first).click();
    await page.reload();
    await page.waitForSelector("body[data-hydrated=true]");
    await page.getByText("My picks and preferences").click();
    await expect(page.getByRole("region", { name: "Favourites" }).getByText(first, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Remove ${first} from favourites` }).click();
    await expect(page.getByRole("region", { name: "Favourites" })).toHaveCount(0);
  });

  test("the result card can star a place or hide it for good", async ({ page }) => {
    await openApp(page);
    await search(page);
    const winner = await spinAndWait(page);
    await page.getByRole("button", { name: "☆ Add to favourites" }).click();
    await expect(page.getByRole("button", { name: "★ Favourite" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /Never show again/ }).click();
    await expect(page.locator(".result-pop")).toHaveCount(0);
    await expect(listed(page, winner)).toHaveCount(0);
    await expect(removeButtons(page)).toHaveCount(7);
    // A new search does not bring it back (and a nearby place fills the wheel instead)...
    await searchAgain(page);
    await expect(listed(page, winner)).toHaveCount(0);
    // ...until it is shown again.
    await page.getByText("My picks and preferences").click();
    await page.getByRole("button", { name: `Show again ${winner}` }).click();
    await page.getByLabel("Skip places that won in the last").selectOption("0"); // it also won a moment ago
    await searchAgain(page);
    await expect(listed(page, winner)).toHaveCount(1);
  });

  test("a place that just won is skipped next time, unless you turn that off", async ({ page }) => {
    await openApp(page);
    await search(page);
    const winner = await spinAndWait(page);
    await page.getByText("My picks and preferences").click();
    await expect(page.getByRole("region", { name: "Recent winners" }).getByText(winner)).toBeVisible();
    await searchAgain(page);
    await expect(listed(page, winner)).toHaveCount(0);
    await page.getByLabel("Skip places that won in the last").selectOption("0");
    await searchAgain(page);
    await expect(listed(page, winner)).toHaveCount(1);
  });

  test("clear my data forgets everything", async ({ page }) => {
    page.on("dialog", (d) => void d.accept());
    await openApp(page);
    await search(page);
    const [first] = await optionNames(page);
    await star(page, first).click();
    await spinAndWait(page);
    await page.getByText("My picks and preferences").click();
    await page.getByRole("button", { name: "Clear my data" }).click();
    await expect(page.getByRole("region", { name: "Favourites" })).toHaveCount(0);
    await expect(page.getByText("Nothing yet.")).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem("wsg-prefs"))).toBeNull();
    await search(page);
    await expect(star(page, first)).toHaveAttribute("aria-pressed", "false");
  });

  test("a shared wheel offers no favourites, because its places have no lasting identity", async ({ page }) => {
    await openApp(page);
    await search(page);
    await page.getByRole("button", { name: /Copy/ }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    await page.goto(link);
    await page.waitForSelector("body[data-hydrated=true]");
    await expect(removeButtons(page)).toHaveCount(8);
    await expect(page.getByRole("button", { name: /^Favourite / })).toHaveCount(0);
    await expect(page.getByText("My picks and preferences")).toHaveCount(0);
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
