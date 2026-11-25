"use client";

// The map in 3D (plans/crm.md, Feature 7): a little solar system. You
// are the planet; the people you met yourself orbit on the inner ring,
// the people they introduced on the next, and so on. Drag turns it, a
// pinch or the wheel zooms, a tap opens the person; with motion allowed
// it drifts slowly when left alone.
//
// three.js is loaded here with a dynamic import() (components/
// orbit-scene.ts), so no other screen downloads it. Nothing renders
// between changes: the frame loop runs only while something moves. The
// view lives in refs during gestures and drift (no React work per frame)
// and in the module between visits, so leaving the tab keeps it.
//
// Over the canvas, two layers of plain HTML: name labels (only near the
// camera or for the tapped person) and an invisible, aria-hidden marker
// per person at their sphere (what tests find and tap). Both are updated
// four times a second; the labels follow every frame.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MinusIcon, PlusIcon, RecentreIcon } from "@/components/icons";
import { MapButton, TAP_REACH, useReducedMotion } from "@/components/map-controls";
import type { OrbitScene, SceneColors } from "@/components/orbit-scene";
import { TONE_CLASS } from "@/components/stage-chip";
import { StageMark } from "@/components/stage-mark";
import {
  LABEL_ORDER_3D,
  START_PITCH,
  driftBy,
  easeOrbit,
  fitDistance,
  labelBelongs,
  labelCandidates,
  onRing,
  onScreen,
  orbitLayout,
  orbitLines,
  pickPerson,
  project,
  spherePx,
  startOrbit,
  startYaw,
  turnBy,
  zoomBy,
  zoomLimits,
  type OnScreen,
  type Orbit,
} from "@/lib/map-3d";
import { labelFor, labelSpots, layoutKey, placeLabels, type LabelBox, type LabelSpot, type MapGraph } from "@/lib/map-graph";
import { Gestures } from "@/lib/map-view";
import { stageTone } from "@/lib/people";

/** The view between visits (the tab hidden and shown again), for the same network. */
let saved: { key: string; orbit: Orbit } | null = null;

const OVERLAY_MS = 250;
/** The drift waits this long after the last touch. */
const IDLE_MS = 4000;
const EASE_MS = 600;
/** A lost WebGL context gets this long to come back (while the page is visible) before the 2D map takes over. */
const LOST_MS = 3000;
const LABEL_HEIGHT = 20;
const ZOOM_STEP = 1.4;

function readColors(el: HTMLElement): SceneColors {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(`--${name}`).trim();
  return {
    dark: window.matchMedia("(prefers-color-scheme: dark)").matches,
    space: v("space"),
    orbitLine: v("orbit-line"),
    mapEdge: v("map-edge"),
    mapStar: v("map-star"),
    planet: v("planet"),
    sphere: { muted: v("sphere-muted"), ink: v("sphere-ink"), accent: v("sphere-accent") },
  };
}

type Label = { id: string; spot: LabelSpot; x: number; y: number };
type Overlay = { markers: OnScreen[]; labels: Label[] };

type Props = {
  graph: MapGraph;
  visible: ReadonlySet<string>;
  selected: string | null;
  onSelect: (id: string) => void;
  summary: string;
  /** No 3D after all (three.js didn't load, the renderer failed, the context was lost for good). */
  onFail: () => void;
};

export function MapFrame3D({ graph, visible, selected, onSelect, summary, onFail }: Props) {
  const reduceMotion = useReducedMotion();
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>({ markers: [], labels: [] });

  const layout = useMemo(() => orbitLayout(graph), [graph]);
  const key = useMemo(() => layoutKey(graph), [graph]);
  const lines = useMemo(() => orbitLines(graph, layout), [graph, layout]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  // The buttons sit under the frame, so the system can use all of it.
  const fit = size ? fitDistance(layout.reach, size.w, size.h, START_PITCH) : null;
  const home = useMemo(() => startYaw(layout), [layout]);
  /** Interviewing and offer: labelled wherever they are. */
  const important = useMemo(() => new Set(graph.nodes.filter((n) => stageTone(n.stage) === "accent").map((n) => n.id)), [graph]);

  // What the frame loop reads (refs, kept in step by the effects below).
  const live = useRef({
    orbit: null as Orbit | null,
    drawn: null as Orbit | null,
    ease: null as { from: Orbit; to: Orbit; start: number } | null,
    scene: null as OrbitScene | null,
    visible,
    selected,
    reduceMotion,
    size,
    lastTouch: 0,
    pressed: 0,
    inView: true,
    lost: false,
    raf: 0,
    last: 0,
    lastOverlay: -Infinity,
    idleTimer: 0 as ReturnType<typeof setTimeout> | 0,
    spots: new Map<string, LabelSpot>(),
    widths: new Map<string, number>(),
    labels: [] as Label[],
  });
  const labelEls = useRef(new Map<string, HTMLElement>());
  const gestures = useRef(new Gestures());
  const onFailRef = useRef(onFail);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onFailRef.current = onFail;
    onSelectRef.current = onSelect;
  }, [onFail, onSelect]);

  /** Who's on screen from `o`, and the labels that fit (keeping each label's last spot while it's clear). */
  const compute = useCallback(
    (o: Orbit): Overlay => {
      const L = live.current;
      if (!L.size) return { markers: [], labels: [] };
      const { w, h } = L.size;
      const { people, planet } = onScreen(layout, L.visible, o, w, h);
      const candidates = labelCandidates(people, L.selected, planet.depth, new Set(L.labels.map((l) => l.id)), important);
      const width = (id: string) => L.widths.get(id) ?? [...labelFor(byId.get(id)!.name)].length * 6.6 + 30;
      const blockers: LabelBox[] = [
        { id: "you", x: planet.x - planet.r, y: planet.y - planet.r, width: planet.r * 2, height: planet.r * 2 },
        ...people.map((p) => ({ id: p.id, x: p.x - p.r, y: p.y - p.r, width: p.r * 2, height: p.r * 2 })),
        // The frame's edges.
        { id: "frame", x: -1e6, y: -1e6, width: 1e6 + 4, height: 3e6 },
        { id: "frame", x: w - 4, y: -1e6, width: 1e6, height: 3e6 },
        { id: "frame", x: -1e6, y: -1e6, width: 3e6, height: 1e6 + 4 },
        { id: "frame", x: -1e6, y: h - 4, width: 3e6, height: 1e6 },
      ];
      const byIdOnScreen = new Map(people.map((p) => [p.id, p]));
      const spotsFor = (p: OnScreen) => ({ id: p.id, spots: labelSpots(p.x, p.y, p.r, width(p.id), LABEL_HEIGHT) });
      const placed = placeLabels(candidates.map(spotsFor), blockers, L.spots, {
        order: LABEL_ORDER_3D,
        // Only where it plainly belongs to its own sphere, not a neighbour's (the focused and important: touching it).
        allowed: (id, box) => labelBelongs(byIdOnScreen.get(id)!, box, people, id !== L.selected && !important.has(id)),
      });
      // The person in focus is always named: if nothing was clear, the first spot inside the frame.
      const focus = candidates.find((p) => p.id === L.selected);
      if (focus && !placed.has(focus.id)) {
        const forced = placeLabels([spotsFor(focus)], blockers.filter((b) => b.id === "frame"), L.spots, { order: LABEL_ORDER_3D });
        const spot = forced.get(focus.id);
        if (spot) placed.set(focus.id, spot);
      }
      L.spots = placed;
      const labels = candidates.filter((p) => placed.has(p.id)).map((p) => ({ id: p.id, spot: placed.get(p.id)!, x: p.x, y: p.y }));
      return { markers: people, labels };
    },
    [layout, byId, important],
  );

  /** Moves each label to where its person is now (every frame, no React). */
  const follow = useCallback(
    (o: Orbit) => {
      const L = live.current;
      if (!L.size) return;
      const centre = o.distance;
      for (const label of L.labels) {
        const el = labelEls.current.get(label.id);
        const person = layout.people.get(label.id);
        if (!el || !person) continue;
        const s = project(person.position, o, L.size.w, L.size.h);
        if (!s) continue;
        const r = spherePx(person.interactions, s.depth, centre);
        const box = labelSpots(s.x, s.y, r, L.widths.get(label.id) ?? el.offsetWidth, LABEL_HEIGHT)[label.spot];
        el.style.transform = `translate(${box.x}px, ${box.y}px)`;
      }
    },
    [layout],
  );

  const invalidate = useRef<() => void>(() => {});

  // What the scene is built from: read when it's (re)built, which happens
  // only when the network's shape (`key`) changes.
  const built = useRef({ graph, layout, lines });
  const scenePeople = useCallback((g: MapGraph) => g.nodes.map((n) => ({ id: n.id, stage: n.stage, interactions: n.interactions })), []);
  useEffect(() => {
    built.current = { graph, layout, lines };
    // Same shape, new stages or counts (a sheet saved something): update in place.
    live.current.scene?.setPeople(scenePeople(graph));
    live.current.lastOverlay = -Infinity;
    invalidate.current();
  }, [graph, layout, lines, scenePeople]);

  // The frame loop: draws, drifts, eases; runs only while something moves.
  useEffect(() => {
    const L = live.current;
    const canDrift = (now: number) =>
      !L.reduceMotion && !L.selected && L.pressed === 0 && L.inView && document.visibilityState === "visible" && now - L.lastTouch >= IDLE_MS;

    const frameCb = (now: number) => {
      L.raf = 0;
      const scene = L.scene;
      if (!scene || !L.orbit || L.lost) return;
      const dt = L.last ? Math.min(now - L.last, 100) : 0;
      L.last = now;
      let o = L.orbit;
      let moving = false;
      if (L.ease) {
        const t = (now - L.ease.start) / EASE_MS;
        o = easeOrbit(L.ease.from, L.ease.to, t);
        if (t >= 1) {
          o = L.ease.to;
          L.ease = null;
        } else moving = true;
      } else if (canDrift(now)) {
        o = driftBy(o, dt);
        moving = true;
      }
      L.orbit = o;
      saved = { key, orbit: o };
      const animating = scene.draw(o, now);
      L.drawn = o;
      const still = !moving && !animating;
      if (still || now - L.lastOverlay >= OVERLAY_MS) {
        L.lastOverlay = now;
        const next = compute(o);
        L.labels = next.labels;
        // Markers are for finding people: skip re-rendering a thousand of them while it moves.
        setOverlay((prev) => ({ labels: next.labels, markers: still || next.markers.length <= 300 ? next.markers : prev.markers }));
      }
      follow(o);
      if (!still) {
        L.raf = requestAnimationFrame(frameCb);
      } else {
        L.last = 0;
        // Waiting out the pause after a touch: wake up when the drift may start.
        if (!L.reduceMotion && !L.selected && L.pressed === 0) {
          const wait = IDLE_MS - (now - L.lastTouch);
          if (wait > 0) {
            if (L.idleTimer) clearTimeout(L.idleTimer);
            L.idleTimer = setTimeout(() => {
              L.idleTimer = 0;
              invalidate.current();
            }, wait + 20);
          } else if (canDrift(performance.now())) L.raf = requestAnimationFrame(frameCb);
        }
      }
    };
    invalidate.current = () => {
      if (!L.raf && L.scene && !L.lost) L.raf = requestAnimationFrame(frameCb);
    };
    return () => {
      if (L.raf) cancelAnimationFrame(L.raf);
      if (L.idleTimer) clearTimeout(L.idleTimer);
      L.raf = 0;
      L.idleTimer = 0;
      L.last = 0;
      invalidate.current = () => {};
    };
  }, [key, compute, follow]);

  // Measure the frame.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    // A hidden page (<Activity>) measures 0 × 0: keep the last real size, or the view would be squeezed to fit nothing.
    const measure = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The view: the saved one for this network, else the start; on a resize, kept within the new zoom limits.
  useLayoutEffect(() => {
    const L = live.current;
    L.size = size;
    if (!size || fit === null) return;
    if (!L.orbit) L.orbit = saved?.key === key ? saved.orbit : startOrbit(fit, home);
    const { near, far } = zoomLimits(fit, layout.reach);
    L.orbit = { ...L.orbit, distance: Math.min(far, Math.max(near, L.orbit.distance)) };
    L.scene?.setSize(size.w, size.h, Math.min(window.devicePixelRatio || 1, 2));
    L.lastOverlay = -Infinity;
    invalidate.current();
  }, [size, fit, key, layout, home]);

  // The scene: a fresh canvas each time (a disposed one's context is gone for good).
  useEffect(() => {
    const hostEl = host.current;
    const frameEl = frame.current;
    if (!hostEl || !frameEl) return;
    const L = live.current;
    const canvas = document.createElement("canvas");
    canvas.className = "block size-full";
    canvas.setAttribute("aria-hidden", "true");
    hostEl.appendChild(canvas);
    let disposed = false;
    let lostTimer: ReturnType<typeof setTimeout> | 0 = 0;
    const arm = () => {
      if (!lostTimer && L.lost && document.visibilityState === "visible") lostTimer = setTimeout(() => onFailRef.current(), LOST_MS);
    };
    const onLost = (e: Event) => {
      e.preventDefault(); // ask for it back
      L.lost = true;
      arm();
    };
    const onRestored = () => {
      L.lost = false;
      if (lostTimer) clearTimeout(lostTimer);
      lostTimer = 0;
      invalidate.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        arm();
        invalidate.current();
      } else if (lostTimer) {
        // Lost while hidden (iOS does this to background apps): wait until it's visible again.
        clearTimeout(lostTimer);
        lostTimer = 0;
      }
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    document.addEventListener("visibilitychange", onVisibility);

    import("@/components/orbit-scene").then(
      ({ createOrbitScene }) => {
        if (disposed) return;
        const { graph: g, layout, lines } = built.current;
        try {
          L.scene = createOrbitScene(
            canvas,
            {
              layout,
              lines,
              people: scenePeople(g),
              ringPoint: (depth, angle) => {
                const ring = layout.rings.get(depth)!;
                return onRing(ring.radius, angle, ring.tilt);
              },
            },
            readColors(frameEl),
          );
        } catch {
          onFailRef.current();
          return;
        }
        if (L.size) L.scene.setSize(L.size.w, L.size.h, Math.min(window.devicePixelRatio || 1, 2));
        L.scene.setVisible(L.visible, false, performance.now());
        L.lastOverlay = -Infinity;
        setReady(true);
        invalidate.current();
      },
      () => {
        if (!disposed) onFailRef.current(); // the chunk didn't load (offline): the 2D map
      },
    );

    // Light or dark changed: the scene's colours come from the CSS variables.
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      L.scene?.setColors(readColors(frameEl));
      invalidate.current();
    };
    scheme.addEventListener("change", onScheme);

    return () => {
      disposed = true;
      scheme.removeEventListener("change", onScheme);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      document.removeEventListener("visibilitychange", onVisibility);
      if (lostTimer) clearTimeout(lostTimer);
      L.scene?.dispose();
      L.scene = null;
      L.lost = false;
      canvas.remove();
    };
  }, [key, scenePeople]);

  // Who's shown (the slider): newcomers scale in, with motion allowed.
  useEffect(() => {
    const L = live.current;
    L.visible = visible;
    L.scene?.setVisible(visible, !L.reduceMotion, performance.now());
    L.lastOverlay = -Infinity;
    invalidate.current();
  }, [visible]);

  useEffect(() => {
    const L = live.current;
    L.selected = selected;
    L.reduceMotion = reduceMotion;
    if (reduceMotion && L.ease) {
      L.orbit = L.ease.to;
      L.ease = null;
    }
    L.lastOverlay = -Infinity;
    invalidate.current();
  }, [selected, reduceMotion]);

  // Off screen: nothing draws until it's back.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      live.current.inView = entry.isIntersecting;
      if (entry.isIntersecting) invalidate.current();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Measure the labels that just appeared, for placing them next time.
  useLayoutEffect(() => {
    for (const [id, el] of labelEls.current) live.current.widths.set(id, el.offsetWidth);
    follow(live.current.drawn ?? live.current.orbit ?? startOrbit(1));
  }, [overlay.labels, follow]);

  const touched = () => {
    const L = live.current;
    L.lastTouch = performance.now();
    L.ease = null;
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const box = frame.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  // The wheel zooms; attached natively so it can stop the page scrolling.
  useEffect(() => {
    const el = frame.current;
    if (!el || fit === null) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const L = live.current;
      if (!L.orbit) return;
      touched();
      L.orbit = zoomBy(L.orbit, Math.exp(-e.deltaY * 0.0015), fit, layout.reach);
      invalidate.current();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fit, layout]);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return; // the primary button or a finger only: a right-click opens nothing
    frame.current?.setPointerCapture(e.pointerId);
    gestures.current.down(e.pointerId, local(e));
    live.current.pressed += 1;
    touched();
  }

  function onPointerMove(e: React.PointerEvent) {
    const L = live.current;
    const step = gestures.current.move(e.pointerId, local(e));
    if (!L.orbit || fit === null) return;
    if (step.kind === "pan") L.orbit = turnBy(L.orbit, step.dx, step.dy);
    else if (step.kind === "pinch") L.orbit = zoomBy(L.orbit, step.factor, fit, layout.reach);
    else return;
    touched();
    invalidate.current();
  }

  function release(tapped: { x: number; y: number } | null) {
    const L = live.current;
    L.pressed = Math.max(0, L.pressed - 1);
    touched();
    invalidate.current();
    if (!tapped || !L.drawn || !L.size) return;
    // What was on screen when the finger lifted: the view that was drawn last.
    const { people } = onScreen(layout, L.visible, L.drawn, L.size.w, L.size.h);
    const id = pickPerson(people, tapped.x, tapped.y, TAP_REACH);
    if (id) onSelectRef.current(id);
  }

  const moveTo = (target: Orbit) => {
    const L = live.current;
    if (!L.orbit) return;
    const from = L.orbit;
    touched();
    if (L.reduceMotion) L.orbit = target;
    else L.ease = { from, to: target, start: performance.now() };
    invalidate.current();
  };

  const zoomButton = (factor: number) => {
    const L = live.current;
    if (!L.orbit || fit === null) return;
    moveTo(zoomBy(L.ease?.to ?? L.orbit, factor, fit, layout.reach));
  };

  return (
    <div className="relative mt-5">
      <div
        ref={frame}
        role="img"
        aria-label={`Network map. ${summary} The same network is listed below the map.`}
        className="relative aspect-square max-h-[min(60dvh,520px)] w-full touch-none overflow-hidden rounded-(--radius-card) border border-line-strong bg-space select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => release(gestures.current.up(e.pointerId))}
        onPointerCancel={(e) => {
          gestures.current.cancel(e.pointerId);
          release(null);
        }}
      >
        <div ref={host} className="absolute inset-0" data-map-3d="" />
        {!ready && <p className="absolute inset-0 flex items-center justify-center text-ink-muted">Laying out…</p>}
        <Markers markers={overlay.markers} names={byId} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {overlay.labels.map((label) => {
            const n = byId.get(label.id);
            if (!n) return null;
            return (
              <span
                key={label.id}
                ref={(el) => {
                  if (el) labelEls.current.set(label.id, el);
                  else labelEls.current.delete(label.id);
                }}
                data-name-label={label.id}
                className={`absolute top-0 left-0 flex h-5 items-center gap-1 rounded-full border bg-surface px-1.5 text-xs font-semibold whitespace-nowrap text-ink ${label.id === selected ? "border-accent" : "border-line-strong"}`}
              >
                <StageMark stage={n.stage} size={11} className={TONE_CLASS[stageTone(n.stage)]} />
                {labelFor(n.name)}
              </span>
            );
          })}
        </div>
      </div>
      {/* Under the frame, not over it: over it, a tilted system seen from above would run beneath them. */}
      <div className="mt-2 flex items-start justify-between gap-3">
        <p className="pt-1 text-sm text-ink-muted">Drag to turn · pinch to zoom · tap a person</p>
        <div className="flex shrink-0 gap-2">
          <MapButton label="Zoom in" onClick={() => zoomButton(ZOOM_STEP)}>
            <PlusIcon />
          </MapButton>
          <MapButton label="Zoom out" onClick={() => zoomButton(1 / ZOOM_STEP)}>
            <MinusIcon />
          </MapButton>
          <MapButton label="Recentre" onClick={() => fit !== null && moveTo(startOrbit(fit, home))}>
            <RecentreIcon />
          </MapButton>
        </div>
      </div>
    </div>
  );
}

/**
 * Where each person is, for finding them (tests, and nothing else: hidden
 * from everyone). Memoised: while a big network drifts the markers are
 * left as they were, and this skips re-rendering a thousand of them.
 */
const Markers = memo(function Markers({ markers, names }: { markers: readonly OnScreen[]; names: ReadonlyMap<string, { name: string }> }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {markers.map((m) => (
        <span
          key={m.id}
          data-node={m.id}
          data-label={labelFor(names.get(m.id)?.name ?? "")}
          data-covered={m.covered ? "" : undefined}
          className="absolute"
          style={{ left: m.x - m.r, top: m.y - m.r, width: m.r * 2, height: m.r * 2 }}
        />
      ))}
    </div>
  );
});
