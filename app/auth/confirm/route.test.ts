import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSupabase } from "@/tests/next-mocks";

const supabase = makeFakeSupabase();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));

const { GET } = await import("./route");

const confirm = (query: string) => GET(new NextRequest(`https://network.example/auth/confirm${query}`));
const location = (response: Response) => response.headers.get("location");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("/auth/confirm", () => {
  it("logs in with the token and goes to Today", async () => {
    supabase.auth.verifyOtp.mockResolvedValue({ error: null });
    const response = await confirm("?token_hash=abc&type=email");
    expect(location(response)).toBe("https://network.example/");
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "email" });
  });

  it("sends a used or expired link back to /login?error=link", async () => {
    supabase.auth.verifyOtp.mockResolvedValue({ error: { message: "expired", status: 403 } });
    expect(location(await confirm("?token_hash=abc&type=email"))).toBe("https://network.example/login?error=link");
  });

  it("refuses a missing token or an unexpected type without calling Supabase", async () => {
    for (const query of ["", "?type=email", "?token_hash=abc", "?token_hash=abc&type=recovery"]) {
      expect(location(await confirm(query)), query).toBe("https://network.example/login?error=link");
    }
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("ignores any 'next' address in the link: it can't send you to another site", async () => {
    supabase.auth.verifyOtp.mockResolvedValue({ error: null });
    const response = await confirm("?token_hash=abc&type=email&next=https://evil.example");
    expect(location(response)).toBe("https://network.example/");
  });
});
