"use client";

// A full-screen sheet on a phone, a centred card on a wide screen, built
// on the native <dialog> (plans/crm.md, Feature 2): showModal() traps
// focus, makes the page behind it inert, and Esc closes it. Focus returns
// to whatever opened it. It slides up in 250 ms; with Reduce Motion it
// just appears.

import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/icons";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Stops Esc and the close button while saving. */
  busy?: boolean;
  children: ReactNode;
  /** Pinned to the bottom: the main actions. */
  footer?: ReactNode;
  /**
   * On a phone, a sheet as tall as its content, rising from the bottom over
   * the dimmed page (you keep your place, and its buttons are near the
   * thumb), instead of the full screen that forms use.
   */
  compact?: boolean;
};

/** The heading of the page you're on: hidden pages (<Activity>) keep theirs in the DOM, out of sight. */
function visibleHeading(): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>("main h1")].find((h) => h.checkVisibility());
}

/**
 * Focus the heading of the page you're on, once there is one: the page may
 * be changing under the sheet (it closes as a deleted person's page is
 * hidden, and the next page is still loading). Waits up to about two
 * seconds, and never takes focus from something that has it.
 */
function focusHeadingSoon(frames = 120) {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const heading = visibleHeading();
    if (heading) heading.focus();
    else if (frames > 0) focusHeadingSoon(frames - 1);
  });
}

export function Sheet({ open, onClose, title, busy = false, children, footer, compact = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  // Several sheets can sit on one page (closed dialogs stay in the DOM), so each title has its own id.
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Hidden routes stay alive (<Activity>): close the dialog when this page
  // is hidden, so it's never found open on the way back.
  useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (!dialog?.open) return;
      dialog.close();
      // React doesn't deliver the close event to a hidden page, so the
      // onClose below never runs: put focus on the next page's heading here.
      focusHeadingSoon();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc: close through our state, or not at all while saving.
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={() => {
        if (open) onClose();
        const back = opener.current as HTMLElement | null;
        // What opened it may be gone (a deleted row, an empty state that filled up).
        // (Gone from the DOM, or on a page <Activity> has hidden.)
        if (back?.isConnected && back.checkVisibility()) back.focus();
        else focusHeadingSoon();
      }}
      className={
        (compact
          ? "top-auto bottom-0 mx-0 mt-auto mb-0 h-auto max-h-[90dvh] w-full max-w-none rounded-t-(--radius-card) border-t border-line-strong bg-background p-0 text-ink backdrop:bg-scrim "
          : "m-0 h-dvh max-h-none w-full max-w-none bg-background p-0 text-ink backdrop:bg-scrim ") +
        "sm:m-auto sm:h-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-(--radius-card) sm:border sm:border-line-strong " +
        "open:flex open:flex-col motion-safe:open:animate-[sheet-up_var(--motion-sheet)_var(--ease-out)]"
      }
    >
      <header
        className={`flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-2 ${compact ? "" : "pt-[max(0.5rem,env(safe-area-inset-top))]"}`}
      >
        {/* A long name stops at two lines here (the sheet's own name, read by screen readers, stays whole). */}
        <h2 id={titleId} className="line-clamp-2 min-w-0 text-section font-semibold tracking-tight [overflow-wrap:anywhere]">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => !busy && onClose()}
          aria-disabled={busy || undefined}
          className="-mr-2.5 inline-flex size-11 items-center justify-center rounded-(--radius-field) text-ink-muted hover:text-ink active:bg-surface-press"
        >
          <CloseIcon size={22} />
          <span className="sr-only">Close</span>
        </button>
      </header>
      <div className={`min-h-0 flex-1 overflow-y-auto px-5 py-6 ${!footer && compact ? "pb-[max(1.5rem,env(safe-area-inset-bottom))]" : ""}`}>{children}</div>
      {footer && (
        <footer className="shrink-0 border-t border-line bg-background px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer>
      )}
    </dialog>
  );
}
