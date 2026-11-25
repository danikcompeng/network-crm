// A stage's shape (plans/crm.md, Feature 2), so a stage never relies on
// colour: new ○, reached out ◔, talking ●, interviewing ◆, offer ★,
// parked –. Drawn in currentColor; always shown beside the stage's name
// (lists) or announced with it (the map, Feature 5), so it's decorative.
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
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <StageShape stage={stage} />
    </svg>
  );
}
