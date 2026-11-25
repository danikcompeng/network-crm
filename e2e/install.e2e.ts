// Installable (plans/crm.md, Feature 6). Phones fetch the manifest and
// icons WITHOUT the login cookie, so these run logged out.

import { expect, test, type Page } from "@playwright/test";
import { APP_ICONS, APP_NAME, iconByFile, iconUrl } from "../lib/app-identity";

/** Width and height of a PNG, from its header. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("the manifest loads without a login and opens standalone on Today", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ id: "/", name: APP_NAME, short_name: APP_NAME, start_url: "/", display: "standalone" });
  expect(manifest.orientation).toBeUndefined();
});

for (const icon of APP_ICONS) {
  test(`${icon.file} is a ${icon.size} px PNG, without a login`, async ({ request }) => {
    const response = await request.get(iconUrl(icon), { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    expect(pngSize(await response.body())).toEqual({ width: icon.size, height: icon.size });
  });
}

test("an unknown icon is a 404, not the login page", async ({ request }) => {
  const response = await request.get("/icons/nope.png", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
});

/**
 * The distinct values of an attribute on matching tags. A production build
 * can stream the page's metadata twice, so the same tag can appear twice;
 * what matters is that there's only one value.
 */
async function distinct(page: Page, selector: string, attribute: string) {
  const values = await page.locator(selector).evaluateAll((els, a) => els.map((el) => el.getAttribute(a)), attribute);
  return [...new Set(values)];
}

test("pages link the manifest, our icons and the iPhone tags, never a default favicon", async ({ page }) => {
  await page.goto("/login");
  expect(await distinct(page, 'link[rel="manifest"]', "href")).toEqual(["/manifest.webmanifest"]);
  expect(await distinct(page, 'link[rel="apple-touch-icon"]', "href")).toEqual([iconUrl(iconByFile("apple-touch-icon.png")!)]);
  expect(await distinct(page, 'link[rel="apple-touch-icon"]', "sizes")).toEqual(["180x180"]);
  expect(await distinct(page, 'link[rel="icon"]', "href")).toEqual([iconUrl(iconByFile("icon-192.png")!)]);
  expect(await distinct(page, 'meta[name="apple-mobile-web-app-title"]', "content")).toEqual([APP_NAME]);
  expect(await distinct(page, 'meta[name="apple-mobile-web-app-status-bar-style"]', "content")).toEqual(["default"]);
  await expect(page.locator('link[href*="favicon.ico"], link[href*="icon.svg"]')).toHaveCount(0);
});

/** The RGBA of one pixel of an icon, at (x, y) in the drawing's 0 0 100 100 box, read through a canvas. */
function iconPixel(page: Page, file: string, x: number, y: number) {
  return page.evaluate(
    async ({ src, x, y }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const px = Math.min(img.width - 2, Math.max(1, Math.floor((img.width * x) / 100)));
      const py = Math.min(img.height - 2, Math.max(1, Math.floor((img.height * y) / 100)));
      return Array.from(ctx.getImageData(px, py, 1, 1).data);
    },
    { src: iconUrl(iconByFile(file)!), x, y },
  );
}

const WHITE = [255, 255, 255, 255];
const COBALT = [0x1d, 0x4e, 0xd8, 255];

test("the corners: iPhone opaque, tab icon rounded (see-through), maskable full-bleed", async ({ page }) => {
  await page.goto("/login");
  expect((await iconPixel(page, "apple-touch-icon.png", 0, 0))[3]).toBe(255);
  expect((await iconPixel(page, "icon-192.png", 0, 0))[3]).toBe(0);
  expect(await iconPixel(page, "icon-maskable-512.png", 0, 0)).toEqual(COBALT);
});

test("the orbit mark is drawn: a white centre dot, ring and small dot, smaller on the maskable icon", async ({ page }) => {
  await page.goto("/login");
  // Points along the line to the small dot (30 degrees below the left).
  const along = (radius: number, k = 1): [number, number] => [50 - radius * k * Math.cos(Math.PI / 6), 50 + radius * k * Math.sin(Math.PI / 6)];
  for (const file of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
    expect(await iconPixel(page, file, 50, 50), `${file} centre dot`).toEqual(WHITE);
    expect(await iconPixel(page, file, 50, 22), `${file} ring, at the top`).toEqual(WHITE);
    expect(await iconPixel(page, file, 50, 78), `${file} ring, at the bottom (unbroken)`).toEqual(WHITE);
    expect(await iconPixel(page, file, 50, 36), `${file} between the dot and the ring`).toEqual(COBALT);
    expect(await iconPixel(page, file, ...along(28)), `${file} small dot`).toEqual(WHITE);
    // The small dot shows outside the ring (whose outer edge is at 31.5).
    expect(await iconPixel(page, file, ...along(35)), `${file} small dot, past the ring`).toEqual(WHITE);
    expect(await iconPixel(page, file, ...along(40)), `${file} field beyond the small dot`).toEqual(COBALT);
  }
  // Maskable: scaled by 0.95 about the centre. Where the full-size ring's
  // top edge would be is field; the scaled ring and dot are white.
  expect(await iconPixel(page, "icon-maskable-512.png", 50, 19.2), "maskable, unscaled ring").toEqual(COBALT);
  expect(await iconPixel(page, "icon-maskable-512.png", 50, 50 - 28 * 0.95), "maskable, scaled ring").toEqual(WHITE);
  expect(await iconPixel(page, "icon-maskable-512.png", ...along(28, 0.95)), "maskable, scaled small dot").toEqual(WHITE);
});
