"use client";

// One person's page (plans/crm.md, Feature 2): who they are, what's next,
// how you know them (the whole chain above them), who they introduced you
// to, notes, and the timeline. Edit opens the sheet over this page and
// saving refreshes it in place.

import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ApplicationDialog } from "@/components/application-dialog";
import { ApplicationRowView } from "@/components/applications-screen";
import { ContactDialog } from "@/components/contact-dialog";
import { LogSheet } from "@/components/log-sheet";
import { PlusIcon } from "@/components/icons";
import { applicationOrder, type ApplicationRow } from "@/lib/applications";
import { StageChip } from "@/components/stage-chip";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/error-text";
import { INTERACTION_LABELS, TIMELINE_LIMIT } from "@/lib/crm";
import type { ContactPageData, TimelineEntry } from "@/lib/contacts-data";
import { undoInteraction } from "@/lib/interaction-actions";
import { followUpBucket, followUpLabel } from "@/lib/follow-up";
import { formatDay } from "@/lib/format";
import { chainAbove, introductions } from "@/lib/network";
import { byName } from "@/lib/people";

/** The timeline's heading id: unique, since a person page is one per id and Activity keeps other people's pages. */
const TIMELINE_HEADING = "person-timeline";

export function ContactScreen({ data, today }: { data: ContactPageData; today: string }) {
  const { contact, people, timeline, interactionCount, applications } = data;
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);
  // Hidden pages stay alive: never come back to a sheet left open.
  useLayoutEffect(
    () => () => {
      setLogging(false);
    },
    [],
  );
  const [addingApplication, setAddingApplication] = useState(false);
  const [openApplication, setOpenApplication] = useState<ApplicationRow | null>(null);

  const links = people.map((p) => ({ id: p.id, introducedBy: p.introduced_by }));
  const byId = new Map(people.map((p) => [p.id, p]));
  const chain = chainAbove(links, contact.id).map((id) => byId.get(id)!);
  const introduced = (introductions(links).get(contact.id) ?? []).map((id) => byId.get(id)!).sort(byName);
  // A no-break space before the dot, so a wrapped line never starts with "·".
  const where = [contact.company, contact.role].filter(Boolean).join("\u00a0· ");

  return (
    <>
      <header className="mt-2">
        <div className="flex items-start justify-between gap-3">
          {/* A very long name steps down a size, so the page's actions stay near the top. */}
          <h1
            tabIndex={-1}
            className={`min-w-0 font-semibold tracking-tight text-balance outline-none [overflow-wrap:anywhere] ${contact.name.length > 40 ? "text-section" : "text-title"}`}
          >
            {contact.name}
          </h1>
          <Button variant="secondary" size="sm" block={false} onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        {where && <p className="mt-2 text-lead text-ink-muted [overflow-wrap:anywhere]">{where}</p>}
        <div className="mt-3">
          <StageChip stage={contact.stage} />
        </div>
        <div className="mt-4">
          <Button onClick={() => setLogging(true)}>Log interaction</Button>
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-4">
        <Card title="Next follow-up">
          {contact.next_follow_up ? (
            <FollowUp day={contact.next_follow_up} today={today} />
          ) : (
            <p className="text-ink-muted">No follow-up set.</p>
          )}
        </Card>

        <Card title="How you know them">
          {chain.length === 0 ? (
            <p>You met them yourself.</p>
          ) : (
            <>
              <p className="text-ink-muted">Introduced through</p>
              {/* The chain, top down, ending with this person: each step a
                  44 px link, joined by a line. */}
              <ol aria-label="Introduction chain" className="mt-1">
                {chain.map((p) => (
                  <li key={p.id} className="relative pl-5 before:absolute before:top-0 before:bottom-0 before:left-[5px] before:w-px before:bg-edge">
                    <span aria-hidden="true" className="absolute top-1/2 left-0.5 size-2 -translate-y-1/2 rounded-full bg-edge" />
                    <PersonLink id={p.id} name={p.name} block />
                  </li>
                ))}
                <li className="relative flex min-h-11 items-center pl-5 before:absolute before:top-0 before:h-1/2 before:left-[5px] before:w-px before:bg-edge">
                  <span aria-hidden="true" className="absolute top-1/2 left-0 size-3 -translate-y-1/2 rounded-full bg-accent" />
                  <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{contact.name}</span>
                </li>
              </ol>
            </>
          )}
          {(contact.how_met || contact.met_on) && (
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              {contact.how_met && <Detail label="How you met">{contact.how_met}</Detail>}
              {contact.met_on && <Detail label="Met on">{formatDay(contact.met_on, today)}</Detail>}
            </dl>
          )}
        </Card>

        {introduced.length > 0 && (
          <Card title={`Introduced you to ${introduced.length === 1 ? "1 person" : `${introduced.length} people`}`}>
            <ul className="flex flex-col">
              {introduced.map((p) => (
                <li key={p.id}>
                  <PersonLink id={p.id} name={p.name} block />
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="Applications">
          {applications.length === 0 ? (
            <p className="text-ink-muted [overflow-wrap:anywhere]">None linked to {contact.name}.</p>
          ) : (
            <ul className="-mx-4 -mb-1">
              {[...applications].sort(applicationOrder(today)).map((a) => (
                <li key={a.id} className="border-b border-line last:border-b-0">
                  <ApplicationRowView application={a} person={null} today={today} onOpen={() => setOpenApplication(a)} />
                </li>
              ))}
            </ul>
          )}
          <Button variant="ghost" size="sm" block={false} className="-ml-3 mt-2" onClick={() => setAddingApplication(true)}>
            <PlusIcon size={18} />
            Add application
          </Button>
        </Card>

        {contact.notes && (
          <Card title="Notes">
            {/* Plain text: nothing in a note can run as HTML. */}
            <p className="whitespace-pre-line [overflow-wrap:anywhere]">{contact.notes}</p>
          </Card>
        )}

        <Card title="Timeline" headingId={TIMELINE_HEADING}>
          {timeline.length === 0 ? (
            <p className="text-ink-muted">Nothing logged yet.</p>
          ) : (
            <>
              <ol className="flex flex-col">
                {timeline.map((entry) => (
                  <li key={entry.id} className="border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
                    <TimelineItem entry={entry} today={today} contactHasFollowUp={contact.next_follow_up !== null} />
                  </li>
                ))}
              </ol>
              {interactionCount > TIMELINE_LIMIT && (
                <p className="mt-3 text-sm text-ink-muted">
                  Showing the latest {TIMELINE_LIMIT} of {interactionCount}.
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      <LogSheet person={logging ? { id: contact.id, name: contact.name } : null} onClose={() => setLogging(false)} today={today} />
      <ApplicationDialog
        open={addingApplication}
        onClose={() => setAddingApplication(false)}
        today={today}
        people={people}
        contactId={contact.id}
      />
      <ApplicationDialog
        open={openApplication !== null}
        onClose={() => setOpenApplication(null)}
        today={today}
        people={people}
        application={openApplication ?? undefined}
      />
      <ContactDialog
        open={editing}
        onClose={() => setEditing(false)}
        today={today}
        people={people}
        contact={contact}
        deleteInfo={{ interactions: interactionCount, introduced: introduced.map((p) => p.name), applications: applications.length }}
      />
    </>
  );
}

/** A titled card; named by its title, so screen readers can jump between them. */
function Card({ title, children, headingId }: { title: string; children: React.ReactNode; headingId?: string }) {
  const generated = useId();
  const id = headingId ?? generated;
  return (
    <section aria-labelledby={id} className="rounded-(--radius-card) border border-line-strong bg-surface p-4">
      <h2 id={id} tabIndex={-1} className="mb-2 text-sm font-medium text-ink-muted outline-none">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function FollowUp({ day, today }: { day: string; today: string }) {
  const bucket = followUpBucket(day, today);
  const label = followUpLabel(day, today);
  return (
    <p className={`text-lead tabular-nums ${bucket === "overdue" ? "font-semibold text-danger" : ""}`}>
      {label}
      {bucket !== "later" && <span className="font-normal text-ink-muted"> · {formatDay(day, today)}</span>}
    </p>
  );
}

function PersonLink({ id, name, block = false }: { id: string; name: string; block?: boolean }) {
  return (
    <Link
      href={`/people/${id}`}
      className={
        block
          ? "-mx-2 flex min-h-11 min-w-0 items-center rounded-(--radius-field) px-2 font-medium text-accent [overflow-wrap:anywhere] active:bg-surface-press"
          : "font-medium text-accent [overflow-wrap:anywhere]"
      }
    >
      {name}
    </Link>
  );
}

/**
 * One timeline entry, with Delete. The confirmation says when deleting it
 * would bring back a follow-up it had resolved (the database's rule: only
 * if they have no follow-up now, and nothing later resolved it too).
 */
/** A note longer than this folds to 6 lines, with Show all. */
const LONG_NOTE = 320;

function TimelineItem({ entry, today, contactHasFollowUp }: { entry: TimelineEntry; today: string; contactHasFollowUp: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const deleteRef = useRef<HTMLButtonElement>(null);
  // Keep: focus goes back to Delete, never to the top of the page.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (!confirming && wasConfirming.current) deleteRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  const label = INTERACTION_LABELS[entry.kind].toLowerCase();

  function remove() {
    startTransition(async () => {
      try {
        const result = await undoInteraction(entry.id);
        if (!result.ok) return setMessage(result.message);
        // The entry is about to disappear: focus the timeline's heading, not nothing.
        document.getElementById(TIMELINE_HEADING)?.focus();
      } catch {
        setMessage("Couldn’t delete. Check your connection and try again.");
      }
    });
  }

  return (
    <>
      <p className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">{INTERACTION_LABELS[entry.kind]}</span>
        <time dateTime={entry.day} className="text-ink-muted tabular-nums">
          {formatDay(entry.day, today)}
        </time>
      </p>
      {entry.note && (
        <>
          <p className={`mt-1 whitespace-pre-line [overflow-wrap:anywhere] ${entry.note.length > LONG_NOTE && !showAll ? "line-clamp-6" : ""}`}>{entry.note}</p>
          {entry.note.length > LONG_NOTE && (
            <Button variant="link" size="sm" block={false} className="-ml-3" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? "Show less" : "Show all"}
            </Button>
          )}
        </>
      )}
      {!confirming ? (
        <Button ref={deleteRef} variant="ghost" size="sm" block={false} className="-ml-3 mt-1" onClick={() => setConfirming(true)}>
          Delete<span className="sr-only"> this {label} from {formatDay(entry.day, today)}</span>
        </Button>
      ) : (
        <div role="group" aria-label={`Delete this ${label}?`} className="mt-2 flex flex-col gap-3 rounded-(--radius-field) border border-danger p-3">
          <p className="text-sm">
            <span className="font-semibold">
              Delete this {label} from {formatDay(entry.day, today)}?
            </span>
            {entry.cleared_follow_up && !contactHasFollowUp && (
              <span className="text-ink-muted"> This may bring back the {formatDay(entry.cleared_follow_up, today)} follow-up it resolved.</span>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" block={false} onClick={() => setConfirming(false)} busy={pending}>
              Keep
            </Button>
            <Button variant="danger" size="sm" block={false} onClick={remove} busy={pending}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </div>
          {message && <ErrorText>{message}</ErrorText>}
        </div>
      )}
    </>
  );
}
