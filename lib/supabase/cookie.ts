// Orbit's own name for the Supabase login cookie ("network-auth", from
// before the rename: kept, since renaming it would log everyone out).
//
// Orbit, Hold and Bitewise share one Supabase project, so by default all
// three would use "sb-<project>-auth-token". On localhost that's the same
// cookie for every app (cookies ignore the port), and logging out of one
// would log you out of the others. Used by every Supabase client here
// (lib/supabase/server.ts and proxy.ts), so they all read the same login.
export const AUTH_COOKIE_NAME = "network-auth";

/**
 * Options for every Supabase cookie Orbit sets. httpOnly: only the server
 * reads the login (there's no browser Supabase client), so page scripts,
 * and anything injected into them, can't steal the tokens. secure: only
 * over HTTPS once deployed (plain http://localhost would drop it).
 */
export const AUTH_COOKIE_OPTIONS = {
  name: AUTH_COOKIE_NAME,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
} as const;
