import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, openApp, search, spinAndWait, test } from "./fixtures";

// Automated WCAG 2.1 A and AA checks (axe-core) on every screen state, in the light and the dark theme. They catch
// contrast, names, roles and structure problems; they do not replace trying the app with a keyboard and a screen reader.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n   ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join("\n   ")}`);
  expect(summary, `${label}: accessibility violations`).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accessibility (axe, WCAG 2.1 AA), ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("the theme really is applied", async ({ page }) => {
      await openApp(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
      expect(background).toContain(scheme === "dark" ? "rgb(30, 27, 75)" : "rgb(253, 230, 138)");
    });

    test("the empty start screen", async ({ page }) => {
      await openApp(page);
      await scan(page, "start");
    });

    test("a wheel with results, and the result card", async ({ page }) => {
      await openApp(page);
      await search(page);
      await scan(page, "results");
      await spinAndWait(page);
      await scan(page, "result card");
    });

    test("the filters, with More filters and the preferences panel open", async ({ page }) => {
      await openApp(page);
      await search(page);
      await page.getByText("More filters").click();
      await page.getByText("My picks and preferences").click();
      await scan(page, "filters and preferences");
    });

    test("your own list, and the group helpers", async ({ page }) => {
      await openApp(page);
      await page.getByRole("button", { name: /My own list/ }).click();
      await scan(page, "custom editor");
      await page.getByLabel("Your options").fill("A\nB\nC x2\nD");
      await page.getByRole("button", { name: /^Put on the wheel/ }).click();
      await scan(page, "custom wheel");
      await page.getByRole("button", { name: /Take turns vetoing/ }).click();
      await scan(page, "veto setup");
      await page.getByRole("button", { name: "Start" }).click();
      await scan(page, "veto turn");
      await page.getByRole("button", { name: "Stop" }).click();
      await page.getByRole("button", { name: /Head-to-head/ }).click();
      await scan(page, "head-to-head");
    });

    test("a live room, as host", async ({ page }) => {
      await openApp(page);
      await page.getByRole("button", { name: /My own list/ }).click();
      await page.getByLabel("Your options").fill("A\nB\nC");
      await page.getByRole("button", { name: /^Put on the wheel/ }).click();
      await page.getByRole("button", { name: /Live room/ }).click();
      await expect(page.getByLabel("Room link")).toBeVisible();
      await scan(page, "room host");
    });
  });
}

test.describe("theme switch", () => {
  test("cycles Auto, Light, Dark, remembers the choice, and Auto follows the device", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openApp(page);
    const html = page.locator("html");
    const toggle = () => page.getByRole("button", { name: /^Colour theme:/ });
    await expect(html).toHaveAttribute("data-theme", "dark"); // Auto, device is dark
    await expect(toggle()).toHaveAccessibleName("Colour theme: Auto. Switch to Light");

    await toggle().click(); // Light, whatever the device says
    await expect(html).toHaveAttribute("data-theme", "light");
    await page.reload();
    await page.waitForSelector("body[data-hydrated=true]");
    await expect(html).toHaveAttribute("data-theme", "light"); // remembered, and applied before the page painted
    await expect(toggle()).toHaveAccessibleName("Colour theme: Light. Switch to Dark");

    await toggle().click(); // Dark
    await expect(html).toHaveAttribute("data-theme", "dark");
    await toggle().click(); // back to Auto
    await expect(toggle()).toHaveAccessibleName("Colour theme: Auto. Switch to Light");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).toHaveAttribute("data-theme", "light"); // Auto follows the device live
    expect(await page.evaluate(() => window.localStorage.getItem("wsg-theme"))).toBeNull();
  });
});

test.describe("keyboard", () => {
  test("search, spin and read the result without a mouse", async ({ page }) => {
    await openApp(page);
    await page.getByLabel("Neighbourhood or city").focus();
    await page.keyboard.type("Shoreditch, London");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(8);
    const spin = page.getByRole("button", { name: /^Spin/ });
    await spin.focus();
    await expect(spin).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator(".result-pop")).toBeVisible({ timeout: 9000 });
    // The result is announced politely to screen readers.
    await expect(page.locator("[aria-live=polite]").filter({ has: page.locator(".result-pop") })).toHaveCount(1);
    // And every interactive control can be reached by Tab with a visible focus ring (outline styles are set on all of them).
    const unfocusable = await page.evaluate(() =>
      [...document.querySelectorAll("button, a[href], input, select, textarea, summary")]
        .filter((el) => (el as HTMLElement).tabIndex < 0 && !el.closest("[hidden], [inert]") && getComputedStyle(el).display !== "none")
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unfocusable).toEqual([]);
  });
});

test("the checker itself works: it flags a button with no name and pale text", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    document.body.insertAdjacentHTML("beforeend", '<button style="color:#ccc;background:#fff;width:40px;height:40px"></button><p style="color:#ddd;background:#fff">pale text</p>');
  });
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const ids = results.violations.map((v) => v.id);
  expect(ids).toContain("button-name");
  expect(ids).toContain("color-contrast");
});

test.describe("Hindi", () => {
  test.use({ locale: "hi-IN" });

  test("the page follows a Hindi device, switches back, and remembers the choice", async ({ page }) => {
    await openApp(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    await expect(page.getByRole("heading", { name: /हम कहाँ चलें/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "खोजें", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Switch to English/ }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: /Where should we go/ })).toBeVisible();
    await page.reload();
    await page.waitForSelector("body[data-hydrated=true]");
    await expect(page.getByRole("heading", { name: /Where should we go/ })).toBeVisible(); // the choice beat the device default
  });

  test("a whole search, spin and result work in Hindi, and pass the accessibility checks", async ({ page }) => {
    await openApp(page);
    await page.getByLabel("मोहल्ला या शहर").fill("Shoreditch, London");
    await page.getByRole("button", { name: "खोजें", exact: true }).click();
    await expect(page.getByRole("button", { name: /^[^🙈]* हटाएँ$/ })).toHaveCount(8);
    await expect(page.getByText("पास में:")).toBeVisible();
    await scan(page, "hindi results");
    await page.getByRole("button", { name: "घुमाएँ!" }).click();
    const card = page.locator(".result-pop");
    await expect(card).toBeVisible({ timeout: 9000 });
    await expect(card).toContainText("चलिए चलते हैं");
    await expect(card.getByRole("button", { name: /तस्वीर के रूप में शेयर करें/ })).toBeVisible();
    await scan(page, "hindi result card");
    await page.getByText("और फ़िल्टर").click();
    await scan(page, "hindi filters");
  });

  test("messages built from parts read as Hindi sentences", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: /मेरी अपनी सूची/ }).click();
    await page.getByLabel("आपके विकल्प").fill("A\nA\nB x9\nC");
    await page.getByRole("button", { name: /^पहिये पर रखें/ }).click();
    await expect(page.getByText("1 दोहराया हुआ विकल्प छोड़ दिया गया।")).toBeVisible();
    await expect(page.getByText("वज़न 5 तक जा सकता है।")).toBeVisible();
    await page.getByRole("button", { name: /आमने-सामने मुक़ाबला/ }).click();
    await expect(page.getByText(/क्वार्टर-फ़ाइनल|सेमी-फ़ाइनल|फ़ाइनल/)).toBeVisible();
  });
});
