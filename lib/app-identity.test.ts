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
      version: 2,
      ORBIT_MARK: { core: 12, orbit: 28, stroke: 7, moon: { angle: 150, r: 9 } },
      MASKABLE_SCALE: 0.95,
      ICON_COLORS: { field: "#1D4ED8", mark: "#FFFFFF" },
      full: { center: [50, 50], core: 12, orbit: 28, stroke: 7, moon: { center: [25.75, 64], r: 9 } },
      maskable: { center: [50, 50], core: 11.4, orbit: 26.6, stroke: 6.65, moon: { center: [26.96, 63.3], r: 8.55 } },
    });
  });

  it("the mark on its field reads (white on cobalt, well over 3:1)", () => {
    expect(contrast(ICON_COLORS.mark, ICON_COLORS.field)).toBeGreaterThan(4.5);
    expect(ICON_COLORS.field).toBe(PALETTE.light["accent-fill"]);
  });
});

describe("the orbit mark", () => {
  it("is a centre dot, one ring around it and a small dot on the ring, low on the left", () => {
    const mark = markGeometry("full");
    const [x, y] = mark.moon.center;
    expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(mark.orbit, 6);
    expect(x).toBeLessThan(50);
    expect(y).toBeGreaterThan(50);
  });

  it("the small dot shows on both sides of the ring (a bead), smaller than you, and the centre dot is clear of the ring", () => {
    for (const shape of ["full", "maskable"] as const) {
      const mark = markGeometry(shape);
      // Past the ring's stroke on each side by at least a third of its own radius.
      expect(mark.moon.r - mark.stroke / 2).toBeGreaterThan(mark.moon.r / 3);
      expect(mark.moon.r).toBeLessThan(mark.core);
      expect(mark.orbit - mark.stroke / 2 - mark.core).toBeGreaterThan(mark.core * 0.75);
    }
  });

  it("keeps all of the maskable mark inside Android's safe circle, with room for launchers that crop further", () => {
    expect(markReach(markGeometry("maskable"))).toBeLessThanOrEqual(MASKABLE_SAFE_RADIUS * 0.9);
  });

  it("its bounding box: the small dot on the left, the ring on the other three sides", () => {
    expect(markBounds(markGeometry("full")).map((n) => Math.round(n * 100) / 100)).toEqual([16.75, 18.5, 81.5, 81.5]);
  });

  it("stays inside the icon's square, with a margin", () => {
    // The small dot reaches farthest: 28 + 9.
    expect(markReach(markGeometry("full"))).toBeCloseTo(37, 6);
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
