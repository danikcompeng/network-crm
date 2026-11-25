import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { DEMO_PEOPLE } from "./demo-seed";
import {
  ALONG_3D,
  FOV,
  LABEL_BAND,
  MAX_LABELS,
  MAX_PITCH,
  MAX_TILT,
  MAX_ZOOM,
  MIN_PITCH,
  MIN_ZOOM,
  NEAREST,
  PLANET_RADIUS,
  START_PITCH,
  cameraPosition,
  driftBy,
  easeOrbit,
  SPARSE_STEP,
  fitDistance,
  labelBelongs,
  labelCandidates,
  onRing,
  onScreen,
  orbitLayout,
  orbitLines,
  pickPerson,
  project,
  ringRadius3d,
  ringTilt,
  shortestTurn,
  spherePx,
  spreadAngles,
  starField,
  startOrbit,
  startYaw,
  turnBy,
  zoomBy,
  zoomLimits,
  type OnScreen,
  type Orbit,
} from "./map-3d";
import { YOU, buildGraph, dotRadius, type MapPerson } from "./map-graph";
import { ringRadii, sectorAngles } from "./map-layout";

const person = (id: string, introduced_by: string | null, extra: Partial<MapPerson> = {}): MapPerson => ({
  id,
  name: id.toUpperCase(),
  company: null,
  stage: "talking",
  introduced_by,
  day: "2026-11-01",
  interactions: 0,
  ...extra,
});

const demo = DEMO_PEOPLE.map((p) =>
  person(p.key, p.introducedBy ?? null, { day: addDays("2026-11-24", -p.addedDaysAgo), interactions: p.interactions.length }),
);

const TAU = 2 * Math.PI;
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
const gapBetween = (a: number, b: number) => Math.min(wrap(a - b), wrap(b - a));
const len = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
/** The iPhone frame: 350 wide, about 506 tall. */
const W = 350;
const H = 506;

describe("rings", () => {
  it("each ring is tilted slightly, the same way, more further out, at most 12 degrees, no two in one plane", () => {
    const tilts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(ringTilt);
    for (let i = 0; i < tilts.length; i++) {
      expect(tilts[i].tilt).toBeGreaterThan(0);
      expect(tilts[i].tilt).toBeLessThanOrEqual(MAX_TILT + 1e-12);
      if (i > 0) expect(tilts[i].tilt).toBeGreaterThanOrEqual(tilts[i - 1].tilt);
    }
    expect(MAX_TILT).toBeLessThan(MIN_PITCH); // never seen edge-on
    const planes = new Set(tilts.map((t) => `${t.tilt.toFixed(4)}:${t.turn.toFixed(4)}`));
    expect(planes.size).toBe(tilts.length);
  });

  it("a point on a ring is that far from the centre; it rises and dips by sin(tilt) of the radius at most", () => {
    const flat = onRing(2, 1.1, { tilt: 0, turn: 0.7 });
    expect(flat.y).toBeCloseTo(0, 12);
    expect(len(flat)).toBeCloseTo(2, 12);
    for (const depth of [1, 2, 3, 6]) {
      const t = ringTilt(depth);
      const pts = Array.from({ length: 360 }, (_, i) => onRing(3, (i * TAU) / 360, t));
      for (const p of pts) expect(len(p)).toBeCloseTo(3, 12);
      expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(3 * Math.sin(t.tilt), 3);
      expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(-3 * Math.sin(t.tilt), 3);
    }
  });

  it("seen from above, a point stays within a degree of its angle (only the tilt axis turns, so chains don't twist)", () => {
    for (const depth of [1, 3, 5, 9]) {
      for (let i = 0; i < 72; i++) {
        const a = (i * TAU) / 72;
        const p = onRing(2, a, ringTilt(depth));
        expect(gapBetween(Math.atan2(p.z, p.x), a)).toBeLessThan((1 * Math.PI) / 180);
      }
    }
  });

  it("ring radii are the 2D ones pulled in towards You, still growing outward, more slowly further out", () => {
    expect(ringRadius3d(96)).toBeCloseTo(1.4, 12);
    expect(ringRadius3d(384)).toBeCloseTo(0.55 + 0.85 * 4 ** 0.75, 12);
    const steps = [1, 2, 3, 4, 5, 10].map((d) => ringRadius3d(96 * d));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    expect(ringRadius3d(96 * 10) / ringRadius3d(96)).toBeLessThan(5); // a chain ten deep is under five times ring 1
  });
});

describe("spreading people round a ring", () => {
  it("keeps angles that are far enough apart where they are", () => {
    expect(spreadAngles([0.1, 1, 2], 0.5)).toEqual([0.1, 1, 2]);
  });

  it("pushes close ones apart, in order, to the gap (or an even share of the ring when crowded)", () => {
    const out = spreadAngles([1, 1.01, 1.02, 3], 0.3);
    const sorted = [...out].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TAU;
      expect(next - sorted[i]).toBeGreaterThanOrEqual(0.3 - 1e-6);
    }
    expect(out[0]).toBeLessThan(out[1]);
    expect(out[1]).toBeLessThan(out[2]);
    expect(out[1]).toBeCloseTo(1.01, 6); // the middle one stays put
    expect(out[3]).toBeCloseTo(3, 6); // far away: untouched

    const crowded = spreadAngles(Array.from({ length: 10 }, () => 0.5), 1);
    const c = [...crowded].sort((a, b) => a - b);
    for (let i = 0; i < c.length; i++) {
      const next = i + 1 < c.length ? c[i + 1] : c[0] + TAU;
      expect(next - c[i]).toBeGreaterThanOrEqual(TAU / 10 - 1e-3);
    }
  });

  it("a nearly full, clustered ring (the gap 90% of an even share) still gets its gaps", () => {
    const n = 60;
    const gap = (0.9 * TAU) / n;
    const out = spreadAngles(Array.from({ length: n }, (_, i) => 1 + (i * 0.05) / n), gap);
    const sorted = [...out].sort((a, b) => a - b);
    for (let i = 0; i < n; i++) {
      const next = i + 1 < n ? sorted[i + 1] : sorted[0] + TAU;
      expect(next - sorted[i]).toBeGreaterThanOrEqual(gap - 1e-3);
    }
  });

  it("a crowded, clustered ring: 150 people within 0.1 radians end up an even share apart", () => {
    const n = 150;
    const out = spreadAngles(Array.from({ length: n }, (_, i) => 2 + (i * 0.1) / n), 1);
    const sorted = [...out].sort((a, b) => a - b);
    for (let i = 0; i < n; i++) {
      const next = i + 1 < n ? sorted[i + 1] : sorted[0] + TAU;
      expect(next - sorted[i]).toBeGreaterThanOrEqual(TAU / n - 1e-3);
    }
  });

  it("handles the wrap past a full turn, and one or none", () => {
    const out = spreadAngles([TAU - 0.01, 0.01], 0.2);
    expect(gapBetween(out[0], out[1])).toBeGreaterThanOrEqual(0.2 - 1e-6);
    expect(spreadAngles([7], 1)).toEqual([7 - TAU]);
    expect(spreadAngles([], 1)).toEqual([]);
  });
});

describe("the solar system", () => {
  const graph = buildGraph(demo);
  const layout = orbitLayout(graph);

  it("puts everyone exactly once on their depth's ring, near their 2D sector angle", () => {
    expect(layout.people.size).toBe(graph.nodes.length);
    expect(graph.nodes.length).toBe(20);
    const sectors = sectorAngles(graph);
    for (const n of graph.nodes) {
      const p = layout.people.get(n.id)!;
      expect(p.depth).toBe(n.depth);
      expect(len(p.position)).toBeCloseTo(layout.rings.get(n.depth)!.radius, 9);
      expect(p.position).toEqual(onRing(layout.rings.get(n.depth)!.radius, p.angle, ringTilt(n.depth)));
      // Spreading moves people a little, never far from their sector.
      expect(gapBetween(p.angle, sectors.get(n.id)!.angle)).toBeLessThan(Math.PI / 4);
    }
    // ... and keeps each ring's order round the circle.
    for (const depth of layout.rings.keys()) {
      const ids = graph.nodes.filter((n) => n.depth === depth).map((n) => n.id);
      const turnOrder = (angle: (id: string) => number) => {
        const sorted = [...ids].sort((a, b) => angle(a) - angle(b));
        const start = sorted.indexOf(ids[0]);
        return [...sorted.slice(start), ...sorted.slice(0, start)];
      };
      expect(turnOrder((id) => layout.people.get(id)!.angle)).toEqual(turnOrder((id) => wrap(sectors.get(id)!.angle)));
    }
  });

  it("rings step out from You: full steps for busy rings, short ones for a ring of one or two", () => {
    const radii = ringRadii(graph);
    expect(layout.rings.get(1)!.radius).toBeCloseTo(ringRadius3d(radii.get(1)!), 12);
    const depths = [...layout.rings.keys()].sort((a, b) => a - b);
    for (const d of depths.slice(1)) {
      const step = layout.rings.get(d)!.radius - layout.rings.get(d - 1)!.radius;
      const full = ringRadius3d(radii.get(d)!) - ringRadius3d(radii.get(d - 1)!);
      const count = graph.nodes.filter((n) => n.depth === d).length;
      expect(step).toBeCloseTo(count <= 2 ? Math.min(full, SPARSE_STEP) : full, 12);
    }
    // A chain ten deep: its tail doesn't push the edge far out.
    const chain = orbitLayout(buildGraph([person("root", null), ...Array.from({ length: 9 }, (_, i) => person(`c${i}`, i === 0 ? "root" : `c${i - 1}`))]));
    expect(chain.reach).toBeLessThan(ringRadius3d(96) + 9 * SPARSE_STEP + 1e-9);
  });

  it("people on one ring keep their distance (the demo's five leaves on ring 1 had 18-degree sectors)", () => {
    const people = [...layout.people.values()];
    for (const a of people) {
      for (const b of people) {
        if (a.id >= b.id || a.depth !== b.depth) continue;
        const d = len({ x: a.position.x - b.position.x, y: a.position.y - b.position.y, z: a.position.z - b.position.z });
        expect(d, `${a.id} and ${b.id}`).toBeGreaterThanOrEqual(ALONG_3D * 0.97); // a chord, a little under the arc
      }
    }
  });

  it("at the starting view on a phone, nobody is covered, and on one ring nobody's centre is under a neighbour", () => {
    const o = startOrbit(fitDistance(layout.reach, W, H));
    const { people } = onScreen(layout, new Set(layout.people.keys()), o, W, H);
    expect(people.filter((p) => p.covered).map((p) => p.id)).toEqual([]);
    for (const a of people) {
      for (const b of people) {
        if (a.id >= b.id || layout.people.get(a.id)!.depth !== layout.people.get(b.id)!.depth) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id} and ${b.id}`).toBeGreaterThan(Math.max(a.r, b.r) * 1.5);
      }
    }
  });

  it("is the same for the same data, whatever the input order", () => {
    const again = orbitLayout(buildGraph([...demo].reverse()));
    for (const [id, p] of layout.people) expect(again.people.get(id)).toEqual(p);
  });

  it("the lines join each person to their introducer, or to You at the centre", () => {
    const lines = orbitLines(graph, layout);
    expect(lines).toHaveLength(graph.nodes.length);
    for (const line of lines) {
      const n = graph.nodes.find((m) => m.id === line.to)!;
      expect(line.from).toBe(n.parent);
      expect(line.b).toEqual(layout.people.get(n.id)!.position);
      expect(line.a).toEqual(n.parent === YOU ? { x: 0, y: 0, z: 0 } : layout.people.get(n.parent)!.position);
    }
  });

  it("reach is the outer ring", () => {
    expect(layout.reach).toBe(Math.max(...[...layout.rings.values()].map((r) => r.radius)));
  });

  it("a thousand people lay out quickly, every one finite", () => {
    const many = Array.from({ length: 1000 }, (_, i) => person(`p${String(i).padStart(4, "0")}`, i < 100 ? null : `p${String(i % 100).padStart(4, "0")}`));
    const t = performance.now();
    const big = orbitLayout(buildGraph(many));
    const o = startOrbit(fitDistance(big.reach, W, H));
    onScreen(big, new Set(big.people.keys()), o, W, H);
    expect(performance.now() - t).toBeLessThan(1000);
    expect(big.people.size).toBe(1000);
    for (const p of big.people.values()) expect([p.position.x, p.position.y, p.position.z].every(Number.isFinite)).toBe(true);
  });
});

describe("sphere sizes", () => {
  it("grow with interactions (the 2D rule), about 7 to 19 px, nearer a little bigger", () => {
    expect(spherePx(0, 10, 10)).toBeCloseTo(0.55 * dotRadius(0) + 4, 12);
    expect(spherePx(4, 10, 10)).toBeGreaterThan(spherePx(0, 10, 10));
    expect(spherePx(30, 10, 10)).toBe(spherePx(200, 10, 10));
    expect(spherePx(0, 1000, 10)).toBeGreaterThanOrEqual(7);
    expect(spherePx(30, 0.01, 10)).toBeLessThanOrEqual(19.4);
    expect(spherePx(0, 8, 10)).toBeGreaterThan(spherePx(0, 12, 10));
  });
});

describe("the camera", () => {
  it("sits `distance` from the centre, above it by the pitch", () => {
    const o: Orbit = { yaw: 0.7, pitch: 0.4, distance: 5 };
    const c = cameraPosition(o);
    expect(len(c)).toBeCloseTo(5, 12);
    expect(c.y).toBeCloseTo(5 * Math.sin(0.4), 12);
    expect(cameraPosition({ yaw: 0, pitch: 0, distance: 3 })).toEqual({ x: 0, y: 0, z: 3 });
  });

  it("starts 50 degrees up", () => {
    expect(startOrbit(9)).toEqual({ yaw: 0, pitch: START_PITCH, distance: 9 });
    expect(START_PITCH).toBeCloseTo((50 * Math.PI) / 180, 12);
  });

  it("a drag turns it; pitch stays between 20 and 75 degrees", () => {
    const o = startOrbit(5);
    const right = turnBy(o, 90, 0);
    expect(shortestTurn(o.yaw, right.yaw)).toBeCloseTo(-0.5, 12);
    expect(right.pitch).toBe(o.pitch);
    expect(turnBy(o, 0, 10_000).pitch).toBe(MAX_PITCH);
    expect(turnBy(o, 0, -10_000).pitch).toBe(MIN_PITCH);
  });

  it("zoom stays within its limits, and never inside the system", () => {
    const o = startOrbit(10);
    expect(zoomBy(o, 2, 10, 3).distance).toBeCloseTo(5, 12);
    expect(zoomBy(o, 1000, 10, 2).distance).toBe(10 * MIN_ZOOM);
    expect(zoomBy(o, 0.001, 10, 2).distance).toBe(10 * MAX_ZOOM);
    // A wide frame fits from close by: 0.35 of it would be inside the outer ring.
    expect(zoomBy(startOrbit(4), 1000, 4, 3.9).distance).toBeCloseTo(3.9 * NEAREST, 12);
    expect(zoomLimits(4, 3.9).near).toBeGreaterThan(3.9);
  });

  it("drifts one turn in three minutes", () => {
    expect(shortestTurn(0, driftBy(startOrbit(5), 45_000).yaw)).toBeCloseTo(TAU / 4, 9);
    expect(driftBy(startOrbit(5), 0)).toEqual(startOrbit(5));
  });

  it("eases the short way round, ending exactly at the target", () => {
    expect(shortestTurn(0.1, TAU - 0.1)).toBeCloseTo(-0.2, 12);
    expect(shortestTurn(TAU - 0.1, 0.1)).toBeCloseTo(0.2, 12);
    const from: Orbit = { yaw: 6.1, pitch: 0.4, distance: 9 };
    const to = startOrbit(5);
    expect(easeOrbit(from, to, 0)).toEqual(from);
    const end = easeOrbit(from, to, 1);
    expect(gapBetween(end.yaw, 0)).toBeCloseTo(0, 9);
    expect(end.pitch).toBeCloseTo(to.pitch, 12);
    expect(end.distance).toBeCloseTo(5, 12);
    const half = easeOrbit(from, to, 0.5);
    expect(half.yaw).toBeGreaterThan(6.1); // forwards through a full turn, not back the long way
  });
});

describe("projection", () => {
  it("the centre is the middle of the view; up is up and right is right from the front", () => {
    const o: Orbit = { yaw: 0, pitch: 0, distance: 10 };
    const c = project({ x: 0, y: 0, z: 0 }, o, W, H)!;
    expect(c.x).toBeCloseTo(W / 2, 9);
    expect(c.y).toBeCloseTo(H / 2, 9);
    expect(c.depth).toBeCloseTo(10, 9);
    expect(project({ x: 1, y: 0, z: 0 }, o, W, H)!.x).toBeGreaterThan(W / 2);
    expect(project({ x: 0, y: 1, z: 0 }, o, W, H)!.y).toBeLessThan(H / 2);
    // From the starting view, the 2D map's "top" (angle -90 degrees) is the far side: higher on screen.
    const s = startOrbit(10);
    expect(project({ x: 0, y: 0, z: -2 }, s, W, H)!.y).toBeLessThan(project({ x: 0, y: 0, z: 2 }, s, W, H)!.y);
  });

  it("matches the pinhole maths of a vertical field of view (as three.js's camera)", () => {
    const o: Orbit = { yaw: 0, pitch: 0, distance: 10 };
    const p = project({ x: 0, y: 1, z: 0 }, o, W, H)!;
    const pxPerUnit = H / 2 / (10 * Math.tan(((FOV / 2) * Math.PI) / 180));
    expect(H / 2 - p.y).toBeCloseTo(pxPerUnit, 9);
    expect(p.scale).toBeCloseTo(pxPerUnit, 9);
    expect(project({ x: 0, y: 0, z: 5 }, o, W, H)!.scale).toBeCloseTo(pxPerUnit * 2, 9);
  });

  it("agrees with three.js's own camera (PerspectiveCamera, lookAt), to a hundredth of a px", () => {
    for (const o of [startOrbit(9, 1.3), { yaw: 4, pitch: 1.2, distance: 6 }, { yaw: 0.2, pitch: 0.4, distance: 14 }] as Orbit[]) {
      const camera = new PerspectiveCamera(FOV, W / H, 0.05, 400);
      const eye = cameraPosition(o);
      camera.position.set(eye.x, eye.y, eye.z);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      for (const p of [
        { x: 0, y: 0, z: 0 },
        { x: 1.4, y: 0.1, z: -0.3 },
        { x: -2.5, y: -0.4, z: 2.2 },
        { x: 0.3, y: 0.8, z: 3.1 },
      ]) {
        const ndc = new Vector3(p.x, p.y, p.z).project(camera);
        const mine = project(p, o, W, H)!;
        expect(mine.x).toBeCloseTo(((ndc.x + 1) / 2) * W, 2);
        expect(mine.y).toBeCloseTo(((1 - ndc.y) / 2) * H, 2);
      }
    }
  });

  it("anything behind the camera isn't on screen", () => {
    expect(project({ x: 0, y: 0, z: 20 }, { yaw: 0, pitch: 0, distance: 10 }, W, H)).toBeNull();
  });

  it("the fitting distance keeps every sphere in the frame, from any angle, on a phone and a laptop", () => {
    const layout = orbitLayout(buildGraph(demo));
    for (const [w, h] of [
      [W, H],
      [640, 520],
    ]) {
      const fit = fitDistance(layout.reach, w, h);
      for (const yaw of [0, 1, 2, 3, 4, 5]) {
        for (const pitch of [MIN_PITCH, 0.8, MAX_PITCH]) {
          const { people } = onScreen(layout, new Set(layout.people.keys()), { yaw, pitch, distance: fit }, w, h);
          expect(people).toHaveLength(20);
          for (const s of people) {
            expect(s.x - s.r).toBeGreaterThanOrEqual(0);
            expect(s.x + s.r).toBeLessThanOrEqual(w);
            expect(s.y - s.r).toBeGreaterThanOrEqual(0);
            expect(s.y + s.r).toBeLessThanOrEqual(h);
          }
        }
      }
    }
  });

  it("the planet covers who's behind it, not who's in front; a nearer sphere covers a farther one", () => {
    const layout = orbitLayout(buildGraph([person("front", null), person("back", null), person("beside", null), person("shadowed", null)]));
    layout.people.get("front")!.position = { x: 0, y: 0, z: 1 };
    layout.people.get("back")!.position = { x: 0, y: 0, z: -1 };
    layout.people.get("beside")!.position = { x: 2, y: 0, z: 2 };
    layout.people.get("shadowed")!.position = { x: 3.05, y: 0, z: -2 }; // behind "beside", slightly off its centre
    const o: Orbit = { yaw: 0, pitch: 0, distance: 10 };
    const { people, planet } = onScreen(layout, new Set(layout.people.keys()), o, W, H);
    const get = (id: string) => people.find((p) => p.id === id)!;
    expect(planet.r).toBeCloseTo(PLANET_RADIUS * planet.scale, 12);
    expect(get("front").covered).toBe(false);
    expect(get("back").covered).toBe(true);
    expect(get("beside").covered).toBe(false);
    expect(Math.hypot(get("beside").x - get("shadowed").x, get("beside").y - get("shadowed").y)).toBeLessThan(get("beside").r);
    expect(get("shadowed").covered).toBe(true);
  });

  it("fitting round a box (fitDistance's avoid): from any side, no sphere touches it or leaves the frame", () => {
    const layout = orbitLayout(buildGraph(demo));
    const buttons = { x: W - 56, y: 0, width: 56, height: 172 };
    const fit = fitDistance(layout.reach, W, W, START_PITCH, buttons);
    expect(fit).toBeGreaterThanOrEqual(fitDistance(layout.reach, W, W, START_PITCH));
    for (let i = 0; i < 24; i++) {
      const { people } = onScreen(layout, new Set(layout.people.keys()), { yaw: (i * TAU) / 24, pitch: START_PITCH, distance: fit }, W, W);
      for (const s of people) {
        expect(s.x - s.r).toBeGreaterThanOrEqual(0);
        expect(s.x + s.r).toBeLessThanOrEqual(W);
        expect(s.y - s.r).toBeGreaterThanOrEqual(0);
        expect(s.y + s.r).toBeLessThanOrEqual(W);
        const inButtons = s.x + s.r > buttons.x && s.y - s.r < buttons.y + buttons.height;
        expect(inButtons, `${s.id} under the buttons at yaw ${i * 15}`).toBe(false);
      }
    }
  });

  it("the fitted system fills the frame's width (the outline is fitted, not a ball round it)", () => {
    const layout = orbitLayout(buildGraph(demo));
    const o = startOrbit(fitDistance(layout.reach, W, W));
    const ring = layout.rings.get(Math.max(...layout.rings.keys()))!;
    const xs = Array.from({ length: 360 }, (_, i) => project(onRing(ring.radius, (i * TAU) / 360, ring.tilt), o, W, W)!.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan((W - 44) * 0.9);
  });

  it("the starting view turns the deepest chain side-on: its outermost person on the right, level with the centre", () => {
    const chain = [person("root", null), ...Array.from({ length: 9 }, (_, i) => person(`c${i}`, i === 0 ? "root" : `c${i - 1}`)), person("other", null)];
    const layout = orbitLayout(buildGraph(chain));
    const o = startOrbit(fitDistance(layout.reach, W, W), startYaw(layout));
    const { people, planet } = onScreen(layout, new Set(layout.people.keys()), o, W, W);
    const end = people.find((p) => p.id === "c8")!;
    expect(end.x).toBeGreaterThan(planet.x + 40);
    // Side-on: the chain spreads across the screen, nobody in it covered.
    expect(people.filter((p) => p.covered).map((p) => p.id)).toEqual([]);
    expect(startYaw(orbitLayout(buildGraph([])))).toBe(0);
  });

  it("only the visible are on screen", () => {
    const layout = orbitLayout(buildGraph(demo));
    const one = [...layout.people.keys()][0];
    expect(onScreen(layout, new Set([one]), startOrbit(fitDistance(layout.reach, W, H)), W, H).people.map((p) => p.id)).toEqual([one]);
  });
});

describe("tapping and labels", () => {
  const at = (id: string, x: number, y: number, extra: Partial<OnScreen> = {}): OnScreen => ({ id, x, y, r: 10, depth: 5, scale: 50, covered: false, ...extra });

  it("a tap takes the sphere it's inside, the frontmost of overlapping ones", () => {
    // The front one is bigger and the tap is nearer the back one's centre: the front one still wins.
    const people = [at("back", 110, 100, { depth: 8 }), at("front", 100, 100, { depth: 4, r: 14 })];
    expect(pickPerson(people, 110, 100, 22)).toBe("front");
  });

  it("else the nearest edge within reach, never beyond, never a covered one", () => {
    const people = [at("a", 0, 0), at("b", 100, 0), at("covered", 50, 0, { covered: true })];
    expect(pickPerson(people, 30, 0, 22)).toBe("a"); // 20 from a's edge, 60 from b's
    expect(pickPerson(people, 50, 0, 22)).toBeNull(); // the covered one is right there, the others 40 away
    expect(pickPerson(people, 0, 32, 22)).toBe("a"); // 22 from a's edge: just in reach
    expect(pickPerson(people, 0, 32.5, 22)).toBeNull();
    expect(pickPerson([], 0, 0, 22)).toBeNull();
  });

  it("labels: the one in focus first, then those nearer than the centre, nearest first; at most 8; never covered", () => {
    const people = [
      ...Array.from({ length: 12 }, (_, i) => at(`n${String(i).padStart(2, "0")}`, i * 30, 0, { depth: 2 + i * 0.1 })),
      at("covered", 0, 0, { depth: 3, covered: true }),
      at("farside", 0, 0, { depth: 9 }),
    ];
    const picked = labelCandidates(people, "farside", 5);
    expect(picked[0].id).toBe("farside");
    expect(picked).toHaveLength(MAX_LABELS);
    expect(picked.slice(1).map((p) => p.id)).toEqual(["n00", "n01", "n02", "n03", "n04", "n05", "n06"]);
    expect(labelCandidates(people, "covered", 5).some((p) => p.id === "covered")).toBe(false);
    expect(labelCandidates(people, null, 1)).toEqual([]);
  });

  it("labels: the important (interviewing, offer) come right after the one in focus, wherever they are", () => {
    const people = [at("near", 0, 0, { depth: 2 }), at("key-far", 50, 0, { depth: 9 }), at("key-near", 90, 0, { depth: 3 }), at("focus", 130, 0, { depth: 8 })];
    const picked = labelCandidates(people, "focus", 5, new Set(), new Set(["key-far", "key-near"]));
    expect(picked.map((p) => p.id)).toEqual(["focus", "key-near", "key-far", "near"]);
  });

  it("a label must plainly belong to its own sphere: touching it, and nearer to it than to any other", () => {
    const own = at("own", 100, 100, { r: 10 });
    const box = { x: 113, y: 93, width: 40, height: 14 }; // just right of own
    expect(labelBelongs(own, box, [own])).toBe(true);
    expect(labelBelongs(own, { ...box, x: 120 }, [own])).toBe(false); // 10 px off its edge
    const neighbour = at("n", 165, 100, { r: 10 }); // the box's right end touches it
    expect(labelBelongs(own, box, [own, neighbour])).toBe(false);
    expect(labelBelongs(own, box, [own, at("far", 300, 300)])).toBe(true);
    // Not strict (the focused and important): touching its own sphere is enough.
    expect(labelBelongs(own, box, [own, neighbour], false)).toBe(true);
    expect(labelBelongs(own, { ...box, x: 120 }, [own], false)).toBe(false);
  });

  it("labels don't flicker at the centre: they come a little in front of it and go a little behind it", () => {
    const edge = (d: number) => [at("p", 0, 0, { depth: d })];
    expect(labelCandidates(edge(5), null, 5)).toEqual([]); // right at the centre: not yet
    expect(labelCandidates(edge(5 - LABEL_BAND - 0.01), null, 5)).toHaveLength(1);
    const shown = new Set(["p"]);
    expect(labelCandidates(edge(5), null, 5, shown)).toHaveLength(1); // still shown
    expect(labelCandidates(edge(5 + LABEL_BAND - 0.01), null, 5, shown)).toHaveLength(1);
    expect(labelCandidates(edge(5 + LABEL_BAND + 0.01), null, 5, shown)).toEqual([]);
  });
});

describe("stars", () => {
  it("the same sky every time, on the shell", () => {
    const one = starField(50, 30, 40);
    expect(starField(50, 30, 40)).toEqual(one);
    for (const s of one) {
      expect(len(s)).toBeGreaterThanOrEqual(30 - 1e-9);
      expect(len(s)).toBeLessThanOrEqual(40 + 1e-9);
    }
    expect(new Set(one.map((s) => s.x.toFixed(6))).size).toBe(50);
  });
});
