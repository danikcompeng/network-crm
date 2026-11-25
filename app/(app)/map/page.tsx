// The network map: You in the middle, everyone around, who introduced whom
// (plans/crm.md, Feature 5).
import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NetworkMap } from "@/components/network-map";
import { loadMap } from "@/lib/map-data";
import { userTimeZone, userToday } from "@/lib/server-helpers";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Map" };

export default function MapPage() {
  return (
    <main className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-8">
      <Suspense fallback={<MapSkeleton />}>
        <MapContent />
      </Suspense>
    </main>
  );
}

async function MapContent() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login");
  const [today, timeZone] = await Promise.all([userToday(), userTimeZone()]);
  const people = await loadMap(supabase, timeZone, today);
  return <NetworkMap people={people} today={today} />;
}

function MapSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="h-9 w-52 rounded bg-surface-sunk" />
      <div className="mt-3 h-5 w-64 rounded bg-surface-sunk" />
      <div className="mt-5 aspect-square max-h-[min(60dvh,520px)] w-full rounded-(--radius-card) bg-surface-sunk" />
    </div>
  );
}
