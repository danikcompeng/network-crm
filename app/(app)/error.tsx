"use client";

// When a screen inside the app can't load: the same calm message as
// app/error.tsx, but inside the tab layout (laid out like the tab screens),
// so the tab bar stays and you can go somewhere else. (Next 16 passes
// `retry`, not `reset`.)

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-8">
      <h1 tabIndex={-1} className="text-title font-semibold tracking-tight outline-none">
        Couldn&apos;t load this screen
      </h1>
      <p className="mt-3 text-lead text-ink-muted">Check your connection, then try again. Nothing you saved is lost.</p>
      <Button block={false} className="mt-6 self-start" onClick={() => retry()}>
        Try again
      </Button>
    </main>
  );
}
