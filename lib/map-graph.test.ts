import { describe, expect, it } from "vitest";
import {
  YOU,
  buildGraph,
  dotRadius,
  growthRange,
  labelFor,
  labelOrder,
  labelSpots,
  layoutKey,
  mapDay,
  networkList,
  placeLabels,
  visibleOn,
  visibleSummary,
  type MapPerson,
} from "./map-graph";
import { computeLayout, layoutFor, markShown, radialStart, RING, ringRadii } from "./map-layout";
import { DEMO_PEOPLE } from "./demo-seed";
import { addDays } from "./dates";

const person = (id: string, introduced_by: string | null, day = "2026-11-01", extra: Partial<MapPerson> = {}): MapPerson => ({
  id,
  name: id.toUpperCase(),
  company: null,
  stage: "talking",
  introduced_by,
  day,
  interactions: 0,
  ...extra,
});

const PEOPLE = [
  person("b", "a", "2026-10-05"),
  person("a", null, "2026-10-01"),
  person("c", "b", "2026-10-09"),
  person("d", "a", "2026-10-03"),
  person("e", null, "2026-10-20"),
  person("f", "gone", "2026-10-25"), // introducer not in the list: hangs off you
];

describe("buildGraph", () => {
  const graph = buildGraph(PEOPLE);
  it("hangs everyone off You or their introducer, with depths", () => {
    const at = Object.fromEntries(graph.nodes.map((n) => [n.id, [n.parent, n.depth]]));
    expect(at).toEqual({ a: [YOU, 1], e: [YOU, 1], f: [YOU, 1], b: ["a", 2], d: ["a", 2], c: ["b", 3] });
  });
  it("orders children by the day met, then name", () => {
    expect(graph.children.get(YOU)).toEqual(["a", "e", "f"]);
    expect(graph.children.get("a")).toEqual(["d", "b"]);
  });
  it("weighs each branch by everyone in it", () => {
    expect(graph.weight.get("a")).toBe(4);
    expect(graph.weight.get(YOU)).toBe(7);
  });
  it("a self-introduced person hangs off You", () => {
    expect(buildGraph([person("a", "a")]).nodes[0].parent).toBe(YOU);
  });
  it("the layout key changes when the drawing order does (a changed met-on), not otherwise", () => {
    const moved = buildGraph(PEOPLE.map((p) => (p.id === "d" ? { ...p, day: "2026-10-30" } : p)));
    expect(layoutKey(moved)).not.toBe(layoutKey(graph));
    const busier = buildGraph(PEOPLE.map((p) => ({ ...p, interactions: 5 })));
    expect(layoutKey(busier)).toBe(layoutKey(graph));
  });
  it("doesn't depend on input order", () => {
    expect(layoutKey(buildGraph([...PEOPLE].reverse()))).toBe(layoutKey(graph));
    expect(buildGraph([...PEOPLE].reverse()).children).toEqual(graph.children);
  });
  it("a loop (refused by the database) still puts everyone on the map exactly once", () => {
    const loop = buildGraph([person("x", "y"), person("y", "x"), person("z", "y")]);
    expect(loop.nodes.map((n) => n.id).sort()).toEqual(["x", "y", "z"]);
    expect(loop.children.get(YOU)).toEqual(["x"]);
    const list = networkList(loop, new Set(["x", "y", "z"]));
    const ids: string[] = [];
    const walk = (items: typeof list) => items.forEach((i) => (ids.push(i.node.id), walk(i.children)));
    walk(list);
    expect(ids.sort()).toEqual(["x", "y", "z"]);
  });
});

describe("growth", () => {
  it("nobody appears before their introducer", () => {
    const g = buildGraph([person("a", null, "2026-11-12"), person("b", "a", "2026-11-05")]);
    expect(g.nodes.find((n) => n.id === "b")!.appears).toBe("2026-11-12");
    expect([...visibleOn(g.nodes, "2026-11-08")]).toEqual([]);
    expect([...visibleOn(g.nodes, "2026-11-12")].sort()).toEqual(["a", "b"]);
  });
  it("the far right (null) shows everyone; the range runs from the first day to today", () => {
    const g = buildGraph(PEOPLE);
    expect(visibleOn(g.nodes, null).size).toBe(6);
    expect(growthRange(g.nodes, "2026-11-24")).toEqual({ first: "2026-10-01", last: "2026-11-24" });
    expect(growthRange(buildGraph([person("a", null, "2026-11-24")]).nodes, "2026-11-24")).toBeNull();
    expect(growthRange([], "2026-11-24")).toBeNull();
    // Everyone on one day, earlier than today (an import): nothing to grow through.
    expect(growthRange(buildGraph([person("a", null, "2026-11-21"), person("b", null, "2026-11-21")]).nodes, "2026-11-24")).toBeNull();
  });
  it("the day someone appears: met-on, else the day added in your timezone, never after today", () => {
    expect(mapDay(null, "2026-11-24T03:00:00Z", "America/Toronto", "2026-11-24")).toBe("2026-11-23");
    expect(mapDay(null, "2026-11-24T03:00:00Z", "UTC", "2026-11-24")).toBe("2026-11-24");
    expect(mapDay("2026-10-02", "2026-11-24T03:00:00Z", "America/Toronto", "2026-11-24")).toBe("2026-10-02");
    expect(mapDay("2026-12-30", "2026-11-24T03:00:00Z", "UTC", "2026-11-24")).toBe("2026-11-24");
  });
  it("the summary and the list follow what's visible", () => {
    const g = buildGraph(PEOPLE);
    const early = visibleOn(g.nodes, "2026-10-06"); // a, d, b
    expect(visibleSummary(g, early)).toEqual({ people: 3, chains: 1 });
    expect(networkList(g, early).map((i) => i.node.id)).toEqual(["a"]);
    expect(networkList(g, early)[0].children.map((i) => i.node.id)).toEqual(["d", "b"]);
  });
});

describe("dots and labels", () => {
  it("radius: 8 at none, growing with the square root, 22 at 30 or more", () => {
    expect(dotRadius(0)).toBe(8);
    expect(dotRadius(1)).toBeCloseTo(10.56, 1);
    expect(dotRadius(30)).toBe(22);
    expect(dotRadius(200)).toBe(22);
  });
  it("labels: first names, titles skipped, long names cut", () => {
    expect(labelFor("Riya Patel")).toBe("Riya");
    expect(labelFor("Dr. Elena Marsh")).toBe("Elena");
    expect(labelFor("Bartholomewsworthington")).toBe("Bartholomewsw…");
  });
  it("each label takes the first clear spot (below, right, left, above), in priority order", () => {
    const at = (id: string, x: number, y: number) => ({ id, spots: labelSpots(x, y, 10, 40, 14) });
    const dot = (id: string, x: number, y: number) => ({ id, x: x - 10, y: y - 10, width: 20, height: 20 });
    // b sits right under a: a keeps "below"; b's own "below" is clear too.
    const placed = placeLabels([at("a", 0, 0), at("b", 0, 30)], [dot("a", 0, 0), dot("b", 0, 30)]);
    expect(placed.get("a")).toBe("right"); // below a is b's dot
    expect(placed.get("b")).toBe("below");
    // Dots all around (diagonals too): no spot fits, the label is left out.
    const boxedIn = [dot("n", 0, 25), dot("e", 35, 0), dot("w", -35, 0), dot("s", 0, -25), dot("se", 30, 22), dot("sw", -30, 22), dot("ne", 30, -22), dot("nw", -30, -22)];
    expect(placeLabels([at("a", 0, 0)], boxedIn).has("a")).toBe(false);
    // Its own dot never blocks it.
    expect(placeLabels([at("a", 0, 0)], [dot("a", 0, 0)]).get("a")).toBe("below");
    // Labels keep 3 px apart.
    const two = placeLabels([{ id: "a", spots: labelSpots(0, 0, 10, 40, 14) }, { id: "c", spots: labelSpots(0, 18, 0, 40, 14) }]);
    expect(two.get("c")).not.toBe("below");
  });
  it("labels: a lone title or an empty name doesn't break", () => {
    expect(labelFor("Dr.")).toBe("Dr.");
    expect(labelFor("")).toBe("");
  });
  it("priority: the tapped dot, then most interactions, then name", () => {
    const g = buildGraph([person("a", null, "2026-11-01", { interactions: 1 }), person("b", null, "2026-11-01", { interactions: 9 })]);
    expect(labelOrder(g.nodes, null).map((n) => n.id)).toEqual(["b", "a"]);
    expect(labelOrder(g.nodes, "a").map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("layout", () => {
  const demo = DEMO_PEOPLE.map((p) =>
    person(p.key, p.introducedBy ?? null, addDays("2026-11-24", -p.addedDaysAgo), { interactions: p.interactions.length }),
  );

  it("the radial start puts each depth on its ring, rings roomy enough and growing outward", () => {
    const g = buildGraph(demo);
    const start = radialStart(g);
    const radii = ringRadii(g);
    for (const n of g.nodes) {
      const p = start.get(n.id)!;
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(radii.get(n.depth)!, 5);
      expect(radii.get(n.depth)!).toBeGreaterThanOrEqual(n.depth * RING);
    }
    const crowded = buildGraph(Array.from({ length: 40 }, (_, i) => person(`p${i}`, null)));
    expect(ringRadii(crowded).get(1)!).toBeGreaterThan(RING); // 40 people need a wider first ring
  });

  it("is the same every time for the same data, whatever the input order, and ignores interaction counts", () => {
    const one = computeLayout(buildGraph(demo)).positions;
    const two = computeLayout(buildGraph([...demo].reverse())).positions;
    const busier = computeLayout(buildGraph(demo.map((p) => ({ ...p, interactions: p.interactions + 7 })))).positions;
    for (const [id, p] of one) {
      expect(two.get(id)).toEqual(p);
      expect(busier.get(id)).toEqual(p);
    }
    expect(one.get(YOU)).toEqual({ x: 0, y: 0 });
  });

  it("a layout is `first` until shown, and cached", () => {
    const g = buildGraph([person("q1", null), person("q2", "q1")]);
    const one = layoutFor(g);
    expect(one.first).toBe(true);
    expect(layoutFor(g).first).toBe(true); // a thrown-away render doesn't use it up
    markShown(one.key);
    const two = layoutFor(buildGraph([person("q2", "q1"), person("q1", null)]));
    expect(two.first).toBe(false);
    expect(two.positions).toBe(one.positions);
  });

  it("lays out 300 people quickly, every one with a finite position", () => {
    const many = Array.from({ length: 300 }, (_, i) => person(`p${String(i).padStart(3, "0")}`, i < 30 ? null : `p${String(i % 30).padStart(3, "0")}`));
    const t = performance.now();
    const { positions } = computeLayout(buildGraph(many));
    expect(performance.now() - t).toBeLessThan(2000);
    expect(positions.size).toBe(301);
    for (const p of positions.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});
