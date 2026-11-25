// Home, for now (plans/crm.md, Feature 1): who's logged in and a one-line
// summary of the network, read from the database so the demo seed is
// visibly working. Feature 4 replaces this with Today.
import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOutButton, ResetDemoButton } from "@/components/account-actions";
import { NetworkMark } from "@/components/icons";
import { APP_NAME } from "@/lib/app-identity";
import { isDemoEmail } from "@/lib/demo";
import { networkSummary, summaryText } from "@/lib/network";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      {/* Everything here depends on who you are, so it waits for the request. */}
      <Suspense fallback={<HomeSkeleton />}>
        <Home />
      </Suspense>
    </main>
  );
}

async function Home() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login");
  const email = auth.claims.email as string | undefined;
  const demo = isDemoEmail(email);

  const { data, error } = await supabase.from("crm_contacts").select("id, introduced_by");
  // app/error.tsx shows "Couldn't load this page" with Try again.
  if (error) throw new Error(`Home: ${error.message} (${error.code})`);
  const summary = networkSummary(data.map((row) => ({ id: row.id as string, introducedBy: row.introduced_by as string | null })));

  return (
    <>
      <header className="flex min-h-12 items-center gap-2.5">
        <NetworkMark size={24} className="text-accent" />
        <span className="text-base font-semibold tracking-tight">{APP_NAME}</span>
        {demo && (
          <span className="ml-1 rounded-full bg-surface-press px-2.5 py-0.5 text-sm font-medium text-ink-muted">Demo</span>
        )}
      </header>

      <section aria-labelledby="your-network" className="mt-10">
        <h1 id="your-network" className="text-title font-semibold tracking-tight">
          Your network
        </h1>
        <p className="mt-3 text-lead text-ink-muted tabular-nums">{summaryText(summary)}</p>
      </section>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        {/* Who's logged in, so a login link from someone else's email
            (which would log you into THEIR account) is easy to notice. */}
        <p className="min-w-0 truncate text-sm text-ink-muted">{demo ? "Demo account" : email}</p>
        {/* -mr-3: the links' own padding, so their text lines up with the content's right edge. */}
        <div className="-mr-3 flex items-center gap-1">
          {demo && <ResetDemoButton />}
          <LogOutButton />
        </div>
      </footer>
    </>
  );
}

/** The same shape as Home, so nothing jumps when it arrives. */
function HomeSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="flex min-h-12 items-center gap-2.5">
        <div className="size-6 rounded-full bg-surface-sunk" />
        <div className="h-4 w-20 rounded bg-surface-sunk" />
      </div>
      <div className="mt-10 h-9 w-44 rounded bg-surface-sunk" />
      <div className="mt-4 h-5 w-64 rounded bg-surface-sunk" />
    </div>
  );
}
