// The network map's graph, as pure functions (plans/crm.md, Feature 5):
// who is on it, who hangs off whom, how big each dot is, when each one
// appears as the network grows, which labels fit, and the same network as
// a list. Everyone appears exactly once, even through a loop the database
// should never allow.

import type { Stage } from "./crm";
import { todayIn } from "./dates";

export const YOU = "you";

export type MapPerson = {
  id: string;
  name: string;
  company: string | null;
  stage: Stage;
  introduced_by: string | null;
  /** The day they appear: met-on, or the day they were added in your timezone. */
  day: string;
  /** Interactions logged (0 if none: they're missing from crm_contact_stats). */
  interactions: number;
};

export type MapNode = MapPerson & {
  /** Who they hang off on the map: an introducer, or YOU. */
  parent: string;
  /** Rings out from You: 1 for people you met yourself. */
  depth: number;
  /** The day they appear, never before their introducer. */
  appears: string;
};

export type MapGraph = {
  nodes: MapNode[];
  /** Children of each id (YOU included), in drawing order. */
  children: Map<string, string[]>;
  /** How many people hang below each id (themselves included), for sector sizes. */
  weight: Map<string, number>;
};

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const byDayThenName = (a: MapPerson, b: MapPerson) =>
  (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) || collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Builds the tree out from You. Input order never matters (sorted by id
 * first). Anyone the walk can't reach from You (a loop) is hung off You,
 * each loop cut at its lowest id, so the map and the list hold everyone
 * exactly once.
 */
export function buildGraph(people: readonly MapPerson[]): MapGraph {
  const sorted = [...people].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byId = new Map(sorted.map((p) => [p.id, p]));
  const parentOf = new Map<string, string>();
  for (const p of sorted) {
    const intro = p.introduced_by;
    parentOf.set(p.id, intro && intro !== p.id && byId.has(intro) ? intro : YOU);
  }

  const childrenOf = (parent: string) => sorted.filter((p) => parentOf.get(p.id) === parent);
  const children = new Map<string, string[]>();
  const nodes = new Map<string, MapNode>();
  const visit = (parent: string, depth: number, parentAppears: string | null) => {
    const kids = childrenOf(parent)
      .filter((p) => !nodes.has(p.id))
      .sort(byDayThenName);
    children.set(parent, [...(children.get(parent) ?? []), ...kids.map((k) => k.id)]);
    for (const kid of kids) {
      const appears = parentAppears && parentAppears > kid.day ? parentAppears : kid.day;
      nodes.set(kid.id, { ...kid, parent, depth, appears });
    }
    for (const kid of kids) visit(kid.id, depth + 1, nodes.get(kid.id)!.appears);
  };
  visit(YOU, 1, null);

  // Unreached: only through a loop. Hang the lowest id of each loop off You and carry on.
  for (const p of sorted) {
    if (nodes.has(p.id)) continue;
    parentOf.set(p.id, YOU);
    children.set(YOU, [...(children.get(YOU) ?? []), p.id]);
    nodes.set(p.id, { ...p, parent: YOU, depth: 1, appears: p.day });
    visit(p.id, 2, p.day);
  }

  const weight = new Map<string, number>();
  const weigh = (id: string): number => {
    const w = 1 + (children.get(id) ?? []).reduce((sum, c) => sum + weigh(c), 0);
    weight.set(id, w);
    return w;
  };
  weigh(YOU);

  return { nodes: [...nodes.values()], children, weight };
}

/** A dot's radius on screen: square root of interactions, 8 to 22 px, capped at 30 interactions. */
export function dotRadius(interactions: number): number {
  const n = Math.min(Math.max(interactions, 0), 30);
  return 8 + (14 * Math.sqrt(n)) / Math.sqrt(30);
}

/** The words under a dot: the first name, or the next word after a title; at most 14 characters. */
export function labelFor(name: string): string {
  const words = name.trim().split(/\s+/u);
  const titles = /^(dr|prof|mr|mrs|ms|mx|sir|dame)\.?$/i;
  const word = (words.length > 1 && titles.test(words[0]) ? words[1] : words[0]) ?? "";
  const chars = [...word];
  return chars.length > 14 ? `${chars.slice(0, 13).join("")}…` : word;
}

/**
 * Who appears on `day` (everyone when `day` is null: the slider's far
 * right). People are never shown before their introducer.
 */
export function visibleOn(nodes: readonly MapNode[], day: string | null): Set<string> {
  return new Set(nodes.filter((n) => day === null || n.appears <= day).map((n) => n.id));
}

/**
 * The slider's range: the first day anyone appears, to today. Null when
 * there's nothing to grow through (nobody, or everyone appears on one day).
 */
export function growthRange(nodes: readonly MapNode[], today: string): { first: string; last: string } | null {
  if (nodes.length === 0) return null;
  const first = nodes.reduce((min, n) => (n.appears < min ? n.appears : min), today);
  const latest = nodes.reduce((max, n) => (n.appears > max ? n.appears : max), first);
  return first >= today || first === latest ? null : { first, last: today };
}

/**
 * The day someone appears on the map: their met-on day, or the day they
 * were added in your timezone; never after today.
 */
export function mapDay(metOn: string | null, createdAt: string, timeZone: string | undefined, today: string): string {
  const day = metOn ?? todayIn(timeZone, new Date(createdAt));
  return day > today ? today : day;
}

export type Box = { x: number; y: number; width: number; height: number };
export type LabelBox = Box & { id: string };
/** Where a label sits by its dot, in the order they're tried. */
export const LABEL_SPOTS = ["below", "right", "left", "above", "below-right", "below-left", "above-right", "above-left"] as const;
export type LabelSpot = (typeof LABEL_SPOTS)[number];

/** Space kept clear between labels, in screen px. */
export const LABEL_PAD = 3;
/** Space kept clear between a label and someone else's dot (the label's halo covers the rest). */
export const DOT_PAD = 1.5;

const overlaps = (a: Box, b: Box, pad: number) =>
  a.x - pad < b.x + b.width && b.x - pad < a.x + a.width && a.y - pad < b.y + b.height && b.y - pad < a.y + a.height;

/** The boxes a label of `width` × `height` can take around a dot of radius `r` at (x, y). */
export function labelSpots(x: number, y: number, r: number, width: number, height: number): Record<LabelSpot, Box> {
  const d = r * 0.7 + 2; // a diagonal spot starts just off the dot's rim
  return {
    below: { x: x - width / 2, y: y + r + 2, width, height },
    right: { x: x + r + 4, y: y - height / 2, width, height },
    left: { x: x - r - 4 - width, y: y - height / 2, width, height },
    above: { x: x - width / 2, y: y - r - 2 - height, width, height },
    "below-right": { x: x + d, y: y + d, width, height },
    "below-left": { x: x - d - width, y: y + d, width, height },
    "above-right": { x: x + d, y: y - d - height, width, height },
    "above-left": { x: x - d - width, y: y - d - height, width, height },
  };
}

/**
 * Greedy label placement: in priority order, each label takes the first of
 * its spots (below, right, left, above, then the diagonals) that is clear
 * of the labels already placed (LABEL_PAD apart) and of everyone else's
 * dot (`dots`, each with the id of the person it belongs to; DOT_PAD
 * apart); a label with no clear spot is left out. Boxes are in screen px.
 * For the 3D map: a label that had a spot before (`previous`) tries it
 * first, so moving labels don't hop between spots; `order` changes the
 * order spots are tried in; `allowed` can rule a spot out.
 */
export function placeLabels(
  labels: readonly { id: string; spots: Record<LabelSpot, Box> }[],
  dots: readonly LabelBox[] = [],
  previous: ReadonlyMap<string, LabelSpot> = new Map(),
  options: { order?: readonly LabelSpot[]; allowed?: (id: string, box: Box) => boolean } = {},
): Map<string, LabelSpot> {
  const kept: Box[] = [];
  const placed = new Map<string, LabelSpot>();
  const order = options.order ?? LABEL_SPOTS;
  for (const label of labels) {
    const before = previous.get(label.id);
    for (const spot of before ? [before, ...order.filter((s) => s !== before)] : order) {
      const box = label.spots[spot];
      if (options.allowed && !options.allowed(label.id, box)) continue;
      const clash = kept.some((k) => overlaps(box, k, LABEL_PAD)) || dots.some((d) => d.id !== label.id && overlaps(box, d, DOT_PAD));
      if (!clash) {
        kept.push(box);
        placed.set(label.id, spot);
        break;
      }
    }
  }
  return placed;
}

/** Label priority: the tapped dot first, then most interactions, then name. */
export function labelOrder(nodes: readonly MapNode[], selected: string | null): MapNode[] {
  return [...nodes].sort(
    (a, b) =>
      (a.id === selected ? -1 : 0) - (b.id === selected ? -1 : 0) ||
      b.interactions - a.interactions ||
      collator.compare(a.name, b.name),
  );
}

export type ListItem = { node: MapNode; children: ListItem[] };

/** The same network as a nested list, You's people first, each branch in the map's order. Only those in `visible`. */
export function networkList(graph: MapGraph, visible: ReadonlySet<string>): ListItem[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const build = (id: string, seen: Set<string>): ListItem[] =>
    (graph.children.get(id) ?? [])
      .filter((c) => visible.has(c) && !seen.has(c))
      .map((c) => {
        seen.add(c);
        return { node: byId.get(c)!, children: build(c, seen) };
      });
  return build(YOU, new Set());
}

/** "20 people, 3 introduction chains" for what's visible. */
export function visibleSummary(graph: MapGraph, visible: ReadonlySet<string>): { people: number; chains: number } {
  const chains = (graph.children.get(YOU) ?? []).filter(
    (id) => visible.has(id) && (graph.children.get(id) ?? []).some((c) => visible.has(c)),
  ).length;
  return { people: visible.size, chains };
}

/**
 * A key for the shape of the network: positions depend on this and nothing
 * else (who hangs off whom, in drawing order: the order carries the days
 * met and the names).
 */
export function layoutKey(graph: MapGraph): string {
  return [...graph.children.entries()]
    .filter(([, kids]) => kids.length > 0)
    .map(([parent, kids]) => `${parent}>${kids.join(",")}`)
    .sort()
    .join("|");
}
