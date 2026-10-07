// End-to-end tests: a real browser (a phone-sized Chromium) clicking through the site the way
// people do. They run against `next dev` on port 3100 with .env.local — the TEST database and
// TEST Blob store, never the real ones (e2e/guard.ts refuses otherwise).
// Run: npm run e2e  (or npx playwright test e2e/flow.spec.ts for one file).
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/guard.ts",
  globalTeardown: "./e2e/cleanup.ts",
  // One at a time: the flow signs in, creates and deletes; parallel runs would only race each other.
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results/e2e",
  use: {
    ...devices["Pixel 7"],
    baseURL: `http://localhost:${PORT}`,
    locale: "ar",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/version`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
  },
});
