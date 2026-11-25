import "server-only";
// Shared by server actions and pages. Not a "use server" file on purpose:
// everything exported from one of those becomes something the browser can
// call, and these are helpers, not actions.

import { io } from "next/cache";
import { cookies } from "next/headers";
import { TZ_COOKIE } from "./tz-cookie";
import { isValidTimeZone, todayIn } from "./dates";
import { createClient } from "./supabase/server";

/**
 * Server actions can be called by anyone who sends a POST request, not only
 * through our forms, so every action starts here. Returns a client acting
 * as you, and your user id from the verified login token ("sub").
 */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new Error("Not logged in");
  return { supabase, userId, email: data.claims.email as string | undefined };
}

/** Your timezone from the "tz" cookie (components/timezone-sync.tsx), or undefined if missing or unknown. */
export async function userTimeZone(): Promise<string | undefined> {
  const raw = (await cookies()).get(TZ_COOKIE)?.value;
  if (!raw) return undefined;
  let tz: string;
  try {
    tz = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  return isValidTimeZone(tz) ? tz : undefined;
}

/**
 * Today in your timezone (UTC until the cookie arrives).
 *
 * `await io()` before reading the clock: with Partial Prefetching, Next.js
 * prerenders a per-login "App Shell", and refuses to bake the current time
 * into it. io() pauses during that prerender and returns at once during a
 * real request (node_modules/next/dist/docs/.../functions/io.md).
 */
export async function userToday(): Promise<string> {
  const tz = await userTimeZone();
  await io();
  return todayIn(tz);
}

/**
 * Runs an action and turns an unexpected failure on the server (expired
 * login, Supabase unreachable) into a friendly message for the form,
 * instead of the error page replacing the whole screen. The real reason is
 * logged.
 */
export async function guarded<T extends { ok: boolean; message?: string }>(
  action: string,
  message: string,
  run: () => Promise<T>,
): Promise<T | { ok: false; message: string }> {
  try {
    return await run();
  } catch (error) {
    console.error(`${action} failed:`, error);
    return { ok: false, message };
  }
}
