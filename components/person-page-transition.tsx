"use client";

// The person page's half of the expand (plans/crm.md, Motion polish): the
// page as one view-transition element, so the row or card that opened it
// can grow into it (components/expand.ts). It sits in the page's static
// shell, outside the Suspense that loads the person, so it's there in the
// navigation's first commit (the person streams in inside it). It only
// takes part in a navigation from a row or card (the person-expand type);
// every other way in, leaving it, going from one person to another and
// content changing inside it (the person arriving, a refresh) start no
// transition, and a page with nothing to pair with just appears.

import { ViewTransition, type ReactNode } from "react";
import { EXPAND_NAME, EXPAND_TYPE, clearExpand } from "@/components/expand";

export function PersonPageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      name={EXPAND_NAME}
      // Only a navigation from a row or card (its type): opening someone
      // from the map, a chain link or Add person starts no transition.
      enter={{ [EXPAND_TYPE]: "person-expand", default: "none" }}
      exit="none"
      share="none"
      update="none"
      default="none"
      // The pictures are taken: the hand-set name can go.
      onEnter={clearExpand}
    >
      {children}
    </ViewTransition>
  );
}

/**
 * A screen a card can grow out of (People, Today): when it does, the rest
 * of the screen fades out under it instead of vanishing. Only for that
 * navigation (its transition type); any other way of leaving stays
 * instant, and nothing animates when it's shown.
 */
export function ExpandSourceScreen({ children }: { children: ReactNode }) {
  return (
    <ViewTransition exit={{ [EXPAND_TYPE]: "screen-fade", default: "none" }} enter="none" update="none" share="none" default="none">
      {children}
    </ViewTransition>
  );
}
