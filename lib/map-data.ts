import "server-only";
// Reading the network map (plans/crm.md, Feature 5): everyone (at most
// 1,000: one request), sorted by id, with their interaction counts and the
// day each appears, worked out in your timezone.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Stage } from "./crm";
import { mapDay, type MapPerson } from "./map-graph";

type Row = { id: string; name: string; company: string | null; stage: Stage; introduced_by: string | null; met_on: string | null; created_at: string };

export async function loadMap(supabase: SupabaseClient, timeZone: string | undefined, today: string): Promise<MapPerson[]> {
  const [people, stats] = await Promise.all([
    supabase.from("crm_contacts").select("id, name, company, stage, introduced_by, met_on, created_at").order("id").limit(1000),
    supabase.rpc("crm_contact_stats"),
  ]);
  if (people.error) throw new Error(`Map: ${people.error.message} (${people.error.code})`);
  if (stats.error) throw new Error(`Map: stats: ${stats.error.message} (${stats.error.code})`);
  const counts = new Map((stats.data as { contact_id: string; interactions: number }[]).map((s) => [s.contact_id, s.interactions]));
  return (people.data as Row[]).map((p) => ({
    id: p.id,
    name: p.name,
    company: p.company,
    stage: p.stage,
    introduced_by: p.introduced_by,
    day: mapDay(p.met_on, p.created_at, timeZone, today),
    // Someone with no interactions has no stats row.
    interactions: counts.get(p.id) ?? 0,
  }));
}
