// The 2D network map (plans/crm.md, Feature 5), on the real demo account.
// Since Feature 7 it's the fallback for a browser with no WebGL, so every
// test here turns WebGL off; the 3D map's tests are in map-3d.e2e.ts.
import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations, freshDemo, withoutWebGL } from "./helpers/app";
import { reseedDemo } from "./helpers/seed";

test.beforeEach(async ({ page }) => {
  await withoutWebGL(page);
});

test.afterAll(async () => {
  await reseedDemo();
});

const dots = (page: Page) => page.locator("svg [data-node]");
const visibleDots = (page: Page) => page.locator("svg [data-node]:not(.opacity-0)");

test("the map draws everyone around You, and the list holds the same network", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freshDemo(page, "/map");
  await expect(page.getByRole("heading", { level: 1, name: "Your network" })).toBeVisible();
  await expect(page.getByText("20 people, 3 introduction chains.")).toBeVisible();
  await expect(page.getByRole("img", { name: /^Network map\. 20 people, 3 introduction chains\./ })).toBeVisible();
  await expect(dots(page)).toHaveCount(20);

  const list = page.getByRole("region", { name: "The same network, as a list" });
  // Elena's chain: Elena > Sam > Riya > Tom, nested.
  const elena = list.getByRole("listitem").filter({ has: page.getByRole("button", { name: /^Elena Marsh/ }) }).first();
  await expect(elena.getByRole("button", { name: /^Tom Becker/ })).toBeVisible();
  await expect(list.getByRole("button", { name: /^Riya Patel/ })).toContainText("Interviewing");

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await expectNoA11yViolations(page);
  }
});

test("tapping a dot opens that person; a drag doesn't", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freshDemo(page, "/map");
  const riya = page.locator('svg [data-node]').filter({ hasText: "Riya" });
  await expect(riya).toBeVisible();
  const box = (await riya.locator("circle").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // A drag that starts on her moves the map, and opens nothing.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 30, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const moved = (await riya.locator("circle").boundingBox())!;
  // A right-click opens nothing.
  await page.mouse.click(moved.x + moved.width / 2, moved.y + moved.height / 2, { button: "right" });
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.mouse.click(moved.x + moved.width / 2, moved.y + moved.height / 2);
  const sheet = page.getByRole("dialog", { name: "Riya Patel" });
  await expect(sheet).toBeVisible();
  // Closing it puts focus on the map's heading (a dot can't take focus back).
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your network" })).toBeFocused();
});

test("with motion allowed, the dots ease into place once and end where Reduce Motion puts them", async ({ page }) => {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (document.querySelector("svg g.transition-transform")) (window as unknown as { eased: boolean }).eased = true;
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freshDemo(page, "/map");
  const riya = page.locator("svg [data-node]").filter({ hasText: "Riya" }).locator("circle");
  const settled = (await riya.boundingBox())!;

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await expect.poll(() => page.evaluate(() => (window as unknown as { eased?: boolean }).eased), { timeout: 5000 }).toBe(true);
  await expect(page.locator("svg g.transition-transform")).toHaveCount(0, { timeout: 5000 });
  const after = (await riya.boundingBox())!;
  expect(Math.abs(after.x - settled.x)).toBeLessThan(1);
  expect(Math.abs(after.y - settled.y)).toBeLessThan(1);
});

test("the growth slider: an early day shows fewer people, the far right everyone", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freshDemo(page, "/map");
  const slider = page.getByRole("slider", { name: /Your network on/ });
  await expect(slider).toHaveAttribute("aria-valuetext", "Today, all 20 people");
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(visibleDots(page)).toHaveCount(1); // Leo, met first
  await expect(page.getByText(/^On .*: 1 person, no introductions yet\.$/)).toBeVisible();
  await page.keyboard.press("End");
  await expect(visibleDots(page)).toHaveCount(20);
  await expect(page.getByRole("region", { name: "The same network, as a list" }).getByRole("button")).toHaveCount(20);
});

test("with Reduce Motion the settled layout is there at once, and Play is offered only with motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freshDemo(page, "/map");
  await expect(page.getByRole("button", { name: "Watch it grow" })).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.getByRole("button", { name: "Watch it grow" })).toBeVisible();
});

test("an account with nobody gets a starting point, not an empty frame", async ({ page }) => {
  await freshDemo(page, "/map");
  try {
    await reseedDemo({ contacts: [], interactions: [], applications: [] });
    await page.goto("/map");
    await expect(page.getByText(/Your map starts with you/)).toBeVisible();
  } finally {
    await reseedDemo();
  }
});
