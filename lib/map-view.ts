// Pan and zoom for the network map, as pure maths (plans/crm.md, Feature
// 5). A view is a translation and a scale: a point (x, y) in the graph is
// drawn at (x * k + tx, y * k + ty) on screen.

export type View = { k: number; tx: number; ty: number };

export const MIN_SCALE = 0.4;
export const MAX_SCALE = 4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Zoom by `factor` keeping the screen point (px, py) still (under the
 * finger or pointer). `minScale` is the smaller of 0.4 and whatever fits
 * the whole network, so a big network can always be seen whole.
 */
export function zoomAt(view: View, factor: number, px: number, py: number, minScale = MIN_SCALE): View {
  const k = clamp(view.k * factor, Math.min(minScale, MIN_SCALE), MAX_SCALE);
  const applied = k / view.k;
  return { k, tx: px - (px - view.tx) * applied, ty: py - (py - view.ty) * applied };
}

export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, tx: view.tx + dx, ty: view.ty + dy };
}

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * The view that shows `bounds` whole in a `width` × `height` box, with
 * `padding` around, never above 1.6× (and as small as it takes: a big
 * network is seen whole).
 */
export function fitView(bounds: Bounds, width: number, height: number, padding = 32): View {
  const w = Math.max(bounds.maxX - bounds.minX, 1);
  const h = Math.max(bounds.maxY - bounds.minY, 1);
  const k = clamp(Math.min((width - padding * 2) / w, (height - padding * 2) / h, 1.6), 0.02, MAX_SCALE);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { k, tx: width / 2 - cx * k, ty: height / 2 - cy * k };
}

/** The bounds of circles (x, y, r). */
export function boundsOf(points: readonly { x: number; y: number; r: number }[]): Bounds {
  if (points.length === 0) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  return points.reduce(
    (b, p) => ({
      minX: Math.min(b.minX, p.x - p.r),
      minY: Math.min(b.minY, p.y - p.r),
      maxX: Math.max(b.maxX, p.x + p.r),
      maxY: Math.max(b.maxY, p.y + p.r),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

/** A press that moved less than this (in screen px) is a tap, not a drag. */
export const TAP_SLOP = 8;

export function isTap(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) < TAP_SLOP;
}

/** Two fingers: the zoom factor and the midpoint between them, from the previous and current positions. */
export function pinch(
  before: [{ x: number; y: number }, { x: number; y: number }],
  after: [{ x: number; y: number }, { x: number; y: number }],
): { factor: number; mid: { x: number; y: number }; shift: { x: number; y: number } } {
  const d0 = Math.max(Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y), 1);
  const d1 = Math.max(Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y), 1);
  const m0 = { x: (before[0].x + before[1].x) / 2, y: (before[0].y + before[1].y) / 2 };
  const m1 = { x: (after[0].x + after[1].x) / 2, y: (after[0].y + after[1].y) / 2 };
  return { factor: d1 / d0, mid: m1, shift: { x: m1.x - m0.x, y: m1.y - m0.y } };
}

/** Dots shrink a little when zoomed out (to 70% at most), so a whole network fits; labels keep their size. */
export function plateScale(k: number): number {
  return Math.min(1, Math.max(0.7, k));
}

/** The smallest radius a dot shrinks to on screen (a smaller dot stays its own size). */
export const MIN_DRAWN = 9;

/** A dot's radius on screen at zoom `k`: shrunk by plateScale, never below MIN_DRAWN (or its own radius, if smaller). */
export function drawnRadius(r: number, k: number): number {
  return Math.max(r * plateScale(k), Math.min(r, MIN_DRAWN));
}

type Pt = { x: number; y: number };
export type GestureStep = { kind: "none" } | { kind: "pan"; dx: number; dy: number } | { kind: "pinch"; factor: number; mid: Pt; shift: Pt };

/**
 * The pointers on the map, and what each move means: one pointer pans, two
 * pinch. A tap is one pointer that went down and up without moving, with
 * no second pointer at any point of the gesture (lifting the last finger
 * of a pinch is never a tap).
 */
export class Gestures {
  private pointers = new Map<number, Pt & { startX: number; startY: number }>();
  private multi = false;

  down(id: number, p: Pt): void {
    this.pointers.set(id, { ...p, startX: p.x, startY: p.y });
    if (this.pointers.size > 1) this.multi = true;
  }

  move(id: number, p: Pt): GestureStep {
    const before = this.pointers.get(id);
    if (!before) return { kind: "none" };
    let step: GestureStep = { kind: "none" };
    if (this.pointers.size === 1) {
      step = { kind: "pan", dx: p.x - before.x, dy: p.y - before.y };
    } else if (this.pointers.size === 2) {
      const other = [...this.pointers.entries()].find(([key]) => key !== id)![1];
      step = { kind: "pinch", ...pinch([before, other], [p, other]) };
    }
    this.pointers.set(id, { ...before, x: p.x, y: p.y });
    return step;
  }

  /** A pointer lifted: where the tap was, if it was one. */
  up(id: number): Pt | null {
    const p = this.pointers.get(id);
    this.pointers.delete(id);
    const tap = p && !this.multi && this.pointers.size === 0 && isTap(p.x - p.startX, p.y - p.startY) ? { x: p.x, y: p.y } : null;
    if (this.pointers.size === 0) this.multi = false;
    return tap;
  }

  cancel(id: number): void {
    this.pointers.delete(id);
    if (this.pointers.size === 0) this.multi = false;
  }
}
