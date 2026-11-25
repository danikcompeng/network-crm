// Installable (plans/crm.md, Feature 6). Phones fetch the manifest and
// icons WITHOUT the login cookie, so these run logged out.

import { expect, test, type Page } from "@playwright/test";
import { APP_ICONS, APP_NAME, iconByFile, iconUrl, markGeometry, pointOnOrbit, type Point } from "../lib/app-identity";

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

/** The RGBA of pixels of an icon, at (x, y) points in the drawing's 0 0 100 100 box, read through a canvas. */
function iconPixels(page: Page, file: string, points: readonly (readonly [number, number])[]) {
  return page.evaluate(
    async ({ src, points }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return points.map(([x, y]) => {
        const px = Math.min(img.width - 2, Math.max(1, Math.floor((img.width * x) / 100)));
        const py = Math.min(img.height - 2, Math.max(1, Math.floor((img.height * y) / 100)));
        return Array.from(ctx.getImageData(px, py, 1, 1).data);
      });
    },
    { src: iconUrl(iconByFile(file)!), points },
  );
}

/** The RGBA of one pixel of an icon. */
async function iconPixel(page: Page, file: string, x: number, y: number) {
  return (await iconPixels(page, file, [[x, y]]))[0];
}

const WHITE = [255, 255, 255, 255];
const COBALT = [0x1d, 0x4e, 0xd8, 255];

test("the corners: iPhone opaque, tab icon rounded (see-through), maskable full-bleed", async ({ page }) => {
  await page.goto("/login");
  expect((await iconPixel(page, "apple-touch-icon.png", 0, 0))[3]).toBe(255);
  expect((await iconPixel(page, "icon-192.png", 0, 0))[3]).toBe(0);
  expect(await iconPixel(page, "icon-maskable-512.png", 0, 0)).toEqual(COBALT);
});

test("the orbit mark is drawn: the centre dot, the orbit behind and in front of it, the small dot; smaller on the maskable icon", async ({ page }) => {
  await page.goto("/login");
  const checks = (shape: "full" | "maskable") => {
    const mark = markGeometry(shape);
    const c = mark.center;
    const k = mark.core / 16; // 1, or the maskable scale
    /** A point in the orbit's own frame (x along its long axis, y towards the near side). */
    const local = (x: number, y: number): [number, number] => {
      const t = (mark.orbit.tilt * Math.PI) / 180;
      return [c[0] + x * Math.cos(t) - y * Math.sin(t), c[1] + x * Math.sin(t) + y * Math.cos(t)];
    };
    const end = pointOnOrbit(mark, 0);
    const moon = mark.moon.center;
    const outward = (p: Point, by: number): [number, number] => {
      const d = Math.hypot(p[0] - c[0], p[1] - c[1]);
      return [p[0] + ((p[0] - c[0]) / d) * by, p[1] + ((p[1] - c[1]) / d) * by];
    };
    // Where the far half's centre line is 17.25 (scaled) from the centre: inside the cut round the dot.
    let behind: Point = end;
    for (let i = 0; i <= 180; i++) {
      const p = pointOnOrbit(mark, 270 - i / 2);
      if (Math.hypot(p[0] - c[0], p[1] - c[1]) >= 17.25 * k) {
        behind = p;
        break;
      }
    }
    return [
      ["centre dot", [c[0], c[1]], WHITE],
      ["centre dot, top", local(0, -8 * k), WHITE],
      ["orbit, in front of the dot", pointOnOrbit(mark, 90), WHITE],
      ["the cut above the orbit in front", local(0, 3.75 * k), COBALT],
      ["the cut below the orbit in front", local(0, 12.25 * k), COBALT],
      ["centre dot, below the orbit in front", local(0, 14.75 * k), WHITE],
      ["orbit, far half", pointOnOrbit(mark, 330), WHITE],
      ["the far half stops short of the dot", behind, COBALT],
      ["orbit, raised right end", end, WHITE],
      ["beyond the right end", outward(end, mark.stroke / 2 + 4 * k), COBALT],
      ["small dot", moon, WHITE],
      ["small dot, past the orbit", outward(moon, mark.moon.r - 1.5 * k), WHITE],
      ["field beyond the small dot", outward(moon, mark.moon.r + 3 * k), COBALT],
    ] as const;
  };
  // The whole near half, every 2 degrees, is drawn in front: a mask in the
  // wrong coordinates once cut a V out of it, between the points above.
  const nearHalf = (shape: "full" | "maskable") =>
    Array.from({ length: 71 }, (_, i) => 20 + i * 2).map((t) => [`orbit in front, at ${t} degrees`, pointOnOrbit(markGeometry(shape), t), WHITE] as const);
  const sweep = async (file: string, list: readonly (readonly [string, Point, number[]])[]) => {
    const got = await iconPixels(page, file, list.map(([, p]) => p));
    list.forEach(([what, , colour], i) => expect(got[i], `${file} ${what}`).toEqual(colour));
  };
  for (const file of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
    await sweep(file, [...checks("full"), ...nearHalf("full")]);
  }
  await sweep("icon-maskable-512.png", [...checks("maskable"), ...nearHalf("maskable")]);
  // Maskable is scaled down: just inside where the full-size right end is, is field.
  const fullEnd = pointOnOrbit(markGeometry("full"), 0);
  expect(await iconPixel(page, "icon-maskable-512.png", fullEnd[0] + 1, fullEnd[1]), "maskable, unscaled orbit end").toEqual(COBALT);
});
