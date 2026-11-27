// One person: what's next, how you know them, notes, and what happened
// (plans/crm.md, Feature 2).
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContactScreen } from "@/components/contact-screen";
import { ChevronLeftIcon } from "@/components/icons";
import { PersonPageTransition } from "@/components/person-page-transition";
import { isId } from "@/lib/contact-input";
import { loadContact } from "@/lib/contacts-data";
import { userToday } from "@/lib/server-helpers";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Person" };

export default function ContactPage({ params }: PageProps<"/people/[id]">) {
  return (
    // The whole page is what the row that opened it grows into (Motion polish):
    // opaque, so nothing behind shows through while it grows.
    <PersonPageTransition>
      <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col bg-background px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-8">
        <Link
          href="/people"
          className="-ml-3 inline-flex min-h-11 items-center gap-1 self-start rounded-(--radius-field) pr-3 pl-1.5 text-sm font-semibold text-accent active:bg-surface-press"
        >
          <ChevronLeftIcon size={20} />
          People
        </Link>
        {/* The id is request data (Cache Components): read it inside Suspense. */}
        <Suspense fallback={<ContactSkeleton />}>
          {params.then(({ id }) => (
            <Contact id={id} />
          ))}
        </Suspense>
      </main>
    </PersonPageTransition>
  );
}

async function Contact({ id }: { id: string }) {
  if (!isId(id)) notFound();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login");
  const [data, today] = await Promise.all([loadContact(supabase, id), userToday()]);
  if (!data) notFound();
  return <ContactScreen data={data} today={today} />;
}

function ContactSkeleton() {
  return (
    <div aria-hidden="true" className="mt-3">
      <div className="h-9 w-56 rounded bg-surface-sunk" />
      <div className="mt-3 h-5 w-64 rounded bg-surface-sunk" />
      <div className="mt-4 h-8 w-28 rounded-full bg-surface-sunk" />
      <div className="mt-8 h-24 rounded-(--radius-card) bg-surface-sunk" />
      <div className="mt-4 h-40 rounded-(--radius-card) bg-surface-sunk" />
    </div>
  );
}
