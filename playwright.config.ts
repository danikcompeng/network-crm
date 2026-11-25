// End-to-end tests: a real browser shaped like an iPhone, using the app
// through "Try the demo". `npm run test:e2e` runs them all against the
// local dev server on port 3200 (started if it isn't running; never 3000,
// where Hold or Bitewise may be running).
//
// The demo account is real and shared (with Hold and Bitewise too), so:
// - tests run one at a time (workers: 1): two at once would reset each
//   other's contacts;
// - the signed-in tests share ONE demo sign-in (e2e/demo.setup.ts):
//   Supabase rate-limits auth calls per address.
//
// Against a DEPLOYED copy (a BASE_URL that isn't localhost, e.g.
// BASE_URL=https://orbit-dk.vercel.app) only the smoke and install
// checks run, once, with no retries: the full suite would reset the live
// demo under real visitors and overwrite the screenshots.

import { defineConfig } from "@playwright/test";
import { BASE_URL, PHONE } from "./e2e/helpers/phone";

const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(BASE_URL);
const DEMO_SESSION = "e2e/.auth/demo.json";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: local && process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    ...PHONE,
    baseURL: BASE_URL,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  // *.e2e.ts, so Vitest (which runs *.test.ts) never picks these up.
  projects: local
    ? [
        { name: "setup", testMatch: "**/demo.setup.ts" },
        {
          name: "signed-in",
          testMatch: ["**/home.e2e.ts", "**/people.e2e.ts", "**/applications.e2e.ts", "**/today.e2e.ts", "**/map.e2e.ts", "**/a11y.e2e.ts", "**/screens.e2e.ts"],
          dependencies: ["setup"],
          use: { storageState: DEMO_SESSION },
        },
        // Not smoke.e2e.ts: it's for the deployed copy (an extra demo sign-in
        // and a save on the shared demo for nothing, locally).
        { name: "signed-out", testMatch: ["**/login.e2e.ts", "**/install.e2e.ts"] },
      ]
    : [{ name: "production", testMatch: ["**/smoke.e2e.ts", "**/install.e2e.ts"] }],
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "npm run dev", url: BASE_URL, reuseExistingServer: true, timeout: 120_000 },
});
