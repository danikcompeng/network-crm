// Checking and tidying what's typed into the contact form (plans/crm.md,
// Feature 2). Pure: the form runs it for instant messages, and the server
// action runs it again, because an action is a public endpoint.
//
// Same rules as the database's checks (lengths in characters, no spaces
// at either end, empty is null, dates 2000-2100), so a value that passes
// here is never refused there for its shape.

import { LIMITS, STAGES, isStage, type Stage } from "./crm";
import { isValidDay } from "./dates";

export type ContactInput = {
  name: string;
  company: string | null;
  role: string | null;
  stage: Stage;
  introduced_by: string | null;
  how_met: string | null;
  met_on: string | null;
  next_follow_up: string | null;
  notes: string | null;
};

export type ContactField = keyof ContactInput;

/** The nine columns the app may write (the migration grants update on exactly these). */
export const CONTACT_COLUMNS = [
  "name",
  "company",
  "role",
  "stage",
  "introduced_by",
  "how_met",
  "met_on",
  "next_follow_up",
  "notes",
] as const satisfies readonly ContactField[];
export type FieldErrors = Partial<Record<ContactField, string>>;
export type Checked<T> = { ok: true; value: T } | { ok: false; fieldErrors: FieldErrors };

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/** Characters as people count them (code points): an emoji is 1, as in the database's char_length. */
export const length = (text: string) => [...text].length;

/** One line: every run of any whitespace (tabs, non-breaking spaces) becomes one space; trimmed; empty is null. */
export function tidyLine(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // U+0085 (next line) isn't whitespace to JavaScript but can be to Postgres.
  const text = raw.replace(/[\s\u0085]+/gu, " ").trim();
  return text === "" ? null : text;
}

/**
 * Several lines: Windows line ends become \n FIRST (so a note is counted
 * the way it's stored), ends trimmed, inner spacing and line breaks kept;
 * empty is null.
 */
export function tidyText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\r\n?/g, "\n").replace(/^[\s\u0085]+|[\s\u0085]+$/gu, "");
  return text === "" ? null : text;
}

const EARLIEST = "2000-01-01";
const LATEST = "2100-12-31";

/** A calendar day the database accepts, or null for empty; undefined for nonsense. */
export function checkDay(raw: unknown): string | null | undefined {
  if (raw === null || raw === undefined || raw === "") return null;
  if (!isValidDay(raw) || raw < EARLIEST || raw > LATEST) return undefined;
  return raw;
}

type Raw = Record<string, unknown>;

/**
 * Checks the form. `id` is the contact being edited (null for a new one),
 * so they can't be their own introducer; `today` is the viewer's day, so
 * "met on" can't be in the future.
 */
export function checkContact(raw: Raw, options: { id: string | null; today: string }): Checked<ContactInput> {
  const errors: FieldErrors = {};

  const name = tidyLine(raw.name);
  if (!name) errors.name = "Give them a name.";
  else if (length(name) > LIMITS.contactName) errors.name = `Keep the name to ${LIMITS.contactName} characters.`;

  const company = tidyLine(raw.company);
  if (company && length(company) > LIMITS.company) errors.company = `Keep the company to ${LIMITS.company} characters.`;
  const role = tidyLine(raw.role);
  if (role && length(role) > LIMITS.role) errors.role = `Keep the role to ${LIMITS.role} characters.`;
  const howMet = tidyLine(raw.how_met);
  if (howMet && length(howMet) > LIMITS.howMet) errors.how_met = `Keep this to ${LIMITS.howMet} characters.`;
  const notes = tidyText(raw.notes);
  if (notes && length(notes) > LIMITS.contactNotes) {
    errors.notes = `Notes can be up to ${LIMITS.contactNotes.toLocaleString("en-US")} characters (these are ${length(notes).toLocaleString("en-US")}).`;
  }

  const stage = raw.stage === undefined || raw.stage === "" ? "new" : raw.stage;
  if (!isStage(stage)) errors.stage = `Pick one of: ${STAGES.join(", ")}.`;

  let introducedBy: string | null = null;
  if (raw.introduced_by !== undefined && raw.introduced_by !== null && raw.introduced_by !== "") {
    if (!isId(raw.introduced_by)) errors.introduced_by = "Pick someone from the list.";
    else if (options.id && raw.introduced_by.toLowerCase() === options.id.toLowerCase()) {
      errors.introduced_by = "Someone can't introduce themselves.";
    } else introducedBy = raw.introduced_by.toLowerCase();
  }

  const metOn = checkDay(raw.met_on);
  if (metOn === undefined) errors.met_on = "Pick a real date.";
  else if (metOn && metOn > options.today) errors.met_on = "That's in the future. When did you meet?";

  const followUp = checkDay(raw.next_follow_up);
  if (followUp === undefined) errors.next_follow_up = "Pick a real date between 2000 and 2100.";

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      name: name!,
      company,
      role,
      stage: stage as Stage,
      introduced_by: introducedBy,
      how_met: howMet,
      met_on: metOn ?? null,
      next_follow_up: followUp ?? null,
      notes,
    },
  };
}
