// The map in 3D, as pure maths (plans/crm.md, Feature 7): a little solar
// system. You are the planet at the origin; the people you met yourself
// orbit on ring 1, the people they introduced on ring 2, and so on. Each
// ring is tilted slightly, its own way. y is up; a ring before tilting
// lies flat in the x-z plane. Also the camera that circles it (yaw,
// pitch, distance), the projection to the screen (the same maths as
// three.js's PerspectiveCamera looking at the origin), tapping, labels.
//
// Spheres are sized in screen px (like the 2D dots), not world units, so
// the smallest stays big enough to carry its stage glyph.

import { YOU, dotRadius, type Box, type MapGraph } from "./map-graph";
import { RING, ringRadii, sectorAngles } from "./map-layout";

export type Vec3 = { x: number; y: number; z: number };

const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const wrap = (a: number) => (a >= 0 && a < TAU ? a : ((a % TAU) + TAU) % TAU);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The planet (You), in world units. */
export const PLANET_RADIUS = 0.42;
/** The step out to a ring with only one or two people on it, in world units. */
export const SPARSE_STEP = 0.45;
/** Room each person keeps along their ring, in world units. */
export const ALONG_3D = 0.9;
/** The most any ring is tilted. */
export const MAX_TILT = 12 * DEG;

/**
 * A ring's radius in world units, from the 2D ring radius: pulled in
 * towards You so ring 1 has room, and growing more slowly further out
 * (the power 0.75), so one long chain doesn't shrink everyone else to fit.
 */
export function ringRadius3d(radius2d: number): number {
  return 0.55 + 0.85 * (radius2d / RING) ** 0.75;
}

export type RingTilt = { tilt: number; turn: number };

/**
 * How ring `depth` sits: tilted slightly (4 degrees for ring 1, 2 more
 * each ring out, at most 12), all leaning the same way, about an axis
 * turned 40 degrees from the one inside it, so no two rings share a plane.
 */
export function ringTilt(depth: number): RingTilt {
  return { tilt: Math.min(4 + 2 * (depth - 1), 12) * DEG, turn: wrap(depth * 40 * DEG) };
}

/**
 * The point at `angle` round a ring of `radius`, tilted as `ring` says:
 * the flat point, rotated by `tilt` about a horizontal axis at `turn`
 * round the vertical. Only the axis turns, so the point stays close to
 * `angle` seen from above.
 */
export function onRing(radius: number, angle: number, ring: RingTilt): Vec3 {
  const p = { x: radius * Math.cos(angle), y: 0, z: radius * Math.sin(angle) };
  const k = { x: Math.cos(ring.turn), y: 0, z: Math.sin(ring.turn) };
  // Rodrigues: p cos t + (k × p) sin t + k (k·p)(1 − cos t).
  const c = Math.cos(ring.tilt);
  const s = Math.sin(ring.tilt);
  const kp = k.x * p.x + k.z * p.z;
  const cross = { x: k.y * p.z - k.z * p.y, y: k.z * p.x - k.x * p.z, z: k.x * p.y - k.y * p.x };
  return {
    x: p.x * c + cross.x * s + k.x * kp * (1 - c),
    y: p.y * c + cross.y * s + k.y * kp * (1 - c),
    z: p.z * c + cross.z * s + k.z * kp * (1 - c),
  };
}

/**
 * A sphere's radius on screen, in px: from its interactions (0.55 × the
 * 2D dot + 4: 8.4 to 16.1), times a gentle perspective (`centreDepth /
 * depth`, held to 0.85 … 1.2), so nearer is a little bigger.
 */
export function spherePx(interactions: number, depth: number, centreDepth: number): number {
  return sphereBasePx(interactions) * clamp(centreDepth / Math.max(depth, 1e-6), PERSPECTIVE.far, PERSPECTIVE.near);
}

/** A sphere's radius in px at the centre's depth. */
export function sphereBasePx(interactions: number): number {
  return 0.55 * dotRadius(interactions) + 4;
}

/**
 * How dark a sphere's rim gets (a multiple of its colour, in linear light),
 * and how far a sphere at the back fades toward the background, at most
 * (a mix in linear light). lib/palette.test.ts checks that a faded rim and
 * a glyph on a faded sphere still meet 3:1.
 */
export const LIMB = 0.82;
export const DEPTH_FADE = 0.12;

/** How much nearer spheres grow and farther ones shrink, at most (the shader uses the same). */
export const PERSPECTIVE = { far: 0.85, near: 1.2 } as const;

/** The planet's ring (like the app icon's orbit), as a multiple of its radius: close, so it isn't read as an empty ring of people. */
export const PLANET_RING = 1.4;

/**
 * Spreads angles round a circle so neighbours are at least `gap` apart,
 * keeping their order and moving each as little as it can: rounds of
 * pushing each too-close pair apart, half each way. When the gap asked
 * for is (nearly) an even share of the circle, the answer is even spacing
 * in the same order, turned to sit where they were on average; that's
 * worked out directly (pushing only creeps towards it). Deterministic.
 */
export function spreadAngles(angles: readonly number[], gap: number): number[] {
  const n = angles.length;
  if (n < 2) return angles.map(wrap);
  const even = TAU / n;
  const order = angles.map((a, i) => ({ a: wrap(a), i })).sort((p, q) => p.a - q.a || p.i - q.i);
  const out = new Array<number>(n);
  if (gap >= even * 0.97) {
    // Even spacing; the turn is the circular mean of how far each would move.
    let sx = 0;
    let sy = 0;
    order.forEach((o, k) => {
      sx += Math.cos(o.a - k * even);
      sy += Math.sin(o.a - k * even);
    });
    const start = Math.atan2(sy, sx);
    order.forEach((o, k) => (out[o.i] = wrap(start + k * even)));
    return out;
  }
  const g = gap;
  const a = order.map((o) => o.a);
  for (let round = 0; round < 2000; round++) {
    let moved = false;
    for (let k = 0; k < n; k++) {
      const next = k + 1 < n ? a[k + 1] : a[0] + TAU;
      const short = g - (next - a[k]);
      if (short > 1e-9) {
        moved = true;
        a[k] -= short / 2;
        if (k + 1 < n) a[k + 1] += short / 2;
        else a[0] += short / 2;
      }
    }
    if (!moved) break;
  }
  order.forEach((o, k) => (out[o.i] = wrap(a[k])));
  return out;
}

export type OrbitPerson = { id: string; depth: number; angle: number; position: Vec3; interactions: number };
export type OrbitLayout = {
  people: Map<string, OrbitPerson>;
  /** Each depth's ring: its radius (world units) and tilt. */
  rings: Map<number, { radius: number; tilt: RingTilt }>;
  /** The outer ring's radius (at least the planet's ring). */
  reach: number;
};

/**
 * Where everyone sits: on their depth's ring, at their 2D sector angle,
 * spread so no two on one ring are closer than ALONG_3D (or an even share
 * of the ring, if it's crowded).
 */
export function orbitLayout(graph: MapGraph): OrbitLayout {
  const radii = ringRadii(graph);
  const sectors = sectorAngles(graph);
  const rings = new Map<number, { radius: number; tilt: RingTilt }>();
  const byDepth = new Map<number, (typeof graph.nodes)[number][]>();
  for (const n of graph.nodes) byDepth.set(n.depth, [...(byDepth.get(n.depth) ?? []), n]);
  // Each ring a step out from the one inside; a ring with only one or two
  // people (the tail of a long chain) takes a short step, so it doesn't
  // push the edge out and shrink everyone else to fit.
  let previous = 0;
  for (const depth of [...radii.keys()].sort((a, b) => a - b)) {
    const full = ringRadius3d(radii.get(depth)!) - (depth > 1 ? ringRadius3d(radii.get(depth - 1)!) : 0);
    const step = depth > 1 && (byDepth.get(depth)?.length ?? 0) <= 2 ? Math.min(full, SPARSE_STEP) : full;
    previous += step;
    rings.set(depth, { radius: previous, tilt: ringTilt(depth) });
  }

  const people = new Map<string, OrbitPerson>();
  let reach = PLANET_RADIUS * PLANET_RING;
  for (const [depth, nodes] of byDepth) {
    const ring = rings.get(depth)!;
    const spread = spreadAngles(
      nodes.map((n) => sectors.get(n.id)!.angle),
      ALONG_3D / ring.radius,
    );
    nodes.forEach((n, i) => {
      people.set(n.id, { id: n.id, depth, angle: spread[i], position: onRing(ring.radius, spread[i], ring.tilt), interactions: n.interactions });
    });
    reach = Math.max(reach, ring.radius);
  }
  return { people, rings, reach };
}

/** The introduction lines: each person to their introducer (or to You, at the origin). */
export function orbitLines(graph: MapGraph, layout: OrbitLayout): { from: string; to: string; a: Vec3; b: Vec3 }[] {
  const origin = { x: 0, y: 0, z: 0 };
  return graph.nodes.map((n) => ({
    from: n.parent,
    to: n.id,
    a: n.parent === YOU ? origin : layout.people.get(n.parent)!.position,
    b: layout.people.get(n.id)!.position,
  }));
}

// The camera.

/** The camera circles the origin: yaw round the vertical, pitch above the rings' plane, distance from the centre. */
export type Orbit = { yaw: number; pitch: number; distance: number };

/** The vertical field of view, in degrees (three.js's convention). */
export const FOV = 40;
/** Above the steepest ring (12 degrees) with a margin, so no ring is ever seen edge-on. */
export const MIN_PITCH = 20 * DEG;
export const MAX_PITCH = 75 * DEG;
export const START_PITCH = 50 * DEG;
/** A drag of this many px turns the system one radian. */
export const PX_PER_RADIAN = 180;
/** Zoom limits, as fractions of the distance that fits everyone. */
export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 1.6;
/** The camera never comes closer than this many times the system's reach. */
export const NEAREST = 1.15;
/** One turn of the idle drift, in ms. */
export const DRIFT_TURN_MS = 180_000;
/** Room kept between the system and the frame's sides, in px (a sphere's radius and a little). */
export const FIT_MARGIN = 22;

export function cameraPosition(o: Orbit): Vec3 {
  return {
    x: o.distance * Math.cos(o.pitch) * Math.sin(o.yaw),
    y: o.distance * Math.sin(o.pitch),
    z: o.distance * Math.cos(o.pitch) * Math.cos(o.yaw),
  };
}

/**
 * The distance at which the whole system fits a `width` × `height` frame
 * seen from `pitch`: every point within `reach` of the centre's axis and
 * as high or low as the steepest ring can go, FIT_MARGIN px inside the
 * frame and FIT_MARGIN px clear of `avoid` (the buttons' box). It's the
 * projected outline that has to fit, not a ball, so a system seen from
 * above fills the frame.
 */
export function fitDistance(reach: number, width: number, height: number, pitch = START_PITCH, avoid: Box | null = null, fov = FOV): number {
  const m = FIT_MARGIN;
  const clear = (x: number, y: number) =>
    !avoid || x < avoid.x - m || x > avoid.x + avoid.width + m || y < avoid.y - m || y > avoid.y + avoid.height + m;
  const rise = reach * Math.sin(MAX_TILT);
  const outline: Vec3[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i * TAU) / 72;
    for (const y of [-rise, rise]) outline.push({ x: reach * Math.cos(a), y, z: reach * Math.sin(a) });
  }
  const fits = (distance: number) =>
    outline.every((p) => {
      const s = project(p, { yaw: 0, pitch, distance }, width, height, fov);
      return s !== null && s.x >= m && s.x <= width - m && s.y >= m && s.y <= height - m && clear(s.x, s.y);
    });
  let lo = reach * 1.01;
  let hi = reach * 200;
  if (fits(lo)) return lo;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * The yaw that shows the deepest chain side-on (its outermost person on
 * the right), so a long chain spreads across the screen instead of
 * running away from the camera. 0 with nobody.
 */
export function startYaw(layout: OrbitLayout): number {
  let deepest: OrbitPerson | null = null;
  for (const p of layout.people.values()) {
    if (!deepest || p.depth > deepest.depth || (p.depth === deepest.depth && p.id < deepest.id)) deepest = p;
  }
  return deepest ? wrap(-Math.atan2(deepest.position.z, deepest.position.x)) : 0;
}

/** The starting view: from above at START_PITCH, turned by `yaw` (startYaw), everyone in view. */
export function startOrbit(fit: number, yaw = 0): Orbit {
  return { yaw: wrap(yaw), pitch: START_PITCH, distance: fit };
}

/** A drag of (dx, dy) px: right turns the system to the right, down looks from higher up. */
export function turnBy(o: Orbit, dx: number, dy: number): Orbit {
  return { ...o, yaw: wrap(o.yaw - dx / PX_PER_RADIAN), pitch: clamp(o.pitch + dy / PX_PER_RADIAN, MIN_PITCH, MAX_PITCH) };
}

/** The closest and farthest the camera goes, for a system of `reach` that fits at `fit`. */
export function zoomLimits(fit: number, reach: number): { near: number; far: number } {
  const near = Math.max(fit * MIN_ZOOM, reach * NEAREST);
  return { near, far: Math.max(fit * MAX_ZOOM, near) };
}

/** Zoom by `factor` (above 1 is closer), within zoomLimits. */
export function zoomBy(o: Orbit, factor: number, fit: number, reach: number): Orbit {
  const { near, far } = zoomLimits(fit, reach);
  return { ...o, distance: clamp(o.distance / factor, near, far) };
}

/** The idle drift over `ms`. */
export function driftBy(o: Orbit, ms: number): Orbit {
  return { ...o, yaw: wrap(o.yaw + (TAU * ms) / DRIFT_TURN_MS) };
}

/** The shortest signed turn from angle a to angle b, in -π … π. */
export function shortestTurn(a: number, b: number): number {
  const d = wrap(b - a);
  return d > Math.PI ? d - TAU : d;
}

/** Quick to start, gentle to land (a cubic ease-out). */
export function easeOut(t: number): number {
  const c = clamp(t, 0, 1);
  return 1 - (1 - c) ** 3;
}

/** Part way (t, 0 … 1, eased) from one view to another, the short way round. */
export function easeOrbit(from: Orbit, to: Orbit, t: number): Orbit {
  const e = easeOut(t);
  return {
    yaw: wrap(from.yaw + shortestTurn(from.yaw, to.yaw) * e),
    pitch: from.pitch + (to.pitch - from.pitch) * e,
    distance: from.distance + (to.distance - from.distance) * e,
  };
}

// The projection.

export type Projected = {
  /** Screen px from the frame's top left. */
  x: number;
  y: number;
  /** Distance in front of the camera, along its view (world units). */
  depth: number;
  /** Screen px per world unit at that depth. */
  scale: number;
};

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const crossV = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/**
 * Where `p` lands on a `width` × `height` view from the camera at `o`,
 * looking at the origin with y up (as three.js's lookAt does). Null when
 * it's behind the camera (or nearly at it).
 */
export function project(p: Vec3, o: Orbit, width: number, height: number, fov = FOV): Projected | null {
  const eye = cameraPosition(o);
  const forward = norm(sub({ x: 0, y: 0, z: 0 }, eye));
  const right = norm(crossV(forward, { x: 0, y: 1, z: 0 }));
  const up = crossV(right, forward);
  const v = sub(p, eye);
  const depth = dot(v, forward);
  if (depth < 0.01) return null;
  const scale = height / (2 * depth * Math.tan((fov * DEG) / 2));
  return { x: width / 2 + dot(v, right) * scale, y: height / 2 - dot(v, up) * scale, depth, scale };
}

export type OnScreen = Projected & { id: string; r: number; covered: boolean };

/**
 * Everyone in `visible`, on screen, with their sphere's radius in px, and
 * `covered` when their centre is behind the planet or behind a nearer
 * sphere (then they can't be tapped or labelled: what you'd tap there is
 * what's in front). Off-camera people are left out. A grid keeps the
 * covering check quick for a thousand people.
 */
export function onScreen(
  layout: OrbitLayout,
  visible: ReadonlySet<string>,
  o: Orbit,
  width: number,
  height: number,
): { people: OnScreen[]; planet: Projected & { r: number } } {
  const centre = project({ x: 0, y: 0, z: 0 }, o, width, height)!;
  const planet = { ...centre, r: PLANET_RADIUS * centre.scale };
  const people: OnScreen[] = [];
  for (const p of layout.people.values()) {
    if (!visible.has(p.id)) continue;
    const s = project(p.position, o, width, height);
    if (!s) continue;
    const covered = s.depth > planet.depth && Math.hypot(s.x - planet.x, s.y - planet.y) < planet.r;
    people.push({ ...s, id: p.id, r: spherePx(p.interactions, s.depth, centre.depth), covered });
  }
  // Covered by a nearer sphere: look only in the grid cells a sphere spans.
  const CELL = 40;
  const grid = new Map<string, OnScreen[]>();
  for (const p of people) {
    for (let gx = Math.floor((p.x - p.r) / CELL); gx <= Math.floor((p.x + p.r) / CELL); gx++) {
      for (let gy = Math.floor((p.y - p.r) / CELL); gy <= Math.floor((p.y + p.r) / CELL); gy++) {
        const key = `${gx},${gy}`;
        grid.set(key, [...(grid.get(key) ?? []), p]);
      }
    }
  }
  for (const p of people) {
    if (p.covered) continue;
    const near = grid.get(`${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`) ?? [];
    p.covered = near.some((q) => q !== p && q.depth < p.depth && Math.hypot(q.x - p.x, q.y - p.y) < q.r);
  }
  return { people, planet };
}

/**
 * The person a tap at (x, y) means: of those not covered, the frontmost
 * whose sphere the tap is inside, else the one whose edge is nearest,
 * within `reach` px. Null when nobody is in reach.
 */
export function pickPerson(people: readonly OnScreen[], x: number, y: number, reach: number): string | null {
  let best: { id: string; d: number; depth: number } | null = null;
  for (const p of people) {
    if (p.covered) continue;
    const d = Math.max(Math.hypot(p.x - x, p.y - y) - p.r, 0);
    if (d > reach) continue;
    if (!best || d < best.d || (d === best.d && p.depth < best.depth)) best = { id: p.id, d, depth: p.depth };
  }
  return best?.id ?? null;
}

/** At most this many name labels at once. */
export const MAX_LABELS = 8;
/** How far (world units) past the centre's depth a label waits before it comes or goes, so it doesn't flicker. */
export const LABEL_BAND = 0.3;

/**
 * Who gets a name label, in priority order: the person in focus first,
 * then the `important` ones (interviewing, offer) wherever they are, then
 * those nearer the camera than the centre of the system, nearest first;
 * never a covered one; at most `max`. A label comes when its
 * person is LABEL_BAND in front of the centre, and one already shown
 * (`shown`) stays until they're LABEL_BAND behind it. (Whether each fits
 * is placeLabels' job.)
 */
export function labelCandidates(
  people: readonly OnScreen[],
  focus: string | null,
  centreDepth: number,
  shown: ReadonlySet<string> = new Set(),
  important: ReadonlySet<string> = new Set(),
  max = MAX_LABELS,
): OnScreen[] {
  const open = people.filter((p) => !p.covered);
  const nearest = (a: OnScreen, b: OnScreen) => a.depth - b.depth || (a.id < b.id ? -1 : 1);
  const focused = open.filter((p) => p.id === focus);
  const key = open.filter((p) => p.id !== focus && important.has(p.id)).sort(nearest);
  const near = open
    .filter((p) => p.id !== focus && !important.has(p.id) && p.depth < centreDepth + (shown.has(p.id) ? LABEL_BAND : -LABEL_BAND))
    .sort(nearest);
  return [...focused, ...key, ...near].slice(0, max);
}

/** Spots tried for a 3D label: beside the sphere first (rings run across the screen, so below is often taken). */
export const LABEL_ORDER_3D = ["right", "left", "below", "above", "below-right", "below-left", "above-right", "above-left"] as const;

/** From a sphere's edge to the nearest point of `box`, in px (0 if they touch). */
function edgeGap(s: OnScreen, box: Box): number {
  const dx = Math.max(box.x - s.x, 0, s.x - (box.x + box.width));
  const dy = Math.max(box.y - s.y, 0, s.y - (box.y + box.height));
  return Math.max(Math.hypot(dx, dy) - s.r, 0);
}

/**
 * Whether a label at `box` plainly belongs to `own`: within 4 px of their
 * sphere, and (`strict`) nearer to it than to any other sphere on screen,
 * so it can't be read as a neighbour's. Not strict: touching is enough
 * (for the person in focus and the important ones, who'd otherwise go
 * unnamed wherever the map is busy; placeLabels still keeps the label
 * off every other sphere).
 */
export function labelBelongs(own: OnScreen, box: Box, others: readonly OnScreen[], strict = true): boolean {
  const mine = edgeGap(own, box);
  return mine <= 4 && (!strict || others.every((q) => q.id === own.id || edgeGap(q, box) > mine));
}

/**
 * A fixed field of `count` stars on a shell between `inner` and `outer`
 * world units out (decorative, dark mode only), from a seeded generator:
 * the same sky every time.
 */
export function starField(count: number, inner: number, outer: number, seed = 7): Vec3[] {
  let s = seed >>> 0;
  const random = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const u = random() * 2 - 1;
    const a = random() * TAU;
    const r = inner + (outer - inner) * random();
    const ring = Math.sqrt(1 - u * u);
    return { x: r * ring * Math.cos(a), y: r * u, z: r * ring * Math.sin(a) };
  });
}
