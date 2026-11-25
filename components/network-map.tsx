"use client";

// The network map (plans/crm.md, Feature 5): You in the middle, everyone
// you met around you, lines for who introduced whom. A radial tree settled
// by d3-force, laid out in the browser once per shape of the network.
// Positions zoom; dots and labels keep their size on screen. One finger
// pans, two pinch, the wheel zooms at the pointer; a tap opens the person
// sheet. Below the map, the same network as a list, for screen readers
// and anyone who prefers it. The slider replays how the network grew.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ContactDialog } from "@/components/contact-dialog";
import { ChevronRightIcon, FitIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { LogSheet, type LogTarget } from "@/components/log-sheet";
import { PersonSheet } from "@/components/person-sheet";
import { StageLabel } from "@/components/stage-chip";
import { StageShape } from "@/components/stage-mark";
import { Button } from "@/components/ui/button";
import { addDays, daysBetween } from "@/lib/dates";
import { formatDay } from "@/lib/format";
import {
  YOU,
  buildGraph,
  dotRadius,
  growthRange,
  labelFor,
  labelOrder,
  labelSpots,
  networkList,
  placeLabels,
  visibleOn,
  visibleSummary,
  type LabelSpot,
  type ListItem,
  type MapPerson,
} from "@/lib/map-graph";
import { layoutFor, markShown } from "@/lib/map-layout";
import { Gestures, MIN_DRAWN, boundsOf, drawnRadius, fitView, plateScale, zoomAt, type View } from "@/lib/map-view";
import { summaryText } from "@/lib/network";
import { stageTone } from "@/lib/people";

const TONE_FILL = { muted: "var(--ink-muted)", ink: "var(--ink)", accent: "var(--accent)" } as const;
/** Up to this many people, every label that fits shows; beyond it, only when zoomed in or tapped. */
const ALL_LABELS_UP_TO = 40;
const LABEL_ZOOM = 1.6;
/** A tap picks the nearest dot within this many screen px of its edge. */
const TAP_REACH = 22;
const YOU_RADIUS = 18;
/** Room kept on the right when fitting, for the zoom buttons. */
const CONTROLS_INSET = 56;
/** The zoom buttons' column: three 44 px buttons, 8 px apart, 8 px from the top, plus a margin. */
const CONTROLS_HEIGHT = 8 + 3 * 44 + 2 * 8 + 8;
const EASE_MS = 600;
const LABEL_HEIGHT = 14;

/** Where a label's text goes for each spot, relative to its dot (screen px). */
function labelText(spot: LabelSpot, r: number): { x: number; y: number; anchor: "middle" | "start" | "end" } {
  const d = r * 0.7 + 2; // matches labelSpots
  switch (spot) {
    case "right":
      return { x: r + 4, y: 4, anchor: "start" };
    case "left":
      return { x: -r - 4, y: 4, anchor: "end" };
    case "above":
      return { x: 0, y: -r - 5, anchor: "middle" };
    case "below-right":
      return { x: d + 2, y: d + 11, anchor: "start" };
    case "below-left":
      return { x: -d - 2, y: d + 11, anchor: "end" };
    case "above-right":
      return { x: d + 2, y: -d - 3, anchor: "start" };
    case "above-left":
      return { x: -d - 2, y: -d - 3, anchor: "end" };
    default:
      return { x: 0, y: r + 13, anchor: "middle" };
  }
}

/** False in the server's HTML and until React has taken over the page; true after. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true, // the server and first paint assume no motion: nothing animates before we know
  );
}

export function NetworkMap({ people, today }: { people: MapPerson[]; today: string }) {
  const graph = useMemo(() => buildGraph(people), [people]);
  const range = useMemo(() => growthRange(graph.nodes, today), [graph, today]);
  const totalDays = range ? daysBetween(range.first, range.last) : 0;
  // The slider: 0 … totalDays is a day; totalDays + 1 (the far right) is everyone.
  const [step, setStep] = useState<number | null>(null);
  const day = range && step !== null && step <= totalDays ? addDays(range.first, step) : null;
  const visible = useMemo(() => visibleOn(graph.nodes, day), [graph, day]);
  const summary = visibleSummary(graph, visible);
  const list = useMemo(() => networkList(graph, visible), [graph, visible]);

  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [logFor, setLogFor] = useState<LogTarget | null>(null);
  const [adding, setAdding] = useState(false);
  useLayoutEffect(
    () => () => {
      setSheetFor(null);
      setLogFor(null);
      setAdding(false);
    },
    [],
  );

  // A dot isn't focusable, so when its sheet closes focus goes to the heading.
  const heading = useRef<HTMLHeadingElement>(null);
  const fromDot = useRef(false);

  const words = summaryText(summary).replace(/\.$/, "");
  const headline = day ? `On ${formatDay(day, today)}: ${words.toLowerCase()}.` : `${words}.`;

  return (
    <>
      <header>
        <h1 ref={heading} tabIndex={-1} className="text-title font-semibold tracking-tight outline-none">
          Your network
        </h1>
        <p className="mt-2 text-ink-muted tabular-nums">{graph.nodes.length === 0 ? "Just you, for now." : headline}</p>
      </header>

      {graph.nodes.length === 0 ? (
        <div className="mt-8 flex flex-col items-start gap-5">
          <div aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-accent-fill text-sm font-semibold text-on-accent">
            You
          </div>
          <p className="text-lead text-ink-muted">Your map starts with you. Add the people you meet, and who introduced them, and it grows from here.</p>
          <Button block={false} onClick={() => setAdding(true)}>
            <PlusIcon size={18} />
            Add a person
          </Button>
          <ContactDialog open={adding} onClose={() => setAdding(false)} today={today} people={[]} />
        </div>
      ) : (
        <>
          <MapFrame
            graph={graph}
            visible={visible}
            selected={sheetFor}
            onSelect={(id) => {
              fromDot.current = true;
              setSheetFor(id);
            }}
            summary={headline}
          />
          {range && <GrowthSlider range={range} totalDays={totalDays} step={step} onStep={setStep} today={today} everyone={graph.nodes.length} />}
          <section aria-labelledby="network-list" className="mt-8">
            <h2 id="network-list" className="text-section font-semibold tracking-tight">
              The same network, as a list
            </h2>
            <p className="mt-1 text-sm text-ink-muted">You met these people yourself; who each one introduced is listed under them.</p>
            <NetworkList
              items={list}
              onOpen={(id) => {
                fromDot.current = false;
                setSheetFor(id);
              }}
            />
          </section>
        </>
      )}

      <PersonSheet
        personId={sheetFor}
        onClose={() => {
          setSheetFor(null);
          if (fromDot.current) {
            fromDot.current = false;
            // After the sheet hands focus back to whatever opened it (nothing focusable, for a dot).
            requestAnimationFrame(() => heading.current?.focus());
          }
        }}
        onLog={(person) => {
          fromDot.current = false;
          setSheetFor(null);
          setLogFor(person);
        }}
        today={today}
      />
      <LogSheet person={logFor} onClose={() => setLogFor(null)} today={today} />
    </>
  );
}

type FrameProps = {
  graph: ReturnType<typeof buildGraph>;
  visible: ReadonlySet<string>;
  selected: string | null;
  onSelect: (id: string) => void;
  summary: string;
};

function MapFrame({ graph, visible, selected, onSelect, summary }: FrameProps) {
  const reduceMotion = useReducedMotion();
  const frame = useRef<HTMLDivElement>(null);
  const stage = useRef<SVGGElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Laid out only in the browser (never during server render), once per shape of the network.
  const hydrated = useHydrated();
  const layout = useMemo(() => (hydrated ? layoutFor(graph) : null), [hydrated, graph]);
  // The ease from the radial start to the settled spots: only the first
  // time this layout is shown, and only with motion allowed.
  const easing = Boolean(layout?.first) && !reduceMotion;
  const [moved, setMoved] = useState(false);
  const [eased, setEased] = useState(false);
  // During a gesture the view lives in a ref and is written straight to the
  // SVG (no React work per move); when the gesture ends it's committed to
  // state, which is what renders.
  const view = useRef<View>({ k: 1, tx: 0, ty: 0 });
  const [committed, setCommitted] = useState<View>({ k: 1, tx: 0, ty: 0 });
  const k = committed.k;
  const fitScale = useRef(0.4);
  const placed = useRef(false);
  const gestures = useRef(new Gestures());

  const radius = useCallback((id: string) => (id === YOU ? YOU_RADIUS : dotRadius(graph.nodes.find((n) => n.id === id)?.interactions ?? 0)), [graph]);

  // Shown: the next time this shape comes round, it doesn't ease again.
  useEffect(() => {
    if (layout) markShown(layout.key);
  }, [layout]);

  // Measure the frame.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const apply = useCallback((next: View) => {
    view.current = next;
    stage.current?.setAttribute("transform", `translate(${next.tx} ${next.ty}) scale(${next.k})`);
    svg.current?.style.setProperty("--inv", String(1 / next.k));
    svg.current?.style.setProperty("--plate", String(plateScale(next.k)));
  }, []);

  const commitView = useCallback(() => setCommitted({ ...view.current }), []);

  const fit = useCallback(() => {
    if (!layout || !size) return;
    const points = [...layout.positions.entries()].map(([id, p]) => ({ ...p, r: radius(id) + 24 }));
    // Fit in the part of the frame left of the zoom buttons.
    const next = fitView(boundsOf(points), Math.max(size.w - CONTROLS_INSET, 120), size.h, 16);
    fitScale.current = next.k;
    apply(next);
    commitView();
  }, [layout, size, radius, apply, commitView]);

  // Fit the first time there's a layout and a size; keep the view after that (it survives coming back).
  useEffect(() => {
    if (layout && size && !placed.current) {
      placed.current = true;
      fit();
    }
  }, [layout, size, fit]);

  // The ease: two frames at the start positions, then the settled ones
  // with a transition; the transition is dropped once it has played, so
  // nothing lags behind a later zoom.
  useEffect(() => {
    if (!easing) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setMoved(true));
    });
    const done = setTimeout(() => setEased(true), EASE_MS + 150);
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      clearTimeout(done);
    };
  }, [easing]);
  const atStart = easing && !moved;
  const transitioning = easing && moved && !eased;

  // Gestures: pointers for pan / pinch / tap, a native non-passive wheel for zoom.
  const local = (e: { clientX: number; clientY: number }) => {
    const box = frame.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      apply(zoomAt(view.current, Math.exp(-e.deltaY * 0.0015), p.x, p.y, fitScale.current));
      if (timer) clearTimeout(timer);
      timer = setTimeout(commitView, 120);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (timer) clearTimeout(timer);
    };
  }, [apply, commitView]);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return; // the primary button or a finger only: a right-click opens nothing
    frame.current?.setPointerCapture(e.pointerId);
    gestures.current.down(e.pointerId, local(e));
  }

  function onPointerMove(e: React.PointerEvent) {
    const step = gestures.current.move(e.pointerId, local(e));
    if (step.kind === "pan") {
      apply({ ...view.current, tx: view.current.tx + step.dx, ty: view.current.ty + step.dy });
    } else if (step.kind === "pinch") {
      const zoomed = zoomAt(view.current, step.factor, step.mid.x, step.mid.y, fitScale.current);
      apply({ ...zoomed, tx: zoomed.tx + step.shift.x, ty: zoomed.ty + step.shift.y });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const tap = gestures.current.up(e.pointerId);
    commitView();
    if (!tap || !layout) return;
    // A tap: the nearest visible dot within reach of the finger.
    const { k: scale, tx, ty } = view.current;
    let best: { id: string; d: number } | null = null;
    for (const n of graph.nodes) {
      if (!visible.has(n.id)) continue;
      const pos = layout.positions.get(n.id)!;
      const d = Math.hypot(pos.x * scale + tx - tap.x, pos.y * scale + ty - tap.y) - drawnRadius(dotRadius(n.interactions), scale);
      if (d <= TAP_REACH && (!best || d < best.d)) best = { id: n.id, d };
    }
    if (best) onSelect(best.id);
  }

  function onPointerCancel(e: React.PointerEvent) {
    gestures.current.cancel(e.pointerId);
    commitView();
  }

  const positionsNow = layout ? (atStart ? layout.start : layout.positions) : null;

  // Which labels show, and where: all that fit up to 40 people, else only when zoomed in (or the tapped one).
  const labels = useMemo(() => {
    if (!layout) return new Map<string, LabelSpot>();
    const showAll = graph.nodes.length <= ALL_LABELS_UP_TO || k >= LABEL_ZOOM;
    const candidates = labelOrder(graph.nodes, selected).filter((n) => visible.has(n.id) && (showAll || n.id === selected));
    const youR = drawnRadius(YOU_RADIUS, k);
    const dotBoxes = [
      { id: YOU, x: -youR, y: -youR, width: 2 * youR, height: 2 * youR },
      ...graph.nodes
        .filter((n) => visible.has(n.id))
        .map((n) => {
          const p = layout.positions.get(n.id)!;
          const r = drawnRadius(dotRadius(n.interactions), k);
          return { id: n.id, x: p.x * k - r, y: p.y * k - r, width: 2 * r, height: 2 * r };
        }),
    ];
    // The frame's edges and the zoom buttons block labels too, so a label
    // never hangs off the map or sits under a button (label space is
    // screen px around You; the view's offset turns it into the frame's).
    if (size) {
      const { tx, ty } = committed;
      const edge = 4;
      const far = 1e6;
      const [left, top, right, bottom] = [-tx + edge, -ty + edge, size.w - tx - edge, size.h - ty - edge];
      dotBoxes.push(
        { id: "frame", x: left - far, y: -far, width: far, height: 2 * far },
        { id: "frame", x: right, y: -far, width: far, height: 2 * far },
        { id: "frame", x: -far, y: top - far, width: 2 * far, height: far },
        { id: "frame", x: -far, y: bottom, width: 2 * far, height: far },
        { id: "frame", x: size.w - CONTROLS_INSET - tx, y: -ty, width: CONTROLS_INSET, height: CONTROLS_HEIGHT },
      );
    }
    return placeLabels(
      candidates.map((n) => {
        const p = layout.positions.get(n.id)!;
        const width = [...labelFor(n.name)].length * 6.6 + 4;
        return { id: n.id, spots: labelSpots(p.x * k, p.y * k, drawnRadius(dotRadius(n.interactions), k), width, LABEL_HEIGHT) };
      }),
      dotBoxes,
    );
  }, [layout, graph, k, committed, size, selected, visible]);

  const zoomBy = (factor: number) => {
    if (!size) return;
    apply(zoomAt(view.current, factor, (size.w - CONTROLS_INSET) / 2, size.h / 2, fitScale.current));
    commitView();
  };

  return (
    <div className="relative mt-5">
      <div
        ref={frame}
        className="relative h-[min(60dvh,520px)] touch-none overflow-hidden rounded-(--radius-card) border border-line-strong bg-surface select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {!positionsNow && <p className="absolute inset-0 flex items-center justify-center text-ink-muted">Laying out…</p>}
        {positionsNow && (
          <svg
            ref={svg}
            width="100%"
            height="100%"
            role="img"
            aria-label={`Network map. ${summary} The same network is listed below the map.`}
            style={{ ["--inv" as string]: 1 / committed.k, ["--plate" as string]: plateScale(committed.k) }}
          >
            <g ref={stage} transform={`translate(${committed.tx} ${committed.ty}) scale(${committed.k})`}>
              <g className={atStart || transitioning ? "opacity-0" : "opacity-100 transition-opacity duration-(--motion-base)"}>
                {graph.nodes.map((n) => {
                  if (!visible.has(n.id) || (n.parent !== YOU && !visible.has(n.parent))) return null;
                  const a = positionsNow.get(n.parent)!;
                  const b = positionsNow.get(n.id)!;
                  return (
                    <line
                      key={n.id}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="var(--edge)"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </g>
              {graph.nodes.map((n) => {
                const p = positionsNow.get(n.id)!;
                const r = dotRadius(n.interactions);
                const shown = visible.has(n.id);
                const spot = labels.get(n.id);
                const text = spot ? labelText(spot, drawnRadius(r, k)) : null;
                return (
                  // Position (eased once) on the outer group; screen-size scaling and fading on the inner one.
                  <g
                    key={n.id}
                    className={transitioning ? "transition-transform duration-[600ms] ease-(--ease-out)" : ""}
                    style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
                  >
                    <g
                      data-node={n.id}
                      className={`motion-safe:transition-opacity motion-safe:duration-(--motion-base) ${shown ? "" : "pointer-events-none opacity-0"}`}
                      style={{ transform: "scale(var(--inv))" }}
                    >
                      <g style={{ transform: `scale(max(var(--plate), ${Math.min(r, MIN_DRAWN) / r}))` }}>
                        <circle r={r} fill="var(--surface)" stroke={n.id === selected ? "var(--accent)" : "var(--edge)"} strokeWidth={n.id === selected ? 2.5 : 1.5} />
                        <g transform={`translate(${-r * 0.6} ${-r * 0.6}) scale(${(r * 1.2) / 16})`} color={TONE_FILL[stageTone(n.stage)]}>
                          <StageShape stage={n.stage} />
                        </g>
                      </g>
                      {text && (
                        <text
                          x={text.x}
                          y={text.y}
                          textAnchor={text.anchor}
                          className="fill-ink text-xs font-medium"
                          stroke="var(--surface)"
                          strokeWidth={6}
                          strokeLinejoin="round"
                          paintOrder="stroke"
                        >
                          {labelFor(n.name)}
                        </text>
                      )}
                    </g>
                  </g>
                );
              })}
              <g style={{ transform: "scale(var(--inv)) scale(var(--plate))" }}>
                <circle r={YOU_RADIUS} fill="var(--accent-fill)" />
                <text y={5} textAnchor="middle" className="fill-on-accent text-xs font-semibold">
                  You
                </text>
              </g>
            </g>
          </svg>
        )}
      </div>
      <div className="absolute top-2 right-2 flex flex-col gap-2">
        <MapButton label="Zoom in" onClick={() => zoomBy(1.4)}>
          <PlusIcon />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => zoomBy(1 / 1.4)}>
          <MinusIcon />
        </MapButton>
        <MapButton label="Fit the whole network" onClick={fit}>
          <FitIcon />
        </MapButton>
      </div>
      <p className="mt-2 text-sm text-ink-muted">Drag to move · pinch to zoom · tap a person</p>
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-(--radius-field) border border-edge bg-surface text-ink transition-colors duration-(--motion-fast) active:bg-surface-press"
    >
      {children}
    </button>
  );
}

const PLAY_STEPS = 40;

function GrowthSlider({
  range,
  totalDays,
  step,
  onStep,
  today,
  everyone,
}: {
  range: { first: string; last: string };
  totalDays: number;
  step: number | null;
  onStep: (n: number | null) => void;
  today: string;
  everyone: number;
}) {
  const reduceMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  // How far Play has got: kept across the page being hidden and shown again (<Activity>).
  const progress = useRef(0);
  const value = step ?? totalDays + 1;
  const day = value <= totalDays ? addDays(range.first, value) : null;
  const all = `Today · all ${everyone}`;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      progress.current += 1;
      if (progress.current >= PLAY_STEPS) {
        onStep(null);
        setPlaying(false);
      } else {
        onStep(Math.round((totalDays * progress.current) / PLAY_STEPS));
      }
    }, 4000 / PLAY_STEPS);
    return () => clearInterval(timer);
  }, [playing, totalDays, onStep]);

  return (
    <div className="mt-5 flex flex-col gap-1">
      {/* min-h-11: the row is as tall before the Play button appears (after hydration) as after, so nothing jumps. */}
      <div className="flex min-h-11 items-center justify-between gap-3">
        <label htmlFor="growth" className="text-sm font-medium text-ink-muted">
          Your network on: <span className="font-semibold text-ink tabular-nums">{day ? formatDay(day, today) : all}</span>
        </label>
        {!reduceMotion && (
          <Button
            variant="secondary"
            size="sm"
            block={false}
            onClick={() => {
              if (playing) return setPlaying(false);
              progress.current = 0;
              onStep(0);
              setPlaying(true);
            }}
          >
            {playing ? "Stop" : "Watch it grow"}
          </Button>
        )}
      </div>
      <input
        id="growth"
        type="range"
        min={0}
        max={totalDays + 1}
        step={1}
        value={value}
        aria-valuetext={day ? formatDay(day, today) : `Today, all ${everyone} people`}
        onChange={(e) => {
          setPlaying(false);
          const n = Number(e.target.value);
          onStep(n > totalDays ? null : n);
        }}
        className="growth-range"
        style={{ ["--fill" as string]: `${(value / (totalDays + 1)) * 100}%` }}
      />
      <div aria-hidden="true" className="flex justify-between text-sm text-ink-muted tabular-nums">
        <span>{formatDay(range.first, today)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function NetworkList({ items, onOpen, depth = 0 }: { items: ListItem[]; onOpen: (id: string) => void; depth?: number }) {
  if (items.length === 0) return depth === 0 ? <p className="mt-3 text-ink-muted">No one on this day yet.</p> : null;
  return (
    // Nesting stays in the markup at every depth; the visual indent stops after 4 levels.
    <ul className={depth === 0 ? "mt-3 flex flex-col" : depth < 4 ? "ml-4 border-l border-line pl-3" : ""}>
      {items.map(({ node, children }) => (
        <li key={node.id}>
          <button
            type="button"
            onClick={() => onOpen(node.id)}
            className="-mx-2 flex min-h-14 w-[calc(100%+1rem)] items-center gap-3 rounded-(--radius-field) px-2 py-2 text-left transition-colors duration-(--motion-fast) active:bg-surface-press"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-semibold">{node.name}</span>
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <StageLabel stage={node.stage} className="shrink-0" />
                <span aria-hidden="true" className="text-ink-muted">
                  ·
                </span>
                <span className="min-w-0 truncate text-ink-muted">
                  {[node.company, `${node.interactions} ${node.interactions === 1 ? "interaction" : "interactions"}`].filter(Boolean).join(" · ")}
                </span>
              </span>
            </span>
            <ChevronRightIcon size={18} className="shrink-0 text-ink-muted" />
          </button>
          {children.length > 0 && (
            <>
              <p className="sr-only">Introduced you to:</p>
              <NetworkList items={children} onOpen={onOpen} depth={depth + 1} />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
