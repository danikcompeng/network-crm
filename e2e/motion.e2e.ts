// Motion polish (plans/crm.md): a person's row grows into their page, a pulse confirms a saved status and a log, a stage glyph swaps with
// a blur crossfade; with Reduce Motion none of it moves. On the real demo
// account, put back at the end.
import { expect, test, type Page } from "@playwright/test";
import { freshDemo } from "./helpers/app";
import { reseedDemo } from "./helpers/seed";

test.afterAll(async () => {
  await reseedDemo();
});

type Transition = {
  /** The person a row or card stood for, named before the change (the old picture). */
  from: string | null;
  /** Every view-transition pseudo-element that animated, e.g. "::view-transition-new(person-page)". */
  animated: string[];
};

/**
 * Records every view transition: which person row was named for it, and
 * which pseudo-elements animated once it was ready. Before the page loads.
 */
async function watchTransitions(page: Page) {
  await page.addInitScript(() => {
    const log: Transition[] = [];
    (window as unknown as { __transitions: Transition[] }).__transitions = log;
    const named = () => {
      const el = [...document.querySelectorAll<HTMLElement>("[data-expand]")].find((e) => e.style.viewTransitionName);
      return el?.dataset.expand ?? null;
    };
    const original = Document.prototype.startViewTransition;
    Document.prototype.startViewTransition = function (this: Document, arg?: unknown) {
      const entry: Transition = { from: named(), animated: [] };
      log.push(entry);
      const transition = (original as (this: Document, a?: unknown) => ViewTransition).call(this, arg);
      transition.ready
        .then(() => {
          entry.animated = document
            .getAnimations()
            .map((a) => (a.effect as KeyframeEffect | null)?.pseudoElement ?? "")
            .filter((p) => p.startsWith("::view-transition"));
        })
        .catch(() => {});
      return transition;
    } as typeof original;
  });
}

const transitions = (page: Page) => page.evaluate(() => (window as unknown as { __transitions: Transition[] }).__transitions);

/** The last transition, once it has been recorded as ready. */
async function lastTransition(page: Page, count: number): Promise<Transition> {
  await expect.poll(async () => (await transitions(page)).length).toBeGreaterThanOrEqual(count);
  await page.waitForTimeout(100);
  return (await transitions(page)).at(-1)!;
}

/** A pair: the box grows (the group moves only when both pictures exist) and the row fades off. */
const PAIR = ["::view-transition-group(person-page)", "::view-transition-old(person-page)"];
const personPageMoves = (t: Transition) => t.animated.filter((p) => p.includes("(person-page)"));

async function idOf(page: Page, name: string): Promise<string> {
  const href = await page.getByRole("link", { name: new RegExp(`^${name}`) }).getAttribute("href");
  return href!.split("/").at(-1)!;
}

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("a row grows into the person's page; going back is an instant swap", async ({ page }) => {
    await watchTransitions(page);
    await freshDemo(page, "/people");
    await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible();
    const grace = await idOf(page, "Grace Liu");

    await page.getByRole("link", { name: /^Grace Liu/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Grace Liu" })).toBeVisible();
    const open = await lastTransition(page, 1);
    expect(open.from).toBe(grace);
    expect(personPageMoves(open)).toEqual(expect.arrayContaining(PAIR));
    // The name is off again once the transition has its pictures.
    await expect.poll(() => page.evaluate(() => document.querySelectorAll("[data-expand][style*='view-transition-name']").length)).toBe(0);

    // Back (the People tab): People loads fresh, so there's nothing to shrink into; nothing moves.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "People" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible();
    await page.waitForTimeout(300);
    for (const t of (await transitions(page)).slice(1)) expect(personPageMoves(t)).toEqual([]);

    // Again, from the list as it is now (a kept page): it still grows.
    const count = (await transitions(page)).length;
    await page.getByRole("link", { name: /^Grace Liu/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Grace Liu" })).toBeVisible();
    const again = await lastTransition(page, count + 1);
    expect(again.from).toBe(grace);
    expect(personPageMoves(again)).toEqual(expect.arrayContaining(PAIR));
  });

  test("only a tap on a row or card moves anything: not Add person, the map, a tab, or a cmd-click", async ({ page }) => {
    await watchTransitions(page);
    await freshDemo(page, "/people");
    // Visit Grace and come back, so her row was named once.
    await page.getByRole("link", { name: /^Grace Liu/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Grace Liu" })).toBeVisible();
    await lastTransition(page, 1);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "People" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible();

    // A cmd/ctrl-click (a new tab) names nothing here.
    const [popup] = await Promise.all([page.context().waitForEvent("page"), page.getByRole("link", { name: /^Grace Liu/ }).click({ modifiers: ["ControlOrMeta"] })]);
    await popup.close();
    expect(await page.evaluate(() => document.querySelectorAll("[data-expand][style*='view-transition-name']").length)).toBe(0);

    // Add someone: their new page just appears; Grace's row doesn't grow into it.
    await page.getByRole("button", { name: "Add" }).click();
    const sheet = page.getByRole("dialog", { name: "Add a person" });
    await sheet.getByRole("textbox", { name: "Name" }).fill("Motion Test");
    await sheet.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Motion Test" })).toBeVisible();

    // A tab away from People, and from the map's list through the sheet's "Their page".
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Map" }).click();
    await page.getByRole("button", { name: /^Grace Liu/ }).first().click();
    await page.getByRole("dialog", { name: "Grace Liu" }).getByRole("link", { name: "Their page" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Grace Liu" })).toBeVisible();
    await page.waitForTimeout(400);

    // Only the first tap ever started one.
    // Only the first tap moved anything (React may still start a transition
    // for the others, with only its own do-nothing animations on the root).
    const [first, ...rest] = await transitions(page);
    expect(personPageMoves(first)).toEqual(expect.arrayContaining(PAIR));
    for (const t of rest) {
      expect(t.from).toBeNull();
      expect(t.animated.filter((p) => p !== "::view-transition" && p !== "::view-transition-group(root)")).toEqual([]);
    }
  });

  test("Today: a follow-up card grows into the page through its sheet's Their page", async ({ page }) => {
    await watchTransitions(page);
    await freshDemo(page, "/");
    const card = page.locator("article", { has: page.getByRole("button", { name: "Log contact with Riya Patel" }) });
    const riya = await card.getAttribute("data-expand");
    await card.getByRole("button", { name: /Riya Patel/ }).first().click();
    await page.getByRole("dialog", { name: "Riya Patel" }).getByRole("link", { name: "Their page" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Riya Patel" })).toBeVisible();
    const open = await lastTransition(page, 1);
    expect(open.from).toBe(riya);
    expect(personPageMoves(open)).toEqual(expect.arrayContaining(PAIR));
  });

  test("a saved status change pulses its select once; a log's check pops in with a ring", async ({ page }) => {
    await freshDemo(page, "/applications");
    const harborview = page.getByRole("combobox", { name: "Status of Firmware Intern at Harborview Medical Devices" });
    const ring = harborview.locator("xpath=..").locator("[data-pulse]");
    await watchPulses(page);
    await harborview.selectOption("interviewing");
    // Not before it's saved (the toast says so at the same moment).
    await expect(ring).toHaveCount(0);
    await expect(page.getByText("Saved: Harborview Medical Devices, Interviewing.").first()).toBeAttached();
    await expect.poll(() => pulsesSeen(page)).toEqual([true]);
    // Gone once played, and not played again when the row comes back into the list.
    await expect(ring).toHaveCount(0);
    await page.getByRole("group", { name: "Status" }).getByRole("button", { name: /^Offer/ }).click();
    await expect(harborview).toHaveCount(0);
    await page.getByRole("group", { name: "Status" }).getByRole("button", { name: /^All/ }).click();
    await expect(harborview).toBeVisible();
    await page.waitForTimeout(300);
    expect(await pulsesSeen(page)).toEqual([true]);
    await harborview.selectOption("applied");
    await expect(page.getByText("Saved: Harborview Medical Devices, Applied.").first()).toBeAttached();

    await page.goto("/");
    await page.getByRole("button", { name: "Log contact with Riya Patel" }).click();
    const log = page.getByRole("dialog", { name: "Log contact with Riya Patel" });
    await log.getByRole("button", { name: "Call" }).click();
    const sheet = page.getByRole("dialog", { name: "Riya Patel" });
    const check = sheet.locator("[data-logged-check]");
    await expect(check).toBeVisible();
    expect(await check.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);
    await sheet.getByRole("button", { name: "Undo" }).click();
    await expect(sheet).toBeHidden();
  });

  test("a stage glyph crossfades when the stage changes, then one glyph is left", async ({ page }) => {
    await freshDemo(page, "/people");
    await page.getByRole("link", { name: /^Grace Liu/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Grace Liu" })).toBeVisible();
    await watchGlyphs(page);
    await changeStage(page, "Offer");
    await expect.poll(() => sawLeaving(page)).toBe(true);
    await expect(page.locator("main [data-leaving]")).toHaveCount(0);
  });
});

test.describe("with Reduce Motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the row and the page swap at once, and nothing pulses or crossfades", async ({ page }) => {
    await watchTransitions(page);
    await freshDemo(page, "/people");
    await page.getByRole("link", { name: /^Grace Liu/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Grace Liu" })).toBeVisible();
    // (React keeps a do-nothing animation on the root of every transition; the page and the row never move.)
    const open = await lastTransition(page, 1);
    expect(open.from).not.toBeNull();
    expect(personPageMoves(open)).toEqual([]);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "People" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible();
    await page.waitForTimeout(300);
    for (const t of await transitions(page)) expect(personPageMoves(t)).toEqual([]);

    // The glyph: only ever one on screen.
    await page.getByRole("link", { name: /^Grace Liu/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Grace Liu" })).toBeVisible();
    await watchGlyphs(page);
    await changeStage(page, "Offer");
    await page.waitForTimeout(400);
    expect(await sawLeaving(page)).toBe(false);

    // The status pulse: never drawn.
    await page.goto("/applications");
    const harborview = page.getByRole("combobox", { name: "Status of Firmware Intern at Harborview Medical Devices" });
    await watchPulses(page);
    await harborview.selectOption("interviewing");
    await expect(page.getByText("Saved: Harborview Medical Devices, Interviewing.").first()).toBeAttached();
    await page.waitForTimeout(300);
    // (The ring is there, but never shown or animated.)
    expect(await pulsesSeen(page)).not.toContain(true);
    await harborview.selectOption("applied");
    await expect(page.getByText("Saved: Harborview Medical Devices, Applied.").first()).toBeAttached();
  });
});

/** Records each pulse ring as it's added: whether it was visible and animating. */
async function watchPulses(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __pulses: boolean[] };
    w.__pulses = [];
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (n instanceof HTMLElement && n.matches("[data-pulse]")) w.__pulses.push(n.checkVisibility() && n.getAnimations().length > 0);
    }).observe(document.body, { subtree: true, childList: true });
  });
}
const pulsesSeen = (page: Page) => page.evaluate(() => (window as unknown as { __pulses: boolean[] }).__pulses);

/** Watches the page for an old glyph that's visible while it fades (data-leaving). */
async function watchGlyphs(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __sawLeaving: boolean };
    w.__sawLeaving = false;
    const check = () => {
      for (const el of document.querySelectorAll("main [data-leaving]")) if ((el as Element).checkVisibility()) w.__sawLeaving = true;
    };
    new MutationObserver(check).observe(document.body, { subtree: true, childList: true });
  });
}
const sawLeaving = (page: Page) => page.evaluate(() => (window as unknown as { __sawLeaving: boolean }).__sawLeaving);

/** Edits the open person's stage, and waits for the edit sheet to close. */
async function changeStage(page: Page, stage: string) {
  await page.getByRole("button", { name: "Edit" }).click();
  const sheet = page.getByRole("dialog", { name: /^Edit/ });
  await sheet.getByRole("combobox", { name: "Stage" }).selectOption({ label: stage });
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator("main").getByText(stage, { exact: true }).first()).toBeVisible();
}
