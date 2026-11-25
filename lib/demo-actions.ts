"use server";
// "Try the demo" on the login page, and "Reset demo" for the demo account.
// Both run on the server: the browser only ever asks for "the demo", and
// never sees its email or password.

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { logAuthError } from "./auth-log";
import { demoCredentials, isDemoEmail, seedDemo } from "./demo";
import { needsReseed } from "./demo-seed";
import { guarded, requireUser, userTimeZone, userToday } from "./server-helpers";
import { createClient } from "./supabase/server";
import type { FormState } from "./types";

/**
 * Logs into the shared demo account with the password from the server's
 * environment, putting the sample network back first if they're over an
 * hour old, from another day, or were never seeded.
 */
export async function signInDemo(): Promise<FormState> {
  const result = await guarded("signInDemo", "Couldn't open the demo. Please try again.", async () => {
    const credentials = demoCredentials();
    if (!credentials) return { ok: false, message: "The demo isn't set up yet." };

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (error) {
      logAuthError("signInDemo", error);
      // Every demo sign-in comes from our server's address, so a busy
      // minute can hit Supabase's per-address limit.
      if (error.status === 429) {
        return { ok: false, message: "Lots of people just tried the demo. Wait a minute, then try again." };
      }
      // Wrong password (changed in Supabase but not here) or no account:
      // nothing the visitor can fix.
      return { ok: false, message: "The demo isn't working right now. Please try again later." };
    }

    const [today, timeZone] = await Promise.all([userToday(), userTimeZone()]);
    // Metadata straight from the sign-in, not the login token, which can
    // hold an old copy.
    if (needsReseed(data.user.user_metadata, new Date(), today)) {
      try {
        await seedDemo(supabase, data.user, today, timeZone);
      } catch (seedError) {
        // Let them in anyway: the markers weren't written, so the next
        // demo sign-in tries again, and Reset demo is right there.
        console.error("signInDemo: seeding failed:", seedError);
      }
    }
    return { ok: true };
  });
  // Outside guarded on purpose: redirect() works by throwing.
  if (result.ok) redirect("/");
  return result;
}

/** Reset demo: the sample network, fresh, now. The demo account only. */
export async function resetDemo(): Promise<FormState> {
  return guarded("resetDemo", "Couldn't reset the demo. Please try again.", async () => {
    const { supabase } = await requireUser();
    // getUser asks Supabase who this is (not just the token), and seedDemo
    // checks the email again before anything is replaced.
    const { data } = await supabase.auth.getUser();
    if (!data.user || !isDemoEmail(data.user.email)) {
      return { ok: false, message: "Only the demo account can be reset." };
    }
    const [today, timeZone] = await Promise.all([userToday(), userTimeZone()]);
    await seedDemo(supabase, data.user, today, timeZone);
    refresh();
    return { ok: true };
  });
}
