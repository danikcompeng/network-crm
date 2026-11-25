// A person who isn’t in your network (deleted, from another account, or a
// mistyped address). Inside the tab bar, laid out like a person's page.
import Link from "next/link";
import { ChevronLeftIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui/button";

export default function PersonNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-8">
      <Link
        href="/people"
        className="-ml-3 inline-flex min-h-11 items-center gap-1 self-start rounded-(--radius-field) pr-3 pl-1.5 text-sm font-semibold text-accent active:bg-surface-press"
      >
        <ChevronLeftIcon size={20} />
        People
      </Link>
      <h1 tabIndex={-1} className="outline-none mt-2 text-title font-semibold tracking-tight">Not in your network</h1>
      <p className="mt-3 text-lead text-ink-muted">This person isn’t here. Maybe they were deleted, or the link is wrong.</p>
      <Link href="/people" className={buttonClass("secondary", { block: false }, "mt-6 self-start")}>
        Back to People
      </Link>
    </main>
  );
}
