// Checking an interaction before it's logged, and the follow-up offer
// after it (plans/crm.md, Feature 4). Pure and tested.

import { checkDay, length, tidyText } from "./contact-input";
import { LIMITS, isInteractionKind, type InteractionKind } from "./crm";
import { addDays } from "./dates";
import { formatDay } from "./format";

export type InteractionInput = { kind: InteractionKind; note: string | null; day: string };

/**
 * A kind, an optional note, and an optional day (none: `today`). The day
 * can't be after `today` (you can't have talked tomorrow).
 */
export function checkInteraction(
  raw: { kind?: unknown; note?: unknown; day?: unknown },
  today: string,
): { ok: true; value: InteractionInput } | { ok: false; message: string } {
  if (!isInteractionKind(raw.kind)) return { ok: false, message: "Pick what kind of contact it was." };
  const note = tidyText(raw.note);
  if (note && length(note) > LIMITS.interactionNote) {
    return { ok: false, message: `Keep the note to ${LIMITS.interactionNote.toLocaleString("en-US")} characters.` };
  }
  const day = checkDay(raw.day);
  if (day === undefined) return { ok: false, message: "Pick a real date." };
  if (day && day > today) return { ok: false, message: "That's in the future. Pick today or an earlier day." };
  return { ok: true, value: { kind: raw.kind, note, day: day ?? today } };
}

/** How far ahead the offered follow-up is. */
export const FOLLOW_UP_AFTER_DAYS = 7;

export type FollowUpOffer = {
  /** The day the offer suggests: the logged day + 7, but never before today. */
  suggested: string;
  /** The follow-up still set after the log (it was later than the log), which the offer would move. */
  replaces: string | null;
  /** The question, in words. */
  question: string;
};

/**
 * After logging an interaction on `loggedDay`: suggest a follow-up a week
 * later. If one is still set (it was after the log, so the log didn't
 * clear it), the offer is to move it; "Not now" keeps it.
 */
export function followUpOffer(loggedDay: string, stillSet: string | null, today: string): FollowUpOffer {
  const week = addDays(loggedDay, FOLLOW_UP_AFTER_DAYS);
  const suggested = week < today ? addDays(today, FOLLOW_UP_AFTER_DAYS) : week;
  if (stillSet && stillSet !== suggested) {
    return { suggested, replaces: stillSet, question: `Move the follow-up from ${formatDay(stillSet, today)} to:` };
  }
  return { suggested, replaces: null, question: "Follow up again on:" };
}

const LOGGED: Record<InteractionKind, string> = {
  message: "a message",
  email: "an email",
  call: "a call",
  meeting: "a meeting",
  applied: "an application update",
  other: "a contact",
};

/** "Logged a call with Riya Patel." */
export function loggedWords(kind: InteractionKind, name: string): string {
  return `Logged ${LOGGED[kind]} with ${name}.`;
}
