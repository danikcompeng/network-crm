"use client";

// "Try the demo", under the email form: logs into the shared demo account
// with no email. The server does the logging in; this only asks for it.

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/error-text";
import { signInDemo } from "@/lib/demo-actions";
import type { FormState } from "@/lib/types";

export function DemoLogin() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(signInDemo, { ok: false });
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-sm font-medium text-ink-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <Button type="submit" variant="secondary" busy={pending}>
        {pending ? "Opening the demo…" : "Try the demo"}
      </Button>
      <p className="text-center text-sm font-medium text-balance text-ink-muted">
        A shared account with a sample network. No email needed.
      </p>
      {!pending && state.message && <ErrorText className="justify-center">{state.message}</ErrorText>}
    </form>
  );
}
