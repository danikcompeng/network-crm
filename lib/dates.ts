// Calendar days as "YYYY-MM-DD" strings. Pure functions, no database.
//
// Why timezones matter: Vercel's servers run on UTC. At 7 pm in Toronto
// it's already midnight in UTC, so "today" is always worked out in YOUR
// timezone, or tonight's run would land on tomorrow.
//
// Day maths (addDays, daysBetween) runs on UTC dates, where every day is
// exactly 24 hours, so a daylight-saving weekend can't skip or repeat a day.

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/** True for a real calendar day like "2026-11-23" (not "2026-02-30"). */
export function isValidDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  // new Date quietly rolls Feb 30 over to Mar 2, so check it round-trips.
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** True if `timeZone` is a zone name the runtime knows, like "America/Toronto". */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || timeZone === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function zoneOrUtc(timeZone: string | undefined): string {
  return isValidTimeZone(timeZone) ? timeZone : "UTC";
}

function partsIn(timeZone: string | undefined, now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zoneOrUtc(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day"), hour: Number(get("hour")), minute: Number(get("minute")) };
}

/** Today's date in `timeZone`, falling back to UTC if the zone is missing or unknown. */
export function todayIn(timeZone: string | undefined, now: Date = new Date()): string {
  const { year, month, day } = partsIn(timeZone, now);
  return `${year}-${month}-${day}`;
}

/** Minutes since local midnight in `timeZone` (0 to 1439), falling back to UTC. */
export function minutesIntoDay(timeZone: string | undefined, now: Date = new Date()): number {
  const { hour, minute } = partsIn(timeZone, now);
  return hour * 60 + minute;
}

/** addDays("2026-11-30", 1) -> "2026-12-01". */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`: daysBetween("2026-11-20", "2026-11-23") -> 3. Negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * A moment that falls at local noon on `day` in `timeZone`: used to
 * back-date the demo's people so "added on" is exactly that day there.
 *
 * Noon, not midnight: midnight doesn't exist on the days daylight saving
 * starts at 00:00 (Havana, Santiago), and noon stays on the same date for
 * anyone up to 11 hours away.
 *
 * Starts at noon UTC and moves by the difference between the local
 * wall-clock time and the noon we want. Two steps settle it in every zone,
 * even across a DST change.
 */
export function instantOnDay(day: string, timeZone: string | undefined): Date {
  let t = Date.parse(`${day}T12:00:00Z`);
  for (let i = 0; i < 3; i++) {
    const now = new Date(t);
    const offMinutes = daysBetween(todayIn(timeZone, now), day) * 1440 + (720 - minutesIntoDay(timeZone, now));
    if (offMinutes === 0) break;
    t += offMinutes * 60_000;
  }
  return new Date(t);
}

/** The `n` days ending with `today`, oldest first: lastDays("2026-11-23", 3) -> ["2026-11-21", "2026-11-22", "2026-11-23"]. */
export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}
