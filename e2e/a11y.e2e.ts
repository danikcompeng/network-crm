// The accessibility sweep (plans/crm.md, Feature 6): every screen and every
// sheet, light and dark; reflow at 320 px; 44 px targets; the skip link;
// focus inside a sheet; one visible h1 and a unique title per screen.

import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations, freshDemo } from "./helpers/app";
import { localToday, reseedDemo } from "./helpers/seed";
import { stressSeedPayload } from "./helpers/stress-seed";

test.afterAll(async () => {
  await reseedDemo();
});

const SCREENS = [
  { path: "/", h1: "Today" },
  { path: "/people", h1: "People" },
  { path: "/applications", h1: "Applications" },
  { path: "/map", h1: "Your network" },
] as const;

async function bothThemes(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await expectNoA11yViolations(page);
  }
}

/** Opens Riya Patel's page from People (its address has her id in it). */
async function openRiya(page: Page) {
  await page.goto("/people");
  await page.getByRole("link", { name: /^Riya Patel/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Riya Patel" })).toBeVisible();
}

/**
 * Interactive things smaller than 44 × 44 px on screen. The effective
 * target is the element or its <label>, whichever is bigger; anything not
 * visible (hidden pages, closed sheets, sr-only text) is skipped; links
 * inside running text (a <p>) are the one exception.
 */
function smallTargets(page: Page, within = "body") {
  return page.evaluate((root) => {
    const small: string[] = [];
    const scope = document.querySelector(root)!;
    for (const el of scope.querySelectorAll<HTMLElement>("a[href], button, select, input:not([type=hidden]), textarea, [role=button], [role=tab]")) {
      if (!el.checkVisibility()) continue;
      if (el.closest("p") && el.tagName === "A") continue; // a link in a sentence
      const label = el.closest("label") ?? (el.id ? document.querySelector<HTMLElement>(`label[for="${el.id}"]`) : null);
      const box = el.getBoundingClientRect();
      const target = label && label.getBoundingClientRect().height > box.height ? label.getBoundingClientRect() : box;
      if (target.width <= 1 && target.height <= 1) continue; // sr-only (the skip link is checked focused)
      if (target.height < 43.5 || target.width < 43.5) {
        small.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(target.width)}×${Math.round(target.height)}`);
      }
    }
    return small;
  }, within);
}

test("every screen: axe in both themes, one visible h1, a unique title, 44 px targets", async ({ page }) => {
  await freshDemo(page, "/");
  const titles = new Set<string>();
  for (const screen of SCREENS) {
    await page.goto(screen.path);
    await expect(page.getByRole("heading", { level: 1, name: screen.h1 })).toBeVisible();
    expect(await page.locator("h1").evaluateAll((hs) => hs.filter((h) => h.checkVisibility()).length), screen.path).toBe(1);
    titles.add(await page.title());
    expect(await smallTargets(page), screen.path).toEqual([]);
    await bothThemes(page);
  }
  await openRiya(page);
  await expect(page).toHaveTitle(/^Person · /);
  titles.add(await page.title());
  expect(await page.locator("h1").evaluateAll((hs) => hs.filter((h) => h.checkVisibility()).length), "person page").toBe(1);
  expect(await smallTargets(page), "person page").toEqual([]);
  await bothThemes(page);
  expect(titles.size).toBe(SCREENS.length + 1);

  // The measure can fail: a planted 20 px button is caught.
  await page.evaluate(() => {
    const planted = document.createElement("button");
    planted.textContent = "planted";
    planted.style.cssText = "width:20px;height:20px;overflow:hidden";
    [...document.querySelectorAll("main")].find((m) => m.checkVisibility())!.append(planted);
  });
  expect(await smallTargets(page)).toEqual(['button "planted" 20×20']);
});

test("every sheet: axe in both themes and 44 px targets", async ({ page }) => {
  await freshDemo(page, "/people");
  const check = async (name: string | RegExp) => {
    const sheet = page.getByRole("dialog", { name });
    await expect(sheet).toBeVisible();
    expect(await smallTargets(page, "dialog[open]"), String(name)).toEqual([]);
    await bothThemes(page);
    return sheet;
  };

  await page.getByRole("button", { name: "Add" }).click();
  await (await check("Add a person")).getByRole("button", { name: "Cancel" }).click();

  await openRiya(page);
  await page.getByRole("button", { name: "Edit" }).click();
  const edit = await check("Edit Riya Patel");
  await edit.getByRole("button", { name: "Delete Riya Patel" }).click();
  await check("Edit Riya Patel"); // with the delete confirmation open
  await edit.getByRole("button", { name: "Keep" }).click();
  await edit.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Log interaction" }).click();
  await (await check("Log contact with Riya Patel")).getByRole("button", { name: "Close" }).click();

  await page.goto("/");
  await page.getByRole("button", { name: /^Isabel Cruz/ }).click();
  await (await check("Isabel Cruz")).getByRole("button", { name: "Close" }).click();

  await page.goto("/applications");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await (await check("Add an application")).getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: /^Northwind Robotics/ }).first().click();
  const application = await check(/^Edit /);
  await application.getByRole("button", { name: "Delete this application" }).click();
  await check(/^Edit /); // with the delete confirmation open
  await application.getByRole("button", { name: "Keep" }).click();
  await application.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Import" }).click();
  const importer = await check("Import applications");
  await importer.getByRole("textbox", { name: "Paste rows from a spreadsheet or a CSV file" }).fill("Aster Labs\tSoftware Intern\t2026-11-02\tApplied\t");
  await expect(importer.getByRole("status")).toContainText("1 to import");
  await check("Import applications"); // with a preview
});

test("reflow: no screen scrolls sideways at 320 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await freshDemo(page, "/");
  const paths = [...SCREENS.map((s) => s.path)];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(320);
  }
  await openRiya(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), "person page").toBeLessThanOrEqual(320);
});

test("keyboard: the skip link comes first and lands on the screen; a sheet keeps focus off the page behind", async ({ page }) => {
  await freshDemo(page, "/people");
  // The screen's content streamed in (behind its skeleton, Tab would go straight to the tab bar).
  await expect(page.getByRole("link", { name: /^Riya Patel/ })).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  const box = (await skip.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Enter");
  await expect(page.locator("#content")).toBeFocused();
  // Tab from the content goes into the screen first (its search), not the tab bar.
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => { const el = document.activeElement; return el?.closest("main") ? "main" : `${el?.tagName} ${el?.id} ${el?.textContent?.slice(0, 30)}`; })).toBe("main");

  await page.getByRole("button", { name: "Add" }).click();
  const sheet = page.getByRole("dialog", { name: "Add a person" });
  await expect(sheet).toBeVisible();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const where = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return "outside the page";
      return el.closest("dialog[open]") ? "sheet" : `page behind: ${el.tagName} ${el.textContent?.trim().slice(0, 20)}`;
    });
    expect(where === "sheet" || where === "outside the page", where).toBe(true);
  }
  // Closing it gives focus back to what opened it.
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Add" })).toBeFocused();

  // After the screen comes the tab bar.
  await page.evaluate(() => {
    const main = [...document.querySelectorAll("main")].find((m) => m.checkVisibility())!;
    const focusable = [...main.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea")].filter((el) => el.checkVisibility());
    focusable.at(-1)!.focus();
  });
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('nav[aria-label="Main"]')))).toBe(true);
});

test("when what opened a sheet is gone, focus goes to the visible screen's heading", async ({ page }) => {
  await freshDemo(page, "/people");
  await page.getByRole("link", { name: /^Tom Becker/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tom Becker" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit Tom Becker" });
  await edit.getByRole("button", { name: "Delete Tom Becker" }).click();
  await edit.getByRole("button", { name: "Delete", exact: true }).click();
  // The person page is hidden (kept alive), its Edit button with it: People's heading takes focus.
  await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeFocused();
});

test("long content: nothing scrolls sideways at 320 or 390 px", async ({ page }) => {
  await freshDemo(page, "/");
  const { timeZone, today } = localToday();
  const fits = async (where: string) => {
    const width = page.viewportSize()!.width;
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${where} at ${width}`).toBeLessThanOrEqual(width);
  };
  try {
    await reseedDemo(stressSeedPayload(today, timeZone));
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 700 });
      for (const path of SCREENS.map((s) => s.path)) {
        await page.goto(path);
        await expect(page.locator("h1").first()).toBeVisible();
        await fits(path);
      }
      await page.goto("/people");
      for (const name of [/^Maximiliana/, /^alexandria/]) {
        await page.getByRole("link", { name }).click();
        await expect(page).toHaveTitle(/^Person · /);
        await fits(`person ${name}`);
        await page.getByRole("button", { name: "Edit" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await fits(`edit ${name}`);
        await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
        await page.goto("/people");
      }
      await page.goto("/");
      await page.getByRole("button", { name: /^Maximiliana/ }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await fits("person sheet");
      await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    }
  } finally {
    await reseedDemo();
  }
});

test("an unknown address says so, with a way to Today", async ({ page }) => {
  await freshDemo(page, "/");
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Nothing here" })).toBeVisible();
  await expect(page).toHaveTitle(/^Not found · /);
  await page.getByRole("link", { name: "Go to Today" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
});
