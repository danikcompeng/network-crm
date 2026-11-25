// The Today screen, as pure functions (plans/crm.md, Feature 4): who's in
// "Follow up" (today and overdue) and "Coming up" (the next 7 days), in
// what order, and the words on each card. Uses lib/follow-up.ts's buckets,
// so People, a person's page and Today never disagree.

import { daysBetween } from "./dates";
import { followUpBucket, followUpLabel } from "./follow-up";
import { formatDay, formatWeekday } from "./format";
import type { Stage } from "./crm";

export type TodayPerson = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  how_met: string | null;
  stage: Stage;
  next_follow_up: string | null;
  /** The last day you talked (crm_contact_stats), null if never. */
  last_day: string | null;
};

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export type TodayView<T extends TodayPerson> = {
  /** Today and overdue: most overdue first, then by name. */
  followUp: T[];
  /** today + 1 … today + 7: soonest first, then by name. */
  comingUp: T[];
  /** The soonest follow-up after the next 7 days, for "Next: …" when nothing is due. */
  next: T | null;
  /** Anyone with a follow-up at all. */
  anyFollowUps: boolean;
};

export function buildToday<T extends TodayPerson>(people: readonly T[], today: string): TodayView<T> {
  const withDate = people.filter((p): p is T & { next_follow_up: string } => p.next_follow_up !== null);
  const byDayThenName = (a: T & { next_follow_up: string }, b: T & { next_follow_up: string }) =>
    (a.next_follow_up < b.next_follow_up ? -1 : a.next_follow_up > b.next_follow_up ? 1 : 0) || collator.compare(a.name, b.name);
  const followUp = withDate.filter((p) => ["overdue", "today"].includes(followUpBucket(p.next_follow_up, today))).sort(byDayThenName);
  const comingUp = withDate.filter((p) => followUpBucket(p.next_follow_up, today) === "soon").sort(byDayThenName);
  const later = withDate.filter((p) => followUpBucket(p.next_follow_up, today) === "later").sort(byDayThenName);
  return { followUp, comingUp, next: later[0] ?? null, anyFollowUps: withDate.length > 0 };
}

/** The badge on a due card, in the same words as People: "9 days overdue", "1 day overdue", or "Today". */
export function dueBadge(day: string, today: string): { text: string; overdue: boolean } {
  return { text: followUpLabel(day, today), overdue: followUpBucket(day, today) === "overdue" };
}

/** "Last contact today", "… yesterday", "… 23 days ago", "No contact yet". */
export function lastContact(lastDay: string | null, today: string): string {
  if (!lastDay) return "No contact yet";
  // A day after today (logged further east, then travelled west) counts as today.
  const ago = daysBetween(lastDay, today);
  if (ago <= 0) return "Last contact today";
  if (ago === 1) return "Last contact yesterday";
  return `Last contact ${ago} days ago`;
}

/** A coming-up row's day: "Tomorrow", else "Thu, Nov 27". */
export function comingUpDay(day: string, today: string): string {
  return daysBetween(today, day) === 1 ? "Tomorrow" : formatWeekday(day);
}

/** "Next: Kofi Mensah, Dec 8", for when nothing is due or coming up. */
export function nextHint(person: TodayPerson | null, today: string): string | null {
  if (!person?.next_follow_up) return null;
  return `Next: ${person.name}, ${formatDay(person.next_follow_up, today)}`;
}

/**
 * Up to two letters for an avatar: first letters of the first and last
 * words ("José Álvarez" → "JÁ", "Leo" → "L"), as whole characters (so an
 * emoji or an accented letter is never cut in half), upper-cased.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return "?";
  const first = firstGrapheme(words[0]);
  const last = words.length > 1 ? firstGrapheme(words[words.length - 1]) : "";
  return (first + last).toLocaleUpperCase("en");
}

/** "Tuesday, November 24" for the top of Today (from the YYYY-MM-DD string, in UTC, so it never shifts). */
export function longDay(day: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

/** The first character as people see it: a flag or a joined emoji stays whole. */
function firstGrapheme(word: string): string {
  return segmenter.segment(word)[Symbol.iterator]().next().value?.segment ?? "";
}
