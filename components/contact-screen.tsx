"use client";

// One person's page (plans/crm.md, Feature 2): who they are, what's next,
// how you know them (the whole chain above them), who they introduced you
// to, notes, and the timeline. Edit opens the sheet over this page and
// saving refreshes it in place.

import { useId, useState } from "react";
import Link from "next/link";
import { ApplicationDialog } from "@/components/application-dialog";
import { ApplicationRowView } from "@/components/applications-screen";
import { ContactDialog } from "@/components/contact-dialog";
import { PlusIcon } from "@/components/icons";
import { applicationOrder, type ApplicationRow } from "@/lib/applications";
import { StageChip } from "@/components/stage-chip";
import { Button } from "@/components/ui/button";
import { INTERACTION_LABELS, TIMELINE_LIMIT } from "@/lib/crm";
import type { ContactPageData } from "@/lib/contacts-data";
import { followUpBucket, followUpLabel } from "@/lib/follow-up";
import { formatDay } from "@/lib/format";
import { chainAbove, introductions } from "@/lib/network";
import { byName } from "@/lib/people";

export function ContactScreen({ data, today }: { data: ContactPageData; today: string }) {
  const { contact, people, timeline, interactionCount, applications } = data;
  const [editing, setEditing] = useState(false);
  const [addingApplication, setAddingApplication] = useState(false);
  const [openApplication, setOpenApplication] = useState<ApplicationRow | null>(null);

  const links = people.map((p) => ({ id: p.id, introducedBy: p.introduced_by }));
  const byId = new Map(people.map((p) => [p.id, p]));
  const chain = chainAbove(links, contact.id).map((id) => byId.get(id)!);
  const introduced = (introductions(links).get(contact.id) ?? []).map((id) => byId.get(id)!).sort(byName);
  const where = [contact.company, contact.role].filter(Boolean).join(" · ");

  return (
    <>
      <header className="mt-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 text-title font-semibold tracking-tight break-words">{contact.name}</h1>
          <Button variant="secondary" size="sm" block={false} onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        {where && <p className="mt-2 text-lead text-ink-muted">{where}</p>}
        <div className="mt-3">
          <StageChip stage={contact.stage} />
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
                  <span className="font-semibold">{contact.name}</span>
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
            <p className="text-ink-muted">None linked to {contact.name}.</p>
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
            <p className="whitespace-pre-line break-words">{contact.notes}</p>
          </Card>
        )}

        <Card title="Timeline">
          {timeline.length === 0 ? (
            <p className="text-ink-muted">Nothing logged yet.</p>
          ) : (
            <>
              <ol className="flex flex-col">
                {timeline.map((entry) => (
                  <li key={entry.id} className="border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
                    <p className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-semibold">{INTERACTION_LABELS[entry.kind]}</span>
                      <time dateTime={entry.day} className="text-ink-muted tabular-nums">
                        {formatDay(entry.day, today)}
                      </time>
                    </p>
                    {entry.note && <p className="mt-1 break-words">{entry.note}</p>}
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
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-(--radius-card) border border-line-strong bg-surface p-4">
      <h2 id={id} className="mb-2 text-sm font-medium text-ink-muted">
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
      <dd className="min-w-0 break-words">{children}</dd>
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
          ? "-mx-2 flex min-h-11 items-center rounded-(--radius-field) px-2 font-medium text-accent active:bg-surface-press"
          : "font-medium text-accent"
      }
    >
      {name}
    </Link>
  );
}
