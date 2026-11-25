import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoCredentials, isDemoEmail, seedDemo } from "./demo";
import { fakeQuery, fakeTables } from "@/tests/next-mocks";
import { SEED_DB_AT_KEY, SEEDED_AT_KEY, SEEDED_DAY_KEY } from "./demo-seed";

const DEMO = "demo@example.com";

beforeEach(() => {
  vi.stubEnv("DEMO_EMAIL", DEMO);
  vi.stubEnv("DEMO_PASSWORD", "long-test-password");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** A fake Supabase client that records what was called, in order. */
function fakeSupabase(options: { rpcError?: { message: string; code: string } } = {}) {
  const calls: string[] = [];
  const client = {
    auth: {
      updateUser: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        calls.push(`updateUser ${data[SEEDED_AT_KEY] === null ? "clear" : "mark"}`);
        return { error: null };
      }),
    },
    from: (table: string) => {
      calls.push(`read ${table}`);
      return fakeQuery(table);
    },
    rpc: vi.fn(async (name: string) => {
      calls.push(`rpc ${name}`);
      return { error: options.rpcError ?? null };
    }),
  };
  return { client: client as unknown as SupabaseClient, raw: client, calls };
}

describe("isDemoEmail", () => {
  it("matches the demo address, ignoring case and spaces", () => {
    expect(isDemoEmail(DEMO)).toBe(true);
    expect(isDemoEmail("  Demo@Example.com ")).toBe(true);
    expect(isDemoEmail("someone@example.com")).toBe(false);
    expect(isDemoEmail(undefined)).toBe(false);
  });
  it("is never true when no demo is set up", () => {
    vi.stubEnv("DEMO_EMAIL", "");
    expect(isDemoEmail("")).toBe(false);
    expect(demoCredentials()).toBeNull();
  });
});

describe("seedDemo", () => {
  it("refuses any account that isn't the demo, before touching anything", async () => {
    const { client, calls } = fakeSupabase();
    await expect(seedDemo(client, { email: "real.person@example.com" }, "2026-11-24", "UTC")).rejects.toThrow(/not the demo/);
    expect(calls).toEqual([]);
  });

  it("reseeds in one transaction, then marks it done with the finish time and day (one auth call)", async () => {
    const { client, raw, calls } = fakeSupabase();
    fakeTables.crm_contacts = { count: 20, rows: [{ updated_at: "2026-11-24T17:00:00.5+00:00" }] };
    await seedDemo(client, { email: DEMO }, "2026-11-24", "America/Toronto");
    expect(calls.slice(-5)).toEqual([
      "rpc reseed_demo_crm",
      "read crm_contacts",
      "read crm_interactions",
      "read crm_applications",
      "updateUser mark",
    ]);
    const marked = raw.auth.updateUser.mock.calls.at(-1)![0].data;
    // The database's time of the seed, not this server's clock.
    expect(marked[SEED_DB_AT_KEY]).toBe("2026-11-24T17:00:00.5+00:00");
    expect(marked[SEEDED_DAY_KEY]).toBe("2026-11-24");
    expect(Math.abs(Date.parse(marked[SEEDED_AT_KEY] as string) - Date.now())).toBeLessThan(5_000);
  });

  it("doesn't mark a failed reseed as done, so the next sign-in tries again", async () => {
    const { client, calls } = fakeSupabase({ rpcError: { message: "boom", code: "XX000" } });
    await expect(seedDemo(client, { email: DEMO }, "2026-11-24", "UTC")).rejects.toThrow(/reseed/);
    expect(calls).toEqual(["rpc reseed_demo_crm"]);
  });
});

describe("seedDemo's payload", () => {
  it("is the sample network dated from the today it's given (Riya's follow-up is due that day)", async () => {
    const { client, raw } = fakeSupabase();
    await seedDemo(client, { email: DEMO }, "2026-11-24", "Pacific/Kiritimati");
    const [name, args] = raw.rpc.mock.calls[0] as unknown as [string, { p_seed: { contacts: { name: string; next_follow_up: string | null }[] } }];
    expect(name).toBe("reseed_demo_crm");
    expect(args.p_seed.contacts.find((c) => c.name === "Riya Patel")?.next_follow_up).toBe("2026-11-24");
  });
});
