// Runs before every page request (Next.js 16 renamed "middleware" to "proxy").
// Two jobs:
//   1. Refresh the Supabase login cookie, so you stay logged in.
//   2. Send anyone who isn't logged in to /login (and anyone who is, away from it).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_OPTIONS } from "./lib/supabase/cookie";
import { TZ_COOKIE } from "./lib/tz-cookie";

/** Pages you can open without logging in. Everything else needs a login. */
export const PUBLIC_PATHS = ["/login", "/auth"];

export function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          // Supabase asks for no-cache headers when it refreshes a login,
          // so no shared cache keeps one person's cookie for another.
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // getClaims() checks the login token's signature, so it can't be faked
  // (getSession() would trust whatever the cookie says).
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);
  const path = request.nextUrl.pathname;

  // A server action (a button on a page) from someone whose login just
  // ended: let it through, so the action answers with its own friendly
  // message instead of the request being bounced to /login. Every action
  // checks the login itself (requireUser).
  const isAction = request.headers.has("next-action");

  if (!loggedIn && !isPublicPath(path) && !isAction) return redirectKeepingCookies(request, response, "/login");
  if (loggedIn && path === "/login") return redirectKeepingCookies(request, response, "/");
  keepTimezoneCookie(request, response);
  return response;
}

/**
 * Sets the timezone cookie again from the server, for another year. Safari
 * deletes cookies written by page scripts after 7 days; one the server sets
 * lasts as long as it says, so an app left open for weeks keeps its
 * timezone.
 */
export function keepTimezoneCookie(request: NextRequest, response: NextResponse) {
  const value = request.cookies.get(TZ_COOKIE)?.value;
  if (value) response.cookies.set(TZ_COOKIE, value, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

// A redirect is a brand-new response, so copy over any refreshed cookies.
function redirectKeepingCookies(request: NextRequest, from: NextResponse, to: string) {
  const redirect = NextResponse.redirect(new URL(to, request.url));
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: [
    // Everything except static files. The manifest and icons are skipped
    // too: phones fetch them without your login cookie, and would get the
    // login page instead of the icon. proxy.test.ts checks real paths.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|txt|xml)$).*)",
  ],
};
