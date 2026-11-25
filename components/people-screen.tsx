"use client";

// The People list (plans/crm.md, Feature 2): search and stage filter run
// here, on the one list the page loaded, so they're instant. The address
// keeps them (?q=&stage=) through history.replaceState, which never
// navigates, so Back from a person returns to the same list.

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ContactDialog } from "@/components/contact-dialog";
import { BellIcon, CloseIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { StageLabel } from "@/components/stage-chip";
import { Button } from "@/components/ui/button";
import { STAGES, STAGE_LABELS } from "@/lib/crm";
import { followUpBucket, followUpLabel } from "@/lib/follow-up";
import { count, talkedLabel } from "@/lib/format";
import { filterPeople, parseStageFilter, type PersonRow, type StageFilter } from "@/lib/people";

type ListPerson = PersonRow & { last_day: string | null };

export function PeopleScreen({ people, today }: { people: ListPerson[]; today: string }) {
  const params = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [stage, setStage] = useState<StageFilter>(() => parseStageFilter(params.get("stage")));
  // "Deleted Sam Okafor" arrives as ?deleted=. This page stays alive while
  // hidden (<Activity>), so watch the address rather than reading it once,
  // keep the words once shown (the address drops the param right after),
  // and clear them when the page is hidden, so they don't greet the next
  // visit. Only shown if nobody by that name is still listed, so a crafted
  // link can't announce a deletion that didn't happen.
  const deletedParam = params.get("deleted");
  const [deleted, setDeleted] = useState<string | null>(null);
  const [seenParam, setSeenParam] = useState<string | null>(null);
  if (deletedParam !== seenParam) {
    setSeenParam(deletedParam);
    if (deletedParam && !people.some((p) => p.name === deletedParam)) setDeleted(deletedParam);
  }
  useLayoutEffect(() => () => setDeleted(null), []);
  const [adding, setAdding] = useState(false);

  // Keep the filter in the address, without navigating (and drop
  // ?deleted= once it's been shown, so a reload doesn't repeat it).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("q", query.trim());
    else url.searchParams.delete("q");
    if (stage !== "all") url.searchParams.set("stage", stage);
    else url.searchParams.delete("stage");
    url.searchParams.delete("deleted");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [query, stage, deletedParam]);

  const { visible, counts } = useMemo(() => filterPeople(people, query, stage), [people, query, stage]);
  const filtering = query.trim() !== "" || stage !== "all";

  return (
    <>
      <header className="flex min-h-12 items-center justify-between gap-3">
        <h1 tabIndex={-1} className="outline-none text-title font-semibold tracking-tight">People</h1>
        {/* Empty, the Add under the explanation is the one to press. */}
        {people.length > 0 && (
          <Button size="sm" block={false} onClick={() => setAdding(true)}>
            <PlusIcon size={18} />
            Add
          </Button>
        )}
      </header>

      {/* Always mounted, filled after: screen readers announce a change to a status, not one that arrives full. */}
      <p role="status" className={deleted ? "mt-3 text-sm text-ink-muted" : "sr-only"}>
        {deleted ? `Deleted ${deleted}.` : ""}
      </p>

      {people.length === 0 ? (
        <EmptyAccount onAdd={() => setAdding(true)} />
      ) : (
        <>
          <div className="relative mt-5">
            <label htmlFor="people-search" className="sr-only">
              Search people
            </label>
            <SearchIcon size={20} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-muted" />
            <input
              id="people-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, company or role"
              autoComplete="off"
              enterKeyHint="search"
              className="h-12 w-full rounded-(--radius-field) border border-edge bg-surface pr-12 pl-12 text-base text-ink placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-0.5 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-(--radius-field) text-ink-muted hover:text-ink"
              >
                <CloseIcon size={18} />
                <span className="sr-only">Clear search</span>
              </button>
            )}
          </div>

          {/* Stage chips: one at a time; scrolls sideways on a narrow phone. */}
          <div role="group" aria-label="Stage" className="-mx-5 mt-3 flex scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {(["all", ...STAGES] as const).map((s) => {
              const selected = stage === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setStage(s)}
                  className={
                    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap " +
                    "transition-colors duration-(--motion-fast) ease-(--ease-out) " +
                    (selected
                      ? "border-accent bg-accent-tint text-accent"
                      : "border-line-strong bg-surface text-ink hover:border-edge active:bg-surface-press")
                  }
                >
                  {s === "all" ? "All" : STAGE_LABELS[s]}
                  <span className={`tabular-nums ${selected ? "text-accent" : "text-ink-muted"}`}>{counts[s]}</span>
                </button>
              );
            })}
          </div>

          <p role="status" className="sr-only">
            {count(visible.length, "person", "people")}
          </p>

          {visible.length === 0 ? (
            <div className="mt-10 flex flex-col items-start gap-3">
              <p className="text-lead text-ink-muted">
                {query.trim() ? <>No one matches &ldquo;{query.trim()}&rdquo;{stage !== "all" ? ` in ${STAGE_LABELS[stage]}` : ""}.</> : `No one in ${STAGE_LABELS[stage as Exclude<StageFilter, "all">]} yet.`}
              </p>
              {filtering && (
                <Button
                  variant="secondary"
                  size="sm"
                  block={false}
                  onClick={() => {
                    setQuery("");
                    setStage("all");
                  }}
                >
                  Show everyone
                </Button>
              )}
            </div>
          ) : (
            <ul className="mt-4 overflow-hidden rounded-(--radius-card) border border-line-strong bg-surface">
              {visible.map((p) => (
                <li key={p.id} className="border-b border-line last:border-b-0">
                  <PersonRowLink person={p} today={today} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ContactDialog open={adding} onClose={() => setAdding(false)} today={today} people={people} />
    </>
  );
}

function PersonRowLink({ person, today }: { person: ListPerson; today: string }) {
  const where = [person.company, person.role].filter(Boolean).join(" · ");
  const due = person.next_follow_up;
  const bucket = due !== null ? followUpBucket(due, today) : null;
  return (
    <Link
      href={`/people/${person.id}`}
      className="flex min-h-[68px] flex-col justify-center gap-1 px-4 py-3 transition-colors duration-(--motion-fast) active:bg-surface-press"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-semibold">{person.name}</span>
        {due ? (
          // A scale: overdue (red, bold), today (ink, bold), then muted.
          <span
            className={`inline-flex shrink-0 items-center gap-1 text-sm tabular-nums ${
              bucket === "overdue" ? "font-semibold text-danger" : bucket === "today" ? "font-semibold text-ink" : "text-ink-muted"
            }`}
          >
            <BellIcon size={14} />
            <span className="sr-only">Follow up: </span>
            {followUpLabel(due, today)}
          </span>
        ) : person.last_day ? (
          <span className="shrink-0 text-sm text-ink-muted tabular-nums">{talkedLabel(person.last_day, today)}</span>
        ) : null}
      </span>
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <StageLabel stage={person.stage} className="shrink-0" />
        {where && (
          <>
            <span aria-hidden="true" className="text-ink-muted">
              ·
            </span>
            <span className="min-w-0 truncate text-ink-muted">{where}</span>
          </>
        )}
      </span>
    </Link>
  );
}

function EmptyAccount({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-10 flex flex-col items-start gap-4">
      <p className="text-lead text-ink-muted">No one yet. Add the first person you&rsquo;ve met: a recruiter, a professor, a friend who knows someone.</p>
      <Button block={false} onClick={onAdd}>
        <PlusIcon size={18} />
        Add a person
      </Button>
    </div>
  );
}
