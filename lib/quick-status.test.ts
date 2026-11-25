import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFFLINE_MESSAGE, QuickStatusQueue, type SendResult } from "./quick-status";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(answers: (SendResult | Error)[]) {
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
  });
  const finishSend = async () => {
    resolveSend?.();
    await vi.runAllTimersAsync();
  };
  return { queue, sent, saved, rolledBack, finishSend };
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

  it("after fresh server data, the server's stamp is used again", async () => {
    const { queue, sent, finishSend } = setup([{ ok: true, updated_at: "s1" }]);
    queue.change("a", "s0", "applied");
    await vi.advanceTimersByTimeAsync(600);
    await finishSend();
    queue.reset();
    queue.change("a", "s9", "offer");
    await vi.advanceTimersByTimeAsync(600);
    expect(sent.at(-1)).toEqual(["a", "s9", "offer"]);
  });
});
