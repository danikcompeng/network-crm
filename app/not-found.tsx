// An address that isn't a page (a mistyped link, an old bookmark): a calm
// message and a way home, instead of Next's default page. Logged out, the
// proxy has already sent you to Log in, so this is for signed-in people.
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[28rem] flex-1 flex-col justify-center gap-6 px-5 py-16">
      <div>
        <h1 tabIndex={-1} className="outline-none text-title font-semibold tracking-tight">Nothing here</h1>
        <p className="mt-3 text-lead text-ink-muted">This address isn&apos;t a page. The link may be old or mistyped.</p>
      </div>
      <Link href="/" className={buttonClass("primary")}>
        Go to Today
      </Link>
    </main>
  );
}
