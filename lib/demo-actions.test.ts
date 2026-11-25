import { beforeEach, describe, expect, it, vi } from "vitest";
import { Redirected, fakeCookies, fakeTables, makeFakeSupabase, nextCache, nextHeaders, nextNavigation } from "@/tests/next-mocks";
import { SEED_DB_AT_KEY, SEEDED_AT_KEY, SEEDED_DAY_KEY, demoSeedPayload, seedCounts } from "./demo-seed";

const supabase = makeFakeSupabase();
vi.mock("./supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
vi.mock("next/cache", () => nextCache);

const { resetDemo, signInDemo } = await import("./demo-actions");
const { todayIn } = await import("./dates");

const DEMO = "demo@example.com";
const demoUser = (metadata: Record<string, unknown> = {}) => ({ id: "demo-id", email: DEMO, user_metadata: metadata });

beforeEach(() => {
  vi.clearAllMocks();
  fakeCookies.clear();
  fakeCookies.set("tz", "America/Toronto");
  vi.stubEnv("DEMO_EMAIL", DEMO);
  vi.stubEnv("DEMO_PASSWORD", "long-test-password");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("signInDemo", () => {
  it("says so when the demo isn't set up", async () => {
    vi.stubEnv("DEMO_PASSWORD", "");
    expect(await signInDemo()).toEqual({ ok: false, message: "The demo isn't set up yet." });
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("signs in with the server's credentials, seeds a never-seeded demo, and goes to Today", async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: demoUser() }, error: null });
    await expect(signInDemo()).rejects.toEqual(new Redirected("/"));
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: DEMO, password: "long-test-password" });
    expect(supabase.rpc).toHaveBeenCalledWith("reseed_demo_crm", expect.anything());
  });

  it("dates the seed from the visitor's timezone cookie, not the server's UTC day", async () => {
    fakeCookies.set("tz", "Pacific%2FKiritimati"); // UTC+14: a day ahead of UTC for most of it
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: demoUser() }, error: null });
    await expect(signInDemo()).rejects.toEqual(new Redirected("/"));
    const seed = (supabase.rpc.mock.calls[0] as unknown as [string, { p_seed: { contacts: { name: string; next_follow_up: string }[] } }])[1].p_seed;
    expect(seed.contacts.find((c) => c.name === "Riya Patel")?.next_follow_up).toBe(todayIn("Pacific/Kiritimati"));
  });

  /** The tables exactly as the seed left them, `mark` being the database's time of the seed. */
  function untouchedDemo(mark: string) {
    const counts = seedCounts(demoSeedPayload(todayIn("America/Toronto"), "America/Toronto"));
    fakeTables.crm_contacts = { count: counts.contacts, rows: [{ updated_at: mark }] };
    fakeTables.crm_interactions = { count: counts.interactions, rows: [{ created_at: "2026-01-01T12:00:00+00:00" }] };
    fakeTables.crm_applications = { count: counts.applications, rows: [] };
  }
  const MARK = "2026-11-24T17:00:00.5+00:00";
  const freshMarkers = () => ({ [SEEDED_AT_KEY]: new Date().toISOString(), [SEEDED_DAY_KEY]: todayIn("America/Toronto"), [SEED_DB_AT_KEY]: MARK });

  it("doesn't reseed when the sample data is fresh and untouched (metadata from the sign-in, not the token)", async () => {
    untouchedDemo(MARK);
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: demoUser(freshMarkers()) }, error: null });
    await expect(signInDemo()).rejects.toEqual(new Redirected("/"));
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.auth.getClaims).not.toHaveBeenCalled();
  });

  it("reseeds a fresh demo that a visitor changed (someone deleted), so the next visitor finds it whole", async () => {
    untouchedDemo(MARK);
    fakeTables.crm_contacts.count -= 1;
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: demoUser(freshMarkers()) }, error: null });
    await expect(signInDemo()).rejects.toEqual(new Redirected("/"));
    expect(supabase.rpc).toHaveBeenCalledWith("reseed_demo_crm", expect.anything());
  });

  it("still lets you in when the seed fails", async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: demoUser() }, error: null });
    supabase.rpc.mockResolvedValueOnce({ error: { message: "missing function", code: "PGRST202" } } as never);
    await expect(signInDemo()).rejects.toEqual(new Redirected("/"));
  });

  it("explains a rate limit, and a broken demo account", async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: "x", status: 429 } });
    expect((await signInDemo()).message).toMatch(/Lots of people/);
    supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: "x", status: 400 } });
    expect((await signInDemo()).message).toMatch(/isn't working/);
  });
});

describe("resetDemo", () => {
  beforeEach(() => {
    supabase.auth.getClaims.mockResolvedValue({ data: { claims: { sub: "someone", email: DEMO } } });
  });

  it("refuses a real account (checked with Supabase, not the token) before touching anything", async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "real", email: "real.person@example.com" } } });
    expect(await resetDemo()).toEqual({ ok: false, message: "Only the demo account can be reset." });
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("reseeds the demo and refreshes the page", async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: demoUser() } });
    expect(await resetDemo()).toEqual({ ok: true });
    expect(supabase.rpc).toHaveBeenCalledWith("reseed_demo_crm", expect.anything());
    expect(nextCache.refresh).toHaveBeenCalled();
  });

  it("gives a friendly message when logged out, instead of crashing the page", async () => {
    supabase.auth.getClaims.mockResolvedValue({ data: null });
    expect(await resetDemo()).toEqual({ ok: false, message: "Couldn't reset the demo. Please try again." });
  });
});
