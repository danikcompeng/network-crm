"use client";

// Add or edit an application, in a sheet (plans/crm.md, Feature 3). The
// same pattern as people: filled fresh when it opens, the version it was
// opened with kept for the save, ids from useId (hidden pages stay in the
// DOM), the server's checks run here first for instant messages.

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/error-text";
import { SelectField } from "@/components/ui/select-field";
import { Sheet } from "@/components/ui/sheet";
import { TextAreaField } from "@/components/ui/text-area-field";
import { TextField } from "@/components/ui/text-field";
import { createApplication, deleteApplication, updateApplication } from "@/lib/application-actions";
import { APPLICATION_COLUMNS, checkApplication, type ApplicationErrors, type ApplicationField } from "@/lib/application-input";
import { statusChange, type ApplicationRow } from "@/lib/applications";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/lib/crm";
import { byName } from "@/lib/people";
import type { PersonOption } from "@/components/contact-dialog";

type Values = Record<ApplicationField, string>;

function startingValues(application: ApplicationRow | undefined, contactId: string | null): Values {
  return Object.fromEntries(
    APPLICATION_COLUMNS.map((c) => [
      c,
      application ? (application[c] ?? "") : c === "status" ? "applied" : c === "contact_id" ? (contactId ?? "") : "",
    ]),
  ) as Values;
}

type Props = {
  open: boolean;
  onClose: () => void;
  today: string;
  people: readonly PersonOption[];
  /** Editing this one; adding when missing. */
  application?: ApplicationRow;
  /** Adding from a person's page: them, filled in. */
  contactId?: string | null;
};

export function ApplicationDialog({ open, onClose, today, people, application, contactId = null }: Props) {
  const editing = Boolean(application);
  const [values, setValues] = useState<Values>(() => startingValues(application, contactId));
  const [errors, setErrors] = useState<ApplicationErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [appliedTouched, setAppliedTouched] = useState(false);
  const [openedAt, setOpenedAt] = useState(application?.updated_at ?? "");
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const questionRef = useRef<HTMLParagraphElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const formId = `${uid}-form`;

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues(startingValues(application, contactId));
      setErrors({});
      setMessage(null);
      setConfirmingDelete(false);
      setAppliedTouched(false);
      setOpenedAt(application?.updated_at ?? "");
    }
  }

  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirmingDelete) questionRef.current?.focus();
    else if (wasConfirming.current) deleteButtonRef.current?.focus();
    wasConfirming.current = confirmingDelete;
  }, [confirmingDelete]);

  // Adding something you've sent: "applied on" follows today until touched.
  const shown: Values =
    !editing && !appliedTouched && values.status !== "saved" ? { ...values, applied_on: today } : values;

  const personOptions = useMemo(() => [...people].sort(byName), [people]);

  function set(field: ApplicationField, value: string) {
    if (field === "applied_on") setAppliedTouched(true);
    setValues((v) => {
      // Leaving "saved" dates it today if it had no date (the same rule as the list).
      if (field === "status" && v.status === "saved" && value !== "saved" && !v.applied_on && editing) {
        const change = statusChange({ status: "saved", applied_on: null }, value as ApplicationStatus, today);
        return { ...v, status: value, applied_on: change.applied_on ?? "" };
      }
      return { ...v, [field]: value };
    });
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function showErrors(fieldErrors: ApplicationErrors) {
    setErrors(fieldErrors);
    const first = APPLICATION_COLUMNS.find((c) => fieldErrors[c]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);
    const checked = checkApplication(shown, { today });
    if (!checked.ok) return showErrors(checked.fieldErrors);
    startTransition(async () => {
      try {
        const result = application ? await updateApplication(application.id, openedAt, shown) : await createApplication(shown);
        if (result.ok) return onClose();
        if (result.fieldErrors) showErrors(result.fieldErrors);
        setMessage(result.message ?? null);
      } catch {
        setMessage("Couldn’t save. Check your connection and try again.");
      }
    });
  }

  function remove() {
    if (!application || pending) return;
    startTransition(async () => {
      try {
        const result = await deleteApplication(application.id);
        if (result.ok) return onClose();
        setConfirmingDelete(false);
        setMessage(result.message ?? "Couldn’t delete. Try again.");
      } catch {
        setConfirmingDelete(false);
        setMessage("Couldn’t delete. Check your connection and try again.");
      }
    });
  }

  const field = (name: ApplicationField) => ({
    id: `${uid}-${name}`,
    name,
    value: shown[name],
    error: errors[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(name, e.target.value),
  });

  // The role names it (a company can have two applications); the company is in its field.
  const title = editing ? `Edit ${application!.role}` : "Add an application";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      busy={pending}
      title={title}
      footer={
        confirmingDelete ? undefined : (
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} busy={pending}>
              Cancel
            </Button>
            <Button type="submit" form={formId} busy={pending}>
              {pending ? "Saving…" : editing ? "Save" : "Add application"}
            </Button>
          </div>
        )
      }
    >
      <form ref={formRef} id={formId} noValidate onSubmit={save} className="flex flex-col gap-5">
        {message && <ErrorText>{message}</ErrorText>}
        <TextField {...field("company")} label="Company" autoComplete="organization" />
        <TextField {...field("role")} label="Role" autoComplete="off" />
        <SelectField {...field("status")} label="Status">
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {APPLICATION_STATUS_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-1 gap-5 min-[380px]:grid-cols-2">
          <TextField {...field("applied_on")} type="date" label="Applied on" max={today} />
          <TextField {...field("deadline")} type="date" label="Deadline" />
        </div>
        <TextField {...field("link")} type="url" inputMode="url" label="Link to the posting (optional)" placeholder="https://" autoComplete="off" />
        <TextField {...field("location")} label="Location (optional)" autoComplete="off" />
        <SelectField {...field("contact_id")} label="Person (optional)" hint="A recruiter, or whoever referred you.">
          <option value="">Nobody</option>
          {personOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.company ? `${p.name} · ${p.company}` : p.name}
            </option>
          ))}
        </SelectField>
        <TextAreaField {...field("notes")} label="Notes (optional)" rows={4} />

        {application && (
          <section aria-label="Delete" className="mt-6 border-t border-line pt-6">
            {!confirmingDelete ? (
              <Button ref={deleteButtonRef} variant="danger-quiet" onClick={() => setConfirmingDelete(true)}>
                Delete this application
              </Button>
            ) : (
              <div role="group" aria-label="Delete this application?" className="flex flex-col gap-4 rounded-(--radius-card) border border-danger p-4">
                <p ref={questionRef} tabIndex={-1} className="font-semibold outline-none">
                  Delete {application.role} at {application.company}?
                </p>
                <p className="-mt-2 text-sm text-ink-muted">It can’t be undone. The person tied to it stays.</p>
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
