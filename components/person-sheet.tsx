"use client";

// A quick look at someone from Today (plans/crm.md, Feature 4): who they
// are, their follow-up (change or clear it without logging anything),
// notes, the latest 5 interactions, their page, and Log interaction. It
// loads its own data when it opens, so it works for anyone.

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { StageLabel } from "@/components/stage-chip";
import { Button, buttonClass } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/error-text";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { INTERACTION_LABELS } from "@/lib/crm";
import { followUpBucket, followUpLabel } from "@/lib/follow-up";
import { formatDay } from "@/lib/format";
import { setFollowUp } from "@/lib/interaction-actions";
import { loadPersonSheet, type PersonSheetData } from "@/lib/person-sheet-actions";

type Props = {
  personId: string | null;
  onClose: () => void;
  onLog: (person: { id: string; name: string }) => void;
  today: string;
};

export function PersonSheet({ personId, onClose, onLog, today }: Props) {
  const uid = useId();
  const [person, setPerson] = useState<PersonSheetData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [nextDay, setNextDay] = useState("");
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  // Fresh for every person it opens for.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (personId !== openedFor) {
    setOpenedFor(personId);
    setPerson(null);
    setMessage(null);
    setChanging(false);
  }

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!personId) return;
    let cancelled = false;
    startLoading(async () => {
      try {
        const result = await loadPersonSheet(personId);
        if (cancelled) return;
        if (result.ok) setPerson(result.person);
        else setMessage(result.message);
      } catch {
        if (!cancelled) setMessage("Couldn’t load them. Check your connection and try again.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [personId, attempt]);

  function saveFollowUp(day: string | null) {
    if (!person || saving) return;
    // Save needs a day; only "Clear it" clears.
    if (day === "") return setMessage("Pick a day, or use Clear it.");
    setMessage(null);
    startSaving(async () => {
      try {
        const result = await setFollowUp(person.id, day, person.next_follow_up);
        if (!result.ok) {
          setMessage(result.message);
          // Changed elsewhere: show what it is now, so the next try can work.
          if (result.reason === "changed") {
            setChanging(false);
            setAttempt((n) => n + 1);
          }
          return;
        }
        setPerson({ ...person, next_follow_up: day });
        setChanging(false);
      } catch {
        setMessage("Couldn’t save. Check your connection and try again.");
      }
    });
  }

  const where = person ? [person.company, person.role].filter(Boolean).join(" · ") : "";
  const due = person?.next_follow_up ?? null;

  return (
    <Sheet
      compact
      open={personId !== null}
      onClose={onClose}
      busy={saving}
      title={person?.name ?? (message ? "Couldn’t load" : "Loading…")}
      footer={
        person ? (
          <div className="flex gap-3">
            <Link href={`/people/${person.id}`} onClick={onClose} className={buttonClass("secondary")}>
              Their page
            </Link>
            <Button onClick={() => onLog({ id: person.id, name: person.name })}>Log interaction</Button>
          </div>
        ) : undefined
      }
    >
      {message && <ErrorText className="mb-4">{message}</ErrorText>}
      {!person && message && !loading && (
        <Button variant="secondary" block={false} onClick={() => {
          setMessage(null);
          setAttempt((n) => n + 1);
        }}>
          Try again
        </Button>
      )}
      {!person && loading && (
        <div aria-hidden="true" className="flex flex-col gap-3">
          <div className="h-5 w-48 rounded bg-surface-sunk" />
          <div className="h-20 rounded-(--radius-card) bg-surface-sunk" />
          <div className="h-32 rounded-(--radius-card) bg-surface-sunk" />
        </div>
      )}
      {person && (
        <div className="flex flex-col gap-5">
          <div>
            {where && <p className="text-lead text-ink-muted">{where}</p>}
            <p className="mt-2 text-sm">
              <StageLabel stage={person.stage} />
            </p>
            {person.how_met && <p className="mt-1 text-sm text-ink-muted">{person.how_met}</p>}
          </div>

          <section aria-labelledby={`${uid}-follow`} className="rounded-(--radius-card) border border-line-strong bg-surface p-4">
            <h3 id={`${uid}-follow`} className="mb-1 text-sm font-medium text-ink-muted">
              Next follow-up
            </h3>
            {!changing ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={due && followUpBucket(due, today) === "overdue" ? "font-semibold text-danger" : ""}>
                  {due ? dueWords(due, today) : "None set"}
                </p>
                <Button
                  variant="link"
                  size="sm"
                  block={false}
                  className="-my-2 -mr-2"
                  onClick={() => {
                    setNextDay(due && due >= today ? due : today);
                    setChanging(true);
                  }}
                >
                  {due ? "Change" : "Set one"}
                </Button>
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-3">
                <TextField id={`${uid}-next`} type="date" label="Follow up on" min={today} value={nextDay} onChange={(e) => setNextDay(e.target.value)} />
                <div className="flex flex-wrap gap-3">
                  <Button size="sm" block={false} onClick={() => saveFollowUp(nextDay)} busy={saving}>
                    Save
                  </Button>
                  {due && (
                    <Button variant="secondary" size="sm" block={false} onClick={() => saveFollowUp(null)} busy={saving}>
                      Clear it
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" block={false} onClick={() => setChanging(false)} busy={saving}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </section>

          {person.notes && (
            <section aria-labelledby={`${uid}-notes`}>
              <h3 id={`${uid}-notes`} className="mb-1 text-sm font-medium text-ink-muted">
                Notes
              </h3>
              <p className="rounded-(--radius-card) bg-surface-press p-4 whitespace-pre-line break-words">{person.notes}</p>
            </section>
          )}

          <section aria-labelledby={`${uid}-recent`}>
            <h3 id={`${uid}-recent`} className="mb-1 text-sm font-medium text-ink-muted">
              Latest
            </h3>
            {person.recent.length === 0 ? (
              <p className="text-ink-muted">Nothing logged yet.</p>
            ) : (
              <ol className="flex flex-col">
                {person.recent.map((entry) => (
                  <li key={entry.id} className="border-b border-line py-2.5 last:border-b-0">
                    <p className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-semibold">{INTERACTION_LABELS[entry.kind]}</span>
                      <time dateTime={entry.day} className="text-ink-muted tabular-nums">
                        {formatDay(entry.day, today)}
                      </time>
                    </p>
                    {entry.note && <p className="mt-0.5 text-sm break-words text-ink-muted">{entry.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}

/** "3 days overdue · Nov 21", "Today · Nov 24", or just "Dec 9" when the label is already the date. */
function dueWords(day: string, today: string): string {
  const label = followUpLabel(day, today);
  const date = formatDay(day, today);
  return label === date ? date : `${label} · ${date}`;
}
