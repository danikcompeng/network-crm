import { describe, expect, it } from "vitest";
import {
  APP_ICONS,
  APP_NAME,
  ICON_COLORS,
  ICON_VERSION,
  MASKABLE_SAFE_RADIUS,
  MASKABLE_SCALE,
  NETWORK_MARK,
  appManifest,
  iconByFile,
  iconUrl,
  markGeometry,
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
    expect({ version: ICON_VERSION, NETWORK_MARK, MASKABLE_SCALE, ICON_COLORS }).toEqual({
      version: 1,
      NETWORK_MARK: {
        hub: { center: [50, 50], r: 11.7 },
        rings: [
          [21.9, 25.8],
          [78.1, 29.7],
          [67.2, 78.9],
        ],
        ringRadius: 8.2,
        stroke: 5.5,
        spokes: [
          [
            [28.8, 32.2],
            [42.5, 44.7],
          ],
          [
            [70.9, 35.6],
            [58.1, 45.6],
          ],
          [
            [61.5, 69.6],
            [55.3, 59.4],
          ],
        ],
      },
      MASKABLE_SCALE: 0.8,
      ICON_COLORS: { field: "#1D4ED8", mark: "#FFFFFF" },
    });
  });

  it("the mark on its field reads (white on cobalt, well over 3:1)", () => {
    expect(contrast(ICON_COLORS.mark, ICON_COLORS.field)).toBeGreaterThan(4.5);
    expect(ICON_COLORS.field).toBe(PALETTE.light["accent-fill"]);
  });
});

describe("the network mark", () => {
  it("is drawn as specified on the tab and iPhone icons", () => {
    for (const shape of ["rounded", "full"] as const) {
      const mark = markGeometry(shape);
      expect(mark.rings).toEqual(NETWORK_MARK.rings);
      expect(mark.stroke).toBe(NETWORK_MARK.stroke);
    }
  });

  it("keeps all of the maskable mark (strokes included) inside Android's safe circle", () => {
    const reach = markReach(markGeometry("maskable"));
    expect(reach).toBeLessThanOrEqual(MASKABLE_SAFE_RADIUS);
    // Not shrunk more than it needs to be.
    expect(reach).toBeGreaterThan(MASKABLE_SAFE_RADIUS * 0.9);
    // At full size it would NOT fit, so the scaling matters.
    expect(markReach(markGeometry("full"))).toBeGreaterThan(MASKABLE_SAFE_RADIUS);
  });

  it("stays inside the icon's square, with a margin", () => {
    expect(markReach(markGeometry("full"))).toBeLessThan(50);
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
