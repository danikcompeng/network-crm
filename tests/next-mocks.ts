// Stand-ins for Next.js and Supabase in unit tests of server actions.
// Each test file calls vi.mock(...) with these, then sets what Supabase
// answers per test.
import { vi } from "vitest";

/** What redirect() throws, so a test can see where it was sent. */
export class Redirected extends Error {
  constructor(public to: string) {
    super(`redirect to ${to}`);
  }
}

export const fakeCookies = new Map<string, string>();

export const nextHeaders = {
  headers: async () => new Headers({ origin: "https://network.example" }),
  cookies: async () => ({
    get: (name: string) => (fakeCookies.has(name) ? { name, value: fakeCookies.get(name)! } : undefined),
    getAll: () => [...fakeCookies].map(([name, value]) => ({ name, value })),
    set: vi.fn(),
  }),
};

export const nextNavigation = {
  redirect: (to: string) => {
    throw new Redirected(to);
  },
};

export const nextCache = { io: async () => {}, refresh: vi.fn() };

/** A fake Supabase client: every method is a vi.fn() a test can program. */
export function makeFakeSupabase() {
  return {
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signOut: vi.fn(async () => ({ error: null })),
      signInWithPassword: vi.fn(),
      getClaims: vi.fn(),
      getUser: vi.fn(),
      updateUser: vi.fn(async () => ({ error: null })),
    },
    rpc: vi.fn(async () => ({ error: null })),
  };
}
