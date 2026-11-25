"use client";

// The bottom tab bar on every signed-in screen (plans/crm.md, Feature 2).
// Real links; the current one has aria-current="page". Each feature adds
// its tab here, so the bar never offers a screen that doesn't exist.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ComponentType, type SVGProps } from "react";
import { HomeIcon, PeopleIcon } from "@/components/icons";

type Tab = { href: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }> };

export const TABS: readonly Tab[] = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/people", label: "People", Icon: PeopleIcon },
];

/** The tab a path belongs to: "/people/123/edit" is People; "/" only matches itself. */
export function currentTab(path: string, tabs: readonly { href: string }[] = TABS): string | null {
  const match = tabs
    .filter((t) => (t.href === "/" ? path === "/" : path === t.href || path.startsWith(`${t.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.href ?? null;
}

/**
 * The bar, with the current tab marked. usePathname waits for the request
 * below a dynamic segment (/people/[id]) with Cache Components, so the
 * marked bar sits in its own Suspense; the fallback is the same bar with
 * no current tab, so nothing moves when it arrives.
 */
export function TabBar() {
  return (
    <Suspense fallback={<Bar current={null} />}>
      <CurrentBar />
    </Suspense>
  );
}

function CurrentBar() {
  return <Bar current={currentTab(usePathname())} />;
}

function Bar({ current }: { current: string | null }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line-strong bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-[32rem]">
        {TABS.map(({ href, label, Icon }) => {
          const active = current === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-sm font-medium " +
                  "transition-colors duration-(--motion-fast) ease-(--ease-out) active:bg-surface-press " +
                  (active ? "text-accent" : "text-ink-muted hover:text-ink")
                }
              >
                {/* The current tab has a tinted pill and a heavier label, not only a colour. */}
                <span
                  className={`flex h-7 w-14 items-center justify-center rounded-full ${active ? "bg-accent-tint" : ""}`}
                >
                  <Icon size={22} strokeWidth={active ? 2 : 1.75} />
                </span>
                <span className={active ? "font-semibold" : ""}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
