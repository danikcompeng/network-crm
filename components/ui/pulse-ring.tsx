"use client";

// Pulse to confirm (plans/crm.md, Motion polish): a 2 px cobalt ring that
// moves out from its parent's edge and fades, once, over --motion-sheet.
// Put it in a `relative` box with a `key` that changes for each new
// confirmation. It says when it has played (`onDone`), so its owner can
// forget it and a row shown again never replays it. With Reduce Motion it
// isn't drawn at all (the words that come with it still confirm).

import { useEffect, useState } from "react";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PulseRing({ onDone, className = "rounded-(--radius-field)" }: { onDone?: () => void; className?: string }) {
  // Only ever mounted after a save (never in the server's HTML), so the media query can be read here.
  const [on, setOn] = useState(() => !reducedMotion());
  useEffect(() => {
    if (!on) onDone?.();
  }, [on, onDone]);
  if (!on) return null;
  return (
    <span
      aria-hidden="true"
      data-pulse=""
      onAnimationEnd={() => setOn(false)}
      className={`pointer-events-none absolute inset-0 motion-safe:animate-[confirm-ring_var(--motion-sheet)_var(--ease-out)_both] ${className}`}
    />
  );
}
