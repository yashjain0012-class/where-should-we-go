import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the production build (`npm run build` first; `npm run e2e` does both).
// The OpenStreetMap services are mocked in e2e/fixtures.ts, so the tests are fast, offline and never flaky.
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2, // one production server serves every page; more workers than that just slows each test down
  timeout: 45_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    reducedMotion: "reduce", // a 1.2 s spin instead of 5 s; individual tests turn it off when they check the animation
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
