import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { APP_NAME } from "../../lib/app-identity";
import { reseedDemo } from "./seed";

/** Signs in with "Try the demo" and waits for home. */
export async function signInDemo(page: Page) {
  await page.goto("/login");
  // Playwright reuses whatever answers on the port: make sure it's this app
  // (another app's server on 3200 once passed itself off as this one).
  await expect(page.getByRole("heading", { level: 1, name: APP_NAME })).toBeVisible();
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
}

/**
 * Puts the demo's sample network back, so every test starts the same. Uses
 * the shared session from e2e/demo.setup.ts (signing in only if there
 * isn't one), to keep auth calls to the shared demo down.
 */
export async function freshDemo(page: Page, path = "/") {
  await reseedDemo();
  await page.goto(path);
  if (page.url().endsWith("/login")) {
    await signInDemo(page);
    if (path !== "/") await page.goto(path);
  }
}

/**
 * Fails on any serious or critical accessibility problem axe can find
 * (contrast, names, labels, roles), in WCAG 2.2 AA terms.
 */
export async function expectNoA11yViolations(page: Page) {
  // Let colour transitions finish: measured mid-transition, contrast is
  // neither colour's.
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/**
 * Makes the page's browser have no WebGL (every getContext("webgl…")
 * answers null), so the map falls back to 2D (plans/crm.md, Feature 7).
 * Call before the page loads.
 */
export async function withoutWebGL(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return (original as (this: HTMLCanvasElement, ...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
}
