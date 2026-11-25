"use client";

// Shared by the 2D map and the 3D one (plans/crm.md, Features 5 and 7):
// the 44 px map buttons and the preferences read after hydration.

import { useSyncExternalStore } from "react";

/** Room kept on the right when fitting, for the map buttons. */
export const CONTROLS_INSET = 56;
/** The buttons' column: three 44 px buttons, 8 px apart, 8 px from the top, plus a margin. */
export const CONTROLS_HEIGHT = 8 + 3 * 44 + 2 * 8 + 8;
/** A tap picks the nearest person within this many screen px of their dot's edge. */
export const TAP_REACH = 22;

/** False in the server's HTML and until React has taken over the page; true after. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function useReducedMotion(): boolean {
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

export function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
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
