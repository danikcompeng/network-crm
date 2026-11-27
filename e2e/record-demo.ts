// Records Orbit's silent demo videos on the live site:
//   npm run record:demo        (needs ffmpeg: see e2e/helpers/film.ts)
//
// Two takes, light and dark, on a 393 x 852 phone screen drawn at 2x,
// each in a fresh browser that logs in ONLY through "Try the demo" (no
// personal data). The format matches Bitewise's videos: 786 x 1704, H.264
// .mp4, no audio (here at a steady 30 fps, from Chrome's screencast).
//
// Makes, in design/videos/:
//   orbit-demo-light.mp4, orbit-demo-dark.mp4  the whole tour (~50 s)
//   orbit-loop-light.mp4, orbit-loop-dark.mp4  the 3D map turning and
//                                              growing (~15 s), looping
//   orbit-map.gif                              the light loop, 360 px
//                                              wide at 20 fps, for the README
// and stills of the busiest moments in test-results/record/stills/, to look
// at before committing.
//
// The tour:
//   1. Login, then "Try the demo".
//   2. Today: follow-ups and application counts.
//   3. People: scroll a little, open Grace Liu (how you met, who
//      introduced her, the timeline), back to the list.
//   4. Applications: scroll, one status change (Harborview: Applied →
//      Interviewing), put back off camera afterwards.
//   5. Map: it drifts, a drag turns it, zoom in, tap a person, close,
//      Recentre, "Watch it grow".
// Then, after the tour's last frame, the loop: Recentre, a slow turn,
// "Watch it grow", the drift, Recentre again, so it ends where it starts.
//
// The demo account is shared with real visitors (and Hold and Bitewise):
// the one status change is put back after each take, and the next "Try
// the demo" reseeds a demo that was changed at all.

import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { APP_NAME } from "../lib/app-identity";
import { Film, findFfmpeg, gifOf, lengthOf, stills } from "./helpers/film";
import { Finger, showTouches, type Point } from "./helpers/finger";

const BASE_URL = process.env.BASE_URL ?? "https://orbit-dk.vercel.app";
/**
 * RECORD_CPU_SLOWDOWN=4 records with the CPU slowed 4x (DevTools), as a
 * check on a slower phone: the videos then go to test-results/, never
 * over the real ones.
 */
const SLOWDOWN = Number(process.env.RECORD_CPU_SLOWDOWN ?? 1);
const VIDEOS = SLOWDOWN > 1 ? path.resolve("test-results", "record-slow") : path.resolve("design", "videos");
const FRAMES = path.resolve("test-results", "record");
/** The page background (app/globals.css), for the tour's fade in and out. */
const BACKGROUND = { light: "0xF8F7F4", dark: "0x131518" } as const;
/** Over this, a video is too big to commit. */
const MAX_BYTES = 10 * 1024 * 1024;

type Theme = keyof typeof BACKGROUND;

/** The application changed on camera, and its status before and after. */
const HARBORVIEW = { name: "Status of Firmware Intern at Harborview Medical Devices", from: "applied", to: "interviewing" } as const;

test.describe.configure({ mode: "serial" });

/** A fresh phone-shaped browser: no saved login. The 2x comes from the launch flags (record.config.ts). */
async function phone(browser: Browser, theme: Theme) {
  const context = await browser.newContext({
    viewport: null,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    baseURL: BASE_URL,
    colorScheme: theme,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const size = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
  expect(size, "the window should be 393 x 852 at 2x (record.config.ts)").toEqual([393, 852, 2]);
  return { context, page };
}

/** Scrolls the page with the finger (a slow drag, no fling) until `target` sits around `at` (0 = top, 1 = bottom of the screen). */
async function bringIntoView(page: Page, finger: Finger, target: Locator, at = 0.45, ms = 700) {
  for (let tries = 0; tries < 4; tries++) {
    const box = await target.boundingBox();
    if (!box) throw new Error(`can't see ${target}`);
    const room = await page.evaluate(() => ({ y: scrollY, max: document.documentElement.scrollHeight - innerHeight, h: innerHeight }));
    const want = Math.max(-room.y, Math.min(room.max - room.y, box.y + box.height / 2 - room.h * at));
    if (Math.abs(want) < 24) return;
    const dy = Math.max(-420, Math.min(420, want));
    const startY = dy > 0 ? 640 : 200;
    await finger.drag({ x: 300, y: startY }, { x: 290, y: startY - dy }, ms, { hold: 120 });
    await page.waitForTimeout(250);
  }
}

const markers = (page: Page) => page.locator("span[data-node]");

/** Someone on the map, uncovered and well inside the frame: the first of `names` that is. */
async function personOnMap(page: Page, names: string[]): Promise<{ name: string; at: Point }> {
  const frame = (await page.getByRole("img", { name: /^Network map/ }).boundingBox())!;
  for (const name of names) {
    const m = page.locator(`span[data-node][data-label="${name}"]:not([data-covered])`);
    if ((await m.count()) === 0) continue;
    const b = (await m.boundingBox())!;
    const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    if (at.x > frame.x + 30 && at.x < frame.x + frame.width - 70 && at.y > frame.y + 30 && at.y < frame.y + frame.height - 30) return { name, at };
  }
  throw new Error(`none of ${names.join(", ")} is clear on the map`);
}

/** A slow, slightly curved drag across the map, so it turns. */
async function turnMap(page: Page, finger: Finger, frame: { x: number; y: number; width: number; height: number }, ms: number, sweep = 0.55) {
  const from = { x: frame.x + frame.width * 0.2, y: frame.y + frame.height * 0.78 };
  const to = { x: frame.x + frame.width * (0.2 + sweep), y: frame.y + frame.height * 0.62 };
  await finger.drag(from, to, ms, {
    settle: 50,
    hold: 100,
    // A gentle arc, as a thumb moves.
    path: (t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * 26 }),
  });
}

/** Everything on camera, with marks for cutting and for the stills. */
async function act(page: Page, finger: Finger, film: Film) {
  const pause = (ms: number) => page.waitForTimeout(ms);
  const tabs = page.getByRole("navigation", { name: "Main" });

  // 1. Login → Try the demo.
  film.mark("tour-start");
  await pause(1400);
  await finger.tap(page.getByRole("button", { name: "Try the demo" }));

  // 2. Today: follow-ups and application counts.
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Follow up" })).toBeVisible();
  film.mark("today");
  await pause(2200);

  // 3. People: scroll a little, open Grace, back.
  await finger.tap(tabs.getByRole("link", { name: "People" }));
  await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible();
  film.mark("people");
  await pause(900);
  const grace = page.getByRole("link", { name: /^Grace Liu/ });
  await bringIntoView(page, finger, grace, 0.55, 750);
  await pause(500);
  // Her row grows into her page (Motion polish).
  film.mark("expand");
  await finger.tap(grace);
  await expect(page.getByRole("heading", { level: 1, name: "Grace Liu" })).toBeVisible();
  film.mark("person");
  await pause(1300);
  // How you met and who introduced her at the top, the timeline below.
  await bringIntoView(page, finger, page.getByRole("region", { name: "How you know them" }), 0.3, 850);
  film.mark("how-met");
  await pause(2300);
  await bringIntoView(page, finger, page.getByRole("region", { name: "Timeline" }), 0.5, 800);
  film.mark("timeline");
  await pause(1700);
  await finger.tap(tabs.getByRole("link", { name: "People" }));
  await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible();
  film.mark("back");
  await pause(700);

  // 4. Applications: scroll, one status change.
  await finger.tap(tabs.getByRole("link", { name: "Applications" }));
  await expect(page.getByRole("heading", { level: 1, name: "Applications" })).toBeVisible();
  film.mark("applications");
  await pause(1100);
  const status = page.getByRole("combobox", { name: HARBORVIEW.name });
  await bringIntoView(page, finger, status, 0.55, 850);
  await pause(600);
  film.mark("status-tap");
  await finger.tap(status);
  await pause(400);
  await status.selectOption(HARBORVIEW.to);
  await expect(page.getByRole("status").filter({ hasText: "Saved: Harborview Medical Devices, Interviewing." })).toBeVisible();
  film.mark("status");
  await pause(1900);

  // 5. The map.
  await finger.tap(tabs.getByRole("link", { name: "Map" }));
  await expect(page.locator("[data-map-3d] canvas")).toHaveCount(1);
  await expect(page.getByText("Laying out…")).toHaveCount(0);
  await expect(markers(page)).toHaveCount(20);
  film.mark("map");
  await pause(2600); // it drifts
  const frame = (await page.getByRole("img", { name: /^Network map/ }).boundingBox())!;
  film.mark("turn");
  await turnMap(page, finger, frame, 1500);
  await pause(600);
  await finger.tap(page.getByRole("button", { name: "Zoom in" }));
  await pause(550);
  await finger.tap(page.getByRole("button", { name: "Zoom in" }));
  await pause(900);
  const { name, at } = await personOnMap(page, ["Riya", "Sam", "Grace", "Omar", "Elena", "Marcus"]);
  await finger.tapAt(at);
  const sheet = page.getByRole("dialog", { name: new RegExp(`^${name} `) });
  await expect(sheet).toBeVisible();
  await pause(500);
  film.mark("sheet");
  await pause(2000);
  await finger.tap(sheet.getByRole("button", { name: "Close" }));
  await expect(sheet).toBeHidden();
  await pause(700);
  await finger.tap(page.getByRole("button", { name: "Recentre" }));
  await pause(1100);
  const grow = page.getByRole("button", { name: "Watch it grow" });
  await finger.tap(grow);
  film.mark("grow");
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(grow).toBeVisible({ timeout: 10_000 });
  await pause(1600);
  film.mark("tour-end");

  // The loop: from the home view back to the home view.
  await finger.tap(page.getByRole("button", { name: "Recentre" }));
  await pause(1100);
  film.mark("loop-start");
  await pause(1000);
  film.mark("loop-turn");
  await turnMap(page, finger, frame, 2600, 0.6);
  await pause(700);
  await finger.tap(grow);
  film.mark("loop-grow");
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(grow).toBeVisible({ timeout: 10_000 });
  await pause(3400); // the drift picks up again
  await finger.tap(page.getByRole("button", { name: "Recentre" }));
  await pause(1500);
  film.mark("loop-end");
}

/** Off camera: Harborview back to Applied. */
async function putBack(page: Page) {
  await page.goto("/applications");
  const status = page.getByRole("combobox", { name: HARBORVIEW.name });
  if ((await status.inputValue()) === HARBORVIEW.from) return;
  await status.selectOption(HARBORVIEW.from);
  await expect(page.getByRole("status").filter({ hasText: "Saved: Harborview Medical Devices, Applied." })).toBeVisible();
}

/**
 * One throwaway view transition before the camera rolls, drawn like the
 * expand (a clipped, shadowed, blurred picture): a fresh browser profile
 * otherwise drops frames on its first one, while the GPU sets that up
 * (a phone that has opened the app before has this cached).
 */
async function warmUp(page: Page) {
  await page.evaluate(async () => {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;left:20px;top:300px;width:300px;height:60px;background:var(--surface);view-transition-name:warm-up;opacity:0.01";
    const style = document.createElement("style");
    style.textContent = `
      ::view-transition-group(warm-up) { animation-duration: 300ms; box-shadow: 0 0 0 1px var(--line-strong), 0 12px 32px rgb(29 33 37 / 0.12); border-radius: 16px; }
      ::view-transition-image-pair(warm-up) { clip-path: inset(0 round 16px); }
      ::view-transition-old(warm-up) { animation: 300ms both warm-blur; }
      @keyframes warm-blur { to { opacity: 0; filter: blur(2px); } }`;
    document.head.append(style);
    document.body.append(el);
    await document.startViewTransition(() => {
      el.style.top = "40px";
      el.style.height = "700px";
    }).finished;
    el.remove();
    style.remove();
  });
}

const megabytes = (file: string) => (fs.statSync(file).size / 1024 / 1024).toFixed(1);

for (const theme of ["light", "dark"] as const satisfies readonly Theme[]) {
  test(`${theme} take`, async ({ browser }) => {
    const ffmpeg = await findFfmpeg();
    if (!ffmpeg) throw new Error("No ffmpeg: set FFMPEG_PATH, or npm install --no-save ffmpeg-static");

    const { context, page } = await phone(browser, theme);
    await showTouches(page);
    await page.goto("/login");
    // This app's login page, fully settled (fonts, the form), before the camera rolls.
    await expect(page.getByRole("heading", { level: 1, name: APP_NAME })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try the demo" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);

    await warmUp(page);
    const finger = await Finger.on(page);
    if (SLOWDOWN > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: SLOWDOWN });
    const film = await Film.roll(page, path.join(FRAMES, SLOWDOWN > 1 ? `${theme}-slow` : theme));
    let acted = false;
    try {
      await act(page, finger, film);
      acted = true;
    } finally {
      await film.stop();
      try {
        await putBack(page);
      } catch (error) {
        console.error(`Couldn't put Harborview back: press Reset demo on Today. ${error}`);
      }
      await context.close();
    }
    console.log(film.saveTimeline());
    if (!acted) return;

    const tourFile = path.join(VIDEOS, `orbit-demo-${theme}.mp4`);
    const loopFile = path.join(VIDEOS, `orbit-loop-${theme}.mp4`);
    const tour = film.encode(ffmpeg, tourFile, film.at("tour-start"), film.at("tour-end"), BACKGROUND[theme]);
    const loop = film.encodeLoop(ffmpeg, loopFile, film.at("loop-start"), film.at("loop-end"));
    if (theme === "light") gifOf(ffmpeg, loopFile, path.join(VIDEOS, "orbit-map.gif"));

    // How steady the capture was on the map (the busiest stretch).
    const steady = film.report(film.at("turn"), film.at("loop-end"));
    console.log(`${theme}: map capture ${steady.perSecond.toFixed(1)} frames/s, ${steady.over40ms} gaps over 40 ms`);
    // And through the expand (the tap's 120 ms hold, then 250 ms of growing) and the status pulse.
    const expand = film.report(film.at("expand") + 120, film.at("expand") + 520);
    console.log(`${theme}: expand ${expand.frames} frames (${expand.perSecond.toFixed(1)}/s), ${expand.over40ms} gaps over 40 ms`);
    const pulse = film.report(film.at("status"), film.at("status") + 300);
    console.log(`${theme}: pulse ${pulse.frames} frames (${pulse.perSecond.toFixed(1)}/s), ${pulse.over40ms} gaps over 40 ms`);

    // Stills of the busiest moments, to look at.
    const t0 = film.at("tour-start");
    const s = (mark: string, plus = 0) => (film.at(mark) + plus - t0) / 1000;
    const dir = path.join(FRAMES, "stills");
    stills(ffmpeg, tourFile, dir, [s("expand", 200), s("expand", 300), s("expand", 400), s("how-met", 300), s("status", 80), s("status", 300), s("turn", 750), s("sheet"), s("grow", 1500), s("grow", 3000)]);
    const l0 = film.at("loop-start") + 600; // the loop's 0:00 (encodeLoop drops the crossfade at the start)
    stills(ffmpeg, loopFile, dir, [(film.at("loop-turn") + 1300 - l0) / 1000, (film.at("loop-grow") + 2000 - l0) / 1000, 0, loop.seconds - 0.05]);

    for (const file of [tourFile, loopFile, ...(theme === "light" ? [path.join(VIDEOS, "orbit-map.gif")] : [])]) {
      const big = fs.statSync(file).size > MAX_BYTES ? "  (over 10 MB: don't commit)" : "";
      const length = file.endsWith(".mp4") ? ` ${lengthOf(ffmpeg, file).toFixed(2)} s` : "";
      console.log(`${path.relative(process.cwd(), file)}:${length} ${megabytes(file)} MB${big}`);
    }
    console.log(`${theme}: tour ${tour.seconds.toFixed(2)} s, loop ${loop.seconds.toFixed(2)} s`);
  });
}
