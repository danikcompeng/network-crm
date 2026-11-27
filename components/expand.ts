// A person's row or card growing into their page (plans/crm.md, Motion
// polish). The page is a React <ViewTransition name="person-page">
// (components/person-page-transition.tsx); the other end is the element
// you tapped (`data-expand="<id>"`: a People row, a Today follow-up card,
// through its sheet). Giving it the same view-transition name pairs the
// two, and the browser grows one into the other.
//
// A name lives for one transition only: it's put on at the tap and taken
// off as soon as the page's transition starts, or after 2 s, so a later,
// unrelated navigation (adding someone new) never pairs with an old row.
//
// Going back doesn't shrink it: People and Today load their lists fresh on
// every visit (a skeleton first), so the row isn't there yet when the
// browser takes its picture (and the browser's own Back carries no
// transition type, so nothing is set to animate). Back stays an instant
// swap.

export const EXPAND_NAME = "person-page";
/** The navigation's transition type when something grows (the screen behind then fades out instead of vanishing). */
export const EXPAND_TYPE = "person-expand";

/** The longest a hand-set name may stay on, if no transition takes it off first. */
const MAX_NAMED_MS = 2000;

let clearTimer: ReturnType<typeof setTimeout> | undefined;

function expandables(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-expand]")];
}

/** Takes every hand-set name off. */
export function clearExpand() {
  clearTimeout(clearTimer);
  for (const el of expandables()) el.style.viewTransitionName = "";
}

function onScreen(el: HTMLElement): boolean {
  if (!el.checkVisibility()) return false;
  const box = el.getBoundingClientRect();
  return box.bottom > 0 && box.top < window.innerHeight && box.height > 0;
}

function name(el: HTMLElement) {
  clearExpand();
  el.style.viewTransitionName = EXPAND_NAME;
  clearTimer = setTimeout(clearExpand, MAX_NAMED_MS);
}

/** A tap on a row or card that opens its person's page: it grows into it. */
export function expandFrom(el: HTMLElement) {
  name(el);
}

/**
 * Opening person `id`'s page from somewhere else (their sheet): their card
 * on this screen grows, if it's on screen. Says whether it will.
 */
export function expandFromPerson(id: string): boolean {
  const el = expandables().find((e) => e.dataset.expand === id && onScreen(e));
  if (el) name(el);
  else clearExpand();
  return el !== undefined;
}
