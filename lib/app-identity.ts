// The app's name, description, icon and home-screen manifest, in one place
// (plans/crm.md, Feature 6 and "Renamed to Orbit"). Same approach as Hold's
// app identity.
import type { MetadataRoute } from "next";
import { PALETTE } from "./palette";

export const APP_NAME = "Orbit";
export const APP_DESCRIPTION = "Who you met, who introduced you, and when to follow up.";

/** The icon's colours: the cobalt field and the white mark on it. */
export const ICON_COLORS = {
  field: PALETTE.light["accent-fill"],
  mark: PALETTE.light["on-accent"],
} as const;

export type Point = readonly [x: number, y: number];

/**
 * The orbit mark, in a 0 0 100 100 box centred on (50, 50): a solid dot
 * (you) with one unbroken ring around it and a small dot (a person) on the
 * ring, like a bead: wider than the ring's stroke, so it shows on both
 * sides of it. Angles in degrees, 0 to the right, positive downwards
 * (screen y runs down). The small dot sits low on the left, away from the
 * upper right, and the ring isn't cut open around it: a ring cut around a
 * dot at the upper right is the Ionic framework's logo (design-critic).
 */
export const ORBIT_MARK = {
  core: 12, // the centre dot's radius
  orbit: 28, // the ring's radius, to the middle of its stroke
  stroke: 7,
  moon: { angle: 150, r: 9 },
} as const;

/**
 * Android's safe zone for a maskable icon: a centred circle with a radius
 * of 40% of the icon. Whatever shape Android cuts, it never cuts inside it.
 */
export const MASKABLE_SAFE_RADIUS = 40;

/**
 * How much smaller the mark is drawn on the maskable icon, about the
 * centre. At full size it already fits the safe circle (37 of 40), with
 * little room for launchers that crop further; at 0.95 it reaches 35.2
 * and looks nearly the size it is on the other icons.
 */
export const MASKABLE_SCALE = 0.95;

/**
 * - "rounded": a rounded square, for browser tabs and Android's "any" icon.
 * - "full": fills the whole square. iPhone rounds the corners itself, and
 *   it shows see-through corners as black.
 * - "maskable": full-bleed, with the mark drawn smaller so it stays inside
 *   the safe circle, because Android cuts it to its own shape.
 */
export type IconShape = "rounded" | "full" | "maskable";

export type MarkGeometry = {
  center: Point;
  core: number;
  orbit: number;
  stroke: number;
  moon: { center: Point; r: number };
};

/** The mark for an icon shape, in the 0 0 100 100 box. */
export function markGeometry(shape: IconShape): MarkGeometry {
  const k = shape === "maskable" ? MASKABLE_SCALE : 1;
  const t = (ORBIT_MARK.moon.angle * Math.PI) / 180;
  const orbit = ORBIT_MARK.orbit * k;
  return {
    center: [50, 50],
    core: ORBIT_MARK.core * k,
    orbit,
    stroke: ORBIT_MARK.stroke * k,
    moon: { center: [50 + orbit * Math.cos(t), 50 + orbit * Math.sin(t)], r: ORBIT_MARK.moon.r * k },
  };
}

/** How far the drawn mark reaches from the icon's centre (strokes included). */
export function markReach(mark: MarkGeometry): number {
  const from = ([x, y]: Point) => Math.hypot(x - 50, y - 50);
  return Math.max(mark.core, mark.orbit + mark.stroke / 2, from(mark.moon.center) + mark.moon.r);
}

/** The drawing's bounding box in the 0 0 100 100 box: [left, top, right, bottom]. */
export function markBounds(mark: MarkGeometry): [number, number, number, number] {
  const ring = mark.orbit + mark.stroke / 2;
  const [mx, my] = mark.moon.center;
  return [
    Math.min(50 - ring, mx - mark.moon.r),
    Math.min(50 - ring, my - mark.moon.r),
    Math.max(50 + ring, mx + mark.moon.r),
    Math.max(50 + ring, my + mark.moon.r),
  ];
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
export const ICON_VERSION = 2; // 1: the network mark; 2: the orbit mark (2026-11-25)

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
