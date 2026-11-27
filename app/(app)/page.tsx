// Today: who to follow up with now, and who's coming up this week
// (plans/crm.md, Feature 4). It replaced Feature 1's temporary Home.
import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExpandSourceScreen } from "@/components/person-page-transition";
import { TodayScreen } from "@/components/today-screen";
import { isDemoEmail } from "@/lib/demo";
import { userToday } from "@/lib/server-helpers";
import { createClient } from "@/lib/supabase/server";
import { loadToday } from "@/lib/today-data";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    // A card here can grow into a person's page; the rest fades out under it (Motion polish).
    <ExpandSourceScreen>
      <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-6">
        {/* Everything here depends on who you are and what day it is for you. */}
        <Suspense fallback={<TodaySkeleton />}>
          <Today />
        </Suspense>
      </main>
    </ExpandSourceScreen>
  );
}

async function Today() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login");
  const email = auth.claims.email as string | undefined;
  // One "today" for everything on this screen.
  const [data, today] = await Promise.all([loadToday(supabase), userToday()]);
  return <TodayScreen {...data} today={today} demo={isDemoEmail(email)} email={email} />;
}

/** The same shape as Today, so nothing jumps when it arrives. */
function TodaySkeleton() {
  return (
    <div aria-hidden="true">
      <div className="h-4 w-40 rounded bg-surface-sunk" />
      <div className="mt-2 h-9 w-28 rounded bg-surface-sunk" />
      <div className="mt-5 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[72px] rounded-(--radius-card) bg-surface-sunk" />
        ))}
      </div>
      <div className="mt-8 h-6 w-28 rounded bg-surface-sunk" />
      <div className="mt-3 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[148px] rounded-(--radius-card) bg-surface-sunk" />
        ))}
      </div>
    </div>
  );
}
