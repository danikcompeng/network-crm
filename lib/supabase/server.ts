import "server-only";
import { createServerClient } from "@supabase/ssr";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { AUTH_COOKIE_OPTIONS } from "./cookie";

// Supabase remembers who is logged in with cookies. This makes a client
// that reads and writes them for the current request. Make a new one per
// request; never share one between users.
export async function createClient() {
  const cookieStore = await cookies();
  // Supabase checks the login token's expiry against the clock. With
  // Partial Prefetching, Next prerenders a per-login App Shell and refuses
  // clock reads in it ("unstable value Date.now()"), so wait for the real
  // request first. In actions and real requests this returns at once.
  await io();

  return createServerClient(supabaseUrl(), supabaseKey(), {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components can't set cookies (only actions and route
          // handlers can). That's fine: proxy.ts keeps the session fresh.
        }
      },
    },
  });
}

/** The project URL. Public (it's in every browser request to Supabase anyway). */
export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set (see README: Environment)");
  return url;
}

/**
 * The publishable ("anon") key. Public by design: what it can do is limited
 * by Row Level Security. Never the service-role key, which this app doesn't use.
 */
export function supabaseKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set (see README: Environment)");
  return key;
}
