import "server-only";
// The shared demo account: who it is, and putting its sample network back.
//
// "server-only": DEMO_EMAIL and DEMO_PASSWORD must never reach a browser.
// They have no NEXT_PUBLIC_ prefix, so Next.js wouldn't bundle them anyway;
// this line also makes the build fail if a browser file imports this one.

import type { SupabaseClient } from "@supabase/supabase-js";
import { demoSeedPayload, seededMarkers } from "./demo-seed";

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

  const marked = await supabase.auth.updateUser({ data: seededMarkers(new Date(), today) });
  if (marked.error) throw new Error(`seedDemo: write markers: ${marked.error.message}`);
}
