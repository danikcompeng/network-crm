// A finger for the demo recording: real touch events at a human pace, and a
// soft dot on screen wherever it touches (adapted from Bitewise's
// e2e/helpers/finger.ts).
//
// Playwright's click() lands instantly, which looks robotic on video, and
// a drag needs touch moves in between. So this sends the browser's touch
// events directly (Chrome DevTools Protocol), one move per frame (16 ms),
// eased like a hand that speeds up and slows down. The app sees a real
// touch (pointerType "touch"), so the 3D map turns exactly as on a phone,
// and a drag on a list scrolls it.

import type { CDPSession, Locator, Page } from "@playwright/test";

export type Point = { x: number; y: number };

/** One frame at 60 fps. */
const FRAME_MS = 16;

/** Slow at both ends, quick in the middle. t goes 0 → 1. */
export function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * The touch dot: a page script that draws a soft circle under each touch,
 * grows it in on touchstart, follows touchmove, fades it on touchend. It
 * only listens (passive, capture) and can't be hit (pointer-events: none),
 * and the dot is added on the first touch, long after React has hydrated.
 */
export async function showTouches(page: Page) {
  await page.addInitScript(() => {
    let dot: HTMLDivElement | null = null;
    const make = () => {
      const style = document.createElement("style");
      style.textContent = `
        #film-touch { position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none; }
        #film-touch > div {
          position: absolute; left: -21px; top: -21px; width: 42px; height: 42px; border-radius: 50%;
          background: rgba(24, 26, 30, 0.2); border: 2px solid rgba(255, 255, 255, 0.75);
          box-shadow: 0 1px 8px rgba(0, 0, 0, 0.16);
          opacity: 0; transform: scale(0.55);
          transition: opacity 240ms ease-out, transform 240ms ease-out;
        }
        #film-touch.down > div { opacity: 1; transform: scale(1); transition-duration: 110ms; }
        @media (prefers-color-scheme: dark) {
          #film-touch > div { background: rgba(255, 255, 255, 0.26); border-color: rgba(255, 255, 255, 0.5); box-shadow: 0 1px 10px rgba(0, 0, 0, 0.5); }
        }`;
      document.head.appendChild(style);
      const outer = document.createElement("div");
      outer.id = "film-touch";
      outer.setAttribute("aria-hidden", "true");
      outer.appendChild(document.createElement("div"));
      document.documentElement.appendChild(outer);
      return outer;
    };
    const place = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      dot ??= make();
      dot.style.transform = `translate(${t.clientX}px, ${t.clientY}px)`;
    };
    const opts = { capture: true, passive: true } as const;
    addEventListener("touchstart", (e) => {
      place(e);
      dot?.classList.add("down");
    }, opts);
    addEventListener("touchmove", place, opts);
    const lift = () => dot?.classList.remove("down");
    addEventListener("touchend", lift, opts);
    addEventListener("touchcancel", lift, opts);
  });
}

export class Finger {
  private constructor(
    private readonly page: Page,
    private readonly cdp: CDPSession,
  ) {}

  static async on(page: Page): Promise<Finger> {
    return new Finger(page, await page.context().newCDPSession(page));
  }

  private async touch(type: "touchStart" | "touchMove" | "touchEnd", at?: Point) {
    await this.cdp.send("Input.dispatchTouchEvent", {
      type,
      // A fingertip, not a pin point.
      touchPoints: at ? [{ x: at.x, y: at.y, radiusX: 10, radiusY: 10, force: 1, id: 1 }] : [],
    });
  }

  /** The middle of the element, scrolled into view first. */
  async centre(target: Locator): Promise<Point> {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error(`Finger: can't see ${target}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /** A tap at a point, held a moment like a thumb, so the press shows. */
  async tapAt(at: Point, { hold = 120 } = {}) {
    await this.touch("touchStart", at);
    await this.page.waitForTimeout(hold);
    await this.touch("touchEnd");
  }

  /**
   * A tap on an element, once it's ready: a "trial" click runs Playwright's
   * usual checks (visible, enabled, not still sliding in, nothing covering
   * it) without clicking.
   */
  async tap(target: Locator, opts: { hold?: number } = {}) {
    await target.click({ trial: true });
    await this.tapAt(await this.centre(target), opts);
  }

  /**
   * Puts the finger down at `from`, waits `settle` ms, slides to `to` over
   * `ms` (eased, or along `path` if given: t 0 → 1 to a point), waits
   * `hold` ms, lifts it.
   */
  async drag(from: Point, to: Point, ms: number, { settle = 60, hold = 80, path }: { settle?: number; hold?: number; path?: (t: number) => Point } = {}) {
    await this.touch("touchStart", from);
    await this.page.waitForTimeout(settle);
    const steps = Math.max(2, Math.round(ms / FRAME_MS));
    const started = Date.now();
    for (let i = 1; i <= steps; i++) {
      const t = easeInOut(i / steps);
      await this.touch("touchMove", path ? path(t) : { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      // Keep to the clock, so a slow round trip doesn't stretch the drag.
      const due = started + i * FRAME_MS - Date.now();
      if (due > 0) await this.page.waitForTimeout(due);
    }
    if (hold > 0) await this.page.waitForTimeout(hold);
    await this.touch("touchEnd");
  }
}
