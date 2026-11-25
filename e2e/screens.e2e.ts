// Screenshots for the design-critic and the case study, in light and dark,
// at iPhone size (390 x 844 @3x). Saved to docs/screenshots/<feature>/.
// Run against a production build, so no dev tools appear in the shots:
//   npm run build && npx next start -p 3300
//   BASE_URL=http://localhost:3300 npx playwright test e2e/screens.e2e.ts --project=signed-in -g "home"
// (or plain `npm run screens` against the dev server).

import { expect, test, type Page } from "@playwright/test";
import { freshDemo } from "./helpers/app";
import { reseedDemo } from "./helpers/seed";

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

test("people screens", async ({ page }) => {
  const folder = "feature-2";
  await freshDemo(page, "/people");
  await expect(page.getByRole("button", { name: "All 20" })).toBeVisible();
  await shoot(page, folder, "people");

  await page.getByRole("button", { name: /^Talking/ }).click();
  await shoot(page, folder, "people-talking");
  await page.getByRole("button", { name: /^All/ }).click();
  await page.getByRole("searchbox", { name: "Search people" }).fill("zzz");
  await shoot(page, folder, "people-no-match");
  await page.getByRole("searchbox", { name: "Search people" }).fill("");

  await page.getByRole("link", { name: /^Riya Patel/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Riya Patel" })).toBeVisible();
  await shoot(page, folder, "person");
  await shoot(page, folder, "person-full", { fullPage: true });

  await page.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit Riya Patel" });
  await expect(edit).toBeVisible();
  await shoot(page, folder, "person-edit");
  await edit.getByRole("button", { name: "Delete Riya Patel" }).click();
  await edit.getByRole("button", { name: "Keep" }).scrollIntoViewIfNeeded();
  await shoot(page, folder, "person-delete-confirm");
  await edit.getByRole("button", { name: "Keep" }).click();
  await edit.getByRole("button", { name: "Cancel" }).click();

  await page.goto("/people");
  await page.getByRole("button", { name: "Add" }).click();
  const add = page.getByRole("dialog", { name: "Add a person" });
  await shoot(page, folder, "add");
  await add.getByRole("button", { name: "Add person" }).click();
  await expect(add.getByText("Give them a name.")).toBeVisible();
  await shoot(page, folder, "add-error");
  await add.getByRole("button", { name: "Cancel" }).click();

  await page.goto("/people/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Not in your network" })).toBeVisible();
  await shoot(page, folder, "person-not-found");

  try {
    await reseedDemo({ contacts: [], interactions: [], applications: [] });
    await page.goto("/people");
    await expect(page.getByText(/No one yet/)).toBeVisible();
    await shoot(page, folder, "people-empty");
  } finally {
    await reseedDemo();
  }
});
