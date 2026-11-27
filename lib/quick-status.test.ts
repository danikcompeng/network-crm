import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFFLINE_MESSAGE, QuickStatusQueue, type SendResult } from "./quick-status";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(answers: (SendResult | Error)[], latestStamp?: (id: string) => string | undefined) {
  const sent: [string, string, string][] = [];
  const saved: [string, string, string][] = [];
  const rolledBack: [string, string][] = [];
  let resolveSend: (() => void) | null = null;
  const queue = new QuickStatusQueue({
    send: async (id, stamp, to) => {
      sent.push([id, stamp, to]);
      const answer = answers.shift() ?? { ok: true, updated_at: `stamp-${sent.length}` };
      await new Promise<void>((r) => (resolveSend = r));
      if (answer instanceof Error) throw answer;
      return answer;
    },
    onSaved: (id, s) => saved.push([id, s.status, s.updated_at]),
    onRolledBack: (id, message) => rolledBack.push([id, message]),
    latestStamp,
  });
  const finishSend = async () => {
    resolveSend?.();
    await vi.runAllTimersAsync();
  };
  /** Lets the running save answer, without moving the clock (a waiting change keeps waiting). */
  const finishSendOnly = async () => {
    resolveSend?.();
    await vi.advanceTimersByTimeAsync(0);
  };
  return { queue, sent, saved, rolledBack, finishSend, finishSendOnly };
}

describe("QuickStatusQueue", () => {
  it("two changes within the settle time send one save, with the latest choice", async () => {
    const { queue, sent, finishSend } = setup([]);
    queue.change("a", "s0", "applied");
    await vi.advanceTimersByTimeAsync(300);
    queue.change("a", "s0", "online_assessment");
    await vi.advanceTimersByTimeAsync(599);
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([["a", "s0", "online_assessment"]]);
    await finishSend();
    expect(queue.busy("a")).toBe(false);
  });

  it("a change while a save runs is saved after it, with the stamp the first save returned", async () => {
    const { queue, sent, saved, finishSend } = setup([{ ok: true, updated_at: "s1" }, { ok: true, updated_at: "s2" }]);
    queue.change("a", "s0", "applied");
    await vi.advanceTimersByTimeAsync(600);
    queue.change("a", "s0", "offer"); // while the first is in flight
    await vi.advanceTimersByTimeAsync(600);
    expect(sent).toHaveLength(1);
    await finishSend();
    expect(sent).toEqual([
      ["a", "s0", "applied"],
      ["a", "s1", "offer"],
    ]);
    await finishSend();
    expect(saved).toEqual([
      ["a", "applied", "s1"],
      ["a", "offer", "s2"],
    ]);
  });

  it("a change made during a save, still waiting when fresh data lands, goes out with the fresh stamp (not refused)", async () => {
    // The screen's data for the row: refreshed after the first save, so then it holds s1.
    let serverStamp = "s0";
    const { queue, sent, saved, rolledBack, finishSend, finishSendOnly } = setup(
      [{ ok: true, updated_at: "s1" }, { ok: true, updated_at: "s2" }],
      () => serverStamp,
    );
    queue.change("a", "s0", "applied");
    await vi.advanceTimersByTimeAsync(600); // the first save starts
    queue.change("a", "s0", "interviewing"); // the screen still shows s0; this one waits its 600 ms
    await finishSendOnly(); // the first save finishes...
    serverStamp = "s1"; // ...and the refresh lands before the wait is over
    queue.reset();
    await vi.advanceTimersByTimeAsync(600);
    expect(sent).toEqual([
      ["a", "s0", "applied"],
      ["a", "s1", "interviewing"],
    ]);
    await finishSend();
    expect(rolledBack).toEqual([]);
    expect(saved).toEqual([
      ["a", "applied", "s1"],
      ["a", "interviewing", "s2"],
    ]);
  });

  it("the same, but the refresh shows someone else changed the row since: still refused (their change isn't overwritten)", async () => {
    let serverStamp = "s0";
    const { queue, sent, rolledBack, finishSend, finishSendOnly } = setup(
      [{ ok: true, updated_at: "s1" }, { ok: false, message: "It was changed somewhere else." }],
      () => serverStamp,
    );
    queue.change("a", "s0", "applied");
    await vi.advanceTimersByTimeAsync(600);
    queue.change("a", "s0", "interviewing");
    await finishSendOnly();
    serverStamp = "s-elsewhere"; // another device changed it after our first save
    queue.reset();
    await vi.advanceTimersByTimeAsync(600);
    // Sent with what the screen showed when it was chosen, so the server refuses it.
    expect(sent).toHaveLength(2);
    expect(sent.at(-1)).toEqual(["a", "s0", "interviewing"]);
    await finishSend();
    expect(rolledBack).toEqual([["a", "It was changed somewhere else."]]);
    expect(queue.busy("a")).toBe(false);
  });

  it("the refresh landing before the first save answers: the waiting change still goes out with the saved stamp", async () => {
    let serverStamp = "s0";
    const { queue, sent, rolledBack, finishSend, finishSendOnly } = setup(
      [{ ok: true, updated_at: "s1" }, { ok: true, updated_at: "s2" }],
      () => serverStamp,
    );
    queue.change("a", "s0", "applied");
    await vi.advanceTimersByTimeAsync(600);
    queue.change("a", "s0", "interviewing");
    serverStamp = "s1";
    queue.reset(); // nothing of ours to keep yet
    await finishSendOnly(); // now the first save answers s1
    await vi.advanceTimersByTimeAsync(600);
    expect(sent.at(-1)).toEqual(["a", "s1", "interviewing"]);
    await finishSend();
    expect(rolledBack).toEqual([]);
  });

  it("a row deleted elsewhere: the waiting change goes out with its own stamp, and the server's answer rolls it back", async () => {
    let serverStamp: string | undefined = "s0";
    const { queue, sent, rolledBack, finishSend, finishSendOnly } = setup(
      [{ ok: true, updated_at: "s1" }, { ok: false, message: "That application was removed." }],
      () => serverStamp,
    );
    queue.change("a", "s0", "applied");
    await vi.advanceTimersByTimeAsync(600);
    queue.change("a", "s0", "interviewing");
    await finishSendOnly();
    serverStamp = undefined; // gone from the fresh data
    queue.reset();
    await vi.advanceTimersByTimeAsync(600);
    expect(sent.at(-1)).toEqual(["a", "s0", "interviewing"]);
    await finishSend();
    expect(rolledBack).toEqual([["a", "That application was removed."]]);
  });

  it("a refused first save with a second change waiting: one rollback, nothing more sent", async () => {
    const { queue, sent, rolledBack, finishSend } = setup([{ ok: false, message: "It was changed somewhere else." }]);
    queue.change("a", "s0", "applied");
    await vi.advanceTimersByTimeAsync(600);
    queue.change("a", "s0", "interviewing");
    await finishSend(); // the refusal, then every timer
    expect(sent).toEqual([["a", "s0", "applied"]]);
    expect(rolledBack).toEqual([["a", "It was changed somewhere else."]]);
    expect(queue.busy("a")).toBe(false);
  });

  it("a kept stamp survives another row's refresh, and goes when a refresh shows the row changed elsewhere", async () => {
    const server = new Map([["a", "s0"], ["b", "t0"]]);
    const { queue, sent, finishSend } = setup([{ ok: true, updated_at: "s1" }], (id) => server.get(id));
    queue.change("a", "s0", "applied");
    await vi.advanceTimersByTimeAsync(600);
    await finishSend();
    server.set("a", "s1").set("b", "t1"); // a refresh after row b's save: row a as we left it
    queue.reset();
    queue.change("a", "s0", "offer"); // a screen still showing s0 for a moment
    await vi.advanceTimersByTimeAsync(600);
    expect(sent.at(-1)).toEqual(["a", "s1", "offer"]);
    await finishSend();
    server.set("a", "s-elsewhere");
    queue.reset();
    queue.change("a", "s-elsewhere", "rejected");
    await vi.advanceTimersByTimeAsync(600);
    expect(sent.at(-1)).toEqual(["a", "s-elsewhere", "rejected"]);
  });

  it("a refused save rolls the row back and says why", async () => {
    const { queue, rolledBack, finishSend } = setup([{ ok: false, message: "It was changed somewhere else." }]);
    queue.change("a", "s0", "offer");
    await vi.advanceTimersByTimeAsync(600);
    await finishSend();
    expect(rolledBack).toEqual([["a", "It was changed somewhere else."]]);
    expect(queue.busy("a")).toBe(false);
  });

  it("a call that fails outright (offline) rolls back, and the row keeps working", async () => {
    const { queue, sent, rolledBack, saved, finishSend } = setup([new Error("Failed to fetch")]);
    queue.change("a", "s0", "offer");
    await vi.advanceTimersByTimeAsync(600);
    await finishSend();
    expect(rolledBack).toEqual([["a", OFFLINE_MESSAGE]]);
    queue.change("a", "s0", "rejected");
    await vi.advanceTimersByTimeAsync(600);
    await finishSend();
    expect(sent.at(-1)).toEqual(["a", "s0", "rejected"]);
    expect(saved.at(-1)).toEqual(["a", "rejected", expect.any(String)]);
  });

  it("rows don't wait for each other", async () => {
    const { queue, sent } = setup([]);
    queue.change("a", "sa", "offer");
    queue.change("b", "sb", "rejected");
    await vi.advanceTimersByTimeAsync(600);
    expect(sent.map(([id]) => id).sort()).toEqual(["a", "b"]);
  });

  it("after fresh server data that moved on (changed elsewhere), the server's stamp is used again", async () => {
    let serverStamp = "s0";
    const { queue, sent, finishSend } = setup([{ ok: true, updated_at: "s1" }], () => serverStamp);
    queue.change("a", "s0", "applied");
    await vi.advanceTimersByTimeAsync(600);
    await finishSend();
    serverStamp = "s9";
    queue.reset();
    queue.change("a", "s9", "offer");
    await vi.advanceTimersByTimeAsync(600);
    expect(sent.at(-1)).toEqual(["a", "s9", "offer"]);
  });
});
