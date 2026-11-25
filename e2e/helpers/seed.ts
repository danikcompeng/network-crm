// Puts the demo's sample network back from the TEST RUNNER, through the
// same database function the app uses (reseed_demo_crm), as the demo user.
//
// Why not click "Reset demo" before every test: that also writes the
// demo's markers through Supabase's auth API, which is rate-limited per
// address (and shared with Hold's and Bitewise's demos). Here it's one
// sign-in per run, then plain database calls.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { todayIn } from "../../lib/dates";
import { demoSeedPayload, type SeedPayload } from "../../lib/demo-seed";

let client: Promise<SupabaseClient> | null = null;

export function demoClient(): Promise<SupabaseClient> {
  client ??= (async () => {
    // Playwright doesn't read .env.local by itself.
    try {
      process.loadEnvFile(".env.local");
    } catch {
      // Already in the environment (CI), or missing: checked below.
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const email = process.env.DEMO_EMAIL;
    const password = process.env.DEMO_PASSWORD;
    if (!url || !key || !email || !password) throw new Error("e2e: the Supabase and DEMO_* env vars are needed (.env.local)");
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`e2e: demo sign-in failed: ${error.message}`);
    return supabase;
  })();
  return client;
}

/** This machine's timezone (the browser's too) and its today. */
export function localToday(): { timeZone: string; today: string } {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { timeZone, today: todayIn(timeZone) };
}

/**
 * The sample network, fresh, dated from today in this machine's timezone.
 * Or `seed` instead, for a test that needs another state (an empty
 * account): that test must put the samples back afterwards, even if it
 * fails, because real visitors share this demo.
 */
export async function reseedDemo(seed?: SeedPayload): Promise<void> {
  const supabase = await demoClient();
  const { timeZone, today } = localToday();
  const { error } = await supabase.rpc("reseed_demo_crm", { p_seed: seed ?? demoSeedPayload(today, timeZone) });
  if (error) throw new Error(`e2e: reseed failed: ${error.message}`);
}
