"use server";
// Adding, editing and deleting contacts (plans/crm.md, Feature 2).
// Every action checks the login, checks its input again (an action is a
// public endpoint), turns database answers into words, and never throws:
// the dialog shows what went wrong.

import { refresh } from "next/cache";
import { RedirectType, redirect } from "next/navigation";
import { CONTACT_COLUMNS, checkContact, isId, type ContactInput, type FieldErrors } from "./contact-input";
import { requireUser, userToday } from "./server-helpers";

export type ContactResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "invalid" | "gone" | "changed" | "loop" | "limit" | "error";
      message?: string;
      fieldErrors?: FieldErrors;
    };

const ERROR = { ok: false, reason: "error", message: "Couldn't save. Check your connection and try again." } as const;
const GONE = { ok: false, reason: "gone", message: "That person was removed, maybe in another tab." } as const;
const CHANGED = {
  ok: false,
  reason: "changed",
  message: "They were changed somewhere else since you opened this. Close it to see the latest, then edit again.",
} as const;

type DbError = { code?: string; message?: string };

/** A database refusal in words, next to the field it's about when there is one. */
function contactError(error: DbError): ContactResult {
  switch (error.code) {
    case "CR001":
      return {
        ok: false,
        reason: "loop",
        fieldErrors: { introduced_by: "They're already above this person in the chain, so that would make a loop." },
      };
    case "23503":
      return { ok: false, reason: "invalid", fieldErrors: { introduced_by: "That person no longer exists. Pick someone else." } };
    case "54000":
      return { ok: false, reason: "limit", message: "You can have up to 1,000 people." };
    case "23514":
      // The form's checks match the database's, so this is a rule the app
      // doesn't know about: say so plainly.
      return { ok: false, reason: "invalid", message: "Something in the form isn't allowed. Check the fields and try again." };
    default:
      console.error("contact save failed:", { code: error.code, message: error.message });
      return ERROR;
  }
}

/** Only the nine writable columns, so an update never names one the database won't let us change. */
function writable(value: ContactInput): ContactInput {
  return Object.fromEntries(CONTACT_COLUMNS.map((c) => [c, value[c]])) as ContactInput;
}

const DELETE_ERROR = { ok: false, reason: "error", message: "Couldn't delete. Check your connection and try again." } as const;

async function guard(label: string, body: () => Promise<ContactResult>, fallback: ContactResult = ERROR): Promise<ContactResult> {
  try {
    return await body();
  } catch (error) {
    console.error(`${label} failed:`, error);
    return fallback;
  }
}

/** Adds a person. The dialog then opens their page. */
export async function createContact(raw: Record<string, unknown>): Promise<ContactResult> {
  return guard("createContact", async () => {
    const { supabase } = await requireUser();
    const checked = checkContact(raw, { id: null, today: await userToday() });
    if (!checked.ok) return { ok: false, reason: "invalid", fieldErrors: checked.fieldErrors };
    const { data, error } = await supabase.from("crm_contacts").insert(writable(checked.value)).select("id").single();
    if (error) return contactError(error);
    refresh();
    return { ok: true, id: data.id as string };
  });
}

/**
 * Saves changes to a person, but only to the version the dialog was opened
 * with (`openedAt` is its updated_at): a save from a stale screen is
 * refused instead of writing old values back over newer ones.
 */
export async function updateContact(id: unknown, openedAt: unknown, raw: Record<string, unknown>): Promise<ContactResult> {
  return guard("updateContact", async () => {
    if (!isId(id)) return GONE;
    if (typeof openedAt !== "string" || Number.isNaN(Date.parse(openedAt))) return CHANGED;
    const { supabase } = await requireUser();
    const checked = checkContact(raw, { id, today: await userToday() });
    if (!checked.ok) return { ok: false, reason: "invalid", fieldErrors: checked.fieldErrors };
    const { data, error } = await supabase
      .from("crm_contacts")
      .update(writable(checked.value))
      .eq("id", id)
      .eq("updated_at", openedAt)
      .select("id");
    if (error) return contactError(error);
    refresh();
    if (data.length > 0) return { ok: true, id };
    // Nothing matched: changed since, or gone?
    const still = await supabase.from("crm_contacts").select("id").eq("id", id);
    return still.data && still.data.length > 0 ? CHANGED : GONE;
  });
}

/**
 * Deletes a person. Their interactions go with them; the people they
 * introduced stay (with no introducer) and their applications stay
 * (unlinked): the database does both. Then the list, replacing this page
 * in the history, so Back never reaches the deleted person.
 */
export async function deleteContact(id: unknown): Promise<ContactResult> {
  const result = await guard("deleteContact", async () => {
    if (!isId(id)) return GONE;
    const { supabase } = await requireUser();
    const { data, error } = await supabase.from("crm_contacts").delete().eq("id", id).select("name");
    if (error) {
      console.error("deleteContact:", { code: error.code, message: error.message });
      return DELETE_ERROR;
    }
    if (data.length === 0) {
      refresh();
      return GONE;
    }
    return { ok: true, id: data[0].name as string };
  }, DELETE_ERROR);
  // Outside guard on purpose: redirect() works by throwing. refresh()
  // first: the delete also changed the people they introduced, and pages
  // kept alive in the history must not show the deleted person.
  if (result.ok) refresh();
  if (result.ok) redirect(`/people?deleted=${encodeURIComponent(result.id)}`, RedirectType.replace);
  return result;
}
