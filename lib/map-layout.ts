// Where each dot goes (plans/crm.md, Feature 5): a radial tree (rings by
// depth from You, each person's sector sized by how many hang below them),
// settled by a short, fixed d3-force run. Deterministic on one device: the
// graph is built in id order, the simulation is stopped at creation and
// driven only by tick(), node objects are fresh every time, and the
// collision radius is constant (interaction counts never move anyone).

import { forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation, type SimulationNodeDatum } from "d3-force";
import { YOU, layoutKey, type MapGraph } from "./map-graph";

export type Point = { x: number; y: number };
export type Layout = { positions: Map<string, Point>; start: Map<string, Point> };

/** The distance between rings. */
export const RING = 96;
/** How many ticks the settling run takes (fixed, so every run is the same). */
export const TICKS = 120;

/**
 * Ticks for a network of `n` people: halved above 400 so the account's
 * limit (1,000) still lays out in about half a second on a laptop. Still
 * fixed for a given size, so the picture stays the same.
 */
export function ticksFor(n: number): number {
  return n > 400 ? TICKS / 2 : TICKS;
}
/** Room each dot keeps around it, whatever its size. */
export const COLLIDE = 26;

/** Room each person needs along their ring. */
const ALONG = 52;

/**
 * Each depth's ring radius: at least RING × depth, and big enough for the
 * people on it to sit ALONG apart; never closer to You than the ring inside.
 */
export function ringRadii(graph: MapGraph): Map<number, number> {
  const counts = new Map<number, number>();
  for (const n of graph.nodes) counts.set(n.depth, (counts.get(n.depth) ?? 0) + 1);
  const radii = new Map<number, number>();
  let previous = 0;
  const deepest = Math.max(0, ...counts.keys());
  for (let d = 1; d <= deepest; d++) {
    const needed = ((counts.get(d) ?? 0) * ALONG) / (2 * Math.PI);
    const r = Math.max(RING * d, needed, previous + RING * 0.8);
    radii.set(d, r);
    previous = r;
  }
  return radii;
}

/** The radial tree: each person in the middle of their sector, on their depth's ring. */
export function radialStart(graph: MapGraph): Map<string, Point> {
  const start = new Map<string, Point>([[YOU, { x: 0, y: 0 }]]);
  const depthOf = new Map(graph.nodes.map((n) => [n.id, n.depth]));
  const radii = ringRadii(graph);
  const place = (id: string, from: number, to: number) => {
    const kids = graph.children.get(id) ?? [];
    const total = kids.reduce((s, k) => s + (graph.weight.get(k) ?? 1), 0);
    let at = from;
    for (const k of kids) {
      const span = ((to - from) * (graph.weight.get(k) ?? 1)) / Math.max(total, 1);
      const angle = at + span / 2;
      const r = radii.get(depthOf.get(k) ?? 1) ?? RING;
      start.set(k, { x: r * Math.cos(angle), y: r * Math.sin(angle) });
      place(k, at, at + span);
      at += span;
    }
  };
  // Start at the top and go clockwise.
  place(YOU, -Math.PI / 2, (3 * Math.PI) / 2);
  return start;
}

type Node = SimulationNodeDatum & { id: string; depth: number };

/** The settled positions, from the radial start. */
export function computeLayout(graph: MapGraph): Layout {
  const start = radialStart(graph);
  const radii = ringRadii(graph);
  const nodes: Node[] = [
    { id: YOU, depth: 0, x: 0, y: 0, fx: 0, fy: 0 },
    ...graph.nodes.map((n) => ({ id: n.id, depth: n.depth, x: start.get(n.id)!.x, y: start.get(n.id)!.y })),
  ];
  const links = graph.nodes.map((n) => ({ source: n.parent, target: n.id }));
  const simulation = forceSimulation<Node>(nodes)
    .stop()
    .force(
      "link",
      forceLink<Node, { source: string; target: string }>(links)
        .id((d) => d.id)
        .distance(RING * 0.8)
        .strength(0.6),
    )
    .force("charge", forceManyBody<Node>().strength(-60).distanceMax(RING * 3))
    .force("collide", forceCollide<Node>(COLLIDE))
    .force("ring", forceRadial<Node>((d) => (d.depth === 0 ? 0 : (radii.get(d.depth) ?? d.depth * RING))).strength(0.25));
  simulation.tick(ticksFor(graph.nodes.length));
  const positions = new Map(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
  return { positions, start };
}

const cache = new Map<string, Layout>();
const seen = new Set<string>();

/**
 * The layout for this shape of network, computed once per page load
 * (`<Activity>` and refreshes keep it). `first` is true until the screen
 * calls `markShown(key)` after showing it, so the ease plays once (and a
 * render React throws away doesn't use it up).
 */
export function layoutFor(graph: MapGraph): Layout & { key: string; first: boolean } {
  const key = layoutKey(graph);
  let layout = cache.get(key);
  if (!layout) {
    layout = computeLayout(graph);
    cache.set(key, layout);
    if (cache.size > 20) cache.delete(cache.keys().next().value!);
  }
  return { ...layout, key, first: !seen.has(key) };
}

export function markShown(key: string): void {
  seen.add(key);
}
