// The map in 3D (plans/crm.md, Feature 7), on the real demo account, in
// headless Chromium's WebGL (SwiftShader). People are found by the
// invisible markers the map keeps at each sphere (data-node, data-label);
// a pixel check proves the drawing is where the markers say.
import { expect, test, type Page } from "@playwright/test";
import { PALETTE } from "../lib/palette";
import { expectNoA11yViolations, freshDemo, withoutWebGL } from "./helpers/app";
import { reseedDemo } from "./helpers/seed";

test.afterAll(async () => {
  await reseedDemo();
});

const markers = (page: Page) => page.locator("span[data-node]");
const marker = (page: Page, name: string) => page.locator(`span[data-node][data-label="${name}"]`);

/** The centre and radius (CSS px) of someone's sphere, from their marker. */
async function sphere(page: Page, name: string) {
  const box = (await marker(page, name).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, r: box.width / 2 };
}

/** The RGB of the screen at (x, y) CSS px. */
async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  const png = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 }, scale: "css" });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }, png.toString("base64"));
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const near = (a: number[], b: number[], within: number) => a.every((v, i) => Math.abs(v - b[i]) <= within);

async function open3d(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await freshDemo(page, "/map");
  await expect(page.locator("[data-map-3d] canvas")).toHaveCount(1);
  await expect(page.getByText("Laying out…")).toHaveCount(0);
  await expect(markers(page)).toHaveCount(20);
}

test("the 3D map draws everyone round You, with no 2D map, and passes axe in light and dark", async ({ page }) => {
  await open3d(page);
  await expect(page.getByRole("img", { name: /^Network map\. 20 people, 3 introduction chains\. The same network is listed below the map\.$/ })).toBeVisible();
  await expect(page.locator("svg [data-node]")).toHaveCount(0);
  await expect(page.getByText("Drag to turn · pinch to zoom · tap a person")).toBeVisible();
  await expect(page.getByRole("button", { name: "Recentre" })).toBeVisible();
  // At the starting view nobody is hidden behind the planet or someone else.
  await expect(page.locator("span[data-node][data-covered]")).toHaveCount(0);
  // The list is still the same network.
  await expect(page.getByRole("region", { name: "The same network, as a list" }).getByRole("button")).toHaveCount(20);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await expectNoA11yViolations(page);
  }
});

test("each sphere is drawn where its marker is, in its stage colour, in light and dark", async ({ page }) => {
  await open3d(page);
  for (const mode of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: mode, reducedMotion: "reduce" });
    await page.waitForTimeout(300);
    // Riya is interviewing (cobalt), Leo is talking (ink): the sphere's colour, beside the glyph.
    for (const [name, role] of [
      ["Riya", "sphere-accent"],
      ["Leo", "sphere-ink"],
    ] as const) {
      const s = await sphere(page, name);
      const got = await pixel(page, s.x + s.r * 0.75, s.y + s.r * 0.15);
      expect(near(got, rgb(PALETTE[mode][role]), 40), `${mode}: ${name} at ${s.x},${s.y} is ${got}`).toBe(true);
    }
    // The people furthest left and right are drawn where their markers are too.
    const boxes = await markers(page).evaluateAll((els) =>
      els.filter((e) => !e.hasAttribute("data-covered")).map((e) => {
        const b = e.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2, r: b.width / 2 };
      }),
    );
    boxes.sort((a, b) => a.x - b.x);
    for (const s of [boxes[0], boxes[boxes.length - 1]]) {
      const got = await pixel(page, s.x + s.r * 0.7, s.y + s.r * 0.15);
      expect(near(got, rgb(PALETTE[mode].space), 40), `${mode}: something is drawn at ${s.x},${s.y}: ${got}`).toBe(false);
    }
    // And the frame's background is the map's own token.
    const frame = (await page.getByRole("img", { name: /^Network map/ }).boundingBox())!;
    expect(near(await pixel(page, frame.x + 12, frame.y + frame.height - 12), rgb(PALETTE[mode].space), 6)).toBe(true);
  }
});

test("tapping a person opens them; a drag or a right-click doesn't; closing goes back to the heading", async ({ page }) => {
  await open3d(page);
  const start = await sphere(page, "Riya");

  // A drag that starts on her turns the map and opens nothing.
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, start.y + 20, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(async () => {
    const now = await sphere(page, "Riya");
    return Math.hypot(now.x - start.x, now.y - start.y);
  }).toBeGreaterThan(5);

  const moved = await sphere(page, "Riya");
  await page.mouse.click(moved.x, moved.y, { button: "right" });
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.mouse.click(moved.x, moved.y);
  const sheet = page.getByRole("dialog", { name: "Riya Patel" });
  await expect(sheet).toBeVisible();
  // Her name label shows while she's in focus.
  await expect(page.locator(`[data-name-label]`).filter({ hasText: "Riya" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your network" })).toBeFocused();
});

test("a tap on a touch screen opens the person too", async ({ page }) => {
  await open3d(page);
  const s = await sphere(page, "Tom");
  await page.touchscreen.tap(s.x, s.y);
  await expect(page.getByRole("dialog", { name: "Tom Becker" })).toBeVisible();
});

test("zoom and Recentre: the view comes back exactly", async ({ page }) => {
  await open3d(page);
  const start = await sphere(page, "Riya");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(async () => (await sphere(page, "Riya")).x).not.toBeCloseTo(start.x, 0);
  // And turn it.
  const frame = (await page.getByRole("img", { name: /^Network map/ }).boundingBox())!;
  await page.mouse.move(frame.x + 40, frame.y + frame.height - 30);
  await page.mouse.down();
  await page.mouse.move(frame.x + 160, frame.y + frame.height - 60, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Recentre" }).click();
  await expect.poll(async () => Math.hypot((await sphere(page, "Riya")).x - start.x, (await sphere(page, "Riya")).y - start.y)).toBeLessThan(1);
});

test("with Reduce Motion nothing drifts; with motion allowed it turns slowly on its own", async ({ page }) => {
  await open3d(page);
  const before = await sphere(page, "Riya");
  await page.waitForTimeout(1500);
  const still = await sphere(page, "Riya");
  expect(Math.hypot(still.x - before.x, still.y - before.y)).toBeLessThan(0.5);

  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light" });
  await expect.poll(async () => Math.hypot((await sphere(page, "Riya")).x - before.x, (await sphere(page, "Riya")).y - before.y), { timeout: 10_000 }).toBeGreaterThan(3);
  // Back to Reduce Motion: it stops.
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.waitForTimeout(400);
  const stopped = await sphere(page, "Riya");
  await page.waitForTimeout(1000);
  const later = await sphere(page, "Riya");
  expect(Math.hypot(later.x - stopped.x, later.y - stopped.y)).toBeLessThan(0.5);
});

test("the growth slider: the first day shows one person, the far right everyone", async ({ page }) => {
  await open3d(page);
  const slider = page.getByRole("slider", { name: /Your network on/ });
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(markers(page)).toHaveCount(1);
  await expect(marker(page, "Leo")).toHaveCount(1);
  await page.keyboard.press("End");
  await expect(markers(page)).toHaveCount(20);
});

test("leaving the tab and coming back keeps the view, lets the old WebGL context go, and still draws (twenty times over)", async ({ page }) => {
  test.setTimeout(120_000);
  await open3d(page);
  const frame = (await page.getByRole("img", { name: /^Network map/ }).boundingBox())!;
  await page.mouse.move(frame.x + 40, frame.y + frame.height - 30);
  await page.mouse.down();
  await page.mouse.move(frame.x + 130, frame.y + frame.height - 30, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const turned = await sphere(page, "Riya");
  const nav = page.getByRole("navigation", { name: "Main" });
  const first = await page.locator("[data-map-3d] canvas").elementHandle();
  for (let i = 0; i < 20; i++) {
    await nav.getByRole("link", { name: "Today" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await nav.getByRole("link", { name: "Map" }).click();
    await expect(page.locator("[data-map-3d] canvas")).toHaveCount(1);
    await expect(markers(page)).toHaveCount(20);
  }
  // The first canvas is gone and its context released (browsers allow only about 16 at once).
  expect(await first!.evaluate((c: HTMLCanvasElement) => ({ attached: c.isConnected, lost: c.getContext("webgl2")?.isContextLost() ?? true }))).toEqual({
    attached: false,
    lost: true,
  });
  await expect(page.locator("canvas")).toHaveCount(1);
  const back = await sphere(page, "Riya");
  expect(Math.hypot(back.x - turned.x, back.y - turned.y)).toBeLessThan(1);
  const got = await pixel(page, back.x + back.r * 0.75, back.y + back.r * 0.15);
  expect(near(got, rgb(PALETTE.light["sphere-accent"]), 40), `Riya drawn: ${got}`).toBe(true);
});

test("no WebGL: the 2D map, automatically", async ({ page }) => {
  await withoutWebGL(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freshDemo(page, "/map");
  await expect(page.locator("svg [data-node]")).toHaveCount(20);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("img", { name: /^Network map\. 20 people/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fit the whole network" })).toBeVisible();
});

test("a WebGL context lost for a moment and given back: still 3D, drawn again", async ({ page }) => {
  await open3d(page);
  await page.evaluate(async () => {
    const canvas = document.querySelector("[data-map-3d] canvas") as HTMLCanvasElement;
    const lose = canvas.getContext("webgl2")!.getExtension("WEBGL_lose_context")!;
    lose.loseContext();
    await new Promise((r) => setTimeout(r, 500));
    lose.restoreContext();
  });
  await page.waitForTimeout(3500); // past the 3 s grace
  await expect(page.locator("svg [data-node]")).toHaveCount(0);
  await expect(page.locator("[data-map-3d] canvas")).toHaveCount(1);
  // Drawn again: nudge it so it renders, then look.
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Recentre" }).click();
  const s = await sphere(page, "Riya");
  const got = await pixel(page, s.x + s.r * 0.75, s.y + s.r * 0.15);
  expect(near(got, rgb(PALETTE.light["sphere-accent"]), 40), `Riya drawn again: ${got}`).toBe(true);
});

test("three.js failing to load (offline): the 2D map", async ({ page }) => {
  await page.route(/\.js(\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes("WebGLRenderer")) await route.abort();
    else await route.fulfill({ response, body });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freshDemo(page, "/map");
  await expect(page.locator("svg [data-node]")).toHaveCount(20);
  await expect(page.locator("[data-map-3d]")).toHaveCount(0);
});

test("a WebGL context lost for good: the 2D map takes over", async ({ page }) => {
  await open3d(page);
  await page.evaluate(() => {
    const canvas = document.querySelector("[data-map-3d] canvas") as HTMLCanvasElement;
    canvas.getContext("webgl2")!.getExtension("WEBGL_lose_context")!.loseContext();
  });
  await expect(page.locator("svg [data-node]")).toHaveCount(20, { timeout: 8000 });
  await expect(page.locator("[data-map-3d]")).toHaveCount(0);
});

test("three.js is downloaded only by the map", async ({ page }) => {
  // Every script response, read in full before anything is asserted.
  const reads: Promise<{ url: string; three: boolean }>[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() !== "script") return;
    reads.push(response.text().then((body) => ({ url: response.url(), three: body.includes("WebGLRenderer") }), () => ({ url: response.url(), three: false })));
  });
  const scripts = async () => Promise.all(reads);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freshDemo(page, "/");
  for (const path of ["/", "/people", "/applications"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect((await scripts()).filter((s) => s.three).map((s) => s.url)).toEqual([]);
  await page.goto("/map");
  await expect(page.locator("[data-map-3d] canvas")).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  expect((await scripts()).some((s) => s.three)).toBe(true);
});
