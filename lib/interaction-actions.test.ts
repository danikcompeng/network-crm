import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCookies, nextCache, nextHeaders, nextNavigation } from "@/tests/next-mocks";

type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
const calls: { method: string; args: unknown[] }[] = [];
let answers: Answer[] = [];
function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "update", "select", "eq", "is", "maybeSingle"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.then = (resolve: (value: Answer) => void) => resolve({ data: null, error: null, ...answers.shift() });
  return chain;
}
const supabase = {
  auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "me", email: "me@example.com" } } })) },
  from: (table: string) => (builder().from as (t: string) => unknown)(table),
  rpc: vi.fn(async (name: string, args: unknown) => {
    calls.push({ method: "rpc", args: [name, args] });
    return { data: null, error: null, ...answers.shift() };
  }),
};

vi.mock("./supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
vi.mock("next/cache", () => nextCache);

const { logInteraction, setFollowUp, undoInteraction } = await import("./interaction-actions");
const { todayIn, addDays } = await import("./dates");

const ID = "3f2c1a9e-1111-4222-8333-444455556666";
const today = () => todayIn("America/Toronto");
const called = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args);

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  answers = [];
  fakeCookies.clear();
  fakeCookies.set("tz", "America%2FToronto");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("logInteraction", () => {
  it("logs with the server's today when no day is chosen, and reports what it cleared and what's still set", async () => {
    answers = [{ data: { id: "new", cleared_follow_up: "2026-11-20" } }, { data: { next_follow_up: null } }];
    expect(await logInteraction(ID, { kind: "call" })).toEqual({ ok: true, id: "new", day: today(), today: today(), cleared: "2026-11-20", stillSet: null });
    expect(called("rpc")[0]).toEqual(["crm_log_interaction", { p_contact_id: ID, p_day: today(), p_kind: "call", p_note: null }]);
    expect(nextCache.refresh).toHaveBeenCalled();
  });

  it("refuses a day after today, an unknown kind or a bad id before any query", async () => {
    expect(await logInteraction(ID, { kind: "call", day: addDays(today(), 1) })).toMatchObject({ ok: false, message: expect.stringMatching(/future/) });
    expect(await logInteraction(ID, { kind: "lunch" })).toMatchObject({ ok: false });
    expect(await logInteraction("nope", { kind: "call" })).toMatchObject({ ok: false });
    expect(called("rpc")).toEqual([]);
  });

  it("the limit and a refused value are said in words", async () => {
    answers = [{ error: { code: "54000" } }];
    expect(await logInteraction(ID, { kind: "call" })).toMatchObject({ ok: false, message: expect.stringMatching(/5,000/) });
    answers = [{ error: { code: "23514" } }];
    expect(await logInteraction(ID, { kind: "call" })).toMatchObject({ ok: false, message: expect.stringMatching(/isn't allowed/) });
  });

  it("a chosen earlier day and a tidied note reach the database", async () => {
    answers = [{ data: { id: "n", cleared_follow_up: null } }, { data: { next_follow_up: null } }];
    await logInteraction(ID, { kind: "email", day: addDays(today(), -3), note: "  Sent the deck \r\n" });
    expect(called("rpc")[0][1]).toMatchObject({ p_day: addDays(today(), -3), p_note: "Sent the deck" });
  });

  it("a removed person is said in words", async () => {
    answers = [{ error: { code: "P0002" } }];
    expect(await logInteraction(ID, { kind: "call" })).toMatchObject({ ok: false, message: expect.stringMatching(/removed/) });
  });
});

describe("undoInteraction", () => {
  it("returns what the database restored", async () => {
    answers = [{ data: { deleted: true, restored_follow_up: "2026-11-20" } }];
    expect(await undoInteraction(ID)).toEqual({ ok: true, deleted: true, restored: "2026-11-20" });
    expect(called("rpc")[0]).toEqual(["crm_undo_interaction", { p_id: ID }]);
  });
});

describe("undoInteraction after Set follow-up", () => {
  it("if the log can't be deleted after the follow-up was taken back, it says so (and refreshes)", async () => {
    answers = [{ data: [{ id: ID }] }, { error: { code: "XX000", message: "boom" } }];
    const result = await undoInteraction(ID, { contactId: ID, set: "2026-12-01", afterLog: null });
    expect(result).toMatchObject({ ok: false, reverted: true, message: expect.stringMatching(/taken back/) });
    expect(nextCache.refresh).toHaveBeenCalled();
  });

  it("if the follow-up changed elsewhere, the newer one stays and the log is still deleted", async () => {
    answers = [{ data: [] }, { data: { deleted: true, restored_follow_up: null } }];
    expect(await undoInteraction(ID, { contactId: ID, set: "2026-12-01", afterLog: null })).toEqual({ ok: true, deleted: true, restored: null });
  });

  it("refuses a malformed revert before any query", async () => {
    expect(await undoInteraction(ID, { contactId: ID, set: "nope", afterLog: null })).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });

  it("first takes back the follow-up the sheet set (guarded), then deletes the log", async () => {
    answers = [{ data: [{ id: ID }] }, { data: { deleted: true, restored_follow_up: "2026-11-24" } }];
    expect(await undoInteraction(ID, { contactId: ID, set: "2026-12-01", afterLog: null })).toEqual({
      ok: true,
      deleted: true,
      restored: "2026-11-24",
    });
    expect(called("update")[0][0]).toEqual({ next_follow_up: null });
    expect(called("eq")).toContainEqual(["next_follow_up", "2026-12-01"]);
    expect(called("rpc")[0]).toEqual(["crm_undo_interaction", { p_id: ID }]);
  });
});

describe("setFollowUp", () => {
  it("only when the follow-up is still what the screen saw: none (is null) or a date (eq)", async () => {
    const next = addDays(today(), 7);
    answers = [{ data: [{ id: ID }] }];
    expect(await setFollowUp(ID, next, null)).toEqual({ ok: true });
    expect(called("is")).toEqual([["next_follow_up", null]]);
    calls.length = 0;
    answers = [{ data: [{ id: ID }] }];
    expect(await setFollowUp(ID, next, "2026-12-09")).toEqual({ ok: true });
    expect(called("eq")).toContainEqual(["next_follow_up", "2026-12-09"]);
  });

  it("a changed follow-up is refused, never overwritten", async () => {
    answers = [{ data: [] }, { data: { id: ID } }];
    expect(await setFollowUp(ID, addDays(today(), 7), null)).toMatchObject({ ok: false, reason: "changed" });
  });

  it("refuses a day before today, nonsense, or an emptied date box (only null clears), before any query", async () => {
    expect(await setFollowUp(ID, addDays(today(), -1), null)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await setFollowUp(ID, "soon", null)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await setFollowUp(ID, "", "2026-12-09")).toMatchObject({ ok: false, reason: "invalid" });
    expect(await setFollowUp(ID, undefined, null)).toMatchObject({ ok: false, reason: "invalid" });
    expect(calls).toEqual([]);
  });

  it("null clears it, guarded on what was there", async () => {
    answers = [{ data: [{ id: ID }] }];
    expect(await setFollowUp(ID, null, "2026-12-09")).toEqual({ ok: true });
    expect(called("update")[0][0]).toEqual({ next_follow_up: null });
    expect(called("eq")).toContainEqual(["next_follow_up", "2026-12-09"]);
  });

  it("a person who is gone is said so", async () => {
    answers = [{ data: [] }, { data: null }];
    expect(await setFollowUp(ID, addDays(today(), 7), null)).toMatchObject({ ok: false, message: expect.stringMatching(/removed/) });
  });
});
