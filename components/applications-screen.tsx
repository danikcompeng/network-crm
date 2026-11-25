"use client";

// Applications (plans/crm.md, Feature 3): three tiles (Sent, In process,
// Offers), search, status chips, and a row per application with its
// status changeable in one tap. Filtering is in the browser; the address
// keeps it through history.replaceState (as People).

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { ApplicationDialog } from "@/components/application-dialog";
import type { PersonOption } from "@/components/contact-dialog";
import { ChevronDownIcon, CloseIcon, ExternalIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { ImportSheet } from "@/components/import-sheet";
import { Button } from "@/components/ui/button";
import { Toast, type ToastMessage } from "@/components/ui/toast";
import { changeStatus } from "@/lib/application-actions";
import { QuickStatusQueue } from "@/lib/quick-status";
import { TILES, filterApplications, parseStatusFilter, rowDate, statusTone, type ApplicationRow, type StatusFilter, type Tile } from "@/lib/applications";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/lib/crm";
import { count } from "@/lib/format";
import { TONE_CLASS } from "@/components/stage-chip";

type Props = { applications: ApplicationRow[]; people: PersonOption[]; today: string };

export function ApplicationsScreen({ applications, people, today }: Props) {
  const params = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [filter, setFilter] = useState<StatusFilter>(() => parseStatusFilter(params.get("status")));
  // A link to /applications?status=… (Today's tiles) must change a page
  // kept alive in the background, not only a fresh one.
  const statusParam = params.get("status");
  const [seenStatus, setSeenStatus] = useState(statusParam);
  if (statusParam !== seenStatus) {
    setSeenStatus(statusParam);
    setFilter(parseStatusFilter(statusParam));
    // A new view arrived (a tile on Today): its search comes with it, never a stale one.
    setQuery(params.get("q") ?? "");
  }
  const [editing, setEditing] = useState<ApplicationRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const say = (text: string, tone: ToastMessage["tone"] = "info") => setToast({ id: Date.now(), text, tone });
  const quick = useQuickStatus(applications, say);
  // After a quick change the list keeps its order (a changed row never
  // jumps or vanishes under your finger) until you change the filter or
  // search, add or import, or leave the page.
  const [frozen, setFrozen] = useState<string[] | null>(null);
  const [viewKey, setViewKey] = useState(`${filter}|${query}`);
  if (viewKey !== `${filter}|${query}`) {
    setViewKey(`${filter}|${query}`);
    setFrozen(null);
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("q", query.trim());
    else url.searchParams.delete("q");
    if (filter !== "all") url.searchParams.set("status", filter);
    else url.searchParams.delete("status");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [query, filter]);

  // Hidden routes stay alive: last visit's message and frozen order mustn't greet the next one.
  useLayoutEffect(
    () => () => {
      setToast(null);
      setFrozen(null);
    },
    [],
  );

  const rows = useMemo(() => applications.map((a) => quick.shown(a)), [applications, quick]);
  const { visible: matching, tiles, counts } = useMemo(() => filterApplications(rows, query, filter, today), [rows, query, filter, today]);
  const visible = useMemo(() => {
    if (!frozen) return matching;
    const byId = new Map(rows.map((r) => [r.id, r]));
    return frozen.flatMap((id) => byId.get(id) ?? []);
  }, [frozen, matching, rows]);
  const matchingIds = useMemo(() => new Set(matching.map((r) => r.id)), [matching]);
  const names = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const filtering = query.trim() !== "" || filter !== "all";

  return (
    <>
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1 tabIndex={-1} className="outline-none text-title font-semibold tracking-tight">Applications</h1>
        {applications.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              block={false}
              onClick={() => {
                setFrozen(null);
                setImporting(true);
              }}
            >
              Import
            </Button>
            <Button
              size="sm"
              block={false}
              onClick={() => {
                setFrozen(null);
                setAdding(true);
              }}
            >
              <PlusIcon size={18} />
              Add
            </Button>
          </div>
        )}
      </header>

      <Toast message={toast} />

      {applications.length === 0 ? (
        <div className="mt-10 flex flex-col items-start gap-4">
          <p className="text-lead text-ink-muted">No applications yet. Paste the rows you already track in a spreadsheet, or add one.</p>
          <div className="flex w-full flex-col gap-3">
            <Button onClick={() => setImporting(true)}>Import from a spreadsheet</Button>
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <PlusIcon size={18} />
              Add one
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* The tiles: tap to filter, tap again for everything. */}
          <div role="group" aria-label="Totals" className="mt-5 grid grid-cols-3 gap-2">
            {(Object.keys(TILES) as Tile[]).map((t) => {
              const selected = filter === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setFilter(selected ? "all" : t)}
                  className={
                    "flex min-h-[72px] flex-col items-start justify-center rounded-(--radius-card) border px-3 py-2 text-left " +
                    "transition-colors duration-(--motion-fast) ease-(--ease-out) " +
                    (selected ? "border-accent bg-accent-tint" : "border-line-strong bg-surface active:bg-surface-press")
                  }
                >
                  <span className={`text-title font-semibold tabular-nums ${selected ? "text-accent" : ""}`}>{tiles[t]}</span>
                  <span className={`text-sm ${selected ? "font-semibold text-accent" : "text-ink-muted"}`}>{TILES[t].label}</span>
                </button>
              );
            })}
          </div>

          <div className="relative mt-4">
            <label htmlFor="applications-search" className="sr-only">
              Search applications
            </label>
            <SearchIcon size={20} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-muted" />
            <input
              id="applications-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Company, role or place"
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

          <div role="group" aria-label="Status" className="-mx-5 mt-3 flex scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {(["all", ...APPLICATION_STATUSES] as const).map((s) => {
              const selected = filter === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setFilter(s)}
                  className={
                    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap " +
                    "transition-colors duration-(--motion-fast) ease-(--ease-out) " +
                    (selected ? "border-accent bg-accent-tint text-accent" : "border-line-strong bg-surface text-ink hover:border-edge active:bg-surface-press")
                  }
                >
                  {s === "all" ? "All" : APPLICATION_STATUS_LABELS[s]}
                  <span className={`tabular-nums ${selected ? "text-accent" : "text-ink-muted"}`}>{counts[s]}</span>
                </button>
              );
            })}
          </div>

          <p role="status" className="sr-only">
            {count(visible.length, "application", "applications")}
          </p>

          {visible.length === 0 ? (
            <div className="mt-10 flex flex-col items-start gap-3">
              <p className="text-lead text-ink-muted">Nothing matches{query.trim() ? <> &ldquo;{query.trim()}&rdquo;</> : null} here.</p>
              {filtering && (
                <Button
                  variant="secondary"
                  size="sm"
                  block={false}
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Show everything
                </Button>
              )}
            </div>
          ) : (
            <ul className="mt-4 overflow-hidden rounded-(--radius-card) border border-line-strong bg-surface">
              {visible.map((a) => (
                <li key={a.id} className="border-b border-line last:border-b-0">
                  <ApplicationRowView
                    application={a}
                    person={a.contact_id ? (names.get(a.contact_id) ?? null) : null}
                    today={today}
                    onOpen={() => setEditing(a)}
                    onStatus={(to) => {
                      if (!frozen) setFrozen(visible.map((r) => r.id));
                      quick.change(a, to);
                    }}
                    moved={frozen !== null && !matchingIds.has(a.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ApplicationDialog open={adding} onClose={() => setAdding(false)} today={today} people={people} />
      <ApplicationDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        today={today}
        people={people}
        application={editing ?? undefined}
      />
      <ImportSheet
        open={importing}
        onClose={() => setImporting(false)}
        onImported={(imported, skipped) =>
          say(
            `Imported ${count(imported, "application", "applications")}.` +
              (skipped > 0 ? ` ${skipped} ${skipped === 1 ? "was" : "were"} already in your list.` : ""),
          )
        }
        today={today}
        applications={applications}
      />
    </>
  );
}

/**
 * A row: the opener (company, role, date, person) across the full width,
 * then a line of controls under it: the status picker (drawn as a field:
 * it's the screen's main action) and the posting link. Never inside the
 * opener, and the opener never squeezed by them.
 */
export function ApplicationRowView({
  application: a,
  person,
  today,
  onOpen,
  onStatus,
  moved,
}: {
  application: ApplicationRow;
  person: string | null;
  today: string;
  onOpen: () => void;
  onStatus?: (to: ApplicationStatus) => void;
  /** Shown when a quick change moved it out of the current filter (it stays put until you leave). */
  moved?: boolean;
}) {
  const hydrated = useHydrated();
  const date = rowDate(a, today);
  const dateClass = date?.tone === "danger" ? "font-semibold text-danger" : date?.tone === "ink" ? "font-semibold text-ink" : "text-ink-muted";
  return (
    <div>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full min-w-0 flex-col gap-0.5 px-4 pt-3 pb-2 text-left transition-colors duration-(--motion-fast) active:bg-surface-press"
      >
        <span className="w-full truncate font-semibold">{a.company}</span>
        <span className="w-full truncate text-sm text-ink-muted">{a.role}</span>
        {(date || person || moved) && (
          <span className="w-full truncate text-sm">
            {date && <span className={dateClass}>{date.text}</span>}
            {date && person && <span className="text-ink-muted"> · </span>}
            {person && <span className="text-ink-muted">{person}</span>}
            {moved && <span className="text-ink-muted">{date || person ? " · " : ""}Moved out of this filter</span>}
          </span>
        )}
      </button>
      <div className="flex items-center gap-2 px-4 pb-3">
        {onStatus ? (
          <div className="relative">
            <label htmlFor={`status-${a.id}`} className="sr-only">
              Status of {a.role} at {a.company}
            </label>
            {/* 16 px text, or iPhones zoom in when it's tapped. Sized to its current word. */}
            <select
              id={`status-${a.id}`}
              value={a.status}
              // Until the page is live, a change would only move the native
              // select and never save: wait (a moment on a slow phone).
              disabled={!hydrated}
              onChange={(e) => onStatus(e.target.value as ApplicationStatus)}
              className={`h-11 max-w-[14rem] min-w-[7rem] appearance-none rounded-(--radius-field) border border-edge bg-surface pr-9 pl-3 text-base font-medium [field-sizing:content] ${TONE_CLASS[statusTone(a.status)]}`}
            >
              {APPLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {APPLICATION_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted" />
          </div>
        ) : (
          <span className={`rounded-md bg-surface-press px-2.5 py-1 text-sm font-medium ${TONE_CLASS[statusTone(a.status)]}`}>
            {APPLICATION_STATUS_LABELS[a.status]}
          </span>
        )}
        {a.link && (
          <a
            href={a.link}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-(--radius-field) px-2 text-sm font-semibold text-accent active:bg-surface-press"
          >
            Posting
            <ExternalIcon size={16} />
            <span className="sr-only">
              {" "}
              for {a.role} at {a.company}, opens in a new tab
            </span>
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * The one-tap status change, on lib/quick-status.ts's queue: the choice
 * shows at once, is saved a moment after the last change, one save per row
 * at a time with the latest version stamp; a refused or failed save rolls
 * the row back and says so.
 */
function useQuickStatus(applications: readonly ApplicationRow[], say: (words: string, tone?: "info" | "error") => void) {
  type Override = { status: ApplicationStatus; applied_on: string | null; updated_at: string };
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  const sayRef = useRef(say);
  useEffect(() => {
    sayRef.current = say;
  });
  const names = useRef(new Map<string, string>());
  useEffect(() => {
    names.current = new Map(applications.map((a) => [a.id, a.company]));
  }, [applications]);

  // Built once, after the first render (its callbacks use refs, which render mustn't touch).
  const queue = useRef<QuickStatusQueue | null>(null);
  useEffect(() => {
    queue.current = new QuickStatusQueue({
        send: (id, stamp, to) => changeStatus(id, stamp, to),
        onSaved: (id, saved) => {
          setOverrides((m) => new Map(m).set(id, saved));
          sayRef.current(`Saved: ${names.current.get(id) ?? "the application"}, ${APPLICATION_STATUS_LABELS[saved.status]}.`);
        },
        onRolledBack: (id, message) => {
          setOverrides((m) => {
            const next = new Map(m);
            next.delete(id);
            return next;
          });
          sayRef.current(message, "error");
        },
      });
  }, []);

  // Fresh server data replaces what this screen guessed (and its stamps).
  const [seen, setSeen] = useState(applications);
  if (seen !== applications) {
    setSeen(applications);
    setOverrides(new Map());
  }
  useEffect(() => {
    queue.current?.reset();
  }, [applications]);

  const shown = (a: ApplicationRow): ApplicationRow => {
    const o = overrides.get(a.id);
    return o ? { ...a, ...o } : a;
  };

  function change(a: ApplicationRow, to: ApplicationStatus) {
    setOverrides((m) => new Map(m).set(a.id, { status: to, applied_on: a.applied_on, updated_at: m.get(a.id)?.updated_at ?? a.updated_at }));
    queue.current?.change(a.id, a.updated_at, to);
  }

  return { shown, change };
}

/** False in the server's HTML and until React has taken over the page; true after. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
