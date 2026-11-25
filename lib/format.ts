// Calendar days in words (plans/crm.md, Feature 2). A day is a
// "YYYY-MM-DD" string with no timezone; it's formatted in UTC from that
// string, so no viewer's timezone can shift it to the day before.

import { daysBetween } from "./dates";

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const WEEKDAY_MONTH_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** "Nov 24" in `today`'s year, "Nov 24, 2025" in any other. */
export function formatDay(day: string, today: string): string {
  return day.slice(0, 4) === today.slice(0, 4) ? MONTH_DAY.format(asDate(day)) : MONTH_DAY_YEAR.format(asDate(day));
}

/** "Mon, Nov 24": for headings like Today's date. */
export function formatWeekday(day: string): string {
  return WEEKDAY_MONTH_DAY.format(asDate(day));
}

/** "Today", "Yesterday", "3 days ago" within a week; otherwise the day. */
export function formatPastDay(day: string, today: string): string {
  const ago = daysBetween(day, today);
  if (ago === 0) return "Today";
  if (ago === 1) return "Yesterday";
  if (ago > 1 && ago < 7) return `${ago} days ago`;
  return formatDay(day, today);
}

/** "1 person", "3 people" (any noun with its plural). */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Talked today", "Talked yesterday", "Talked 3 days ago", "Talked Nov 17". */
export function talkedLabel(day: string, today: string): string {
  const past = formatPastDay(day, today);
  return `Talked ${past === "Today" || past === "Yesterday" ? past.toLowerCase() : past}`;
}
