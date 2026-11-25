import { describe, expect, it } from "vitest";
import {
  APP_ICONS,
  APP_NAME,
  ICON_COLORS,
  ICON_VERSION,
  MASKABLE_SAFE_RADIUS,
  MASKABLE_SCALE,
  ORBIT_MARK,
  appManifest,
  iconByFile,
  iconUrl,
  markGeometry,
  markBounds,
  markReach,
  pointOnOrbit,
} from "./app-identity";
import { PALETTE, contrast } from "./palette";

describe("app icons", () => {
  it("has the four files phones ask for, with the right shapes", () => {
    expect(APP_ICONS.map((i) => [i.file, i.size, i.shape])).toEqual([
      ["icon-192.png", 192, "rounded"],
      ["icon-512.png", 512, "rounded"],
      ["icon-maskable-512.png", 512, "maskable"],
      ["apple-touch-icon.png", 180, "full"], // iPhone: opaque, no rounded corners
    ]);
  });

  it("every manifest icon is a file the route serves, at its real size; only one is maskable", () => {
    const icons = appManifest().icons ?? [];
    for (const icon of icons) {
      const known = iconByFile(icon.src.replace(/^\/icons\//, "").replace(/\?.*$/, ""));
      expect(known, icon.src).toBeDefined();
      expect(icon.sizes).toBe(`${known!.size}x${known!.size}`);
    }
    expect(icons.map((i) => i.purpose)).toEqual(["any", "any", "maskable"]);
    expect(iconUrl(APP_ICONS[0])).toBe(`/icons/icon-192.png?v=${ICON_VERSION}`);
    expect(iconByFile("nope.png")).toBeUndefined();
  });

  it("pins the drawing to ICON_VERSION: change the drawing, bump the version and this test together", () => {
    const rounded = (shape: "full" | "maskable") =>
      JSON.parse(JSON.stringify(markGeometry(shape), (_key, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));
    expect({
      version: ICON_VERSION,
      ORBIT_MARK,
      MASKABLE_SCALE,
      ICON_COLORS,
      full: rounded("full"),
      maskable: rounded("maskable"),
    }).toEqual({
      version: 3,
      ORBIT_MARK: { core: 16, orbit: { rx: 37, ry: 8, tilt: -22 }, stroke: 6, gap: 2.5, moon: { t: 135, r: 6.5 } },
      MASKABLE_SCALE: 0.85,
      ICON_COLORS: { field: "#1D4ED8", mark: "#FFFFFF" },
      full: {
        center: [50, 48.59],
        core: 16,
        orbit: { rx: 37, ry: 8, tilt: -22 },
        stroke: 6,
        gap: 2.5,
        moon: { center: [27.86, 63.63], r: 6.5 },
        nearPath: "M 84.31 34.73 A 37 8 -22 0 1 53 56 A 37 8 -22 0 1 15.69 62.45",
        farPath: "M 15.69 62.45 A 37 8 -22 0 1 47 41.17 A 37 8 -22 0 1 84.31 34.73",
      },
      maskable: {
        center: [50, 48.8],
        core: 13.6,
        orbit: { rx: 31.45, ry: 6.8, tilt: -22 },
        stroke: 5.1,
        gap: 2.13,
        moon: { center: [31.18, 61.59], r: 5.53 },
        nearPath: "M 79.16 37.02 A 31.45 6.8 -22 0 1 52.55 55.1 A 31.45 6.8 -22 0 1 20.84 60.58",
        farPath: "M 20.84 60.58 A 31.45 6.8 -22 0 1 47.45 42.49 A 31.45 6.8 -22 0 1 79.16 37.02",
      },
    });
  });

  it("the mark on its field reads (white on cobalt, well over 3:1)", () => {
    expect(contrast(ICON_COLORS.mark, ICON_COLORS.field)).toBeGreaterThan(4.5);
    expect(ICON_COLORS.field).toBe(PALETTE.light["accent-fill"]);
  });
});

describe("the orbit mark", () => {
  const SHAPES = ["full", "maskable"] as const;
  const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  it("is a tilted, flattened orbit, its right end higher, like an orbit seen at an angle", () => {
    const mark = markGeometry("full");
    expect(mark.orbit.ry / mark.orbit.rx).toBeGreaterThan(0.12);
    expect(mark.orbit.ry / mark.orbit.rx).toBeLessThan(0.35);
    expect(mark.orbit.tilt).toBeLessThan(-15);
    expect(mark.orbit.tilt).toBeGreaterThan(-35);
    expect(pointOnOrbit(mark, 0)[1]).toBeLessThan(pointOnOrbit(mark, 180)[1]);
  });

  it("passes behind the centre dot and in front of it (so it can't read as a dot inside an eye)", () => {
    for (const shape of SHAPES) {
      const mark = markGeometry(shape);
      // Both halves cross the dot: their middles are inside it.
      expect(dist(pointOnOrbit(mark, 90), mark.center)).toBeLessThan(mark.core);
      expect(dist(pointOnOrbit(mark, 270), mark.center)).toBeLessThan(mark.core);
      // A cut you can see.
      expect(mark.gap).toBeGreaterThanOrEqual(mark.stroke * 0.4);
      // The dot shows below the orbit in front of it (or it reads as a dome, a hat).
      expect(mark.core - (mark.orbit.ry + mark.stroke / 2 + mark.gap)).toBeGreaterThanOrEqual(2.5 * (mark.core / 16));
    }
  });

  it("the paths: the near half runs from the right end to the left, the far half back", () => {
    const mark = markGeometry("full");
    const r = (p: readonly number[]) => p.map((n) => Math.round(n * 100) / 100).join(" ");
    expect(mark.nearPath.startsWith(`M ${r(pointOnOrbit(mark, 0))} A`)).toBe(true);
    expect(mark.nearPath.endsWith(` ${r(pointOnOrbit(mark, 180))}`)).toBe(true);
    expect(mark.farPath.startsWith(`M ${r(pointOnOrbit(mark, 180))} A`)).toBe(true);
    expect(mark.farPath.endsWith(` ${r(pointOnOrbit(mark, 0))}`)).toBe(true);
  });

  it("puts the small dot on the near half, low on the left, clear of the centre dot and its gap", () => {
    for (const shape of SHAPES) {
      const mark = markGeometry(shape);
      const [x, y] = mark.moon.center;
      const t = (-mark.orbit.tilt * Math.PI) / 180;
      const dx = x - mark.center[0];
      const dy = y - mark.center[1];
      const lx = dx * Math.cos(t) - dy * Math.sin(t);
      const ly = dx * Math.sin(t) + dy * Math.cos(t);
      expect((lx / mark.orbit.rx) ** 2 + (ly / mark.orbit.ry) ** 2).toBeCloseTo(1, 6);
      expect(ly).toBeGreaterThan(0); // the near half
      expect(x).toBeLessThan(mark.center[0]);
      expect(y).toBeGreaterThan(mark.center[1]);
      expect(dist(mark.moon.center, mark.center)).toBeGreaterThan(mark.core + mark.gap + mark.moon.r);
      // A bead: it shows past the stroke on both sides, and it's smaller than you.
      expect(mark.moon.r - mark.stroke / 2).toBeGreaterThan(mark.moon.r / 2);
      // On the orbit, not its tip: some of the orbit runs on past it.
      expect(dist(pointOnOrbit(mark, 180), mark.moon.center) - mark.moon.r).toBeGreaterThan(mark.moon.r / 2);
      expect(mark.moon.r).toBeLessThan(mark.core);
    }
  });

  it("is centred in the square by its bounding box, with a margin", () => {
    for (const shape of SHAPES) {
      const [l, t, r, b] = markBounds(markGeometry(shape));
      expect((l + r) / 2).toBeCloseTo(50, 6);
      expect((t + b) / 2).toBeCloseTo(50, 6);
      expect(l).toBeGreaterThan(10);
    }
    expect(markReach(markGeometry("full"))).toBeLessThan(41);
    const [l, , r] = markBounds(markGeometry("full"));
    expect(r - l).toBeLessThanOrEqual(78); // wide, but with room each side
  });

  it("keeps all of the maskable mark inside Android's safe circle, with room for launchers that crop further", () => {
    expect(markReach(markGeometry("maskable"))).toBeLessThanOrEqual(MASKABLE_SAFE_RADIUS * 0.9);
  });
});

describe("the manifest", () => {
  it("installs standalone on Today, named, never locked to an orientation", () => {
    const m = appManifest();
    expect(m).toMatchObject({ id: "/", name: APP_NAME, short_name: APP_NAME, start_url: "/", scope: "/", display: "standalone" });
    expect(m.orientation).toBeUndefined();
    expect(m.background_color).toBe(PALETTE.light.background);
  });
});
