"use client";

// Today (plans/crm.md, Feature 4): who to follow up with now, and who's
// coming up this week. The log sheet and the person sheet belong to this
// screen, not to a card, so they outlive a card that leaves its list.

import { useLayoutEffect, useState } from "react";
import Link from "next/link";
import { LogOutButton, ResetDemoButton } from "@/components/account-actions";
import { ContactDialog } from "@/components/contact-dialog";
import { ChevronRightIcon, PlusIcon } from "@/components/icons";
import { LogSheet, type LogTarget } from "@/components/log-sheet";
import { PersonSheet } from "@/components/person-sheet";
import { StageLabel } from "@/components/stage-chip";
import { Button } from "@/components/ui/button";
import { TILES, type Tile } from "@/lib/applications";
import { buildToday, comingUpDay, dueBadge, initials, lastContact, longDay, nextHint, type TodayPerson } from "@/lib/today";

type Props = {
  people: TodayPerson[];
  tiles: Record<Tile, number>;
  anyPeople: boolean;
  today: string;
  demo: boolean;
  email: string | undefined;
};

export function TodayScreen({ people, tiles, anyPeople, today, demo, email }: Props) {
  const [logFor, setLogFor] = useState<LogTarget | null>(null);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const view = buildToday(people, today);
  const allZero = Object.values(tiles).every((n) => n === 0);

  // Hidden pages stay alive: never come back to a sheet left open.
  useLayoutEffect(
    () => () => {
      setLogFor(null);
      setSheetFor(null);
    },
    [],
  );

  return (
    <>
      <header>
        <p className="text-sm font-medium text-ink-muted">{longDay(today)}</p>
        <div className="mt-1 flex items-center gap-3">
          <h1 tabIndex={-1} className="text-title font-semibold tracking-tight outline-none">
            Today
          </h1>
          {demo && <span className="rounded-md bg-surface-press px-2 py-0.5 text-sm font-medium text-ink-muted">Demo</span>}
        </div>
      </header>

      {/* One quiet strip, like the mock: the counts are context, Follow up is the job. */}
      <nav
        aria-label="Applications"
        className="mt-5 grid grid-cols-3 divide-x divide-line overflow-hidden rounded-(--radius-card) border border-line-strong bg-surface"
      >
        {(Object.keys(TILES) as Tile[]).map((t) => (
          <Link key={t} href={`/applications?status=${t}`} className="flex min-h-[60px] flex-col justify-center px-3 py-2 active:bg-surface-press">
            <span className={`text-section font-semibold tabular-nums ${allZero ? "text-ink-muted" : ""}`}>{tiles[t]}</span>
            <span className="text-sm text-ink-muted">{TILES[t].label}</span>
          </Link>
        ))}
      </nav>

      <section aria-labelledby="follow-up" className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="follow-up" className="text-section font-semibold tracking-tight">
            Follow up
          </h2>
          {view.followUp.length > 0 && <span className="text-sm text-ink-muted tabular-nums">{view.followUp.length} due</span>}
        </div>
        {view.followUp.length === 0 ? (
          <EmptyDay view={view} anyPeople={anyPeople} today={today} />
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {view.followUp.map((p) => (
              <li key={p.id}>
                <FollowUpCard person={p} today={today} onOpen={() => setSheetFor(p.id)} onLog={() => setLogFor({ id: p.id, name: p.name })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {view.comingUp.length > 0 && (
        <section aria-labelledby="coming-up" className="mt-8">
          <h2 id="coming-up" className="text-section font-semibold tracking-tight">
            Coming up
          </h2>
          <ul className="mt-3 overflow-hidden rounded-(--radius-card) border border-line-strong bg-surface">
            {view.comingUp.map((p) => (
              <li key={p.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => setSheetFor(p.id)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left active:bg-surface-press"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    {p.company && <span className="block truncate text-sm text-ink-muted">{p.company}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-sm text-ink-muted tabular-nums">
                    {comingUpDay(p.next_follow_up!, today)}
                    <ChevronRightIcon size={16} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="min-h-12 flex-1" aria-hidden="true" />
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        {/* Who's logged in, so a login link from someone else's email is easy to notice. */}
        <p className="min-w-0 truncate text-sm text-ink-muted">{demo ? "Demo account" : email}</p>
        <div className="-mr-3 flex items-center gap-1">
          {demo && <ResetDemoButton />}
          <LogOutButton />
        </div>
      </footer>

      <PersonSheet
        personId={sheetFor}
        onClose={() => setSheetFor(null)}
        onLog={(person) => {
          setSheetFor(null);
          setLogFor(person);
        }}
        today={today}
      />
      <LogSheet person={logFor} onClose={() => setLogFor(null)} today={today} />
    </>
  );
}

function FollowUpCard({ person: p, today, onOpen, onLog }: { person: TodayPerson; today: string; onOpen: () => void; onLog: () => void }) {
  const badge = dueBadge(p.next_follow_up!, today);
  const where = [p.company, p.role].filter(Boolean).join(" · ");
  return (
    <article className="rounded-(--radius-card) border border-line-strong bg-surface">
      {/* The card opens the person sheet; Log sits beside it, never inside. */}
      <button type="button" onClick={onOpen} className="flex w-full gap-3 rounded-t-(--radius-card) px-4 pt-4 pb-2 text-left active:bg-surface-press">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-press text-sm font-semibold text-ink-muted">
          {initials(p.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="line-clamp-2 min-w-0 font-semibold [overflow-wrap:anywhere]">{p.name}</span>
            <span
              className={`rounded-md bg-surface-press px-2 py-0.5 text-sm font-semibold ${badge.overdue ? "text-danger" : "text-ink"}`}
            >
              {badge.text}
            </span>
            {p.stage === "parked" && <StageLabel stage="parked" className="text-sm" />}
          </span>
          {where && <span className="mt-0.5 block truncate text-sm text-ink-muted">{where}</span>}
          {p.how_met && <span className="mt-0.5 block truncate text-sm text-ink-muted">{p.how_met}</span>}
        </span>
      </button>
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2">
        <span className="text-sm text-ink-muted">{lastContact(p.last_day, today)}</span>
        <Button size="sm" block={false} onClick={onLog}>
          Log<span className="sr-only"> contact with {p.name}</span>
        </Button>
      </div>
    </article>
  );
}

/** The first screen a new account sees: the same first step as People and Map. */
function FirstPerson({ today }: { today: string }) {
  const [adding, setAdding] = useState(false);
  useLayoutEffect(() => () => setAdding(false), []);
  return (
    <div className="mt-8 flex flex-col items-start gap-4">
      <p className="text-lead text-ink-muted">No one in your network yet. Add the people you meet, and their follow-ups land here.</p>
      <Button block={false} onClick={() => setAdding(true)}>
        <PlusIcon size={18} />
        Add a person
      </Button>
      <ContactDialog open={adding} onClose={() => setAdding(false)} today={today} people={[]} />
    </div>
  );
}

function EmptyDay({ view, anyPeople, today }: { view: ReturnType<typeof buildToday>; anyPeople: boolean; today: string }) {
  if (!anyPeople) {
    return (
      <FirstPerson today={today} />
    );
  }
  if (!view.anyFollowUps) {
    return (
      <p className="mt-3 text-ink-muted">
        No follow-ups set. Give someone a follow-up date (on their page, or after logging a chat) and they’ll show up here on the day.
      </p>
    );
  }
  const hint = view.comingUp.length === 0 ? nextHint(view.next, today) : null;
  return (
    <p className="mt-3 text-ink-muted">
      Nothing to follow up today.{hint ? ` ${hint}.` : ""}
    </p>
  );
}
