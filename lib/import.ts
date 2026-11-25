// Importing applications by pasting rows from a spreadsheet or a CSV file
// (plans/crm.md, Feature 3, with the logic check's decisions). Pure:
// parse, read the columns, read each value, find duplicates, summarise.
// Nothing is saved here; the preview shows exactly what will be, and the
// server action checks it all again (including duplicates).

import { APPLICATION_STATUSES, LIMITS, type ApplicationStatus } from "./crm";
import { addDays } from "./dates";
import { fold } from "./people";

// ---------------------------------------------------------------------------
// 1. Text → rows of cells (RFC 4180, plus tabs).
// ---------------------------------------------------------------------------

/** Tab if the first line has one (a spreadsheet copy), else comma (CSV). */
export function detectDelimiter(text: string): "\t" | "," {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/, 1)[0] ?? "";
  return firstLine.includes("\t") ? "\t" : ",";
}

/**
 * In tab-separated text a cell is only quoted if its closing quote is
 * followed by a tab, a line end or the end: a spreadsheet copies
 * `"Rockstar" Intern` as it is, and treating that quote as an opening one
 * would swallow every row after it.
 */
function quoteCloses(input: string, from: number, delimiter: string): boolean {
  for (let i = from + 1; i < input.length; i++) {
    if (input[i] !== '"') continue;
    if (input[i + 1] === '"') {
      i += 1;
      continue;
    }
    const next = input[i + 1];
    return next === undefined || next === delimiter || next === "\r" || next === "\n";
  }
  return false;
}

/**
 * Rows of cells. Quotes may wrap a cell, and then it may hold the
 * delimiter, line breaks, and "" for a quote. Handles CRLF, a leading BOM,
 * and drops rows that are entirely empty.
 */
export function parseRows(text: string, delimiter = detectDelimiter(text)): string[][] {
  return parseRowsWithLines(text, delimiter).map((r) => r.cells);
}

/**
 * The same rows, each with the line it starts on in the pasted text
 * (1-based), so "Row 8" is row 8 of the spreadsheet even after a blank
 * line or a cell with a line break in it.
 */
export function parseRowsWithLines(text: string, delimiter = detectDelimiter(text)): { cells: string[]; line: number }[] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: { cells: string[]; line: number }[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  let line = 1;
  let rowStart = 1;
  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== "")) rows.push({ cells: row, line: rowStart });
    row = [];
  };
  while (i < input.length) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        if (ch === "\n" || (ch === "\r" && input[i + 1] !== "\n")) line += 1;
        cell += ch;
      }
      i += 1;
      continue;
    }
    if (ch === '"' && cell.trim() === "" && (delimiter === "," || quoteCloses(input, i, delimiter))) {
      cell = "";
      quoted = true;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === "\r" || ch === "\n") {
      endRow();
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      line += 1;
      rowStart = line;
    } else {
      cell += ch;
    }
    i += 1;
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

// ---------------------------------------------------------------------------
// 2. Which column is which.
// ---------------------------------------------------------------------------

export const IMPORT_FIELDS = ["company", "role", "applied_on", "status", "link", "location", "deadline", "notes"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  company: "Company",
  role: "Role",
  applied_on: "Applied on",
  status: "Status",
  link: "Link",
  location: "Location",
  deadline: "Deadline",
  notes: "Notes",
};

/**
 * Words a header cell contains, checked in this order so "Job Link" is a
 * link (not a role) and "Date Applied" a date (not a status).
 */
const HEADER_RULES: [ImportField, RegExp][] = [
  ["link", /\b(link|url|posting|website|href)\b/],
  ["deadline", /\b(deadline|due|closing|closes)\b/],
  ["applied_on", /\b(date|applied|submitted|when)\b/],
  ["status", /\b(status|stage|result|outcome|state|progress)\b/],
  ["location", /\b(location|city|place|where|office|country)\b/],
  ["notes", /\b(notes?|comments?|details|remarks)\b/],
  ["role", /\b(role|position|title|job|internship)\b/],
  ["company", /\b(company|employer|organi[sz]ation|org|firm|business)\b/],
];

/** The field a header cell names, or null. Only short cells without digits look like headers. */
export function headerField(cell: string): ImportField | null {
  const words = fold(cell).replace(/[^a-z0-9]+/g, " ").trim();
  if (words.split(" ").length > 3 || /\d/.test(words)) return null;
  return HEADER_RULES.find(([, pattern]) => pattern.test(words))?.[0] ?? null;
}

/** Without headers, columns are read in this order. */
export const DEFAULT_ORDER: readonly ImportField[] = ["company", "role", "applied_on", "status", "link", "location"];

export type Columns = { fromHeader: boolean; fields: (ImportField | null)[] };

/**
 * Headers when the first row names both a company and a role column
 * (each field matched once, the first column that names it); otherwise
 * the default order, with the first row kept as data.
 */
export function readColumns(firstRow: readonly string[]): Columns {
  const taken = new Set<ImportField>();
  const fields = firstRow.map((cell) => {
    const field = headerField(cell);
    if (!field || taken.has(field)) return null;
    taken.add(field);
    return field;
  });
  if (taken.has("company") && taken.has("role")) return { fromHeader: true, fields };
  return { fromHeader: false, fields: firstRow.map((_, i) => DEFAULT_ORDER[i] ?? null) };
}

// ---------------------------------------------------------------------------
// 3. Values: statuses, dates, links.
// ---------------------------------------------------------------------------

/**
 * Status words, folded, matched as whole words in this order: negatives
 * and rejections first ("No offer" is a rejection), then the rest.
 */
const STATUS_RULES: [RegExp, ApplicationStatus][] = [
  [/\b(not (yet )?applied|haven t applied|have not applied|didn t apply|did not apply|yet to apply)\b/, "saved"],
  [/\b(withdrawn|withdrew|withdraw|pulled out|declined (the |their )?offer|offer declined|turned (it )?down|i declined|no longer interested)\b/, "withdrawn"],
  [/\b(no|not|never|didn t|did not)( \w+){0,2} (accepted|interview\w*|offer\w*|selected|moving forward|progressing)\b/, "rejected"],
  [/\b(no|not) (accepted|interview\w*|offer\w*|selected|moving forward|progressing)\b/, "rejected"],
  [/\b(failed|rescinded)\b/, "rejected"],
  [/\b(no (response|reply|answer)( yet)?|pending|waiting|in review|under review)\b/, "applied"],
  [/\b(rejected|rejection|declined|denied|no|not selected|ghosted|closed|unsuccessful)\b/, "rejected"],
  [/\b(offer|offered|accepted)\b/, "offer"],
  [/\b(interview\w*|phone screen|screen|screening|onsite|on site|final round|superday)\b/, "interviewing"],
  [/\b(oa|online assessment|assessment|hackerrank|codesignal|coding test|test|challenge)\b/, "online_assessment"],
  [/\b(applied|submitted|sent)\b/, "applied"],
  [/\b(saved|to apply|wishlist|wish list|interested|planned|not applied|draft)\b/, "saved"],
];

/** A status from a spreadsheet's words; `known` false when it had to guess "applied". */
export function readStatus(raw: string): { status: ApplicationStatus; known: boolean } {
  const s = fold(raw).replace(/[_-]+/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (s === "") return { status: "applied", known: true };
  const direct = APPLICATION_STATUSES.find((st) => st.replace("_", " ") === s);
  if (direct) return { status: direct, known: true };
  for (const [pattern, status] of STATUS_RULES) if (pattern.test(s)) return { status, known: true };
  return { status: "applied", known: false };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SLASH = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;

function isoDay(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

export type SlashOrder = "month-first" | "day-first";

/** What a slash date says about the order: only possible day-first, only month-first, or either. */
function slashEvidence(value: string): SlashOrder | "either" | null {
  const m = value.trim().match(SLASH);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a > 12 && b <= 12) return "day-first";
  if (b > 12 && a <= 12) return "month-first";
  return "either";
}

/**
 * One order for the whole paste, from every slash date: the side with more
 * evidence wins (rows that disagree become problems); with no evidence,
 * month-first (North American spreadsheets), and `forced` is false so the
 * preview can offer to switch.
 */
export function decideSlashOrder(values: readonly string[]): { order: SlashOrder; forced: boolean } {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const v of values) {
    const e = slashEvidence(v);
    if (e === "day-first") dayFirst += 1;
    if (e === "month-first") monthFirst += 1;
  }
  if (dayFirst === 0 && monthFirst === 0) return { order: "month-first", forced: false };
  return { order: dayFirst > monthFirst ? "day-first" : "month-first", forced: true };
}

/** "Nov 24" with no year: the latest such day not after today ("past"), or the next from today ("next"). */
function yearless(month: number, day: number, today: string, lean: "past" | "next"): string | null {
  const year = Number(today.slice(0, 4));
  const thisYear = isoDay(year, month, day);
  if (!thisYear) return null;
  if (lean === "past") return thisYear <= today ? thisYear : isoDay(year - 1, month, day);
  return thisYear >= today ? thisYear : isoDay(year + 1, month, day);
}

export type DateRead = { day: string } | { empty: true } | { error: string };

/**
 * A calendar day from what a spreadsheet holds. `lean` decides a missing
 * year: applied dates lean into the past, deadlines into the future.
 */
export function readDate(raw: string, order: SlashOrder, today: string, lean: "past" | "next"): DateRead {
  const v = raw
    .trim()
    .replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, "")
    .replace(/(\d)(st|nd|rd|th)\b/gi, "$1");
  if (v === "") return { empty: true };
  const bad: DateRead = { error: "isn’t a date this can read" };
  const wrap = (day: string | null): DateRead => (day ? { day } : bad);
  const monthName = (name: string, day: number, year: string | undefined): DateRead => {
    const month = MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
    if (!month) return bad;
    return wrap(year ? isoDay(fullYear(Number(year)), month, day) : yearless(month, day, today, lean));
  };

  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (m) return wrap(isoDay(Number(m[1]), Number(m[2]), Number(m[3])));
  m = v.match(SLASH);
  if (m) {
    const evidence = slashEvidence(v);
    if (evidence !== "either" && evidence !== order) {
      return { error: `reads ${order === "month-first" ? "day/month" : "month/day"}, unlike the other dates` };
    }
    const [a, b, y] = [Number(m[1]), Number(m[2]), fullYear(Number(m[3]))];
    return wrap(order === "day-first" ? isoDay(y, b, a) : isoDay(y, a, b));
  }
  // "Nov 24, 2026", "November 24 2026", "Sept 3, 2026", "Nov 24"
  m = v.match(/^([a-z]{3,9})\.?\s+(\d{1,2}),?(?:\s+(\d{2}|\d{4}))?$/i);
  if (m) return monthName(m[1], Number(m[2]), m[3]);
  // "24 Nov 2026", "24-Nov-26", "24 Nov"
  m = v.match(/^(\d{1,2})[\s-]([a-z]{3,9})\.?,?(?:[\s-](\d{2}|\d{4}))?$/i);
  if (m) return monthName(m[2], Number(m[1]), m[3]);
  // An Excel serial number: days since 1899-12-30 (30000 is 1982, 80000 is 2119).
  if (/^\d{5}(\.\d+)?$/.test(v)) {
    const n = Math.floor(Number(v));
    if (n >= 30000 && n <= 80000) return { day: addDays("1899-12-30", n) };
  }
  return bad;
}

/**
 * A web link, tidied: "www.x.com/job" gets "https://" in front, and the
 * result is the browser's own normalised form (ASCII, no spaces), so it's
 * always stricter than the database's check. Null for empty; undefined for
 * anything that isn't a web address (a javascript: link, a sentence).
 */
export function tidyLink(raw: unknown): string | null | undefined {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v === "") return null;
  if (/\s/.test(v)) return undefined;
  const bare = /^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+([/?#].*)?$/u.test(v);
  const withScheme = /^https?:\/\//i.test(v) ? v : bare ? `https://${v}` : null;
  if (!withScheme) return undefined;
  try {
    const url = new URL(withScheme);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname.includes(".")) return undefined;
    return url.href.length <= LIMITS.link ? url.href : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// 4. Rows → applications, with problems and duplicates.
// ---------------------------------------------------------------------------

export type ImportedApplication = {
  company: string;
  role: string;
  status: ApplicationStatus;
  applied_on: string | null;
  deadline: string | null;
  link: string | null;
  location: string | null;
  notes: string | null;
};

export type PreviewRow = {
  /** The line it starts on in the paste: the spreadsheet's row number (headers and blank rows count). */
  line: number;
  value: ImportedApplication | null;
  problems: string[];
  /** Words for a value read loosely ("Status “maybe?” read as Applied"). */
  notes: string[];
  /** Already in your list, or earlier in this paste. */
  duplicate: boolean;
  /** Which: "Already in your list." or "Also on row 4." */
  duplicateOf: string | null;
  /** Will be imported: no problems, and not a duplicate (or "Import anyway"). */
  included: boolean;
};

export type PreviewOptions = {
  today: string;
  /** How many more applications fit (1,000 minus what you have). */
  room: number;
  /** The picker's choice for each column, replacing what was read. */
  fields?: (ImportField | null)[];
  /** The switch, when the dates don't decide the order themselves. */
  dateOrder?: SlashOrder;
  /** Duplicate rows (by line) to import anyway. */
  includeDuplicates?: ReadonlySet<number>;
};

export type Preview = {
  columns: Columns;
  /** The header row's cells, if the first row was headers. */
  header: string[] | null;
  dateOrder: SlashOrder;
  /** True when the dates decided the order; false offers the switch. */
  dateOrderForced: boolean;
  /** Any a/b/yyyy dates at all (no switch is needed without them). */
  slashDates: boolean;
  rows: PreviewRow[];
  ready: ImportedApplication[];
  counts: { ready: number; duplicates: number; problems: number };
  /** Set when nothing can be imported (empty, too big, no company/role, no room). */
  blocked: string | null;
};

/** Most rows one import takes. */
export const MAX_IMPORT_ROWS = 500;
/** Most characters one import sends (the server action body limit is 1 MB). */
export const MAX_IMPORT_CHARS = 900_000;

const EARLIEST = "2000-01-01";
const LATEST = "2100-12-31";

const line = (v: string | undefined) => (v ?? "").replace(/[\s\u0085]+/gu, " ").trim();
const chars = (s: string) => [...s].length;

/** company + role, folded: the first half of "the same application". */
export function duplicateKey(company: string, role: string): string {
  return `${fold(company)}\u0000${fold(role)}`;
}

/** Existing applications grouped by company + role, with their applied dates. */
export function duplicateIndex(rows: readonly { company: string; role: string; applied_on: string | null }[]): Map<string, (string | null)[]> {
  const index = new Map<string, (string | null)[]>();
  for (const r of rows) {
    const key = duplicateKey(r.company, r.role);
    index.set(key, [...(index.get(key) ?? []), r.applied_on]);
  }
  return index;
}

/**
 * The same application: same company and role (folded) and the same
 * applied date, where an unknown date matches any (so applying to one role
 * in two seasons isn't a duplicate, but a dateless copy is).
 */
export function isDuplicate(
  candidate: { company: string; role: string; applied_on: string | null },
  index: ReadonlyMap<string, (string | null)[]>,
): boolean {
  const dates = index.get(duplicateKey(candidate.company, candidate.role));
  if (!dates) return false;
  return dates.some((d) => d === null || candidate.applied_on === null || d === candidate.applied_on);
}

const BASE: Omit<Preview, "blocked"> = {
  columns: { fromHeader: false, fields: [] },
  header: null,
  dateOrder: "month-first",
  dateOrderForced: false,
  slashDates: false,
  rows: [],
  ready: [],
  counts: { ready: 0, duplicates: 0, problems: 0 },
};

/** Everything the preview shows, from the pasted text and the applications already saved. */
export function previewImport(
  text: string,
  existing: readonly { company: string; role: string; applied_on: string | null }[],
  options: PreviewOptions,
): Preview {
  if (text.length > MAX_IMPORT_CHARS) {
    return { ...BASE, blocked: "That’s too much text for one import. Paste up to 500 rows at a time." };
  }
  const parsed = parseRowsWithLines(text);
  const rows = parsed.map((r) => r.cells);
  if (rows.length === 0) return { ...BASE, blocked: "Paste some rows first." };

  const read = readColumns(rows[0]);
  const columns: Columns = options.fields ? { fromHeader: read.fromHeader, fields: options.fields } : read;
  const header = read.fromHeader ? rows[0] : null;
  const data = read.fromHeader ? rows.slice(1) : rows;
  const base = { ...BASE, columns, header };
  if (!columns.fields.includes("company") || !columns.fields.includes("role")) {
    return { ...base, blocked: "Choose which column is the company and which is the role." };
  }
  if (data.length === 0) return { ...base, blocked: "There’s only a header row. Paste the rows under it too." };
  if (data.length > MAX_IMPORT_ROWS) {
    return { ...base, blocked: `That’s ${data.length} rows. Import up to ${MAX_IMPORT_ROWS} at a time.` };
  }

  const cellOf = (row: readonly string[], field: ImportField) => {
    const i = columns.fields.indexOf(field);
    return i === -1 ? "" : (row[i] ?? "");
  };
  const dateCells = data.flatMap((r) => [cellOf(r, "applied_on"), cellOf(r, "deadline")]);
  const decided = decideSlashOrder(dateCells);
  const slashDates = dateCells.some((c) => SLASH.test(c.trim()));
  const dateOrder = decided.forced ? decided.order : (options.dateOrder ?? decided.order);

  const seen = duplicateIndex(existing);
  const lines = (read.fromHeader ? parsed.slice(1) : parsed).map((r) => r.line);
  /** Where each company + role first appeared in this paste, to say "Also on row 4". */
  const firstInPaste = new Map<string, number>();

  const previewRows: PreviewRow[] = data.map((row, index) => {
    const lineNo = lines[index];
    const problems: string[] = [];
    const notes: string[] = [];
    const company = line(cellOf(row, "company"));
    const role = line(cellOf(row, "role"));
    if (!company) problems.push("No company.");
    else if (chars(company) > LIMITS.applicationCompany) problems.push(`Company is over ${LIMITS.applicationCompany} characters.`);
    if (!role) problems.push("No role.");
    else if (chars(role) > LIMITS.applicationRole) problems.push(`Role is over ${LIMITS.applicationRole} characters.`);

    const statusCell = line(cellOf(row, "status"));
    const { status, known } = readStatus(statusCell);
    if (!known) notes.push(`Status “${statusCell}” read as Applied (kept in the notes).`);

    const day = (field: "applied_on" | "deadline", label: string, lean: "past" | "next"): string | null => {
      const raw = line(cellOf(row, field));
      const result = readDate(raw, dateOrder, options.today, lean);
      if ("empty" in result) return null;
      if ("error" in result) {
        problems.push(`${label} “${raw}” ${result.error}.`);
        return null;
      }
      if (result.day < EARLIEST || result.day > LATEST) {
        problems.push(`${label} ${result.day} is outside 2000 to 2100.`);
        return null;
      }
      return result.day;
    };
    const appliedOn = day("applied_on", "Applied date", "past");
    if (appliedOn && appliedOn > options.today) problems.push(`Applied date ${appliedOn} is in the future.`);
    const deadline = day("deadline", "Deadline", "next");

    const linkRaw = line(cellOf(row, "link"));
    const link = tidyLink(linkRaw);
    if (link === undefined) notes.push(`Link “${linkRaw}” left out: not a web address.`);

    const location = line(cellOf(row, "location")) || null;
    if (location && chars(location) > LIMITS.location) problems.push(`Location is over ${LIMITS.location} characters.`);
    const noteParts = [
      (cellOf(row, "notes") ?? "").replace(/\r\n?/g, "\n").trim(),
      known ? "" : `Status in the sheet: ${statusCell}`,
    ].filter(Boolean);
    const notesText = noteParts.join("\n") || null;
    if (notesText && chars(notesText) > LIMITS.applicationNotes) {
      problems.push(`Notes are over ${LIMITS.applicationNotes.toLocaleString("en-US")} characters.`);
    }

    if (problems.length > 0) return { line: lineNo, value: null, problems, notes, duplicate: false, duplicateOf: null, included: false };

    const value: ImportedApplication = { company, role, status, applied_on: appliedOn, deadline, link: link ?? null, location, notes: notesText };
    const key = duplicateKey(company, role);
    const duplicate = isDuplicate(value, seen);
    const earlier = firstInPaste.get(key);
    const duplicateOf = duplicate ? (earlier !== undefined && earlier !== lineNo ? `Also on row ${earlier}.` : "Already in your list.") : null;
    if (earlier === undefined) firstInPaste.set(key, lineNo);
    const included = !duplicate || Boolean(options.includeDuplicates?.has(lineNo));
    if (included) seen.set(key, [...(seen.get(key) ?? []), appliedOn]);
    return { line: lineNo, value, problems, notes, duplicate, duplicateOf, included };
  });

  const ready = previewRows.filter((r) => r.included).map((r) => r.value!);
  const counts = {
    ready: ready.length,
    duplicates: previewRows.filter((r) => r.duplicate && !r.included).length,
    problems: previewRows.filter((r) => r.problems.length > 0).length,
  };
  const blocked =
    ready.length > options.room
      ? `You have room for ${Math.max(0, options.room)} more applications (1,000 in all), and this would add ${ready.length}.`
      : null;
  return { ...base, dateOrder, dateOrderForced: decided.forced, slashDates, rows: previewRows, ready, counts, blocked };
}

/** "52 to import · 2 already in your list · 1 with a problem". */
export function previewSummary(counts: Preview["counts"]): string {
  const parts = [`${counts.ready} to import`];
  if (counts.duplicates > 0) parts.push(`${counts.duplicates} already in your list`);
  if (counts.problems > 0) parts.push(`${counts.problems} with ${counts.problems === 1 ? "a problem" : "problems"}`);
  return parts.join(" · ");
}
