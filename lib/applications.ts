// The applications list: counts, order, filter, search, and the rule for
// leaving "saved" (plans/crm.md, Feature 3). Pure and tested.

import { APPLICATION_STATUSES, type ApplicationStatus } from "./crm";
import { daysBetween } from "./dates";
import { formatDay } from "./format";
import { fold, searchWords } from "./people";

export type ApplicationRow = {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  applied_on: string | null;
  deadline: string | null;
  link: string | null;
  location: string | null;
  contact_id: string | null;
  notes: string | null;
  updated_at: string;
};

/**
 * What the three tiles count (by current status: an interview that ended
 * in a rejection leaves "In process"). Not named like the status chips, so
 * "Applied 20" and "Sent 52" can't be confused.
 */
export const TILES = {
  sent: { label: "Sent", statuses: ["applied", "online_assessment", "interviewing", "offer", "rejected", "withdrawn"] },
  in_process: { label: "In process", statuses: ["online_assessment", "interviewing"] },
  offers: { label: "Offers", statuses: ["offer"] },
} as const satisfies Record<string, { label: string; statuses: readonly ApplicationStatus[] }>;
export type Tile = keyof typeof TILES;

export type StatusFilter = ApplicationStatus | Tile | "all";

export function parseStatusFilter(value: string | null | undefined): StatusFilter {
  const v = value ?? "";
  if ((APPLICATION_STATUSES as readonly string[]).includes(v) || Object.hasOwn(TILES, v)) return v as StatusFilter;
  return "all";
}

export function inFilter(status: ApplicationStatus, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (Object.hasOwn(TILES, filter)) return (TILES[filter as Tile].statuses as readonly ApplicationStatus[]).includes(status);
  return status === filter;
}

/**
 * Saved first: upcoming deadlines (soonest first), then none, then passed
 * ones (most recent first), so an old passed deadline doesn't sit on top
 * forever. Then everything else by applied_on, newest first (none last).
 * Ties by company, then role, then id.
 */
export function applicationOrder(today: string) {
  const savedRank = (r: ApplicationRow) => (!r.deadline ? 1 : r.deadline >= today ? 0 : 2);
  return function byApplicationOrder(a: ApplicationRow, b: ApplicationRow): number {
    const aSaved = a.status === "saved";
    const bSaved = b.status === "saved";
    if (aSaved !== bSaved) return aSaved ? -1 : 1;
    if (aSaved) {
      const rank = savedRank(a) - savedRank(b);
      if (rank !== 0) return rank;
      if (a.deadline && b.deadline && a.deadline !== b.deadline) {
        const sooner = a.deadline < b.deadline ? -1 : 1;
        return savedRank(a) === 2 ? -sooner : sooner;
      }
    } else if (a.applied_on !== b.applied_on) {
    if (!a.applied_on) return 1;
    if (!b.applied_on) return -1;
    return a.applied_on > b.applied_on ? -1 : 1;
  }
    return (
      a.company.localeCompare(b.company, "en", { sensitivity: "base" }) ||
      a.role.localeCompare(b.role, "en", { sensitivity: "base" }) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  };
}

/** The visible list, the tile counts and each status's count (both follow the search, not the filter). */
export function filterApplications<T extends ApplicationRow>(
  rows: readonly T[],
  query: string,
  filter: StatusFilter,
  today: string,
): { visible: T[]; tiles: Record<Tile, number>; counts: Record<ApplicationStatus | "all", number> } {
  const words = searchWords(query);
  const found = rows.filter((r) => {
    const haystack = fold(`${r.company} ${r.role} ${r.location ?? ""}`);
    return words.every((w) => haystack.includes(w));
  });
  const counts = Object.fromEntries([["all", found.length], ...APPLICATION_STATUSES.map((s) => [s, 0])]) as Record<
    ApplicationStatus | "all",
    number
  >;
  for (const r of found) counts[r.status] += 1;
  const tiles = Object.fromEntries(
    (Object.keys(TILES) as Tile[]).map((t) => [t, found.filter((r) => inFilter(r.status, t)).length]),
  ) as Record<Tile, number>;
  const visible = found.filter((r) => inFilter(r.status, filter)).sort(applicationOrder(today));
  return { visible, tiles, counts };
}

/**
 * Changing status: leaving "saved" for anything else dates the application
 * today if it had no date (you just applied). Nothing else changes dates.
 */
export function statusChange(
  from: { status: ApplicationStatus; applied_on: string | null },
  to: ApplicationStatus,
  today: string,
): { status: ApplicationStatus; applied_on?: string } {
  if (from.status === "saved" && to !== "saved" && !from.applied_on) return { status: to, applied_on: today };
  return { status: to };
}

/** How loudly a status shows: never red (a rejection isn't an error). */
export function statusTone(status: ApplicationStatus): "muted" | "ink" | "accent" {
  if (status === "interviewing" || status === "offer") return "accent";
  if (status === "applied" || status === "online_assessment") return "ink";
  return "muted";
}

/**
 * The date a row shows: "Applied Nov 3" once sent; for a saved one its
 * deadline ("Deadline Dec 1", "Deadline today", "Deadline passed") or
 * nothing. The tone follows follow-ups: passed is danger, today is ink
 * (bold), everything else muted, and the words carry it either way.
 */
export function rowDate(
  row: Pick<ApplicationRow, "status" | "applied_on" | "deadline">,
  today: string,
): { text: string; tone: "danger" | "ink" | "muted" } | null {
  if (row.status !== "saved") return row.applied_on ? { text: `Applied ${formatDay(row.applied_on, today)}`, tone: "muted" } : null;
  if (!row.deadline) return null;
  const inDays = daysBetween(today, row.deadline);
  if (inDays < 0) return { text: "Deadline passed", tone: "danger" };
  if (inDays === 0) return { text: "Deadline today", tone: "ink" };
  return { text: `Deadline ${formatDay(row.deadline, today)}`, tone: "muted" };
}
