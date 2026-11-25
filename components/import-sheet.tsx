"use client";

// Import applications by pasting (plans/crm.md, Feature 3). The preview is
// worked out from the text and the current list on every render (never
// stored, so a page kept alive under <Activity> can't hold an old one);
// nothing is saved until "Import N applications", and the server checks
// every row and every duplicate again.

import { useDeferredValue, useId, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/error-text";
import { Sheet } from "@/components/ui/sheet";
import { importApplications } from "@/lib/application-actions";
import type { ApplicationRow } from "@/lib/applications";
import { APPLICATION_STATUS_LABELS } from "@/lib/crm";
import { formatDay } from "@/lib/format";
import {
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  parseRows,
  previewImport,
  previewSummary,
  type ImportField,
  type SlashOrder,
} from "@/lib/import";
import { ChevronDownIcon } from "@/components/icons";
import { FIELD_CLASS } from "@/components/ui/select-field";

const MAX = 1000;
/** The server action's body limit is 1 MB; leave room for the envelope. */
const MAX_IMPORT_BYTES = 900_000;

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: (imported: number, skipped: number) => void;
  today: string;
  applications: readonly ApplicationRow[];
};

export function ImportSheet({ open, onClose, onImported, today, applications }: Props) {
  const [text, setText] = useState("");
  const [fields, setFields] = useState<(ImportField | null)[] | undefined>(undefined);
  const [dateOrder, setDateOrder] = useState<SlashOrder | undefined>(undefined);
  const [anyway, setAnyway] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const uid = useId();

  // Fresh every time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText("");
      setFields(undefined);
      setDateOrder(undefined);
      setAnyway(new Set());
      setMessage(null);
    }
  }

  const deferred = useDeferredValue(text);
  const preview = useMemo(
    () =>
      deferred.trim() === ""
        ? null
        : previewImport(deferred, applications, { today, room: MAX - applications.length, fields, dateOrder, includeDuplicates: anyway }),
    [deferred, applications, today, fields, dateOrder, anyway],
  );
  const sample = useMemo(() => parseRows(deferred).slice(0, 3), [deferred]);
  const canImport = preview && !preview.blocked && preview.counts.ready > 0 && !pending;

  function changeText(value: string) {
    setText(value);
    // A new paste is read afresh: column choices and "Import anyway" were for the old one.
    setFields(undefined);
    setAnyway(new Set());
    setMessage(null);
  }

  function chooseField(index: number, field: ImportField | null) {
    const current = [...(preview?.columns.fields ?? [])];
    // Each field belongs to one column: picking it here frees it elsewhere.
    const next = current.map((f, i) => (i === index ? field : f === field ? null : f));
    setFields(next);
  }

  function run() {
    if (!canImport) {
      if (!pending) setMessage(!preview ? "Paste your rows first." : (preview.blocked ?? "Nothing here can be imported yet."));
      return;
    }
    if (!preview) return;
    const rows = preview.rows.filter((r) => r.included);
    const anywayIndexes = rows.flatMap((r, i) => (r.duplicate ? [i] : []));
    const payload = rows.map((r) => r.value);
    // What's sent is JSON (UTF-8): measure that, under the 1 MB server-action limit.
    if (new TextEncoder().encode(JSON.stringify(payload)).length > MAX_IMPORT_BYTES) {
      setMessage("That's too much for one import. Import the rows in two or more pastes.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await importApplications(payload, anywayIndexes);
        if (result.ok) {
          onImported(result.imported, result.skipped);
          onClose();
        } else {
          setMessage(result.message);
        }
      } catch {
        // The call itself failed (offline, too big): keep the paste, say so.
        setMessage("Couldn't import. Check your connection and try again. Nothing was saved.");
      }
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      busy={pending}
      title="Import applications"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} busy={pending}>
            Cancel
          </Button>
          {/* Not ready: a quiet button that says why when tapped, never a full-colour one that does nothing. */}
          <Button variant={canImport || pending ? "primary" : "secondary"} onClick={run} busy={pending} aria-disabled={!canImport || undefined}>
            {pending
              ? "Importing…"
              : preview && preview.counts.ready > 0 && !preview.blocked
                ? `Import ${preview.counts.ready} ${preview.counts.ready === 1 ? "application" : "applications"}`
                : "Import"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor={`${uid}-paste`} className="text-sm font-medium text-ink-muted">
            Paste rows from a spreadsheet or a CSV file
          </label>
          <textarea
            id={`${uid}-paste`}
            value={text}
            onChange={(e) => changeText(e.target.value)}
            rows={6}
            wrap="off"
            spellCheck={false}
            placeholder="Company, Role, Date applied, Status, Link"
            aria-describedby={`${uid}-paste-hint`}
            // One spreadsheet row per line (no wrapping), and 16 px so iPhones don't zoom in.
            className={`min-h-32 resize-none overflow-x-auto py-3 font-mono leading-relaxed whitespace-pre ${FIELD_CLASS}`}
          />
          <p id={`${uid}-paste-hint`} className="text-sm text-ink-muted">
            Copy the rows with their header row (Company, Role, Date applied, Status, Link…). Nothing is saved until you press Import.
          </p>
        </div>

        {message && <ErrorText>{message}</ErrorText>}

        {preview && (
          <section aria-labelledby={`${uid}-preview`} className="flex flex-col gap-4">
            <h3 id={`${uid}-preview`} className="text-section font-semibold tracking-tight">
              Preview
            </h3>

            {sample.length > 0 && (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-2 text-sm font-medium text-ink-muted">
                  {preview.columns.fromHeader ? "Columns, from your header row" : "Columns (no header row found, so read in order)"}
                </legend>
                {sample[0].map((cell, i) => {
                  const heading = preview.header?.[i] ?? `Column ${i + 1}`;
                  const example = (preview.header ? sample[1]?.[i] : cell) ?? "";
                  return (
                    <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-3">
                      <label htmlFor={`${uid}-col-${i}`} className="min-w-0 text-sm">
                        <span className="block truncate font-medium">{heading}</span>
                        {example && <span className="block truncate text-ink-muted">{example}</span>}
                      </label>
                      <div className="relative">
                        <select
                          id={`${uid}-col-${i}`}
                          value={preview.columns.fields[i] ?? ""}
                          onChange={(e) => chooseField(i, (e.target.value || null) as ImportField | null)}
                          className={`h-11 w-40 appearance-none pr-10 ${FIELD_CLASS}`}
                        >
                          <option value="">Ignore</option>
                          {IMPORT_FIELDS.map((f) => (
                            <option key={f} value={f}>
                              {IMPORT_FIELD_LABELS[f]}
                            </option>
                          ))}
                        </select>
                        <ChevronDownIcon size={18} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted" />
                      </div>
                    </div>
                  );
                })}
              </fieldset>
            )}

            {preview.slashDates &&
              (preview.dateOrderForced ? (
                <p className="text-sm">
                  Dates read as {preview.dateOrder === "month-first" ? "month/day" : "day/month"}{" "}
                  <span className="text-ink-muted">(decided by your dates: some numbers are over 12).</span>
                </p>
              ) : (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-medium text-ink-muted">Dates like 03/04/2026 read as</legend>
                  <div className="flex gap-2">
                    {(["month-first", "day-first"] as const).map((order) => (
                      <label
                        key={order}
                        className={
                          "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium " +
                          "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent " +
                          (preview.dateOrder === order ? "border-accent bg-accent-tint text-accent" : "border-line-strong bg-surface text-ink")
                        }
                      >
                        <input
                          type="radio"
                          name={`${uid}-order`}
                          className="sr-only"
                          checked={preview.dateOrder === order}
                          onChange={() => setDateOrder(order)}
                        />
                        {order === "month-first" ? "Month/day" : "Day/month"}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}

            {preview.blocked ? (
              <ErrorText>{preview.blocked}</ErrorText>
            ) : (
              <p role="status" className="font-semibold">
                {previewSummary(preview.counts)}
              </p>
            )}

            {!preview.blocked && (
              <ol className="overflow-hidden rounded-(--radius-card) border border-line-strong bg-surface">
                {preview.rows.map((row) => (
                  <li key={row.line} className="border-b border-line px-4 py-3 last:border-b-0">
                    <div>
                      <div className="min-w-0">
                        {row.value ? (
                          <>
                            <p className="flex items-center gap-2">
                              <span className={`min-w-0 truncate font-medium ${row.included ? "" : "text-ink-muted"}`}>
                                {row.value.company} · {row.value.role}
                              </span>
                              {!row.included && (
                                <span className="shrink-0 rounded-md bg-surface-press px-2 py-0.5 text-sm font-medium text-ink-muted">Skipped</span>
                              )}
                            </p>
                            <p className="text-sm text-ink-muted">
                              Row {row.line} · {APPLICATION_STATUS_LABELS[row.value.status]}
                              {row.value.applied_on &&
                                (row.value.status === "applied"
                                  ? ` ${formatDay(row.value.applied_on, today)}`
                                  : `, applied ${formatDay(row.value.applied_on, today)}`)}
                              {row.value.deadline && `, deadline ${formatDay(row.value.deadline, today)}`}
                            </p>
                          </>
                        ) : (
                          <p className="flex items-center gap-2">
                            <span className="font-medium text-ink-muted">Row {row.line}</span>
                            <span className="rounded-md bg-surface-press px-2 py-0.5 text-sm font-medium text-ink-muted">Skipped</span>
                          </p>
                        )}
                        {row.problems.map((p) => (
                          <ErrorText key={p} className="mt-1">
                            {p}
                          </ErrorText>
                        ))}
                        {row.notes.map((n) => (
                          <p key={n} className="mt-1 text-sm text-ink-muted">
                            {n}
                          </p>
                        ))}
                        {row.duplicate && (
                          <label className="-ml-2 mt-1 inline-flex min-h-11 items-center gap-2 rounded-(--radius-field) px-2 text-sm">
                            <input
                              type="checkbox"
                              className="grid size-5 shrink-0 appearance-none place-content-center rounded-[4px] border-2 border-edge bg-surface checked:border-accent-fill checked:bg-accent-fill checked:before:block checked:before:h-2.5 checked:before:w-1.5 checked:before:-translate-y-px checked:before:rotate-45 checked:before:border-r-2 checked:before:border-b-2 checked:before:border-on-accent"
                              checked={row.included}
                              onChange={(e) => {
                                const next = new Set(anyway);
                                if (e.target.checked) next.add(row.line);
                                else next.delete(row.line);
                                setAnyway(next);
                              }}
                            />
                            {row.duplicateOf} Import anyway
                          </label>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </Sheet>
  );
}
