// The lists and limits in lib/crm.ts must match the migration's checks,
// or the app would offer a stage the database refuses (or the reverse).
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, INTERACTION_KINDS, INTERACTION_LABELS, LIMITS, STAGES, STAGE_LABELS } from "./crm";

const dir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(dir + f, "utf8"))
  .join("\n");

/** The quoted values in the last `<column> in (...)` check for `constraint`. */
function checkList(constraint: string): string[] {
  const matches = [...sql.matchAll(new RegExp(`constraint ${constraint} check \\(\\s*\\w+ in \\(([^)]*)\\)`, "g"))];
  if (matches.length === 0) throw new Error(`no ${constraint} in the migrations`);
  return [...matches.at(-1)![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** The upper bound in the last `char_length(<column>) between 1 and N` (or `<= N`) for `constraint`. */
function maxLength(constraint: string): number {
  const matches = [...sql.matchAll(new RegExp(`constraint ${constraint} check \\(char_length\\(\\w+\\) (?:between 1 and|<=) (\\d+)`, "g"))];
  if (matches.length === 0) throw new Error(`no ${constraint} in the migrations`);
  return Number(matches.at(-1)![1]);
}

describe("lib/crm.ts matches the database", () => {
  it("stages, kinds and statuses", () => {
    expect(checkList("crm_contacts_stage_check")).toEqual([...STAGES]);
    expect(checkList("crm_interactions_kind_check")).toEqual([...INTERACTION_KINDS]);
    expect(checkList("crm_applications_status_check")).toEqual([...APPLICATION_STATUSES]);
  });

  it.each([
    ["crm_contacts_name_check", LIMITS.contactName],
    ["crm_contacts_company_check", LIMITS.company],
    ["crm_contacts_role_check", LIMITS.role],
    ["crm_contacts_how_met_check", LIMITS.howMet],
    ["crm_contacts_notes_check", LIMITS.contactNotes],
    ["crm_interactions_note_check", LIMITS.interactionNote],
    ["crm_applications_company_check", LIMITS.applicationCompany],
    ["crm_applications_role_check", LIMITS.applicationRole],
    ["crm_applications_link_check", LIMITS.link],
    ["crm_applications_location_check", LIMITS.location],
    ["crm_applications_notes_check", LIMITS.applicationNotes],
  ])("%s allows %i characters", (constraint, limit) => {
    expect(maxLength(constraint)).toBe(limit);
  });

  it("every value has a label", () => {
    expect(Object.keys(STAGE_LABELS)).toEqual([...STAGES]);
    expect(Object.keys(INTERACTION_LABELS)).toEqual([...INTERACTION_KINDS]);
    expect(Object.keys(APPLICATION_STATUS_LABELS)).toEqual([...APPLICATION_STATUSES]);
  });
});
