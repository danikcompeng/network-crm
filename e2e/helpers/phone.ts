// The phone every e2e test and screenshot runs on: an iPhone 14-sized
// screen (390 x 844 CSS pixels, drawn at 3x), with touch.
import { devices, type BrowserContextOptions } from "@playwright/test";

export const PHONE = {
  userAgent: devices["iPhone 14"].userAgent,
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
} satisfies BrowserContextOptions;

/**
 * The app under test: the local dev server unless BASE_URL says otherwise.
 * The live copy is https://orbit-dk.vercel.app (only the smoke and install
 * checks run there); never the default, as the full suite resets the demo.
 */
export const BASE_URL = process.env.BASE_URL ?? "http://localhost:3200";
