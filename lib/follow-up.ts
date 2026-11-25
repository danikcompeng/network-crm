// Follow-ups: which bucket a day falls in, and how to say it
// (plans/crm.md, Features 2 and 4). One definition for the people list,
// a contact's page and the Today screen, so they never disagree.
//
//   overdue: before today
//   today:   today
//   soon:    today + 1 ... today + 7 (inclusive)
//   later:   after today + 7
//
// Every comparison is calendar-day maths on "YYYY-MM-DD" strings in the
// viewer's timezone (lib/dates.ts), never timestamps.

import { daysBetween } from "./dates";
import { formatDay } from "./format";

export type FollowUpBucket = "overdue" | "today" | "soon" | "later";

/** How many days after today "soon" reaches (inclusive). */
export const SOON_DAYS = 7;

export function followUpBucket(day: string, today: string): FollowUpBucket {
  const inDays = daysBetween(today, day);
  if (inDays < 0) return "overdue";
  if (inDays === 0) return "today";
  if (inDays <= SOON_DAYS) return "soon";
  return "later";
}

/** "3 days overdue", "1 day overdue", "Today", "Tomorrow", "In 5 days", "Dec 9". */
export function followUpLabel(day: string, today: string): string {
  const inDays = daysBetween(today, day);
  if (inDays < 0) return `${-inDays} ${inDays === -1 ? "day" : "days"} overdue`;
  if (inDays === 0) return "Today";
  if (inDays === 1) return "Tomorrow";
  if (inDays <= SOON_DAYS) return `In ${inDays} days`;
  return formatDay(day, today);
}
