"use server";
// Logging in with a code from an email, and logging out.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logAuthError } from "./auth-log";
import { isDemoEmail } from "./demo";
import { cleanLoginCode, looksLikeEmail } from "./login-code";
import { createClient } from "./supabase/server";
import type { FormState } from "./types";

/** Also says where the email went, so the next step can show it. */
export type LoginEmailState = FormState & { email?: string };

/**
 * Sends the login email: a code to type in, and a button as a backup.
 * Supabase creates the account the first time an address logs in.
 */
export async function sendLoginCode(_prev: LoginEmailState, formData: FormData): Promise<LoginEmailState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!looksLikeEmail(email)) {
    return { ok: false, fieldErrors: { email: "Enter your email address." } };
  }
  // Nobody can read the demo's inbox, so an email to it would only bounce.
  if (isDemoEmail(email)) {
    return { ok: false, fieldErrors: { email: "That's the demo account. Tap Try the demo below." } };
  }

  // Where the email's button should come back to. Supabase only honours an
  // address on its Redirect URLs list, so that list must name EXACT
  // addresses we own (never a wildcard like network-*.vercel.app, which anyone
  // could register and use to receive someone's login link). Anyone can
  // ask Supabase for an email directly, so the list is the real protection,
  // not this code.
  const origin = (await headers()).get("origin") ?? "http://localhost:3200";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error) {
    logAuthError("sendLoginCode", error);
    if (error.status === 429) {
      return {
        ok: false,
        message: "You asked for a code very recently. If the email arrived, use that code. Otherwise wait a minute and try again.",
      };
    }
    return { ok: false, message: "Couldn't send the email. Try again in a minute." };
  }
  return { ok: true, email };
}

/**
 * Logs in with the code from the email, typed into the app. The login is
 * saved in whichever app you typed it into, which matters on an iPhone
 * home-screen app (see lib/login-code.ts).
 */
export async function verifyLoginCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const code = cleanLoginCode(String(formData.get("code") ?? ""));
  if (!code) return { ok: false, fieldErrors: { code: "Type the 6 to 10 digits from the email." } };
  if (!looksLikeEmail(email)) return { ok: false, message: "Start over and enter your email again." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });

  if (error) {
    logAuthError("verifyLoginCode", error);
    // Supabase limits how fast codes can be tried, so guessing can't work.
    if (error.status === 429) {
      return { ok: false, fieldErrors: { code: "Too many tries. Wait a minute, then try again." } };
    }
    // Supabase unreachable (no status) or broken (5xx): the code probably
    // wasn't even checked, so "wrong code" would send you off for a new
    // email you don't need.
    if (!error.status || error.status >= 500) {
      return { ok: false, message: "Couldn't check the code just now. Tap Log in again in a minute." };
    }
    return {
      ok: false,
      fieldErrors: { code: "That code didn't work. Check it's from the newest email, or start over for a new one." },
    };
  }
  // Outside any try/catch on purpose: redirect() works by throwing.
  redirect("/");
}

/**
 * Logs out THIS device only ("local"): your phone stays logged in when you
 * log out on the laptop. The cookie goes first, so you're logged out here
 * whatever happens to the request to Supabase.
 */
export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) logAuthError("signOut", error);
  redirect("/login");
}
