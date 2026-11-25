import { beforeEach, describe, expect, it, vi } from "vitest";
import { Redirected, makeFakeSupabase, nextHeaders, nextNavigation } from "@/tests/next-mocks";

const supabase = makeFakeSupabase();
vi.mock("./supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);

const { sendLoginCode, signOut, verifyLoginCode } = await import("./auth-actions");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DEMO_EMAIL", "demo@example.com");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sendLoginCode", () => {
  it("sends the email, with the button coming back to /auth/confirm on this site", async () => {
    supabase.auth.signInWithOtp.mockResolvedValue({ error: null });
    const result = await sendLoginCode({ ok: false }, form({ email: " me@example.com " }));
    expect(result).toEqual({ ok: true, email: "me@example.com" });
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "me@example.com",
      options: { emailRedirectTo: "https://network.example/auth/confirm" },
    });
  });

  it("refuses a malformed email without calling Supabase", async () => {
    const result = await sendLoginCode({ ok: false }, form({ email: "nope" }));
    expect(result.fieldErrors?.email).toBe("Enter your email address.");
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("refuses the demo's email, in any case or spacing, without calling Supabase", async () => {
    const result = await sendLoginCode({ ok: false }, form({ email: "  DEMO@example.com " }));
    expect(result.fieldErrors?.email).toMatch(/Try the demo/);
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("explains a rate limit, and any other failure", async () => {
    supabase.auth.signInWithOtp.mockResolvedValue({ error: { message: "slow down", status: 429 } });
    expect((await sendLoginCode({ ok: false }, form({ email: "me@example.com" }))).message).toMatch(/very recently/);
    supabase.auth.signInWithOtp.mockResolvedValue({ error: { message: "boom", status: 500 } });
    expect((await sendLoginCode({ ok: false }, form({ email: "me@example.com" }))).message).toMatch(/Couldn't send/);
  });
});

describe("verifyLoginCode", () => {
  const good = form({ email: "me@example.com", code: "123 456" });

  it("logs in and goes to Today", async () => {
    supabase.auth.verifyOtp.mockResolvedValue({ error: null });
    await expect(verifyLoginCode({ ok: false }, good)).rejects.toEqual(new Redirected("/"));
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: "me@example.com", token: "123456", type: "email" });
  });

  it("asks for the digits when the code isn't 6 to 10 digits", async () => {
    const result = await verifyLoginCode({ ok: false }, form({ email: "me@example.com", code: "12" }));
    expect(result.fieldErrors?.code).toMatch(/6 to 10 digits/);
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("says start over when the hidden email is missing or broken", async () => {
    const result = await verifyLoginCode({ ok: false }, form({ email: "", code: "123456" }));
    expect(result.message).toMatch(/Start over/);
  });

  it.each([
    [429, "fieldErrors", /Too many tries/],
    [0, "message", /Couldn't check/],
    [undefined, "message", /Couldn't check/],
    [503, "message", /Couldn't check/],
    [403, "fieldErrors", /didn't work/],
  ])("maps status %s to the right message", async (status, where, text) => {
    supabase.auth.verifyOtp.mockResolvedValue({ error: { message: "x", status } });
    const result = await verifyLoginCode({ ok: false }, good);
    const shown = where === "message" ? result.message : result.fieldErrors?.code;
    expect(shown).toMatch(text);
  });
});

describe("signOut", () => {
  it("logs out this device only and goes to /login, even if Supabase fails", async () => {
    supabase.auth.signOut.mockResolvedValue({ error: { message: "offline" } } as never);
    await expect(signOut()).rejects.toEqual(new Redirected("/login"));
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
