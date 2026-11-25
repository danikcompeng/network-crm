"use client";

// A short message just above the tab bar (plans/crm.md, Feature 3,
// design-critic): where a thumb already is, instead of at the top of a long
// list, and without pushing anything down. It goes away after 4 seconds.
// Screen readers get the same words from a separate, always-mounted status
// region, so nothing depends on seeing it.

import { useEffect, useState } from "react";
import { AlertIcon } from "@/components/icons";

export type ToastMessage = { id: number; text: string; tone: "info" | "error" };

export function Toast({ message }: { message: ToastMessage | null }) {
  const [shown, setShown] = useState<ToastMessage | null>(null);

  // A new message replaces the old one and restarts the clock.
  const [seen, setSeen] = useState<ToastMessage | null>(null);
  if (message !== seen) {
    setSeen(message);
    setShown(message);
  }
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), 4000);
    return () => clearTimeout(timer);
  }, [shown]);

  return (
    <>
      <p role="status" className="sr-only">
        {message?.text ?? ""}
      </p>
      {shown && (
        <div
          aria-hidden="true"
          className={
            "fixed inset-x-5 z-30 mx-auto flex max-w-[30rem] items-start gap-2 rounded-(--radius-card) border border-line-strong bg-surface px-4 py-3 text-sm font-medium " +
            "bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.5rem)] motion-safe:animate-[sheet-up_var(--motion-base)_var(--ease-out)] " +
            (shown.tone === "error" ? "text-danger" : "text-ink")
          }
        >
          {shown.tone === "error" && <AlertIcon size={16} className="mt-0.5 shrink-0" />}
          <span>{shown.text}</span>
        </div>
      )}
    </>
  );
}
