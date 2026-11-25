"use client";

// Log out, and for the demo account, Reset demo.

import { useActionState } from "react";
import { signOut } from "@/lib/auth-actions";
import { resetDemo } from "@/lib/demo-actions";
import type { FormState } from "@/lib/types";

const LINK =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-(--radius-field) px-3 text-sm font-semibold text-ink " +
  "hover:text-accent active:bg-surface-press aria-disabled:cursor-not-allowed";

export function LogOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className={LINK}>
        Log out
      </button>
    </form>
  );
}

type ResetState = FormState & { done?: number };

export function ResetDemoButton() {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(
    async (prev) => {
      const result = await resetDemo();
      // A counter, so a second reset in a row is announced again.
      return result.ok ? { ok: true, done: (prev.done ?? 0) + 1 } : result;
    },
    { ok: false },
  );
  const message = pending ? "" : state.ok ? "Demo reset. The sample network is back." : state.message;
  return (
    <form action={formAction} className="flex flex-col items-start">
      <button
        type="submit"
        aria-disabled={pending || undefined}
        // Busy: one reset at a time (aria-disabled alone doesn't stop a submit).
        onClick={(event) => {
          if (pending) event.preventDefault();
        }}
        className={LINK}
      >
        {pending ? "Resetting…" : "Reset demo"}
      </button>
      <p role="status" className={message ? "px-3 text-sm text-ink-muted" : "sr-only"}>
        {message}
      </p>
    </form>
  );
}
