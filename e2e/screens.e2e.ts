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

export async function shoot(page: Page, folder: string, name: string, options: { fullPage?: boolean; motion?: boolean } = {}) {
  // Wait until React has taken over the page (hydrated).
  await page.waitForLoadState("networkidle");
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: options.motion ? "no-preference" : "reduce" });
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

test("today screens", async ({ page }) => {
  const folder = "feature-4";
  await freshDemo(page);
  await expect(page.getByText("6 due")).toBeVisible();
  await shoot(page, folder, "today");
  await shoot(page, folder, "today-full", { fullPage: true });

  await page.getByRole("button", { name: /^Isabel Cruz/ }).click();
  await expect(page.getByRole("dialog", { name: "Isabel Cruz" }).getByText("9 days overdue", { exact: false })).toBeVisible();
  await shoot(page, folder, "person-sheet");
  await page.getByRole("dialog", { name: "Isabel Cruz" }).getByRole("button", { name: "Log interaction" }).click();
  const log = page.getByRole("dialog", { name: "Log contact with Isabel Cruz" });
  await expect(log).toBeVisible();
  await shoot(page, folder, "log");
  await log.getByRole("button", { name: "Add a note or another day" }).click();
  await shoot(page, folder, "log-extras");
  await log.getByRole("button", { name: "Message" }).click();
  const logged = page.getByRole("dialog", { name: "Isabel Cruz" });
  await expect(logged.getByRole("status")).toContainText("Logged a message with Isabel Cruz.");
  await shoot(page, folder, "logged-offer");
  await logged.getByRole("button", { name: "Set follow-up" }).click();
  await expect(logged.getByText(/^Next follow-up: /)).toBeVisible();
  await shoot(page, folder, "logged-set");
  await logged.getByRole("button", { name: "Undo" }).click();
  await expect(logged).toBeHidden();

  try {
    await reseedDemo({ contacts: [], interactions: [], applications: [] });
    await page.reload();
    await expect(page.getByText(/No one in your network yet/)).toBeVisible();
    await shoot(page, folder, "today-empty");
  } finally {
    await reseedDemo();
  }
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

test("applications screens", async ({ page }) => {
  const folder = "feature-3";
  await freshDemo(page, "/applications");
  await expect(page.getByRole("button", { name: "12 Sent" })).toBeVisible();
  await shoot(page, folder, "applications");
  await shoot(page, folder, "applications-full", { fullPage: true });

  await page.getByRole("button", { name: "5 In process" }).click();
  await shoot(page, folder, "applications-in-process");
  await page.getByRole("button", { name: "5 In process" }).click();

  await page.getByRole("button", { name: /^Kestrel Systems Firmware/ }).click();
  await expect(page.getByRole("dialog", { name: "Edit Firmware Engineering Intern" })).toBeVisible();
  await shoot(page, folder, "application-edit");
  await page.getByRole("dialog", { name: "Edit Firmware Engineering Intern" }).getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await shoot(page, folder, "application-add");
  await page.getByRole("dialog", { name: "Add an application" }).getByRole("button", { name: "Cancel" }).click();

  const sheet = [
    "Company Name\tPosition Title\tDate Applied\tStatus\tJob Link",
    "Kestrel Systems\tFirmware Engineering Intern\t\tInterview\t",
    "Juniper Robotics\tPerception Intern\t11/03/2026\tOA\twww.juniper.example/jobs/7",
    "Aster Labs\tSoftware Intern\t11/05/2026\tmaybe later\t",
    "Bad Row\t\t\tApplied\t",
  ].join("\n");
  await page.getByRole("button", { name: "Import" }).click();
  const importer = page.getByRole("dialog", { name: "Import applications" });
  await shoot(page, folder, "import-empty");
  await importer.getByRole("textbox", { name: "Paste rows from a spreadsheet or a CSV file" }).fill(sheet);
  await expect(importer.getByRole("status")).toContainText("to import");
  await shoot(page, folder, "import-preview");
  await importer.getByRole("heading", { name: "Preview" }).scrollIntoViewIfNeeded();
  await importer.getByRole("status").scrollIntoViewIfNeeded();
  await shoot(page, folder, "import-preview-rows");
  await importer.getByRole("button", { name: "Cancel" }).click();

  await page.goto("/people");
  await page.getByRole("link", { name: /^Riya Patel/ }).click();
  await page.getByRole("region", { name: "Applications" }).scrollIntoViewIfNeeded();
  await shoot(page, folder, "person-applications");

  try {
    const { contacts, interactions } = await import("../lib/demo-seed").then((m) => m.demoSeedPayload("2026-11-24", "UTC"));
    await reseedDemo({ contacts, interactions, applications: [] });
    await page.goto("/applications");
    await expect(page.getByText(/No applications yet/)).toBeVisible();
    await shoot(page, folder, "applications-empty");
  } finally {
    await reseedDemo();
  }
});

test("map screens", async ({ page }) => {
  const folder = "feature-5";
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freshDemo(page, "/map");
  await expect(page.locator("svg [data-node]")).toHaveCount(20);
  await shoot(page, folder, "map");
  // Scroll so the list's heading is at the top (it starts just behind the tab bar, which counts as "in view").
  await page.evaluate(() => {
    const top = document.getElementById("network-list")!.getBoundingClientRect().top;
    window.scrollTo(0, window.scrollY + top - 20);
  });
  await shoot(page, folder, "map-list");
  await page.evaluate(() => window.scrollTo(0, 0));

  const slider = page.getByRole("slider", { name: /Your network on/ });
  await slider.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 25; i++) await page.keyboard.press("ArrowRight");
  await shoot(page, folder, "map-growing");
  await page.keyboard.press("End");

  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await shoot(page, folder, "map-zoomed");
  await page.getByRole("button", { name: "Fit the whole network" }).click();

  const riya = page.locator("svg [data-node]").filter({ hasText: "Riya" });
  const box = (await riya.locator("circle").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole("dialog", { name: "Riya Patel" })).toBeVisible();
  await shoot(page, folder, "map-sheet");
  await page.getByRole("dialog", { name: "Riya Patel" }).getByRole("button", { name: "Close" }).click();

  try {
    await reseedDemo({ contacts: [], interactions: [], applications: [] });
    await page.goto("/map");
    await expect(page.getByText(/Your map starts with you/)).toBeVisible();
    await shoot(page, folder, "map-empty");
  } finally {
    await reseedDemo();
  }

  // With motion allowed: the Play button, mid-sweep.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/map");
  await expect(page.locator("svg [data-node]")).toHaveCount(20);
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Watch it grow" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Stop" }).click(); // hold it mid-sweep for both shots
  await shoot(page, folder, "map-playing", { motion: true });
});
