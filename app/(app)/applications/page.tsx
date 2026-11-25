// Applications: every internship application, where each stands, and a
// paste-import for the ones already in a spreadsheet (plans/crm.md, Feature 3).
import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ApplicationsScreen } from "@/components/applications-screen";
import { loadApplications } from "@/lib/contacts-data";
import { userToday } from "@/lib/server-helpers";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Applications" };

export default function ApplicationsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-8">
      <Suspense fallback={<ApplicationsSkeleton />}>
        <Applications />
      </Suspense>
    </main>
  );
}

async function Applications() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login");
  const [{ applications, people }, today] = await Promise.all([loadApplications(supabase), userToday()]);
  return <ApplicationsScreen applications={applications} people={people} today={today} />;
}

function ApplicationsSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="flex min-h-12 items-center justify-between">
        <div className="h-8 w-40 rounded bg-surface-sunk" />
        <div className="h-11 w-40 rounded-(--radius-field) bg-surface-sunk" />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[72px] rounded-(--radius-card) bg-surface-sunk" />
        ))}
      </div>
      <div className="mt-4 h-12 rounded-(--radius-field) bg-surface-sunk" />
      <div className="mt-5 flex flex-col gap-px overflow-hidden rounded-(--radius-card)">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[76px] bg-surface-sunk" />
        ))}
      </div>
    </div>
  );
}
