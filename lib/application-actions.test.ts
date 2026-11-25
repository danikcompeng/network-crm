import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCookies, nextCache, nextHeaders, nextNavigation } from "@/tests/next-mocks";

// A fake Supabase query builder: records calls, answers in order.
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
const calls: { method: string; args: unknown[] }[] = [];
let answers: Answer[] = [];
function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "insert", "update", "delete", "select", "eq", "single", "maybeSingle", "limit"]) {
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
vi.mock("next/navigation", () => nextNavigation);
vi.mock("next/cache", () => nextCache);

const { changeStatus, createApplication, importApplications, updateApplication } = await import("./application-actions");
const { todayIn } = await import("./dates");

const ID = "3f2c1a9e-1111-4222-8333-444455556666";
const STAMP = "2026-11-24T12:00:00.123456+00:00";
const called = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args);

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  answers = [];
  fakeCookies.clear();
  fakeCookies.set("tz", "America%2FToronto");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createApplication / updateApplication", () => {
  it("checks before touching the database, and inserts exactly the nine columns", async () => {
    expect(await createApplication({ company: "", role: "" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(calls).toEqual([]);
    answers = [{ data: { id: ID } }];
    expect(await createApplication({ company: "Kestrel", role: "Intern", user_id: "x", id: "y" })).toEqual({ ok: true, id: ID });
    expect(Object.keys(called("insert")[0][0] as object).sort()).toEqual(
      ["applied_on", "company", "contact_id", "deadline", "link", "location", "notes", "role", "status"].sort(),
    );
  });

  it("updates only the opened version; says changed or gone otherwise", async () => {
    answers = [{ data: [] }, { data: [{ id: ID }] }];
    expect(await updateApplication(ID, STAMP, { company: "K", role: "R" })).toMatchObject({ reason: "changed" });
    expect(called("eq")).toContainEqual(["updated_at", STAMP]);
    answers = [{ data: [] }, { data: [] }];
    expect(await updateApplication(ID, STAMP, { company: "K", role: "R" })).toMatchObject({ reason: "gone" });
  });

  it("maps a deleted person (23503) and the limit (54000) to words", async () => {
    answers = [{ error: { code: "23503" } }];
    expect(await createApplication({ company: "K", role: "R" })).toMatchObject({ fieldErrors: { contact_id: expect.stringMatching(/no longer exists/) } });
    answers = [{ error: { code: "54000" } }];
    expect(await createApplication({ company: "K", role: "R" })).toMatchObject({ reason: "limit" });
  });
});

describe("changeStatus", () => {
  it("leaving saved dates it today (read from the row as it is now), guarded by its version", async () => {
    answers = [{ data: { status: "saved", applied_on: null } }, { data: [{ updated_at: "2026-11-24T13:00:00+00:00", applied_on: "x", status: "applied" }] }];
    const result = await changeStatus(ID, STAMP, "applied");
    expect(result).toMatchObject({ ok: true, updated_at: "2026-11-24T13:00:00+00:00" });
    expect(called("update")[0][0]).toEqual({ status: "applied", applied_on: todayIn("America/Toronto") });
    expect(called("eq").filter(([c]) => c === "updated_at")).toHaveLength(2);
  });

  it("never overwrites an applied date another tab set", async () => {
    answers = [{ data: { status: "saved", applied_on: "2026-11-03" } }, { data: [{ updated_at: "t", applied_on: "2026-11-03", status: "applied" }] }];
    await changeStatus(ID, STAMP, "applied");
    expect(called("update")[0][0]).toEqual({ status: "applied" });
  });

  it("a stale row is 'changed', a removed one 'gone'; a bad status is refused before any query", async () => {
    answers = [{ data: null }, { data: [{ id: ID }] }];
    // Its own words: no sheet is open to "close".
    expect(await changeStatus(ID, STAMP, "offer")).toMatchObject({ reason: "changed", message: expect.stringMatching(/list now shows the latest/) });
    answers = [{ data: null }, { data: [] }];
    expect(await changeStatus(ID, STAMP, "offer")).toMatchObject({ reason: "gone" });
    calls.length = 0;
    expect(await changeStatus(ID, STAMP, "ghosted")).toMatchObject({ reason: "invalid" });
    expect(calls).toEqual([]);
  });
});

describe("importApplications", () => {
  const row = (company: string, role: string, applied_on: string | null = null) => ({
    company,
    role,
    status: "applied",
    applied_on,
    deadline: null,
    link: null,
    location: null,
    notes: null,
  });

  it("inserts everything new in ONE request, and drops what's already saved now (a retry imports nothing twice)", async () => {
    answers = [{ data: [{ company: "Kestrel", role: "Firmware Intern", applied_on: "2026-11-03" }] }, { data: null }];
    const result = await importApplications([row("kestrel", "firmware intern", "2026-11-03"), row("Halcyon", "Hardware Intern")], []);
    expect(result).toEqual({ ok: true, imported: 1, skipped: 1 });
    expect(called("insert")).toHaveLength(1);
    expect((called("insert")[0][0] as { company: string }[]).map((r) => r.company)).toEqual(["Halcyon"]);
  });

  it("an 'Import anyway' row that is an exact copy of a saved one is a retry: skipped", async () => {
    const saved = { company: "Kestrel", role: "Firmware Intern", applied_on: null, status: "applied", deadline: null, link: null, location: null, notes: null };
    answers = [{ data: [saved] }];
    expect(await importApplications([row("Kestrel", "Firmware Intern")], [0])).toEqual({ ok: true, imported: 0, skipped: 1 });
    expect(called("insert")).toEqual([]);
  });

  it("logged out: a friendly error, no query", async () => {
    supabase.auth.getClaims.mockResolvedValueOnce({ data: { claims: undefined as never } });
    expect(await importApplications([row("A", "R")], [])).toMatchObject({ ok: false });
    expect(called("insert")).toEqual([]);
  });

  it("'Import anyway' keeps a duplicate", async () => {
    answers = [{ data: [{ company: "Kestrel", role: "Firmware Intern", applied_on: null, status: "interviewing" }] }, { data: null }];
    expect(await importApplications([row("Kestrel", "Firmware Intern")], [0])).toEqual({ ok: true, imported: 1, skipped: 0 });
  });

  it("refuses rows that don't pass the checks, before any insert", async () => {
    const result = await importApplications([row("", "Intern"), { ...row("K", "R"), link: "javascript:alert(1)" }], []);
    expect(result).toMatchObject({ ok: false, rows: [{ index: 0 }, { index: 1 }] });
    expect(called("insert")).toEqual([]);
  });

  it("refuses an import that doesn't fit, and anything that isn't a list", async () => {
    answers = [{ data: Array.from({ length: 999 }, (_, i) => ({ company: `C${i}`, role: "R", applied_on: null })) }];
    expect(await importApplications([row("A", "R"), row("B", "R")], [])).toMatchObject({ ok: false, message: expect.stringMatching(/room for 1 more/) });
    expect(await importApplications("nope", [])).toMatchObject({ ok: false });
  });

  it("a database refusal says nothing was saved", async () => {
    answers = [{ data: [] }, { error: { code: "54000" } }];
    expect(await importApplications([row("A", "R")], [])).toMatchObject({ ok: false, message: expect.stringMatching(/Nothing was saved/) });
  });
});
