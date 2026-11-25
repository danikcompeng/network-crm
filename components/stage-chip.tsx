// A stage as its shape and its name (never colour alone). The colour
// only adds emphasis: muted, ink, or cobalt for interviewing and offer.
import { StageMark } from "@/components/stage-mark";
import { STAGE_LABELS, type Stage } from "@/lib/crm";
import { stageTone } from "@/lib/people";

export const TONE_CLASS = { muted: "text-ink-muted", ink: "text-ink", accent: "text-accent" } as const;

/** Inline: shape + name, no background (for rows). */
export function StageLabel({ stage, className = "" }: { stage: Stage; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${TONE_CLASS[stageTone(stage)]} ${className}`}>
      <StageMark stage={stage} size={12} />
      {STAGE_LABELS[stage]}
    </span>
  );
}

/** A badge: shape + name on a quiet fill, 6 px corners (round pills are filters you can tap). */
export function StageChip({ stage }: { stage: Stage }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md bg-surface-press px-2.5 py-1 text-sm font-medium ${TONE_CLASS[stageTone(stage)]}`}
    >
      <StageMark stage={stage} size={12} />
      {STAGE_LABELS[stage]}
    </span>
  );
}
