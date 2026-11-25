// The one-tap status change's save queue (plans/crm.md, Feature 3): pure
// enough to test with fake timers, no React. One queue per screen.
//
// - A change shows at once (the screen applies `onShow`), and is saved a
//   moment after the LAST change on that row, so arrowing through a
//   keyboard-focused select saves once.
// - One save per row at a time; a change made while one is running is
//   saved after it, with the version stamp the first save returned.
// - A refused save (changed elsewhere) or a failed call (offline, a dropped
//   connection: the call itself rejects) rolls the row back and says so,
//   and the row keeps working: nothing is left "running".

import type { ApplicationStatus } from "./crm";

export type SendResult =
  | { ok: true; updated_at?: string; applied_on?: string | null }
  | { ok: false; message?: string };

export type QuickStatusOptions = {
  send: (id: string, stamp: string, to: ApplicationStatus) => Promise<SendResult>;
  /** A row was saved: its new status, applied date and stamp. */
  onSaved: (id: string, saved: { status: ApplicationStatus; applied_on: string | null; updated_at: string }) => void;
  /** A row's change didn't stick: show the server's version again. */
  onRolledBack: (id: string, message: string) => void;
  settleMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

type Entry = { to: ApplicationStatus; timer: unknown; running: boolean; generation: number };

export const SETTLE_MS = 600;
export const OFFLINE_MESSAGE = "Couldn’t save the status. Check your connection and try again.";

export class QuickStatusQueue {
  private entries = new Map<string, Entry>();
  private stamps = new Map<string, string>();
  private generation = 0;
  private readonly settleMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly options: QuickStatusOptions) {
    this.settleMs = options.settleMs ?? SETTLE_MS;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** Fresh server data arrived: its stamps are the truth now. */
  reset() {
    this.stamps.clear();
  }

  /** Is a save waiting or running for this row? */
  busy(id: string): boolean {
    return this.entries.has(id);
  }

  /** A change on a row whose server version is `stamp`. */
  change(id: string, stamp: string, to: ApplicationStatus) {
    const entry = this.entries.get(id) ?? { to, timer: null, running: false, generation: ++this.generation };
    entry.to = to;
    if (entry.timer !== null) this.clearTimer(entry.timer);
    const generation = entry.generation;
    entry.timer = this.setTimer(() => {
      // An old timer must never start a newer entry early.
      if (this.entries.get(id)?.generation !== generation) return;
      entry.timer = null;
      void this.save(id, stamp);
    }, this.settleMs);
    this.entries.set(id, entry);
  }

  private async save(id: string, serverStamp: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry || entry.running) return;
    entry.running = true;
    const to = entry.to;
    const stamp = this.stamps.get(id) ?? serverStamp;
    let result: SendResult;
    try {
      result = await this.options.send(id, stamp, to);
    } catch {
      result = { ok: false, message: OFFLINE_MESSAGE };
    } finally {
      entry.running = false;
    }
    if (!result.ok) {
      this.entries.delete(id);
      this.stamps.delete(id);
      this.options.onRolledBack(id, result.message ?? OFFLINE_MESSAGE);
      return;
    }
    const newStamp = result.updated_at ?? stamp;
    this.stamps.set(id, newStamp);
    this.options.onSaved(id, { status: to, applied_on: result.applied_on ?? null, updated_at: newStamp });
    // Changed again while this one was saving (and its wait is over): save that too.
    if (entry.to !== to && entry.timer === null) void this.save(id, newStamp);
    else if (entry.to === to && entry.timer === null) this.entries.delete(id);
  }
}
