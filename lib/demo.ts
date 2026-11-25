import "server-only";
// The shared demo account: who it is, and putting its sample network back.
//
// "server-only": DEMO_EMAIL and DEMO_PASSWORD must never reach a browser.
// They have no NEXT_PUBLIC_ prefix, so Next.js wouldn't bundle them anyway;
// this line also makes the build fail if a browser file imports this one.

import type { SupabaseClient } from "@supabase/supabase-js";
import { demoSeedPayload, seededMarkers, type DemoState, type TableState } from "./demo-seed";

/** The demo login, or null if the env vars aren't set (no demo then). */
export function demoCredentials(): { email: string; password: string } | null {
  const email = process.env.DEMO_EMAIL?.trim();
  const password = process.env.DEMO_PASSWORD;
  return email && password ? { email, password } : null;
}

/** Is this the demo account's email? Never true when no demo is set up. */
export function isDemoEmail(email: unknown): boolean {
  const demo = process.env.DEMO_EMAIL?.trim().toLowerCase();
  return Boolean(demo) && typeof email === "string" && email.trim().toLowerCase() === demo;
}

/**
 * Replaces the demo account's contacts, interactions and applications with the samples, dated from `today`
 * in `timeZone`. `supabase` must be logged in as the demo: the database
 * function only ever replaces the caller's own data (Row Level Security).
 *
 * `user` is checked first as well, so a bug can never wipe a real account.
 *
 * The data changes all at once or not at all (reseed_demo_crm is one
 * database transaction), so there's no half-made seed to guard against.
 * The markers are written once, after it: if that fails, the old markers
 * stay and the next sign-in simply reseeds again. (One auth call per seed,
 * not two: Supabase rate-limits auth calls per address, and the demo
 * shares that limit with Hold and Bitewise.)
 */
export async function seedDemo(
  supabase: SupabaseClient,
  user: { email?: string },
  today: string,
  timeZone: string | undefined,
): Promise<void> {
  if (!isDemoEmail(user.email)) throw new Error("seedDemo: not the demo account");

  const { error } = await supabase.rpc("reseed_demo_crm", { p_seed: demoSeedPayload(today, timeZone) });
  if (error) throw new Error(`seedDemo: reseed: ${error.message} (${error.code})`);

  // The database's time of the seed: every seeded contact has this updated_at.
  const state = await demoState(supabase);
  const marked = await supabase.auth.updateUser({ data: seededMarkers(new Date(), today, state.contacts.latest) });
  if (marked.error) throw new Error(`seedDemo: write markers: ${marked.error.message}`);
}

/**
 * Row counts and the newest change in each table, for the account behind
 * `supabase` (RLS: only its own rows). Three small requests; the newest
 * change comes back as the first row of a sorted, one-row answer.
 */
export async function demoState(supabase: SupabaseClient): Promise<DemoState> {
  async function table(name: string, column: string): Promise<TableState> {
    const { data, count, error } = await supabase
      .from(name)
      .select(column, { count: "exact" })
      .order(column, { ascending: false })
      .limit(1);
    if (error) throw new Error(`demoState: ${name}: ${error.message} (${error.code})`);
    const first = (data as unknown as Record<string, string>[] | null)?.[0];
    return { count: count ?? 0, latest: first?.[column] ?? null };
  }
  const [contacts, interactions, applications] = await Promise.all([
    table("crm_contacts", "updated_at"),
    table("crm_interactions", "created_at"),
    table("crm_applications", "updated_at"),
  ]);
  return { contacts, interactions, applications };
}
