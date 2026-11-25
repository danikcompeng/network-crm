"use client";

// When a page can't load (Supabase unreachable, say): a calm message and a
// way to try again, instead of a blank screen. Covers every page, so the
// wording doesn't assume which one. (Next 16 passes `retry`, not `reset`.)

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-[28rem] flex-1 flex-col justify-center gap-6 px-5 py-16">
      <div>
        <h1 className="text-title font-semibold tracking-tight">Couldn&apos;t load this page</h1>
        <p className="mt-3 text-lead text-ink-muted">Check your connection, then try again. Nothing you saved is lost.</p>
      </div>
      <Button onClick={() => retry()}>Try again</Button>
    </main>
  );
}
