"use client";

// Two steps: your email, then the code from the email. The email's button
// also works, but typing the code is what logs in an iPhone home-screen
// app (lib/login-code.ts says why).

import { useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/error-text";
import { TextField } from "@/components/ui/text-field";
import { sendLoginCode, verifyLoginCode, type LoginEmailState } from "@/lib/auth-actions";
import { looksLikeEmail } from "@/lib/login-code";
import type { FormState } from "@/lib/types";

export function LoginForm() {
  // "Start over" goes back to the email step with a brand-new form (a new
  // key), which clears what the last attempt sent back. The email you
  // typed is kept up here, so you don't have to type it again.
  const [attempt, setAttempt] = useState(0);
  const [email, setEmail] = useState("");
  return (
    <EmailStep
      key={attempt}
      email={email}
      onEmailChange={setEmail}
      restarted={attempt > 0}
      onStartOver={() => setAttempt((n) => n + 1)}
    />
  );
}

type EmailStepProps = {
  email: string;
  onEmailChange: (email: string) => void;
  restarted: boolean;
  onStartOver: () => void;
};

function EmailStep({ email, onEmailChange, restarted, onStartOver }: EmailStepProps) {
  const [state, formAction, pending] = useActionState<LoginEmailState, FormData>(sendLoginCode, { ok: false });
  const [haveCode, setHaveCode] = useState(false);
  // "I already have a code" with no email yet: said here, next to the box.
  const [localError, setLocalError] = useState<string | null>(null);
  const linkFailed = useSearchParams().get("error") === "link" && !restarted;
  const emailRef = useRef<HTMLInputElement>(null);

  // A problem with the email: put the cursor back in the box, so the
  // keyboard is already open to fix it.
  useEffect(() => {
    if (state.fieldErrors?.email) emailRef.current?.focus();
  }, [state]);

  if (state.ok && state.email) return <CodeStep email={state.email} sent onStartOver={onStartOver} />;
  if (haveCode) return <CodeStep email={email.trim()} sent={false} onStartOver={onStartOver} />;

  const emailError = localError ?? (pending ? undefined : state.fieldErrors?.email);

  return (
    <form action={formAction} noValidate onSubmit={() => setLocalError(null)} className="flex flex-col gap-5">
      {linkFailed && (
        <div className="rounded-(--radius-field) bg-surface px-4 py-3">
          <ErrorText>That login link expired or was already used. Get a new code below.</ErrorText>
        </div>
      )}
      <TextField
        ref={emailRef}
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        inputMode="email"
        enterKeyHint="send"
        placeholder="name@email.com"
        value={email}
        onChange={(e) => {
          onEmailChange(e.target.value);
          setLocalError(null);
        }}
        autoFocus={restarted}
        error={emailError}
      />
      {!pending && state.message && <ErrorText>{state.message}</ErrorText>}
      <div className="flex flex-col gap-2">
        <Button type="submit" busy={pending}>
          {pending ? "Sending…" : "Email me a code"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (looksLikeEmail(email.trim())) {
              setHaveCode(true);
            } else {
              setLocalError("Enter the email the code was sent to first.");
              emailRef.current?.focus();
            }
          }}
        >
          I already have a code
        </Button>
      </div>
    </form>
  );
}

function CodeStep({ email, sent, onStartOver }: { email: string; sent: boolean; onStartOver: () => void }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(verifyLoginCode, { ok: false });
  const [code, setCode] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  // A wrong code: put the cursor back in the box, so you can fix it.
  useEffect(() => {
    if (state.fieldErrors?.code) codeRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {/* Which email the code was sent to: the server needs it to check. */}
      <input type="hidden" name="email" value={email} />
      <TextField
        ref={codeRef}
        id="code"
        name="code"
        label="Code from the email"
        // Read out with the box, so a screen reader also hears which
        // address the code went to (and can catch a typo).
        hint={
          <>
            {sent ? "We sent a code to " : "Type the code we sent to "}
            <strong className="font-semibold">{email}</strong>.
          </>
        }
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        enterKeyHint="go"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={16}
        placeholder="123456"
        className="tracking-[0.2em] tabular-nums"
        error={pending ? undefined : state.fieldErrors?.code}
      />
      {!pending && state.message && <ErrorText>{state.message}</ErrorText>}
      <div className="flex flex-col gap-2">
        <Button type="submit" busy={pending}>
          {pending ? "Logging in…" : "Log in"}
        </Button>
        <Button variant="ghost" busy={pending} onClick={onStartOver}>
          Start over
        </Button>
      </div>
    </form>
  );
}
