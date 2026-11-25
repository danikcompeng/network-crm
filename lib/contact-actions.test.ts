import { beforeEach, describe, expect, it, vi } from "vitest";
import { Redirected, fakeCookies, nextCache, nextHeaders, nextNavigation } from "@/tests/next-mocks";

// A fake Supabase query builder: records the calls, answers what the test says.
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
const calls: { method: string; args: unknown[] }[] = [];
let answers: Answer[] = [];
function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "insert", "update", "delete", "select", "eq", "single"]) {
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
};

vi.mock("./supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => ({ ...nextNavigation, RedirectType: { replace: "replace", push: "push" } }));
vi.mock("next/cache", () => nextCache);

const { createContact, deleteContact, updateContact } = await import("./contact-actions");

const ID = "3f2c1a9e-1111-4222-8333-444455556666";
const OPENED = "2026-11-24T12:00:00.123456+00:00";

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  answers = [];
  fakeCookies.clear();
  fakeCookies.set("tz", "America%2FToronto");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const called = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args);

describe("createContact", () => {
  it("checks the form before touching the database", async () => {
    const result = await createContact({ name: "  " });
    expect(result).toMatchObject({ ok: false, reason: "invalid", fieldErrors: { name: expect.any(String) } });
    expect(called("insert")).toEqual([]);
  });

  it("inserts only the nine columns (never an id or owner the client sent) and returns the new id", async () => {
    answers = [{ data: { id: ID } }];
    const result = await createContact({ name: "Sam", user_id: "someone-else", id: "chosen", stage: "talking" });
    expect(result).toEqual({ ok: true, id: ID });
    const [row] = called("insert")[0] as [Record<string, unknown>];
    expect(Object.keys(row).sort()).toEqual(
      ["company", "how_met", "introduced_by", "met_on", "name", "next_follow_up", "notes", "role", "stage"].sort(),
    );
  });

  it.each([
    ["CR001", { reason: "loop", fieldErrors: { introduced_by: expect.stringMatching(/loop/) } }],
    ["23503", { reason: "invalid", fieldErrors: { introduced_by: expect.stringMatching(/no longer exists/) } }],
    ["54000", { reason: "limit", message: "You can have up to 1,000 people." }],
    ["23514", { reason: "invalid", message: expect.stringMatching(/isn't allowed/) }],
    ["XX000", { reason: "error" }],
  ])("turns database error %s into words", async (code, expected) => {
    answers = [{ error: { code, message: "x" } }];
    expect(await createContact({ name: "Sam" })).toMatchObject({ ok: false, ...expected });
  });

  it("gives a friendly message when logged out, instead of crashing", async () => {
    supabase.auth.getClaims.mockResolvedValueOnce({ data: { claims: undefined as never } });
    expect(await createContact({ name: "Sam" })).toMatchObject({ ok: false, reason: "error" });
  });
});

describe("updateContact", () => {
  it("refuses a malformed id before any query", async () => {
    expect(await updateContact("1 or 1=1", OPENED, { name: "Sam" })).toMatchObject({ ok: false, reason: "gone" });
    expect(calls).toEqual([]);
  });

  it("only updates the version that was opened", async () => {
    answers = [{ data: [{ id: ID }] }];
    expect(await updateContact(ID, OPENED, { name: "Sam" })).toEqual({ ok: true, id: ID });
    expect(called("eq")).toEqual([
      ["id", ID],
      ["updated_at", OPENED],
    ]);
    expect(nextCache.refresh).toHaveBeenCalled();
  });

  it("says 'changed elsewhere' when the person exists but the version moved on", async () => {
    answers = [{ data: [] }, { data: [{ id: ID }] }];
    expect(await updateContact(ID, OPENED, { name: "Sam" })).toMatchObject({ ok: false, reason: "changed" });
  });

  it("says 'removed' when the person is gone", async () => {
    answers = [{ data: [] }, { data: [] }];
    expect(await updateContact(ID, OPENED, { name: "Sam" })).toMatchObject({ ok: false, reason: "gone" });
  });

  it("an unreadable version stamp is 'changed' before any query", async () => {
    for (const stamp of ["yesterday", 42, null]) {
      expect(await updateContact(ID, stamp, { name: "Sam" })).toMatchObject({ ok: false, reason: "changed" });
    }
    expect(calls).toEqual([]);
  });

  it("logged out: a friendly error, no query", async () => {
    supabase.auth.getClaims.mockResolvedValueOnce({ data: { claims: undefined as never } });
    expect(await updateContact(ID, OPENED, { name: "Sam" })).toMatchObject({ ok: false, reason: "error" });
    expect(called("update")).toEqual([]);
  });

  it("can't be their own introducer", async () => {
    expect(await updateContact(ID, OPENED, { name: "Sam", introduced_by: ID })).toMatchObject({
      ok: false,
      fieldErrors: { introduced_by: expect.any(String) },
    });
    expect(called("update")).toEqual([]);
  });
});

describe("deleteContact", () => {
  it("deletes, refreshes, then replaces this page with the list, naming who was deleted", async () => {
    answers = [{ data: [{ name: "Sam Okafor" }] }];
    await expect(deleteContact(ID)).rejects.toEqual(new Redirected("/people?deleted=Sam%20Okafor", "replace"));
    expect(nextCache.refresh).toHaveBeenCalled();
  });

  it("a failed delete says delete, not save", async () => {
    answers = [{ error: { code: "XX000", message: "x" } }];
    expect(await deleteContact(ID)).toMatchObject({ ok: false, message: expect.stringMatching(/Couldn.t delete/) });
    supabase.auth.getClaims.mockResolvedValueOnce({ data: { claims: undefined as never } });
    expect(await deleteContact(ID)).toMatchObject({ ok: false, message: expect.stringMatching(/Couldn.t delete/) });
  });

  it("someone already gone is reported, not redirected", async () => {
    answers = [{ data: [] }];
    expect(await deleteContact(ID)).toMatchObject({ ok: false, reason: "gone" });
  });

  it("refuses a malformed id", async () => {
    expect(await deleteContact("nope")).toMatchObject({ ok: false, reason: "gone" });
    expect(calls).toEqual([]);
  });
});
