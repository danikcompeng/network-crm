import "server-only";
// Reading what Today shows (plans/crm.md, Feature 4): everyone with a
// follow-up (at most 1,000: one request), the day you last talked to each,
// and the application statuses for the three tiles.

import type { SupabaseClient } from "@supabase/supabase-js";
import { TILES, type Tile } from "./applications";
import type { ApplicationStatus } from "./crm";
import type { TodayPerson } from "./today";

function fail(where: string, error: { message: string; code?: string }): never {
  throw new Error(`${where}: ${error.message} (${error.code})`);
}

export type TodayData = { people: TodayPerson[]; tiles: Record<Tile, number>; anyPeople: boolean };

export async function loadToday(supabase: SupabaseClient): Promise<TodayData> {
  const [people, stats, applications, count] = await Promise.all([
    supabase
      .from("crm_contacts")
      .select("id, name, company, role, how_met, stage, next_follow_up")
      .not("next_follow_up", "is", null)
      .limit(1000),
    supabase.rpc("crm_contact_stats"),
    supabase.from("crm_applications").select("status").limit(1000),
    supabase.from("crm_contacts").select("id", { count: "exact", head: true }),
  ]);
  if (people.error) fail("Today", people.error);
  if (stats.error) fail("Today: stats", stats.error);
  if (applications.error) fail("Today: applications", applications.error);
  if (count.error) fail("Today: count", count.error);
  const lastDay = new Map((stats.data as { contact_id: string; last_day: string }[]).map((s) => [s.contact_id, s.last_day]));
  const statuses = (applications.data as { status: ApplicationStatus }[]).map((a) => a.status);
  const tiles = Object.fromEntries(
    (Object.keys(TILES) as Tile[]).map((t) => [t, statuses.filter((s) => (TILES[t].statuses as readonly string[]).includes(s)).length]),
  ) as Record<Tile, number>;
  return {
    people: (people.data as Omit<TodayPerson, "last_day">[]).map((p) => ({ ...p, last_day: lastDay.get(p.id) ?? null })),
    tiles,
    anyPeople: (count.count ?? 0) > 0,
  };
}
