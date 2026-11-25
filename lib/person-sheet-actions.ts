"use server";
// The person sheet on Today loads its own data when it opens (plans/crm.md,
// Feature 4): it works for anyone, including someone who just left
// Today's lists because a log cleared their follow-up.

import type { Stage, InteractionKind } from "./crm";
import { isId } from "./contact-input";
import { requireUser } from "./server-helpers";

export type PersonSheetData = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  how_met: string | null;
  stage: Stage;
  notes: string | null;
  next_follow_up: string | null;
  recent: { id: string; day: string; kind: InteractionKind; note: string | null }[];
};

export type PersonSheetResult = { ok: true; person: PersonSheetData } | { ok: false; message: string };

/** How many interactions the sheet shows (the latest). */
const RECENT = 5;

export async function loadPersonSheet(id: unknown): Promise<PersonSheetResult> {
  try {
    if (!isId(id)) return { ok: false, message: "That person was removed, maybe in another tab." };
    const { supabase } = await requireUser();
    const [person, recent] = await Promise.all([
      supabase.from("crm_contacts").select("id, name, company, role, how_met, stage, notes, next_follow_up").eq("id", id).maybeSingle(),
      supabase
        .from("crm_interactions")
        .select("id, day, kind, note")
        .eq("contact_id", id)
        .order("day", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(RECENT),
    ]);
    if (person.error || recent.error) {
      console.error("loadPersonSheet:", person.error ?? recent.error);
      return { ok: false, message: "Couldn't load them. Check your connection and try again." };
    }
    if (!person.data) return { ok: false, message: "That person was removed, maybe in another tab." };
    return { ok: true, person: { ...(person.data as Omit<PersonSheetData, "recent">), recent: recent.data as PersonSheetData["recent"] } };
  } catch (error) {
    console.error("loadPersonSheet failed:", error);
    return { ok: false, message: "Couldn't load them. Check your connection and try again." };
  }
}
