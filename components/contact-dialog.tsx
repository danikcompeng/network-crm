"use client";

// Add or edit a person, in a sheet (plans/crm.md, Feature 2, "Decided
// after the logic check"). The form is filled fresh every time the sheet
// opens: from the page's current data when editing, from blanks (and
// today) when adding, so it never holds the last person's values or an
// old version. The same checks as the server run first, for instant
// messages; the server runs them again.

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/error-text";
import { SelectField } from "@/components/ui/select-field";
import { Sheet } from "@/components/ui/sheet";
import { TextAreaField } from "@/components/ui/text-area-field";
import { TextField } from "@/components/ui/text-field";
import { createContact, deleteContact, updateContact } from "@/lib/contact-actions";
import { CONTACT_COLUMNS, checkContact, type ContactField, type FieldErrors } from "@/lib/contact-input";
import { LIMITS, STAGES, STAGE_LABELS, type Stage } from "@/lib/crm";
import { introducerChoices } from "@/lib/network";
import { byName, deleteSummary } from "@/lib/people";

export type EditableContact = {
  id: string;
  updated_at: string;
  name: string;
  company: string | null;
  role: string | null;
  stage: Stage;
  introduced_by: string | null;
  how_met: string | null;
  met_on: string | null;
  next_follow_up: string | null;
  notes: string | null;
};

export type PersonOption = { id: string; name: string; company: string | null; introduced_by: string | null };

type Values = Record<ContactField, string>;

function startingValues(contact: EditableContact | undefined, today: string): Values {
  return Object.fromEntries(
    CONTACT_COLUMNS.map((c) => [c, contact ? (contact[c] ?? "") : c === "stage" ? "new" : c === "met_on" ? today : ""]),
  ) as Values;
}

type Props = {
  open: boolean;
  onClose: () => void;
  today: string;
  people: readonly PersonOption[];
  /** Editing this person; adding when missing. */
  contact?: EditableContact;
  /** What deleting them affects, for the confirmation (editing only). */
  deleteInfo?: { interactions: number; introduced: string[]; applications: number };
};

export function ContactDialog({ open, onClose, today, people, contact, deleteInfo }: Props) {
  const router = useRouter();
  const editing = Boolean(contact);
  const [values, setValues] = useState<Values>(() => startingValues(contact, today));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [metOnTouched, setMetOnTouched] = useState(false);
  // The version this sheet was opened with. Kept here, not read from the
  // page: the page refreshes while the sheet is open (coming back to the
  // app, a refused save), and a newer stamp with these older values would
  // let a stale save through.
  const [openedAt, setOpenedAt] = useState(contact?.updated_at ?? "");
  const questionRef = useRef<HTMLParagraphElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Hidden pages stay in the DOM (<Activity>), so ids must be unique per sheet.
  const uid = useId();
  const formId = `${uid}-form`;

  // The delete confirmation: focus its question when it opens, and the
  // "Delete …" button again when it closes (Keep, or a failed delete).
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirmingDelete) questionRef.current?.focus();
    else if (wasConfirming.current) deleteButtonRef.current?.focus();
    wasConfirming.current = confirmingDelete;
  }, [confirmingDelete]);

  // Fresh every time it opens (React's "adjust state when a prop changes",
  // during render rather than in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues(startingValues(contact, today));
      setErrors({});
      setMessage(null);
      setConfirmingDelete(false);
      setMetOnTouched(false);
      setOpenedAt(contact?.updated_at ?? "");
    }
  }

  // Adding: "met on" follows today (a first visit's UTC day becomes your
  // day once the timezone cookie arrives) until you change it yourself.
  const shown: Values = !editing && !metOnTouched ? { ...values, met_on: today } : values;

  const options = useMemo(() => {
    const allowed = new Set(introducerChoices(people.map((p) => ({ id: p.id, introducedBy: p.introduced_by })), contact?.id ?? null));
    return people.filter((p) => allowed.has(p.id)).sort(byName);
  }, [people, contact?.id]);

  function set(field: ContactField, value: string) {
    if (field === "met_on") setMetOnTouched(true);
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function showErrors(fieldErrors: FieldErrors) {
    setErrors(fieldErrors);
    const first = CONTACT_COLUMNS.find((c) => fieldErrors[c]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);
    const checked = checkContact(shown, { id: contact?.id ?? null, today });
    if (!checked.ok) return showErrors(checked.fieldErrors);
    startTransition(async () => {
      const result = contact ? await updateContact(contact.id, openedAt, shown) : await createContact(shown);
      if (result.ok) {
        onClose();
        if (!contact) router.push(`/people/${result.id}`);
        return;
      }
      if (result.fieldErrors) showErrors(result.fieldErrors);
      setMessage(result.message ?? null);
    });
  }

  function remove() {
    if (!contact || pending) return;
    startTransition(async () => {
      // Success redirects to the list; only a failure comes back.
      const result = await deleteContact(contact.id);
      if (!result.ok) {
        setConfirmingDelete(false);
        setMessage(result.message ?? "Couldn't delete. Try again.");
      }
    });
  }

  const field = (name: ContactField) => ({
    id: `${uid}-${name}`,
    name,
    value: shown[name],
    error: errors[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(name, e.target.value),
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      busy={pending}
      title={editing ? `Edit ${contact!.name}` : "Add a person"}
      footer={
        // While a delete is being confirmed, Keep and Delete are the only choice.
        confirmingDelete ? undefined : (
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} busy={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} busy={pending}>
            {pending ? "Saving…" : editing ? "Save" : "Add person"}
          </Button>
        </div>
        )
      }
    >
      <form ref={formRef} id={formId} noValidate onSubmit={save} className="flex flex-col gap-5">
        {message && <ErrorText>{message}</ErrorText>}
        <TextField {...field("name")} label="Name" autoComplete="off" autoCapitalize="words" enterKeyHint="next" />
        <TextField {...field("company")} label="Company (optional)" autoComplete="off" />
        <TextField {...field("role")} label="Role (optional)" autoComplete="off" />
        <SelectField {...field("stage")} label="Stage">
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <SelectField
          {...field("introduced_by")}
          label="Introduced by"
          hint={editing ? "People they introduced aren’t listed: picking one would make a loop." : undefined}
        >
          <option value="">Nobody, I met them myself</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.company ? `${p.name} · ${p.company}` : p.name}
            </option>
          ))}
        </SelectField>
        <TextField {...field("how_met")} label="How you met (optional)" autoComplete="off" maxLength={LIMITS.howMet * 2} />
        <div className="grid grid-cols-1 gap-5 min-[380px]:grid-cols-2">
          <TextField {...field("met_on")} type="date" label="Met on" max={today} />
          <div className="flex flex-col gap-2">
            <TextField {...field("next_follow_up")} type="date" label="Next follow-up" />
            {values.next_follow_up && (
              <button
                type="button"
                onClick={() => set("next_follow_up", "")}
                className="-ml-3 inline-flex min-h-11 items-center self-start rounded-(--radius-field) px-3 text-sm font-semibold text-accent active:bg-surface-press"
              >
                Clear follow-up
              </button>
            )}
          </div>
        </div>
        <TextAreaField {...field("notes")} label="Notes (optional)" rows={5} />

        {contact && deleteInfo && (
          <section aria-labelledby="delete-heading" className="mt-6 border-t border-line pt-6">
            <h3 id="delete-heading" className="sr-only">
              Delete
            </h3>
            {!confirmingDelete ? (
              <Button ref={deleteButtonRef} variant="danger-quiet" onClick={() => setConfirmingDelete(true)}>
                Delete {contact.name}
              </Button>
            ) : (
              <div role="group" aria-label={`Delete ${contact.name}?`} className="flex flex-col gap-4 rounded-(--radius-card) border border-danger p-4">
                <div>
                  {/* Focus lands on the question, never on Delete: a stray Enter mustn't delete. */}
                  <p ref={questionRef} tabIndex={-1} className="font-semibold outline-none">
                    Delete {contact.name}?
                  </p>
                  <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-muted">
                    {deleteSummary(deleteInfo).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setConfirmingDelete(false)} busy={pending}>
                    Keep
                  </Button>
                  <Button variant="danger" onClick={remove} busy={pending}>
                    {pending ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}
      </form>
    </Sheet>
  );
}
