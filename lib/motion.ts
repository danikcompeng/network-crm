// Orbit's motion timings (plans/crm.md, Design direction). The same
// numbers are CSS variables in app/globals.css (--motion-*), for classes
// like duration-(--motion-fast); lib/motion.test.ts checks the two match.

export const MOTION = {
  /** Answer to a tap: press, colour changes. */
  fast: 150,
  /** A state change: a filter applied, a row updated. */
  base: 200,
  /** A sheet sliding up. */
  sheet: 250,
} as const;

/** Quick to start, gentle to land: cubic-bezier(0.2, 0.8, 0.2, 1). */
export const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";
