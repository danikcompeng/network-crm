"use client";

// Log an interaction in two taps (plans/crm.md, Feature 4): Log, then a
// kind. A bottom sheet over the page (you keep your place, and the kinds
// sit near the thumb). It belongs to the screen, not to a card, so it
// outlives the card it was opened from (logging clears the follow-up and
// the card leaves "Follow up" at once). After logging it offers, in one
// place, the next follow-up and Undo.

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/error-text";
import { Sheet } from "@/components/ui/sheet";
import { TextAreaField } from "@/components/ui/text-area-field";
import { TextField } from "@/components/ui/text-field";
import { INTERACTION_KINDS, INTERACTION_LABELS, type InteractionKind } from "@/lib/crm";
import { daysBetween } from "@/lib/dates";
import { formatDay, formatWeekday } from "@/lib/format";
import { logInteraction, setFollowUp, undoInteraction, type LogResult } from "@/lib/interaction-actions";
import { followUpOffer, loggedWords } from "@/lib/interaction-input";

export type LogTarget = { id: string; name: string };

type Logged = Extract<LogResult, { ok: true }> & { kind: InteractionKind };

type Props = {
  /** Who to log for; null closes the sheet. */
  person: LogTarget | null;
  onClose: () => void;
  /** The screen's today: only the date field's limit and words (the server decides the real day). */
  today: string;
};

export function LogSheet({ person, onClose, today }: Props) {
  const uid = useId();
  const [extras, setExtras] = useState(false);
  const [note, setNote] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [sending, setSending] = useState<InteractionKind | null>(null);
  const [logged, setLogged] = useState<Logged | null>(null);
  const [offerDay, setOfferDay] = useState("");
  /** The follow-up this sheet set after the log (Undo takes it back too). */
  const [setByUs, setSetByUs] = useState<string | null>(null);
  const [followUpDone, setFollowUpDone] = useState<"set" | "kept" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const loggedRef = useRef<HTMLParagraphElement>(null);

  // The kind button that had focus is gone once it's logged: focus moves to what happened.
  useEffect(() => {
    if (logged) loggedRef.current?.focus();
  }, [logged]);

  // Fresh for every person it opens for (pages kept alive keep state).
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if ((person?.id ?? null) !== openedFor) {
    setOpenedFor(person?.id ?? null);
    setExtras(false);
    setNote("");
    setDay(null);
    setSending(null);
    setLogged(null);
    setOfferDay("");
    setSetByUs(null);
    setFollowUpDone(null);
    setMessage(null);
  }

  const offer = logged ? followUpOffer(logged.day, logged.stillSet, logged.today) : null;

  function log(kind: InteractionKind) {
    if (!person || pending || logged) return;
    setMessage(null);
    setSending(kind);
    startTransition(async () => {
      try {
        // A day only if you changed it: otherwise the server's today at this tap.
        const result = await logInteraction(person.id, { kind, note, day: day ?? undefined });
        if (!result.ok) return setMessage(result.message);
        setLogged({ ...result, kind });
        setOfferDay(followUpOffer(result.day, result.stillSet, result.today).suggested);
      } catch {
        setMessage("Couldn’t save. Check your connection and try again.");
      } finally {
        setSending(null);
      }
    });
  }

  function setNext() {
    if (!person || !logged || pending) return;
    // An emptied date box isn't a choice (and must never clear the follow-up).
    if (!offerDay) return setMessage("Pick a day for the next follow-up.");
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await setFollowUp(person.id, offerDay, logged.stillSet);
        if (!result.ok) return setMessage(result.message);
        setSetByUs(offerDay);
        setFollowUpDone("set");
      } catch {
        setMessage("Couldn’t save. Check your connection and try again.");
      }
    });
  }

  function undo() {
    if (!person || !logged || pending) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const revert = setByUs ? { contactId: person.id, set: setByUs, afterLog: logged.stillSet } : undefined;
        const result = await undoInteraction(logged.id, revert);
        if (!result.ok) {
          // The follow-up the sheet set was taken back even though the log
          // wasn't deleted: show that, so the sheet never claims it's set.
          if (result.reverted) {
            setSetByUs(null);
            setFollowUpDone(null);
          }
          return setMessage(result.message);
        }
        onClose();
      } catch {
        setMessage("Couldn’t undo. Check your connection and try again.");
      }
    });
  }

  const chosenDay = day && day !== today ? day : null;
  const afterOffer =
    !logged || followUpDone === null
      ? ""
      : followUpDone === "set"
        ? `Next follow-up: ${formatWeekday(offerDay)}.`
        : logged.stillSet
          ? `Follow-up stays on ${formatDay(logged.stillSet, logged.today)}.`
          : "No follow-up set.";
  // One status node, always there, filled after each change (screen readers
  // announce a change to a status, not one that arrives already full).
  const announcement = logged ? `${loggedWords(logged.kind, person?.name ?? "them")} ${afterOffer}` : "";
  const offerOpen = logged !== null && followUpDone === null;

  return (
    <Sheet
      compact
      open={person !== null}
      onClose={onClose}
      busy={pending}
      title={person ? (logged ? person.name : `Log contact with ${person.name}`) : "Log"}
      footer={
        logged ? (
          <div className="flex gap-3">
            <Button variant="secondary" onClick={undo} busy={pending}>
              Undo
            </Button>
            {/* While the follow-up offer is open, Set follow-up is the one filled button. */}
            <Button variant={offerOpen ? "secondary" : "primary"} onClick={onClose} busy={pending}>
              Done
            </Button>
          </div>
        ) : undefined
      }
    >
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {message && <ErrorText className="mb-4">{message}</ErrorText>}
      {person && !logged && (
        <div className="flex flex-col gap-5">
          {/* Note and day first, so the kind you tap last is the button that logs. */}
          {extras && (
            <div id={`${uid}-extras`} className="flex flex-col gap-5">
              <TextAreaField id={`${uid}-note`} label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              <TextField
                id={`${uid}-day`}
                type="date"
                label="Day"
                max={today}
                value={day ?? today}
                onChange={(e) => setDay(e.target.value || null)}
              />
            </div>
          )}
          <p className="text-ink-muted">
            What was it? One tap logs it for {chosenDay ? formatDay(chosenDay, today) : "today"}.
          </p>
          {/* One log per tap: every button waits while one is saving, and the tapped one says so. */}
          <div role="group" aria-label="Kind of contact" className="grid grid-cols-2 gap-3 min-[380px]:grid-cols-3">
            {INTERACTION_KINDS.map((kind) =>
              sending === kind ? (
                <Button key={kind} variant="selected" busy>
                  Logging…
                </Button>
              ) : (
                <Button key={kind} variant="secondary" onClick={() => log(kind)} busy={pending}>
                  {INTERACTION_LABELS[kind]}
                </Button>
              ),
            )}
          </div>
          <button
            type="button"
            aria-expanded={extras}
            aria-controls={`${uid}-extras`}
            onClick={() => {
              // Hidden means not used: a note or day you can't see never rides along.
              if (extras) {
                setNote("");
                setDay(null);
              }
              setExtras((v) => !v);
            }}
            className="-ml-2 inline-flex min-h-11 items-center self-start rounded-(--radius-field) px-2 text-sm font-semibold text-accent active:bg-surface-press"
          >
            {extras ? "Hide the note and day" : "Add a note or another day"}
          </button>
        </div>
      )}

      {person && logged && offer && (
        <div className="flex flex-col gap-5">
          <div>
            <p ref={loggedRef} tabIndex={-1} className="text-lead font-semibold outline-none">
              {loggedWords(logged.kind, person.name)}
            </p>
            {logged.cleared && (
              <p className="mt-1 text-ink-muted">Their {formatDay(logged.cleared, logged.today)} follow-up is done.</p>
            )}
          </div>

          {followUpDone === null ? (
            <section aria-label="Next follow-up" className="flex flex-col gap-3 rounded-(--radius-card) border border-line-strong bg-surface p-4">
              <TextField
                id={`${uid}-next`}
                type="date"
                label={offer.question}
                min={logged.today}
                value={offerDay}
                onChange={(e) => setOfferDay(e.target.value)}
              />
              {offerDay && (
                <p className="-mt-1 text-sm text-ink-muted">
                  {formatWeekday(offerDay)} · {inWords(daysBetween(logged.today, offerDay))}
                </p>
              )}
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setFollowUpDone("kept")} busy={pending}>
                  {offer.replaces ? `Keep ${formatDay(offer.replaces, logged.today)}` : "Not now"}
                </Button>
                <Button onClick={setNext} busy={pending}>
                  {offer.replaces ? "Move it" : "Set follow-up"}
                </Button>
              </div>
            </section>
          ) : (
            <p className="text-ink-muted">{afterOffer}</p>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** "today", "tomorrow", "in a week", "in 10 days". */
function inWords(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === 7) return "in a week";
  return `in ${days} days`;
}
