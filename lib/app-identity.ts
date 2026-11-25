// The app's name, description, icon and home-screen manifest, in one place
// (plans/crm.md, Feature 6). "Network" is the working name (pick a real one
// before it ships), so renaming it is a one-line change. Same approach as
// Hold's app identity.
import type { MetadataRoute } from "next";
import { PALETTE } from "./palette";

export const APP_NAME = "Network";
export const APP_DESCRIPTION = "Who you met, who introduced you, and when to follow up.";

/** The icon's colours: the cobalt field and the white mark on it. */
export const ICON_COLORS = {
  field: PALETTE.light["accent-fill"],
  mark: PALETTE.light["on-accent"],
} as const;

export type Point = readonly [x: number, y: number];

/**
 * The network mark, in a 0 0 100 100 box: a solid hub (you) with spokes to
 * three ringed contacts. The old tab icon's drawing (a 64 px box, scaled
 * by 100/64), with the bottom spoke ending on its ring's stroke instead of
 * poking inside it.
 */
export const NETWORK_MARK = {
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
} as const;

/**
 * Android's safe zone for a maskable icon: a centred circle with a radius
 * of 40% of the icon. Whatever shape Android cuts, it never cuts inside it.
 */
export const MASKABLE_SAFE_RADIUS = 40;

/**
 * How much smaller the mark is drawn on the maskable icon, about the
 * centre (50, 50). The top-left ring reaches farthest (about 48 at full
 * size, its stroke included): 38.4 at 0.8, inside the 40 circle.
 */
export const MASKABLE_SCALE = 0.8;

/**
 * - "rounded": a rounded square, for browser tabs and Android's "any" icon.
 * - "full": fills the whole square. iPhone rounds the corners itself, and
 *   it shows see-through corners as black.
 * - "maskable": full-bleed, with the mark drawn smaller so it stays inside
 *   the safe circle, because Android cuts it to its own shape.
 */
export type IconShape = "rounded" | "full" | "maskable";

export type MarkGeometry = {
  hub: { center: Point; r: number };
  rings: Point[];
  ringRadius: number;
  stroke: number;
  spokes: [Point, Point][];
};

/** The mark for an icon shape, in the 0 0 100 100 box. */
export function markGeometry(shape: IconShape): MarkGeometry {
  const k = shape === "maskable" ? MASKABLE_SCALE : 1;
  const place = ([x, y]: Point): Point => [50 + (x - 50) * k, 50 + (y - 50) * k];
  return {
    hub: { center: place(NETWORK_MARK.hub.center), r: NETWORK_MARK.hub.r * k },
    rings: NETWORK_MARK.rings.map(place),
    ringRadius: NETWORK_MARK.ringRadius * k,
    stroke: NETWORK_MARK.stroke * k,
    spokes: NETWORK_MARK.spokes.map(([a, b]) => [place(a), place(b)] as [Point, Point]),
  };
}

/** How far the drawn mark reaches from the icon's centre (strokes included). */
export function markReach(mark: MarkGeometry): number {
  const from = ([x, y]: Point) => Math.hypot(x - 50, y - 50);
  return Math.max(
    from(mark.hub.center) + mark.hub.r,
    ...mark.rings.map((c) => from(c) + mark.ringRadius + mark.stroke / 2),
    ...mark.spokes.flat().map((p) => from(p) + mark.stroke / 2),
  );
}

export type AppIconFile = {
  file: string;
  size: number;
  shape: IconShape;
  /** Listed in the manifest (Android). The iPhone icon has its own tag. */
  inManifest: boolean;
};

/** Every icon PNG, served at /icons/<file> by app/icons/[file]/route.tsx. */
export const APP_ICONS: readonly AppIconFile[] = [
  { file: "icon-192.png", size: 192, shape: "rounded", inManifest: true },
  { file: "icon-512.png", size: 512, shape: "rounded", inManifest: true },
  { file: "icon-maskable-512.png", size: 512, shape: "maskable", inManifest: true },
  // 180 x 180 is what iPhones ask for.
  { file: "apple-touch-icon.png", size: 180, shape: "full", inManifest: false },
];

/**
 * Bump when the drawing changes: Next serves these PNGs as cacheable for a
 * year, so a new picture needs a new address to reach browsers and Android
 * installs. (iPhone copies its icon once, when you add the app.)
 * lib/app-identity.test.ts pins the drawing next to this number, so a
 * changed drawing fails a test until the version is bumped with it.
 */
export const ICON_VERSION = 1; // 1: the network mark (2026-11-25)

export const iconUrl = (icon: AppIconFile) => `/icons/${icon.file}?v=${ICON_VERSION}`;

export function iconByFile(file: string): AppIconFile | undefined {
  return APP_ICONS.find((icon) => icon.file === file);
}

/** The web app manifest: what Android (and iPhone, partly) reads when you install. */
export function appManifest(): MetadataRoute.Manifest {
  return {
    // The app's identity: stays "/" forever, so Android always knows it's
    // the same app, whatever start_url becomes.
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    start_url: "/", // Today, or Log in when you're logged out
    scope: "/",
    display: "standalone",
    // No orientation lock (WCAG 1.3.4): some people have their phone
    // mounted sideways.
    background_color: PALETTE.light.background,
    theme_color: PALETTE.light.background,
    icons: APP_ICONS.filter((icon) => icon.inManifest).map((icon) => ({
      src: iconUrl(icon),
      sizes: `${icon.size}x${icon.size}`,
      type: "image/png",
      purpose: icon.shape === "maskable" ? "maskable" : "any",
    })),
  };
}
