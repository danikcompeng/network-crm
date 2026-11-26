// The demo video recording (e2e/record-demo.ts), kept apart from the tests
// so `npx playwright test` never records. Run it with `npm run record:demo`.
//
// No emulated viewport: Chrome's screencast (e2e/helpers/film.ts) would
// then hand over frames at CSS size. Instead the window itself is a
// 393 x 852 phone screen at a device scale of 2, so every frame is
// 786 x 1704. Drawn on the GPU where there is one (ANGLE on Direct3D 11
// on Windows), so the 3D map keeps up at 60 frames a second.
import { defineConfig } from "@playwright/test";

const gpu = process.platform === "win32" ? ["--use-angle=d3d11"] : [];

export default defineConfig({
  testDir: ".",
  testMatch: "record-demo.ts",
  // One take at a time: both use the shared demo account.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // A take is about 75 s of acting plus encoding.
  timeout: 8 * 60_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  outputDir: "../test-results/record-output",
  use: {
    browserName: "chromium",
    launchOptions: {
      args: ["--window-size=393,852", "--force-device-scale-factor=2", "--enable-gpu", "--ignore-gpu-blocklist", ...gpu],
    },
  },
});
