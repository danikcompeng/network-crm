"use client";

// Tells the server your timezone, so "today" means YOUR today.
//
// The server runs on UTC and can't see your clock. The browser knows your
// timezone (e.g. "America/Toronto"), so it saves it in a small "tz" cookie
// that's sent with every request. If the cookie was missing or out of date
// (first visit, or you travelled), the page reloads its data once with the
// right day. Same approach as Hold and Bitewise.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { TZ_COOKIE } from "@/lib/tz-cookie";

/**
 * Saves your timezone in the cookie, every time (so it never quietly
 * expires; proxy.ts also re-sets it from the server, which Safari keeps
 * longer). Returns true if the value changed, meaning the page's "today"
 * may be wrong.
 */
export function saveTimezoneCookie(): boolean {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!tz) return false;
  const saved = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${TZ_COOKIE}=`))
    ?.slice(TZ_COOKIE.length + 1);
  document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
  return readable(saved) !== tz;
}

/** The cookie's value decoded, or null if it's missing or garbled. */
function readable(saved: string | undefined): string | null {
  if (!saved) return null;
  try {
    return decodeURIComponent(saved);
  } catch {
    return null;
  }
}

export function TimezoneSync() {
  const router = useRouter();
  // Kept across runs of the effect: in development React runs it twice,
  // and the second run would find the cookie already saved.
  const needsRefresh = useRef(false);

  useEffect(() => {
    if (saveTimezoneCookie()) needsRefresh.current = true;
    if (!needsRefresh.current) return;
    needsRefresh.current = false;
    router.refresh();
  }, [router]);

  return null;
}
