import { describe, expect, it } from "vitest";
import { Gestures, drawnRadius, plateScale, MAX_SCALE, MIN_SCALE, boundsOf, fitView, isTap, panBy, pinch, zoomAt } from "./map-view";

const at = (v: { k: number; tx: number; ty: number }, x: number, y: number) => ({ x: x * v.k + v.tx, y: y * v.k + v.ty });

describe("zoomAt", () => {
  it("keeps the point under the finger still", () => {
    const v = { k: 1, tx: 10, ty: 20 };
    const z = zoomAt(v, 2, 100, 100);
    // The graph point that was at (100, 100) on screen is still there.
    const gx = (100 - v.tx) / v.k;
    const gy = (100 - v.ty) / v.k;
    expect(at(z, gx, gy).x).toBeCloseTo(100);
    expect(at(z, gx, gy).y).toBeCloseTo(100);
    expect(z.k).toBe(2);
  });
  it("is limited to 0.4x-4x", () => {
    expect(zoomAt({ k: 3, tx: 0, ty: 0 }, 10, 0, 0).k).toBe(MAX_SCALE);
    expect(zoomAt({ k: 0.5, tx: 0, ty: 0 }, 0.01, 0, 0).k).toBe(MIN_SCALE);
  });
});

describe("panBy / fit / bounds / taps / pinch", () => {
  it("pans", () => {
    expect(panBy({ k: 2, tx: 1, ty: 1 }, 5, -3)).toEqual({ k: 2, tx: 6, ty: -2 });
  });
  it("fits bounds in the box, centred, never above 1.6x", () => {
    const v = fitView({ minX: -100, minY: -50, maxX: 100, maxY: 50 }, 400, 400, 0);
    expect(v.k).toBeCloseTo(1.6);
    expect(at(v, 0, 0)).toEqual({ x: 200, y: 200 });
    // A big network is fitted whole, below the usual 0.4x limit, and zoom can reach that.
    const big = fitView({ minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 }, 400, 400, 0);
    expect(big.k).toBeCloseTo(0.2);
    expect(zoomAt({ k: 0.3, tx: 0, ty: 0 }, 0.1, 0, 0, big.k).k).toBeCloseTo(0.2);
  });
  it("bounds include each circle's radius; none is a small box", () => {
    expect(boundsOf([{ x: 0, y: 0, r: 5 }, { x: 10, y: -2, r: 1 }])).toEqual({ minX: -5, minY: -5, maxX: 11, maxY: 5 });
    expect(boundsOf([])).toEqual({ minX: -1, minY: -1, maxX: 1, maxY: 1 });
  });
  it("a small move is a tap, a bigger one a drag", () => {
    expect(isTap(3, 4)).toBe(true);
    expect(isTap(6, 6)).toBe(false);
  });
  it("pinch: spreading two fingers zooms in about their midpoint", () => {
    const p = pinch(
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 50, y: 100 },
        { x: 250, y: 100 },
      ],
    );
    expect(p.factor).toBe(2);
    expect(p.mid).toEqual({ x: 150, y: 100 });
    expect(p.shift).toEqual({ x: 0, y: 0 });
  });
});

describe("drawn radius", () => {
  it("shrinks to 70% when zoomed out, never below 9 px (a smaller dot keeps its size)", () => {
    expect(plateScale(2)).toBe(1);
    expect(plateScale(0.2)).toBe(0.7);
    expect(drawnRadius(22, 1)).toBe(22);
    expect(drawnRadius(22, 0.5)).toBeCloseTo(15.4);
    expect(drawnRadius(11, 0.5)).toBe(9);
    expect(drawnRadius(8, 0.5)).toBe(8);
  });
});

describe("Gestures", () => {
  it("one pointer: pan, and a still press is a tap", () => {
    const g = new Gestures();
    g.down(1, { x: 10, y: 10 });
    expect(g.up(1)).toEqual({ x: 10, y: 10 });
    g.down(1, { x: 10, y: 10 });
    expect(g.move(1, { x: 40, y: 20 })).toEqual({ kind: "pan", dx: 30, dy: 10 });
    expect(g.up(1)).toBeNull();
  });
  it("lifting the still finger of a pinch last is not a tap, nor is a two-finger tap", () => {
    const g = new Gestures();
    g.down(1, { x: 10, y: 10 });
    g.down(2, { x: 100, y: 100 });
    expect(g.move(2, { x: 150, y: 150 }).kind).toBe("pinch");
    expect(g.up(2)).toBeNull();
    expect(g.up(1)).toBeNull(); // never moved, but part of a pinch
    g.down(1, { x: 10, y: 10 });
    g.down(2, { x: 50, y: 50 });
    expect(g.up(1)).toBeNull();
    expect(g.up(2)).toBeNull();
    // A fresh single press afterwards is a tap again.
    g.down(3, { x: 5, y: 5 });
    expect(g.up(3)).toEqual({ x: 5, y: 5 });
  });
  it("a cancelled pointer ends the gesture", () => {
    const g = new Gestures();
    g.down(1, { x: 0, y: 0 });
    g.down(2, { x: 9, y: 9 });
    g.cancel(1);
    g.cancel(2);
    g.down(1, { x: 0, y: 0 });
    expect(g.up(1)).toEqual({ x: 0, y: 0 });
    expect(g.move(7, { x: 1, y: 1 })).toEqual({ kind: "none" });
  });
});
