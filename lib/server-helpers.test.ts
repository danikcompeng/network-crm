import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCookies, nextCache, nextHeaders } from "@/tests/next-mocks";

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", () => nextCache);
vi.mock("./supabase/server", () => ({ createClient: async () => ({}) }));

const { userTimeZone } = await import("./server-helpers");

beforeEach(() => fakeCookies.clear());

describe("userTimeZone", () => {
  it("decodes a real zone", async () => {
    fakeCookies.set("tz", "America%2FToronto");
    expect(await userTimeZone()).toBe("America/Toronto");
  });
  it.each([["%E0"], ["Not%2FAZone"], [""]])("is undefined for a garbled or unknown value (%s)", async (value) => {
    fakeCookies.set("tz", value);
    expect(await userTimeZone()).toBeUndefined();
  });
  it("is undefined with no cookie", async () => {
    expect(await userTimeZone()).toBeUndefined();
  });
});
