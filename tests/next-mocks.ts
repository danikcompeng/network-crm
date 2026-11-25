// Stand-ins for Next.js and Supabase in unit tests of server actions.
// Each test file calls vi.mock(...) with these, then sets what Supabase
// answers per test.
import { vi } from "vitest";

/** What redirect() throws, so a test can see where it was sent. */
export class Redirected extends Error {
  constructor(
    public to: string,
    public type?: string,
  ) {
    super(`redirect to ${to}${type ? ` (${type})` : ""}`);
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
  redirect: (to: string, type?: string) => {
    throw new Redirected(to, type);
  },
};

export const nextCache = { io: async () => {}, refresh: vi.fn() };

/**
 * What fake `from(table)` queries answer, by table: a count and the rows.
 * Tests set it; it defaults to "the seed, untouched since the mark".
 */
export const fakeTables: Record<string, { count: number; rows: Record<string, unknown>[] }> = {};

/** A chainable stand-in for supabase.from(...): every call returns itself; awaiting it gives the table's answer. */
export function fakeQuery(table: string) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit", "eq", "insert", "update", "delete", "single"]) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => void) => {
    const answer = fakeTables[table] ?? { count: 0, rows: [] };
    resolve({ data: answer.rows, count: answer.count, error: null });
  };
  return chain;
}

/** A fake Supabase client: every method is a vi.fn() a test can program. */
export function makeFakeSupabase() {
  return {
    from: vi.fn((table: string) => fakeQuery(table)),
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
