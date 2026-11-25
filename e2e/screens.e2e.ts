// Screenshots for the design-critic and the case study, in light and dark,
// at iPhone size (390 x 844 @3x). Saved to docs/screenshots/<feature>/.
// Run against a production build, so no dev tools appear in the shots:
//   npm run build && npx next start -p 3300
//   BASE_URL=http://localhost:3300 npx playwright test e2e/screens.e2e.ts --project=signed-in -g "home"
// (or plain `npm run screens` against the dev server).

import { expect, test, type Page } from "@playwright/test";
import { freshDemo } from "./helpers/app";

const SCHEMES = ["light", "dark"] as const;

async function settle(page: Page) {
  // Fonts loaded and colour transitions finished, or the shot catches
  // buttons halfway between the light and dark colours.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

export async function shoot(page: Page, folder: string, name: string, options: { fullPage?: boolean } = {}) {
  // Wait until React has taken over the page (hydrated).
  await page.waitForLoadState("networkidle");
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await settle(page);
    await page.screenshot({ path: `docs/screenshots/${folder}/${name}-${scheme}.png`, fullPage: options.fullPage });
  }
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login screens", async ({ page }) => {
    const folder = "feature-1";
    await page.goto("/login");
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
    await shoot(page, folder, "login-email");

    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByText(/Enter your email address/)).toBeVisible();
    await shoot(page, folder, "login-email-error");

    await page.getByRole("textbox", { name: "Email" }).fill("you@example.com");
    await page.getByRole("button", { name: "I already have a code" }).click();
    await expect(page.getByRole("textbox", { name: "Code from the email" })).toBeVisible();
    await shoot(page, folder, "login-code");
  });
});

test("home screens", async ({ page }) => {
  await freshDemo(page);
  await expect(page.getByText("20 people, 3 introduction chains.")).toBeVisible();
  await shoot(page, "feature-1", "home");
});
