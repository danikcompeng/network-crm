"use client";

// Keeps "today" on today (plans/crm.md, Feature 2): every label that says
// "Today", "Tomorrow" or "3 days overdue" was worked out on the server for
// one day. This reloads the page's data when the app comes back to the
// foreground (a new day after the phone slept, changes from another
// device, a demo reset), and when the DEVICE's date changes while it stays
// open. It never compares with the server's date, so a phone with a wrong
// clock can't make it reload over and over. Adapted from Hold.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveTimezoneCookie } from "@/components/timezone-sync";
import { todayIn } from "@/lib/dates";

const CHECK_EVERY_MS = 30_000;
const AT_MOST_EVERY_MS = 2_000;

function deviceToday(): string {
  return todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function DayWatcher() {
  const router = useRouter();

  useEffect(() => {
    let lastDay = deviceToday();
    let lastRefresh = Date.now();

    function reload() {
      const now = Date.now();
      // focus and visibilitychange arrive together on return: one reload.
      if (now - lastRefresh < AT_MOST_EVERY_MS) return;
      lastRefresh = now;
      lastDay = deviceToday();
      saveTimezoneCookie();
      router.refresh();
    }
    function onVisible() {
      if (document.visibilityState === "visible") reload();
    }
    function checkDate() {
      if (deviceToday() !== lastDay) reload();
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", reload);
    const timer = setInterval(checkDate, CHECK_EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", reload);
      clearInterval(timer);
    };
  }, [router]);

  return null;
}
