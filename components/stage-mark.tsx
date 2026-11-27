"use client";

// A stage's shape (plans/crm.md, Feature 2), so a stage never relies on
// colour: new ○, reached out ◔, talking ●, interviewing ◆, offer ★,
// parked –. Drawn in currentColor; always shown beside the stage's name
// (lists) or announced with it (the map, Feature 5), so it's decorative.
// When the stage changes, the old shape fades out into a slight blur as
// the new one fades in, in the same spot (Motion polish); with Reduce
// Motion the new one just appears.
import { useLayoutEffect, useState } from "react";
import type { Stage } from "@/lib/crm";

/** The shape's SVG, drawn in a 16 x 16 box centred on (8, 8). Shared with the map. */
export function StageShape({ stage }: { stage: Stage }) {
  switch (stage) {
    case "new":
      return <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" />;
    case "reached_out":
      return (
        <>
          <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 8V2.75A5.25 5.25 0 0 1 13.25 8Z" fill="currentColor" />
        </>
      );
    case "talking":
      return <circle cx="8" cy="8" r="6" fill="currentColor" />;
    case "interviewing":
      return <path d="M8 1.5L14.5 8L8 14.5L1.5 8Z" fill="currentColor" />;
    case "offer":
      return (
        <path
          d="M8 1.2l1.95 4.1 4.5.55-3.3 3.1.85 4.45L8 11.2l-4 2.2.85-4.45-3.3-3.1 4.5-.55Z"
          fill="currentColor"
          strokeLinejoin="round"
        />
      );
    case "parked":
      return <rect x="2.5" y="6.75" width="11" height="2.5" rx="1.25" fill="currentColor" />;
  }
}

export function StageMark({ stage, size = 14, className = "" }: { stage: Stage; size?: number; className?: string }) {
  // The shape on show, and the one fading out after a change (none on the first render).
  const [shown, setShown] = useState(stage);
  const [leaving, setLeaving] = useState<Stage | null>(null);
  if (stage !== shown) {
    setShown(stage);
    // With Reduce Motion the new shape just appears (no old one kept).
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setLeaving(reduced ? null : shown);
  }
  // A page being hidden (<Activity>) finishes the swap at once (its
  // animation is cancelled, not ended), so it never replays on the way back.
  useLayoutEffect(() => () => setLeaving(null), []);
  const done = () => setLeaving(null);
  const layer = "col-start-1 row-start-1";
  return (
    <span aria-hidden="true" data-stage-mark={shown} className={`inline-grid shrink-0 ${className}`} style={{ width: size, height: size }}>
      {leaving && (
        <svg
          key={`out-${leaving}`}
          data-leaving=""
          width={size}
          height={size}
          viewBox="0 0 16 16"
          focusable="false"
          onAnimationEnd={done}
          className={`${layer} motion-safe:animate-[glyph-out_var(--motion-base)_var(--ease-out)_both] motion-reduce:hidden`}
        >
          <StageShape stage={leaving} />
        </svg>
      )}
      <svg
        key={shown}
        width={size}
        height={size}
        viewBox="0 0 16 16"
        focusable="false"
        className={`${layer} ${leaving ? "motion-safe:animate-[glyph-in_var(--motion-base)_var(--ease-out)_both]" : ""}`}
      >
        <StageShape stage={shown} />
      </svg>
    </span>
  );
}
