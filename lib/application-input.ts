// Checking and tidying the application sheet (plans/crm.md, Feature 3).
// Pure: the sheet runs it for instant messages, the server action runs it
// again. Same rules as the database's checks.

import { checkDay, isId, length, tidyLine, tidyText } from "./contact-input";
import { LIMITS, isApplicationStatus, type ApplicationStatus } from "./crm";
import { tidyLink } from "./import";

export type ApplicationInput = {
  company: string;
  role: string;
  status: ApplicationStatus;
  applied_on: string | null;
  deadline: string | null;
  link: string | null;
  location: string | null;
  contact_id: string | null;
  notes: string | null;
};
export type ApplicationField = keyof ApplicationInput;
export type ApplicationErrors = Partial<Record<ApplicationField, string>>;

/** The nine columns the app may write (the migration grants update on exactly these). */
export const APPLICATION_COLUMNS = [
  "company",
  "role",
  "status",
  "applied_on",
  "deadline",
  "link",
  "location",
  "contact_id",
  "notes",
] as const satisfies readonly ApplicationField[];

export function checkApplication(
  raw: Record<string, unknown>,
  options: { today: string },
): { ok: true; value: ApplicationInput } | { ok: false; fieldErrors: ApplicationErrors } {
  const errors: ApplicationErrors = {};

  const company = tidyLine(raw.company);
  if (!company) errors.company = "Which company?";
  else if (length(company) > LIMITS.applicationCompany) errors.company = `Keep it to ${LIMITS.applicationCompany} characters.`;
  const role = tidyLine(raw.role);
  if (!role) errors.role = "Which role?";
  else if (length(role) > LIMITS.applicationRole) errors.role = `Keep it to ${LIMITS.applicationRole} characters.`;

  const status = raw.status === undefined || raw.status === "" ? "applied" : raw.status;
  if (!isApplicationStatus(status)) errors.status = "Pick a status from the list.";

  const appliedOn = checkDay(raw.applied_on);
  if (appliedOn === undefined) errors.applied_on = "Pick a real date.";
  else if (appliedOn && appliedOn > options.today) errors.applied_on = "That's in the future. When did you apply?";
  const deadline = checkDay(raw.deadline);
  if (deadline === undefined) errors.deadline = "Pick a real date between 2000 and 2100.";

  const link = tidyLink(raw.link);
  if (link === undefined) errors.link = "That isn't a web address. Paste the posting's link (https://…).";

  const location = tidyLine(raw.location);
  if (location && length(location) > LIMITS.location) errors.location = `Keep it to ${LIMITS.location} characters.`;
  const notes = tidyText(raw.notes);
  if (notes && length(notes) > LIMITS.applicationNotes) {
    errors.notes = `Notes can be up to ${LIMITS.applicationNotes.toLocaleString("en-US")} characters (these are ${length(notes).toLocaleString("en-US")}).`;
  }

  let contactId: string | null = null;
  if (raw.contact_id !== undefined && raw.contact_id !== null && raw.contact_id !== "") {
    if (isId(raw.contact_id)) contactId = raw.contact_id.toLowerCase();
    else errors.contact_id = "Pick someone from the list.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      company: company!,
      role: role!,
      status: status as ApplicationStatus,
      applied_on: appliedOn ?? null,
      deadline: deadline ?? null,
      link: link ?? null,
      location,
      contact_id: contactId,
      notes,
    },
  };
}
