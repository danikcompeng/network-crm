import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { DemoLogin } from "@/components/demo-login";
import { LoginForm } from "@/components/login-form";
import { OrbitMark } from "@/components/orbit-mark";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-identity";
import { demoCredentials } from "@/lib/demo";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    // max-w-[28rem] is wider than a phone, so phones get exactly the 20 px
    // gutter (px-5); larger screens get a centred column.
    <main className="mx-auto flex w-full max-w-[28rem] flex-1 flex-col px-5 pt-[max(4rem,calc(env(safe-area-inset-top)+3rem))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="mb-10">
        <OrbitMark size={32} cropped className="text-accent" />
        <h1 tabIndex={-1} className="outline-none mt-5 text-display font-semibold tracking-tight text-ink">{APP_NAME}</h1>
        <p className="mt-3 text-lead text-ink-muted">{APP_DESCRIPTION}</p>
      </header>
      <div className="flex flex-col gap-8">
        {/* The form reads the address (?error=link), which only exists per request. */}
        <Suspense fallback={<FormSkeleton />}>
          <LoginForm />
        </Suspense>
        <Suspense fallback={null}>
          <DemoIfSetUp />
        </Suspense>
      </div>
    </main>
  );
}

/**
 * "Try the demo", only when DEMO_EMAIL and DEMO_PASSWORD are set. Checked
 * per request (after connection()), not baked in at build time, so a build
 * made without them still shows the demo once the server has them. Only
 * whether they're set is used; they never reach the page.
 */
async function DemoIfSetUp() {
  await connection();
  return demoCredentials() ? <DemoLogin /> : null;
}

/** Same shape as the email step, so nothing jumps when it arrives. */
function FormSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <div className="flex flex-col gap-2">
        <div className="h-5 w-12 rounded bg-surface-sunk" />
        <div className="h-12 rounded-(--radius-field) bg-surface-sunk" />
      </div>
      <div className="h-12 rounded-(--radius-field) bg-surface-sunk" />
      <div className="h-12" />
    </div>
  );
}
