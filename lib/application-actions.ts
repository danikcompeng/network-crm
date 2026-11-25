"use server";
// Adding, editing, deleting and importing applications, and the one-tap
// status change (plans/crm.md, Feature 3). Every action checks the login
// and its input again (an action is a public endpoint), turns database
// answers into words, and never throws.

import { refresh } from "next/cache";
import { APPLICATION_COLUMNS, checkApplication, type ApplicationErrors, type ApplicationInput } from "./application-input";
import { statusChange } from "./applications";
import { isId } from "./contact-input";
import { isApplicationStatus } from "./crm";
import { duplicateIndex, isDuplicate, MAX_IMPORT_ROWS, type ImportedApplication } from "./import";
import { requireUser, userToday } from "./server-helpers";

export type ApplicationResult =
  | { ok: true; id: string; updated_at?: string; applied_on?: string | null; status?: string }
  | {
      ok: false;
      reason: "invalid" | "gone" | "changed" | "limit" | "error";
      message?: string;
      fieldErrors?: ApplicationErrors;
    };

const ERROR = { ok: false, reason: "error", message: "Couldn't save. Check your connection and try again." } as const;
const GONE = { ok: false, reason: "gone", message: "That application was removed, maybe in another tab." } as const;
const CHANGED = {
  ok: false,
  reason: "changed",
  message: "It was changed somewhere else since you opened it. Close it to see the latest, then try again.",
} as const;
/** For the one-tap change in a row, where no sheet is open. */
const ROW_CHANGED = {
  ok: false,
  reason: "changed",
  message: "It was changed somewhere else, so your change wasn't saved. The list now shows the latest.",
} as const;
const MAX_APPLICATIONS = 1000;

type DbError = { code?: string; message?: string };

function applicationError(error: DbError): ApplicationResult {
  switch (error.code) {
    case "54000":
      return { ok: false, reason: "limit", message: `You can have up to ${MAX_APPLICATIONS.toLocaleString("en-US")} applications.` };
    case "23503":
      return { ok: false, reason: "invalid", fieldErrors: { contact_id: "That person no longer exists. Pick someone else." } };
    case "23514":
      return { ok: false, reason: "invalid", message: "Something in the form isn't allowed. Check the fields and try again." };
    default:
      console.error("application save failed:", { code: error.code, message: error.message });
      return ERROR;
  }
}

/** Exactly the nine writable columns, with explicit nulls (a bulk insert fills missing keys with null). */
function writable(value: ApplicationInput | ImportedApplication): ApplicationInput {
  const full = { contact_id: null, ...value } as ApplicationInput;
  return Object.fromEntries(APPLICATION_COLUMNS.map((c) => [c, full[c] ?? null])) as ApplicationInput;
}

async function guard(label: string, body: () => Promise<ApplicationResult>, fallback: ApplicationResult = ERROR) {
  try {
    return await body();
  } catch (error) {
    console.error(`${label} failed:`, error);
    return fallback;
  }
}

/** Every imported field, for "this exact row is already saved". */
function sameRowKey(r: Pick<ImportedApplication, "company" | "role" | "status" | "applied_on" | "deadline" | "link" | "location" | "notes">): string {
  return JSON.stringify([r.company, r.role, r.status, r.applied_on, r.deadline, r.link, r.location, r.notes]);
}

const validStamp = (s: unknown): s is string => typeof s === "string" && !Number.isNaN(Date.parse(s));

export async function createApplication(raw: Record<string, unknown>): Promise<ApplicationResult> {
  return guard("createApplication", async () => {
    const { supabase } = await requireUser();
    const checked = checkApplication(raw, { today: await userToday() });
    if (!checked.ok) return { ok: false, reason: "invalid", fieldErrors: checked.fieldErrors };
    const { data, error } = await supabase.from("crm_applications").insert(writable(checked.value)).select("id").single();
    if (error) return applicationError(error);
    refresh();
    return { ok: true, id: data.id as string };
  });
}

/** Saves the sheet, only over the version it was opened with (`openedAt`, its updated_at). */
export async function updateApplication(id: unknown, openedAt: unknown, raw: Record<string, unknown>): Promise<ApplicationResult> {
  return guard("updateApplication", async () => {
    if (!isId(id)) return GONE;
    if (!validStamp(openedAt)) return CHANGED;
    const { supabase } = await requireUser();
    const checked = checkApplication(raw, { today: await userToday() });
    if (!checked.ok) return { ok: false, reason: "invalid", fieldErrors: checked.fieldErrors };
    const { data, error } = await supabase
      .from("crm_applications")
      .update(writable(checked.value))
      .eq("id", id)
      .eq("updated_at", openedAt)
      .select("id");
    if (error) return applicationError(error);
    refresh();
    if (data.length > 0) return { ok: true, id };
    const still = await supabase.from("crm_applications").select("id").eq("id", id);
    return still.data && still.data.length > 0 ? CHANGED : GONE;
  });
}

/**
 * The one-tap status change from a row. Guarded by the row's updated_at,
 * and the leaving-saved rule reads the row as it is then (in the same
 * guarded step), so another tab's applied date is never overwritten.
 * Returns the new stamp, so the next quick change on this row can follow.
 */
export async function changeStatus(id: unknown, openedAt: unknown, to: unknown): Promise<ApplicationResult> {
  return guard("changeStatus", async () => {
    if (!isId(id)) return GONE;
    if (!isApplicationStatus(to)) return { ok: false, reason: "invalid", message: "Pick a status from the list." };
    if (!validStamp(openedAt)) return CHANGED;
    const { supabase } = await requireUser();
    const current = await supabase
      .from("crm_applications")
      .select("status, applied_on")
      .eq("id", id)
      .eq("updated_at", openedAt)
      .maybeSingle();
    if (current.error) return applicationError(current.error);
    if (!current.data) {
      refresh();
      const still = await supabase.from("crm_applications").select("id").eq("id", id);
      return still.data && still.data.length > 0 ? ROW_CHANGED : GONE;
    }
    const change = statusChange(current.data as { status: never; applied_on: string | null }, to, await userToday());
    const { data, error } = await supabase
      .from("crm_applications")
      .update(change)
      .eq("id", id)
      .eq("updated_at", openedAt)
      .select("updated_at, applied_on, status");
    if (error) return applicationError(error);
    refresh();
    if (data.length === 0) return ROW_CHANGED;
    const row = data[0] as { updated_at: string; applied_on: string | null; status: string };
    return { ok: true, id, updated_at: row.updated_at, applied_on: row.applied_on, status: row.status };
  });
}

const DELETE_ERROR = { ok: false, reason: "error", message: "Couldn't delete. Check your connection and try again." } as const;

export async function deleteApplication(id: unknown): Promise<ApplicationResult> {
  return guard(
    "deleteApplication",
    async () => {
      if (!isId(id)) return GONE;
      const { supabase } = await requireUser();
      const { data, error } = await supabase.from("crm_applications").delete().eq("id", id).select("id");
      if (error) {
        console.error("deleteApplication:", { code: error.code, message: error.message });
        return DELETE_ERROR;
      }
      refresh();
      return data.length === 0 ? GONE : { ok: true, id };
    },
    DELETE_ERROR,
  );
}

export type ImportResult =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; message: string; rows?: { index: number; problems: string[] }[] };

/**
 * Imports the preview's rows in ONE request (one statement: all or
 * nothing). Every row is checked again, and duplicates against what's saved
 * NOW are dropped (unless the row was marked "Import anyway"), so a retried
 * or repeated import adds nothing twice.
 */
export async function importApplications(rows: unknown, importAnyway: unknown): Promise<ImportResult> {
  const failed: ImportResult = { ok: false, message: "Couldn't import. Check your connection and try again. Nothing was saved." };
  try {
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, message: "There's nothing to import." };
    if (rows.length > MAX_IMPORT_ROWS) return { ok: false, message: `Import up to ${MAX_IMPORT_ROWS} at a time.` };
    const anyway = new Set(Array.isArray(importAnyway) ? importAnyway.filter((i): i is number => Number.isInteger(i)) : []);
    const { supabase } = await requireUser();
    const today = await userToday();

    const checked = rows.map((r) => checkApplication(typeof r === "object" && r ? (r as Record<string, unknown>) : {}, { today }));
    const bad = checked.flatMap((c, index) => (c.ok ? [] : [{ index, problems: Object.values(c.fieldErrors) as string[] }]));
    if (bad.length > 0) return { ok: false, message: "Some rows changed and aren't valid any more. Paste again.", rows: bad };

    const existing = await supabase
      .from("crm_applications")
      .select("company, role, applied_on, status, deadline, link, location, notes")
      .limit(MAX_APPLICATIONS);
    if (existing.error) return applicationError(existing.error) as ImportResult & { ok: false };
    const saved = existing.data as (ImportedApplication & { applied_on: string | null })[];
    const index = duplicateIndex(saved);
    // An exact copy of a saved row is a retry, never a deliberate duplicate.
    const exact = new Set(saved.map((r) => sameRowKey(r)));
    const fresh = checked.flatMap((c, i) => {
      if (!c.ok) return [];
      if (exact.has(sameRowKey(c.value))) return [];
      if (!anyway.has(i) && isDuplicate(c.value, index)) return [];
      return [writable({ ...c.value, contact_id: null })];
    });
    const skipped = rows.length - fresh.length;
    if (fresh.length === 0) return { ok: true, imported: 0, skipped };
    if (existing.data.length + fresh.length > MAX_APPLICATIONS) {
      return { ok: false, message: `You have room for ${MAX_APPLICATIONS - existing.data.length} more applications (1,000 in all). Nothing was saved.` };
    }
    const { error } = await supabase.from("crm_applications").insert(fresh);
    if (error) {
      const words = applicationError(error);
      return { ok: false, message: `${("message" in words && words.message) || "Couldn't import."} Nothing was saved.` };
    }
    refresh();
    return { ok: true, imported: fresh.length, skipped };
  } catch (error) {
    console.error("importApplications failed:", error);
    return failed;
  }
}
