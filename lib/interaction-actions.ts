"use server";
// Logging interactions, undoing them, and setting the next follow-up
// (plans/crm.md, Feature 4). Every action checks the login and its input
// again, turns database answers into words, and never throws.

import { refresh } from "next/cache";
import { checkDay, isId } from "./contact-input";
import { checkInteraction } from "./interaction-input";
import { requireUser, userToday } from "./server-helpers";

export type LogResult =
  | {
      ok: true;
      id: string;
      day: string;
      /** The server's today when it logged (the offer is built from this, never the screen's). */
      today: string;
      /** The follow-up this log resolved (undo puts it back), or null. */
      cleared: string | null;
      /** The follow-up still set after the log (it was later than the log), or null. */
      stillSet: string | null;
    }
  | { ok: false; message: string };

const ERROR = "Couldn't save. Check your connection and try again.";

/**
 * Logs an interaction through crm_log_interaction (one transaction: the
 * interaction, and the follow-up cleared if it was due on or before that
 * day). With no day chosen, it's the server's today at the moment of the
 * tap, so a screen drawn before midnight logs the right day after it.
 */
export async function logInteraction(contactId: unknown, raw: { kind?: unknown; note?: unknown; day?: unknown }): Promise<LogResult> {
  try {
    if (!isId(contactId)) return { ok: false, message: "That person was removed, maybe in another tab." };
    const { supabase } = await requireUser();
    const today = await userToday();
    const checked = checkInteraction(raw, today);
    if (!checked.ok) return checked;
    const { kind, note, day } = checked.value;
    const { data, error } = await supabase.rpc("crm_log_interaction", { p_contact_id: contactId, p_day: day, p_kind: kind, p_note: note });
    if (error) {
      if (error.code === "P0002") return { ok: false, message: "That person was removed, maybe in another tab." };
      if (error.code === "54000") return { ok: false, message: "You've logged the most interactions an account can hold (5,000)." };
      if (error.code === "23514") return { ok: false, message: "Something in that log isn't allowed. Check the note and the day." };
      console.error("logInteraction:", { code: error.code, message: error.message });
      return { ok: false, message: ERROR };
    }
    const result = data as { id: string; cleared_follow_up: string | null };
    const after = await supabase.from("crm_contacts").select("next_follow_up").eq("id", contactId).maybeSingle();
    refresh();
    return {
      ok: true,
      id: result.id,
      day,
      today,
      cleared: result.cleared_follow_up,
      stillSet: (after.data?.next_follow_up as string | null | undefined) ?? null,
    };
  } catch (error) {
    console.error("logInteraction failed:", error);
    return { ok: false, message: ERROR };
  }
}

export type UndoResult =
  | { ok: true; deleted: boolean; restored: string | null }
  | { ok: false; message: string; /** The follow-up the sheet set was already taken back. */ reverted?: boolean };

/**
 * Deletes an interaction (Undo right after logging, or Delete on a
 * timeline entry) through crm_undo_interaction, which puts back the
 * follow-up it resolved, unless something newer replaced it.
 *
 * `revert`: Undo in the log sheet after "Set follow-up" also takes back
 * the follow-up the sheet set: first, only if it's still the day the sheet
 * set, it goes back to what it was right after the log; then the
 * interaction is deleted (which can bring back the one the log cleared).
 * If the second step fails, you're left "logged, nothing set", and Undo
 * can be pressed again.
 */
export async function undoInteraction(
  id: unknown,
  revert?: { contactId: unknown; set: unknown; afterLog: unknown },
): Promise<UndoResult> {
  try {
    if (!isId(id)) return { ok: true, deleted: false, restored: null };
    const { supabase } = await requireUser();
    let reverted = false;
    if (revert) {
      const set = checkDay(revert.set);
      const afterLog = checkDay(revert.afterLog);
      if (!isId(revert.contactId) || set === undefined || afterLog === undefined) {
        return { ok: false, message: "Couldn't undo. Reload and try again." };
      }
      let query = supabase.from("crm_contacts").update({ next_follow_up: afterLog }).eq("id", revert.contactId);
      query = set === null ? query.is("next_follow_up", null) : query.eq("next_follow_up", set);
      const { data: matched, error } = await query.select("id");
      if (error) {
        console.error("undoInteraction (follow-up):", { code: error.code, message: error.message });
        return { ok: false, message: "Couldn't undo. Check your connection and try again." };
      }
      // Nothing matched: the follow-up was changed elsewhere since; that newer one stays.
      if (matched.length > 0) {
        refresh();
        reverted = true;
      }
    }
    const { data, error } = await supabase.rpc("crm_undo_interaction", { p_id: id });
    if (error) {
      console.error("undoInteraction:", { code: error.code, message: error.message });
      return {
        ok: false,
        reverted,
        message: reverted
          ? "The follow-up was taken back, but the log couldn't be deleted. Press Undo again."
          : "Couldn't undo. Check your connection and try again.",
      };
    }
    refresh();
    const result = data as { deleted: boolean; restored_follow_up: string | null };
    return { ok: true, deleted: result.deleted, restored: result.restored_follow_up };
  } catch (error) {
    console.error("undoInteraction failed:", error);
    return { ok: false, message: "Couldn't undo. Check your connection and try again." };
  }
}

export type FollowUpResult = { ok: true } | { ok: false; reason: "changed" | "invalid" | "error"; message: string };

/**
 * Sets (or clears, with null) someone's next follow-up, but only if it is
 * still `expected` (what the screen saw): a follow-up changed in another
 * tab or on another device is never overwritten.
 */
export async function setFollowUp(contactId: unknown, day: unknown, expected: unknown): Promise<FollowUpResult> {
  try {
    if (!isId(contactId)) return { ok: false, reason: "changed", message: "That person was removed, maybe in another tab." };
    // Only an explicit null clears it ("Clear it"); an empty date box is not a choice.
    const next = day === null ? null : typeof day === "string" && day !== "" ? checkDay(day) : undefined;
    const was = checkDay(expected);
    if (next === undefined || was === undefined) return { ok: false, reason: "invalid", message: "Pick a day." };
    const today = await userToday();
    if (next !== null && next < today) return { ok: false, reason: "invalid", message: "Pick today or a later day." };
    const { supabase } = await requireUser();
    let query = supabase.from("crm_contacts").update({ next_follow_up: next }).eq("id", contactId);
    query = was === null ? query.is("next_follow_up", null) : query.eq("next_follow_up", was);
    const { data, error } = await query.select("id");
    if (error) {
      console.error("setFollowUp:", { code: error.code, message: error.message });
      return { ok: false, reason: "error", message: ERROR };
    }
    refresh();
    if (data.length === 0) {
      const still = await supabase.from("crm_contacts").select("id").eq("id", contactId).maybeSingle();
      if (!still.data) return { ok: false, reason: "changed", message: "That person was removed, maybe in another tab." };
      return { ok: false, reason: "changed", message: "Their follow-up was changed somewhere else, so it wasn't touched. Check it on their page." };
    }
    return { ok: true };
  } catch (error) {
    console.error("setFollowUp failed:", error);
    return { ok: false, reason: "error", message: ERROR };
  }
}
