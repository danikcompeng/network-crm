import "server-only";
// Reading contacts for the People list and a contact's page
// (plans/crm.md, Feature 2). Every contact fits in one request (the
// database caps an account at 1,000, the API answers up to 1,000 rows).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EditableContact, PersonOption } from "@/components/contact-dialog";
import { TIMELINE_LIMIT, type InteractionKind } from "./crm";
import type { PersonRow } from "./people";

export type ListPerson = PersonRow & { last_day: string | null };

type StatRow = { contact_id: string; interactions: number; last_day: string };

function fail(where: string, error: { message: string; code?: string }): never {
  // app/error.tsx shows "Couldn't load this page" with Try again.
  throw new Error(`${where}: ${error.message} (${error.code})`);
}

/** Everyone, with the day you last talked to them (null: never). */
export async function loadPeople(supabase: SupabaseClient): Promise<ListPerson[]> {
  const [people, stats] = await Promise.all([
    supabase.from("crm_contacts").select("id, name, company, role, stage, introduced_by, next_follow_up").limit(1000),
    supabase.rpc("crm_contact_stats"),
  ]);
  if (people.error) fail("People", people.error);
  if (stats.error) fail("People: stats", stats.error);
  const lastDay = new Map((stats.data as StatRow[]).map((s) => [s.contact_id, s.last_day]));
  return (people.data as PersonRow[]).map((p) => ({ ...p, last_day: lastDay.get(p.id) ?? null }));
}

export type TimelineEntry = { id: string; day: string; kind: InteractionKind; note: string | null };

export type ContactPageData = {
  contact: EditableContact;
  /** Everyone, for the chain, "introduced you to" and the introducer choices. */
  people: PersonOption[];
  timeline: TimelineEntry[];
  interactionCount: number;
  applicationCount: number;
};

/** One person and everything their page shows, or null if they aren't yours (or don't exist). */
export async function loadContact(supabase: SupabaseClient, id: string): Promise<ContactPageData | null> {
  const [contact, people, timeline, interactions, applications] = await Promise.all([
    supabase
      .from("crm_contacts")
      .select("id, updated_at, name, company, role, stage, introduced_by, how_met, met_on, next_follow_up, notes")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("crm_contacts").select("id, name, company, introduced_by").limit(1000),
    supabase
      .from("crm_interactions")
      .select("id, day, kind, note")
      .eq("contact_id", id)
      .order("day", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(TIMELINE_LIMIT),
    supabase.from("crm_interactions").select("id", { count: "exact", head: true }).eq("contact_id", id),
    supabase.from("crm_applications").select("id", { count: "exact", head: true }).eq("contact_id", id),
  ]);
  for (const [where, result] of [
    ["Contact", contact],
    ["Contact: people", people],
    ["Contact: timeline", timeline],
    ["Contact: interactions", interactions],
    ["Contact: applications", applications],
  ] as const) {
    if (result.error) fail(where, result.error);
  }
  if (!contact.data) return null;
  return {
    contact: contact.data as EditableContact,
    people: people.data as PersonOption[],
    timeline: timeline.data as TimelineEntry[],
    interactionCount: interactions.count ?? 0,
    applicationCount: applications.count ?? 0,
  };
}
