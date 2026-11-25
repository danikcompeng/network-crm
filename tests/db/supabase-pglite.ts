// A stand-in for our Supabase database, for tests: real Postgres (PGlite,
// compiled to WebAssembly, runs inside the test) with the parts of Supabase
// the migration relies on:
//   - the anon and authenticated roles;
//   - auth.users and auth.uid(), which reads the user id from the login
//     token's "sub" claim, as Supabase's does;
//   - Supabase's default privileges: anon and authenticated get ALL on
//     every new table and function in public. Without these, "anon can't
//     read contacts" would pass even if the migration forgot to revoke.
//
// Every query that should obey Row Level Security runs through asUser or
// asAnon: inside a transaction, as that role, with that user's claim. The
// default PGlite user is a superuser that skips RLS entirely, so it's only
// used for setup.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite, type Transaction } from "@electric-sql/pglite";

// Every migration, in name order (the timestamp prefix), exactly as they're
// applied to the real project: the tests always see the current schema.
const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
export const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const SUPABASE_SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (id uuid primary key, email text);
  -- Supabase's own definition: the newer JSON claims (what PostgREST sets
  -- today) or the older single "sub" setting.
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export const USER_A = "00000000-0000-4000-8000-00000000000a";
export const USER_B = "00000000-0000-4000-8000-00000000000b";

export async function freshDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  for (const name of MIGRATIONS) await db.exec(readFileSync(MIGRATIONS_DIR + name, "utf8"));
  await db.query("insert into auth.users (id, email) values ($1, 'a@example.com'), ($2, 'b@example.com')", [
    USER_A,
    USER_B,
  ]);
  return db;
}

/**
 * Runs `fn` as a logged-in user, with Row Level Security on, the way
 * PostgREST does it: a transaction, the authenticated role, and the login
 * token's claims as JSON.
 */
export function asUser<T>(db: PGlite, userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    return fn(tx);
  });
}

/** Today in UTC, as the database sees it (the check-in policy uses this). */
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Runs `fn` as a visitor who isn't logged in. */
export function asAnon<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    return fn(tx);
  });
}

/** The Postgres error code of a failed query (e.g. 42501 = permission denied). */
export async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  throw new Error("Expected the query to fail, but it succeeded");
}
