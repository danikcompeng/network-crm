// People: everyone you know, searchable and filtered by stage
// (plans/crm.md, Feature 2).
import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PeopleScreen } from "@/components/people-screen";
import { loadPeople } from "@/lib/contacts-data";
import { userToday } from "@/lib/server-helpers";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "People" };

export default function PeoplePage() {
  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-8">
      <Suspense fallback={<PeopleSkeleton />}>
        <People />
      </Suspense>
    </main>
  );
}

async function People() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login");
  const [people, today] = await Promise.all([loadPeople(supabase), userToday()]);
  return <PeopleScreen people={people} today={today} />;
}

/** The same shape as the list, so nothing jumps when it arrives. */
function PeopleSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="flex min-h-12 items-center justify-between">
        <div className="h-8 w-28 rounded bg-surface-sunk" />
        <div className="h-11 w-24 rounded-(--radius-field) bg-surface-sunk" />
      </div>
      <div className="mt-5 h-12 rounded-(--radius-field) bg-surface-sunk" />
      <div className="mt-4 flex gap-2">
        {[64, 72, 96, 80].map((w) => (
          <div key={w} className="h-11 rounded-full bg-surface-sunk" style={{ width: w }} />
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-px overflow-hidden rounded-(--radius-card)">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[68px] bg-surface-sunk" />
        ))}
      </div>
    </div>
  );
}
