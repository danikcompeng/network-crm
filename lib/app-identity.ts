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
 * The orbit mark, in a 0 0 100 100 box: a solid dot (you) with a tilted,
 * flattened orbit round it, as a planet's orbit looks seen at an angle: the
 * far half passes behind the dot and the near half in front of it, across
 * its middle (so the dot shows above and below it), each with `gap` of
 * clear field where they meet, and a small dot (a person) on the near
 * half, like a bead: wider than the orbit's stroke.
 *
 * Why this shape (design-critic): a circle with a small dot on it is the
 * Ionic framework's logo; a dot sitting inside an oval reads as an eye.
 * Passing in front of and behind the dot is what says "seen at an angle".
 *
 * The orbit is an ellipse rx by ry, turned by `tilt` degrees (negative:
 * its right end rises). Points on it are given in degrees round it in its
 * own frame: 0 its right end, 90 the near side (below), 270 the far side.
 * The whole drawing is centred by its bounding box.
 */
export const ORBIT_MARK = {
  core: 16, // the centre dot's radius
  orbit: { rx: 37, ry: 8, tilt: -22 }, // to the middle of the stroke
  stroke: 6,
  gap: 2.5,
  moon: { t: 135, r: 6.5 },
} as const;

/**
 * Android's safe zone for a maskable icon: a centred circle with a radius
 * of 40% of the icon. Whatever shape Android cuts, it never cuts inside it.
 */
export const MASKABLE_SAFE_RADIUS = 40;

/**
 * How much smaller the mark is drawn on the maskable icon, about the
 * centre, so it stays inside the safe circle with room for launchers that
 * crop further (tested: at most 90% of the safe radius).
 */
export const MASKABLE_SCALE = 0.85;

/**
 * - "rounded": a rounded square, for browser tabs and Android's "any" icon.
 * - "full": fills the whole square. iPhone rounds the corners itself, and
 *   it shows see-through corners as black.
 * - "maskable": full-bleed, with the mark drawn smaller so it stays inside
 *   the safe circle, because Android cuts it to its own shape.
 */
export type IconShape = "rounded" | "full" | "maskable";

export type MarkGeometry = {
  /** The centre dot's centre, which is also the orbit's. */
  center: Point;
  core: number;
  orbit: { rx: number; ry: number; tilt: number };
  stroke: number;
  gap: number;
  moon: { center: Point; r: number };
  /** The orbit's near half (in front of the dot) and far half (behind it), as SVG paths. */
  nearPath: string;
  farPath: string;
};

const RAD = Math.PI / 180;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The point `degrees` round an orbit centred on `center` (in the orbit's own frame, before the tilt). */
function ovalPoint(center: Point, orbit: MarkGeometry["orbit"], degrees: number): Point {
  const x = orbit.rx * Math.cos(degrees * RAD);
  const y = orbit.ry * Math.sin(degrees * RAD);
  const c = Math.cos(orbit.tilt * RAD);
  const s = Math.sin(orbit.tilt * RAD);
  return [center[0] + x * c - y * s, center[1] + x * s + y * c];
}

/** The point on the orbit's centre line, `degrees` round it. */
export function pointOnOrbit(mark: Pick<MarkGeometry, "center" | "orbit">, degrees: number): Point {
  return ovalPoint(mark.center, mark.orbit, degrees);
}

/** [left, top, right, bottom] of a drawing (strokes included). */
function boundsOf(mark: Omit<MarkGeometry, "nearPath" | "farPath">): [number, number, number, number] {
  // A turned ellipse's half-width and half-height; the stroke adds half its width.
  const { orbit, center, core, moon, stroke } = mark;
  const c = Math.cos(orbit.tilt * RAD);
  const s = Math.sin(orbit.tilt * RAD);
  const hw = Math.hypot(orbit.rx * c, orbit.ry * s) + stroke / 2;
  const hh = Math.hypot(orbit.rx * s, orbit.ry * c) + stroke / 2;
  const [mx, my] = moon.center;
  return [
    Math.min(center[0] - hw, center[0] - core, mx - moon.r),
    Math.min(center[1] - hh, center[1] - core, my - moon.r),
    Math.max(center[0] + hw, center[0] + core, mx + moon.r),
    Math.max(center[1] + hh, center[1] + core, my + moon.r),
  ];
}

/** The mark for an icon shape, in the 0 0 100 100 box, centred by its bounding box. */
export function markGeometry(shape: IconShape): MarkGeometry {
  const k = shape === "maskable" ? MASKABLE_SCALE : 1;
  const orbit = { rx: ORBIT_MARK.orbit.rx * k, ry: ORBIT_MARK.orbit.ry * k, tilt: ORBIT_MARK.orbit.tilt };
  const base = { core: ORBIT_MARK.core * k, orbit, stroke: ORBIT_MARK.stroke * k, gap: ORBIT_MARK.gap * k };
  const at = (center: Point) => ({ ...base, center, moon: { center: ovalPoint(center, orbit, ORBIT_MARK.moon.t), r: ORBIT_MARK.moon.r * k } });
  const [l, t, r, b] = boundsOf(at([50, 50]));
  const mark = at([100 - (l + r) / 2, 100 - (t + b) / 2]);
  // Each half runs clockwise on screen (sweep 1): right end → near side →
  // left end, then left end → far side → right end. In quarters: an arc
  // between two exactly opposite points is ambiguous, and renderers drew it
  // with a kink.
  const p = (degrees: number) => ovalPoint(mark.center, orbit, degrees).map(round2);
  const arc = (degrees: number) => `A ${round2(orbit.rx)} ${round2(orbit.ry)} ${orbit.tilt} 0 1 ${p(degrees).join(" ")}`;
  return {
    ...mark,
    nearPath: `M ${p(0).join(" ")} ${arc(90)} ${arc(180)}`,
    farPath: `M ${p(180).join(" ")} ${arc(270)} ${arc(360)}`,
  };
}

/** The drawing's bounding box in the 0 0 100 100 box: [left, top, right, bottom]. */
export function markBounds(mark: MarkGeometry): [number, number, number, number] {
  return boundsOf(mark);
}

/** How far the drawn mark reaches from the icon's centre (50, 50), strokes included. */
export function markReach(mark: MarkGeometry): number {
  const from = ([x, y]: Point) => Math.hypot(x - 50, y - 50);
  let orbit = 0;
  for (let i = 0; i < 720; i++) orbit = Math.max(orbit, from(pointOnOrbit(mark, i / 2)));
  return Math.max(from(mark.center) + mark.core, orbit + mark.stroke / 2, from(mark.moon.center) + mark.moon.r);
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
export const ICON_VERSION = 3; // 1: the network mark; 2: the orbit mark (a circle); 3: a tilted orbit, in front of and behind the dot (2026-11-25)

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
