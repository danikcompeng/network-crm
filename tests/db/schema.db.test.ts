// The schema (plans/crm.md, Feature 1) against real Postgres with
// Supabase's roles and default privileges (tests/db/supabase-pglite.ts).
// Everything that should obey Row Level Security runs as `authenticated`
// or `anon`, never as the superuser.

import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { USER_A, USER_B, asAnon, asUser, errorCode, freshDatabase, utcToday } from "./supabase-pglite";

const TODAY = utcToday();

let db: PGlite;
beforeAll(async () => {
  db = await freshDatabase();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec("delete from public.crm_applications; delete from public.crm_contacts;");
});

async function addContact(tx: Transaction, name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const cols = ["name", ...Object.keys(extra)];
  const vals = [name, ...Object.values(extra)];
  const { rows } = await tx.query<{ id: string }>(
    `insert into public.crm_contacts (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    vals,
  );
  return rows[0].id;
}

const contactAs = (user: string, name: string, extra: Record<string, unknown> = {}) =>
  asUser(db, user, (tx) => addContact(tx, name, extra));

async function introducerOf(id: string): Promise<string | null> {
  const { rows } = await db.query<{ introduced_by: string | null }>("select introduced_by from public.crm_contacts where id = $1", [id]);
  return rows[0].introduced_by;
}

describe("Row Level Security", () => {
  it("each account sees and changes only its own contacts", async () => {
    const mine = await contactAs(USER_A, "Ana");
    await contactAs(USER_B, "Ben");
    const seen = await asUser(db, USER_A, (tx) => tx.query<{ name: string }>("select name from public.crm_contacts"));
    expect(seen.rows.map((r) => r.name)).toEqual(["Ana"]);

    // B can't update or delete A's row: zero rows touched, no error.
    const updated = await asUser(db, USER_B, (tx) => tx.query("update public.crm_contacts set name = 'Hacked' where id = $1", [mine]));
    const deleted = await asUser(db, USER_B, (tx) => tx.query("delete from public.crm_contacts where id = $1", [mine]));
    expect([updated.affectedRows, deleted.affectedRows]).toEqual([0, 0]);
    expect((await db.query<{ name: string }>("select name from public.crm_contacts where id = $1", [mine])).rows[0].name).toBe("Ana");
  });

  it("you can't create a row owned by someone else", async () => {
    expect(
      await errorCode(
        asUser(db, USER_A, (tx) => tx.query("insert into public.crm_contacts (user_id, name) values ($1, 'Planted')", [USER_B])),
      ),
    ).toBe("42501");
    expect(
      await errorCode(
        asUser(db, USER_A, (tx) => tx.query("insert into public.crm_applications (user_id, company, role) values ($1, 'X', 'Y')", [USER_B])),
      ),
    ).toBe("42501");
  });

  it("interactions and applications are private too", async () => {
    const ana = await contactAs(USER_A, "Ana");
    await asUser(db, USER_A, async (tx) => {
      await tx.query("insert into public.crm_interactions (contact_id, day, kind) values ($1, $2, 'call')", [ana, TODAY]);
      await tx.query("insert into public.crm_applications (company, role) values ('Kestrel', 'Intern')");
    });
    const seenByB = await asUser(db, USER_B, async (tx) => [
      (await tx.query("select * from public.crm_interactions")).rows.length,
      (await tx.query("select * from public.crm_applications")).rows.length,
    ]);
    expect(seenByB).toEqual([0, 0]);
  });

  it("anon can do nothing at all", async () => {
    for (const table of ["crm_contacts", "crm_interactions", "crm_applications"]) {
      expect(await errorCode(asAnon(db, (tx) => tx.query(`select * from public.${table}`))), table).toBe("42501");
      expect(await errorCode(asAnon(db, (tx) => tx.query(`delete from public.${table}`))), table).toBe("42501");
    }
  });

  it("nobody can truncate, and only the editable columns can be updated", async () => {
    const { rows } = await db.query<Record<string, boolean>>(
      `select
         has_table_privilege('authenticated', 'public.crm_contacts', 'truncate') as truncate_contacts,
         has_table_privilege('anon', 'public.crm_contacts', 'select') as anon_select,
         has_column_privilege('authenticated', 'public.crm_contacts', 'name', 'update') as name,
         has_column_privilege('authenticated', 'public.crm_contacts', 'introduced_by', 'update') as introduced_by,
         has_column_privilege('authenticated', 'public.crm_contacts', 'user_id', 'update') as contact_owner,
         has_column_privilege('authenticated', 'public.crm_contacts', 'created_at', 'update') as created_at,
         has_column_privilege('authenticated', 'public.crm_contacts', 'updated_at', 'update') as updated_at,
         has_column_privilege('authenticated', 'public.crm_interactions', 'cleared_follow_up', 'update') as cleared,
         has_column_privilege('authenticated', 'public.crm_interactions', 'contact_id', 'update') as move_interaction,
         has_column_privilege('authenticated', 'public.crm_applications', 'status', 'update') as status,
         has_column_privilege('authenticated', 'public.crm_applications', 'user_id', 'update') as application_owner`,
    );
    expect(rows[0]).toEqual({
      truncate_contacts: false,
      anon_select: false,
      name: true,
      introduced_by: true,
      contact_owner: false,
      created_at: false,
      updated_at: false,
      cleared: false,
      move_interaction: false,
      status: true,
      application_owner: false,
    });
    const ana = await contactAs(USER_A, "Ana");
    expect(
      await errorCode(asUser(db, USER_A, (tx) => tx.query("update public.crm_contacts set user_id = $1 where id = $2", [USER_B, ana]))),
    ).toBe("42501");
  });
});

describe("references stay inside one account", () => {
  it("you can't name someone else's contact as an introducer, even with their id", async () => {
    const theirs = await contactAs(USER_B, "Ben");
    expect(await errorCode(contactAs(USER_A, "Ana", { introduced_by: theirs }))).toBe("23503");
    const ana = await contactAs(USER_A, "Ana");
    expect(
      await errorCode(
        asUser(db, USER_A, (tx) => tx.query("update public.crm_contacts set introduced_by = $1 where id = $2", [theirs, ana])),
      ),
    ).toBe("23503");
  });

  it("you can't log an interaction or link an application to someone else's contact", async () => {
    const theirs = await contactAs(USER_B, "Ben");
    expect(
      await errorCode(
        asUser(db, USER_A, (tx) =>
          tx.query("insert into public.crm_interactions (contact_id, day, kind) values ($1, $2, 'call')", [theirs, TODAY]),
        ),
      ),
    ).toBe("23503");
    expect(
      await errorCode(
        asUser(db, USER_A, (tx) =>
          tx.query("insert into public.crm_applications (company, role, contact_id) values ('X', 'Y', $1)", [theirs]),
        ),
      ),
    ).toBe("23503");
  });
});

describe("the introduction graph", () => {
  it("nobody introduces themselves (the trigger says so first; the check is the backstop)", async () => {
    const ana = await contactAs(USER_A, "Ana");
    const selfLink = () =>
      errorCode(asUser(db, USER_A, (tx) => tx.query("update public.crm_contacts set introduced_by = id where id = $1", [ana])));
    expect(await selfLink()).toBe("CR001");
    await db.exec("alter table public.crm_contacts disable trigger crm_contacts_no_loops");
    try {
      expect(await selfLink()).toBe("23514");
    } finally {
      await db.exec("alter table public.crm_contacts enable trigger crm_contacts_no_loops");
    }
  });

  it("refuses a longer loop made by an update (A > B > C, then C introduces A)", async () => {
    const a = await contactAs(USER_A, "A");
    const b = await contactAs(USER_A, "B", { introduced_by: a });
    const c = await contactAs(USER_A, "C", { introduced_by: b });
    expect(
      await errorCode(asUser(db, USER_A, (tx) => tx.query("update public.crm_contacts set introduced_by = $1 where id = $2", [c, a]))),
    ).toBe("CR001");
    expect(await introducerOf(a)).toBeNull();
  });

  it("refuses a loop made by one bulk insert with chosen ids", async () => {
    const [a, b] = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"];
    expect(
      await errorCode(
        asUser(db, USER_A, (tx) =>
          tx.query("insert into public.crm_contacts (id, name, introduced_by) values ($1, 'A', $2), ($2, 'B', $1)", [a, b]),
        ),
      ),
    ).toBe("CR001");
    expect((await db.query("select * from public.crm_contacts")).rows).toHaveLength(0);
  });

  it("refuses a loop made by one multi-row update (A and B swap to introduce each other)", async () => {
    const a = await contactAs(USER_A, "A");
    const b = await contactAs(USER_A, "B");
    expect(
      await errorCode(
        asUser(db, USER_A, (tx) =>
          tx.query(
            "update public.crm_contacts set introduced_by = case when id = $1 then $2::uuid else $1::uuid end where id in ($1, $2)",
            [a, b],
          ),
        ),
      ),
    ).toBe("CR001");
  });

  it("still allows a chain, a fan-out, and moving someone (their own introductees move with them)", async () => {
    const a = await contactAs(USER_A, "A");
    const b = await contactAs(USER_A, "B", { introduced_by: a });
    const c = await contactAs(USER_A, "C", { introduced_by: b });
    const d = await contactAs(USER_A, "D", { introduced_by: a });
    await asUser(db, USER_A, (tx) => tx.query("update public.crm_contacts set introduced_by = $1 where id = $2", [d, b]));
    expect([await introducerOf(b), await introducerOf(c)]).toEqual([d, b]);
  });

  it("deleting an introducer detaches the people they introduced (and keeps everyone else)", async () => {
    const a = await contactAs(USER_A, "A");
    const b = await contactAs(USER_A, "B", { introduced_by: a });
    const c = await contactAs(USER_A, "C", { introduced_by: b });
    await asUser(db, USER_A, (tx) => tx.query("delete from public.crm_contacts where id = $1", [b]));
    expect(await introducerOf(c)).toBeNull();
    expect((await db.query("select * from public.crm_contacts")).rows).toHaveLength(2);
  });

  it("doesn't hang on a loop that somehow already exists (made by the superuser, skipping the trigger)", async () => {
    const a = await contactAs(USER_A, "A");
    const b = await contactAs(USER_A, "B", { introduced_by: a });
    await db.exec("alter table public.crm_contacts disable trigger crm_contacts_no_loops");
    await db.query("update public.crm_contacts set introduced_by = $1 where id = $2", [b, a]);
    await db.exec("alter table public.crm_contacts enable trigger crm_contacts_no_loops");
    // Pointing a new contact into the loop must answer (allowed: it isn't part of it).
    const c = await contactAs(USER_A, "C", { introduced_by: a });
    expect(await introducerOf(c)).toBe(a);
  });
});

describe("deleting a contact", () => {
  it("deletes their interactions and keeps their applications, unlinked", async () => {
    const ana = await contactAs(USER_A, "Ana");
    await asUser(db, USER_A, async (tx) => {
      await tx.query("insert into public.crm_interactions (contact_id, day, kind) values ($1, $2, 'call')", [ana, TODAY]);
      await tx.query("insert into public.crm_applications (company, role, contact_id) values ('Kestrel', 'Intern', $1)", [ana]);
      await tx.query("delete from public.crm_contacts where id = $1", [ana]);
    });
    expect((await db.query("select * from public.crm_interactions")).rows).toHaveLength(0);
    const { rows } = await db.query<{ contact_id: string | null; user_id: string }>("select contact_id, user_id from public.crm_applications");
    expect(rows).toEqual([{ contact_id: null, user_id: USER_A }]);
  });
});

describe("checks on what's stored", () => {
  const bad: [string, Record<string, unknown>][] = [
    ["an empty name", { name: "" }],
    ["a padded name", { name: " Ana" }],
    ["a name over 80 characters", { name: "x".repeat(81) }],
    ["an empty company (empty is stored as null)", { name: "Ana", company: "" }],
    ["an unknown stage", { name: "Ana", stage: "friend" }],
    ["a follow-up in the year 26", { name: "Ana", next_follow_up: "0026-11-24" }],
    ["a met_on after 2100", { name: "Ana", met_on: "2101-01-01" }],
    ["notes over 4,000 characters", { name: "Ana", notes: "x".repeat(4001) }],
  ];
  it.each(bad)("refuses a contact with %s", async (_label, values) => {
    const { name, ...rest } = values;
    expect(await errorCode(contactAs(USER_A, name as string, rest))).toBe("23514");
  });

  it("counts characters, not bytes: an 80-emoji name fits", async () => {
    await expect(contactAs(USER_A, "🙂".repeat(80))).resolves.toBeTypeOf("string");
  });

  it.each([
    ["javascript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["ftp://example.com"],
    ["https://exa mple.com"],
    ["https://"],
  ])("refuses the application link %s", async (link) => {
    expect(
      await errorCode(
        asUser(db, USER_A, (tx) => tx.query("insert into public.crm_applications (company, role, link) values ('X', 'Y', $1)", [link])),
      ),
    ).toBe("23514");
  });

  it("accepts http and https links, any case", async () => {
    await asUser(db, USER_A, (tx) =>
      tx.query(
        "insert into public.crm_applications (company, role, link) values ('X', 'Y', 'https://jobs.example.com/123?a=b'), ('X', 'Z', 'HTTP://x.example')",
      ),
    );
    expect((await db.query("select * from public.crm_applications")).rows).toHaveLength(2);
  });

  it("refuses an unknown status, an unknown kind, and an Excel-serial year", async () => {
    expect(
      await errorCode(asUser(db, USER_A, (tx) => tx.query("insert into public.crm_applications (company, role, status) values ('X', 'Y', 'ghosted')"))),
    ).toBe("23514");
    expect(
      await errorCode(
        asUser(db, USER_A, (tx) => tx.query("insert into public.crm_applications (company, role, applied_on) values ('X', 'Y', '45620-01-01')")),
      ),
    ).toBe("23514");
    const ana = await contactAs(USER_A, "Ana");
    expect(
      await errorCode(
        asUser(db, USER_A, (tx) => tx.query("insert into public.crm_interactions (contact_id, day, kind) values ($1, $2, 'lunch')", [ana, TODAY])),
      ),
    ).toBe("23514");
  });

  it("an application defaults to applied, with no date", async () => {
    await asUser(db, USER_A, (tx) => tx.query("insert into public.crm_applications (company, role) values ('X', 'Y')"));
    const { rows } = await db.query<{ status: string; applied_on: string | null }>("select status, applied_on from public.crm_applications");
    expect(rows).toEqual([{ status: "applied", applied_on: null }]);
  });
});

describe("interaction days", () => {
  it("accepts today and tomorrow in UTC, refuses the day after", async () => {
    const ana = await contactAs(USER_A, "Ana");
    const log = (day: string) =>
      asUser(db, USER_A, (tx) => tx.query("insert into public.crm_interactions (contact_id, day, kind) values ($1, $2, 'call')", [ana, day]));
    await log(TODAY);
    await log(addDays(TODAY, 1));
    await log("2019-05-01"); // met someone years ago: fine
    expect(await errorCode(log(addDays(TODAY, 2)))).toBe("42501");
  });

  it("an update can't move an interaction past tomorrow either", async () => {
    const ana = await contactAs(USER_A, "Ana");
    await asUser(db, USER_A, (tx) => tx.query("insert into public.crm_interactions (contact_id, day, kind) values ($1, $2, 'call')", [ana, TODAY]));
    expect(
      await errorCode(asUser(db, USER_A, (tx) => tx.query("update public.crm_interactions set day = $1", [addDays(TODAY, 5)]))),
    ).toBe("42501");
  });
});

describe("updated_at", () => {
  it("moves on every update, and the app can't set it", async () => {
    const ana = await contactAs(USER_A, "Ana");
    await db.query("update public.crm_contacts set updated_at = '2001-01-01' where id = $1", [ana]);
    await asUser(db, USER_A, (tx) => tx.query("update public.crm_contacts set stage = 'talking' where id = $1", [ana]));
    const { rows } = await db.query<{ updated_at: Date }>("select updated_at from public.crm_contacts where id = $1", [ana]);
    expect(rows[0].updated_at.getUTCFullYear()).toBeGreaterThan(2001);
  });
});

describe("limits", () => {
  it("stops at 1,000 contacts, even inside one bulk insert", async () => {
    await asUser(db, USER_A, (tx) =>
      tx.query("insert into public.crm_contacts (name) select 'Person ' || g from generate_series(1, 1000) g"),
    );
    expect(await errorCode(contactAs(USER_A, "One too many"))).toBe("54000");
    // Someone else's count is their own.
    await expect(contactAs(USER_B, "Ben")).resolves.toBeTypeOf("string");
    await db.exec("delete from public.crm_contacts");
    expect(
      await errorCode(
        asUser(db, USER_A, (tx) => tx.query("insert into public.crm_contacts (name) select 'P' || g from generate_series(1, 1001) g")),
      ),
    ).toBe("54000");
  });

  it("stops at 1,000 applications and 5,000 interactions", async () => {
    expect(
      await errorCode(
        asUser(db, USER_A, (tx) =>
          tx.query("insert into public.crm_applications (company, role) select 'C', 'R' || g from generate_series(1, 1001) g"),
        ),
      ),
    ).toBe("54000");
    const ana = await contactAs(USER_A, "Ana");
    expect(
      await errorCode(
        asUser(db, USER_A, (tx) =>
          tx.query("insert into public.crm_interactions (contact_id, day, kind) select $1, $2, 'call' from generate_series(1, 5001)", [
            ana,
            TODAY,
          ]),
        ),
      ),
    ).toBe("54000");
  });
});

describe("function privileges", () => {
  it("only the four RPCs are callable, only by logged-in users, and PUBLIC has nothing", async () => {
    const { rows } = await db.query<{ fn: string; anon: boolean; authed: boolean; public_grants: number }>(
      `select p.oid::regprocedure::text as fn,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authed,
              (select count(*)::int from aclexplode(p.proacl) a where a.grantee = 0) as public_grants
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and (p.proname like 'crm\\_%' or p.proname = 'reseed_demo_crm')
        order by 1`,
    );
    expect(rows).toEqual([
      { fn: "crm_contact_stats()", anon: false, authed: true, public_grants: 0 },
      { fn: "crm_contacts_no_loops()", anon: false, authed: false, public_grants: 0 },
      { fn: "crm_enforce_limit()", anon: false, authed: false, public_grants: 0 },
      { fn: "crm_log_interaction(uuid,date,text,text)", anon: false, authed: true, public_grants: 0 },
      { fn: "crm_touch_updated_at()", anon: false, authed: false, public_grants: 0 },
      { fn: "crm_undo_interaction(uuid)", anon: false, authed: true, public_grants: 0 },
      { fn: "reseed_demo_crm(jsonb)", anon: false, authed: true, public_grants: 0 },
    ]);
  });

  it("everything this migration makes is named crm_ (the project is shared)", async () => {
    const { rows } = await db.query<{ name: string }>(
      `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'i', 'S', 'v')
       union
       select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`,
    );
    expect(rows.filter((r) => !r.name.startsWith("crm_") && r.name !== "reseed_demo_crm")).toEqual([]);
  });
});

describe("the updated_at guard the app relies on", () => {
  it("updated_at read back as the API sends it matches exactly once, and not after another change", async () => {
    const ana = await contactAs(USER_A, "Ana");
    // PostgREST sends timestamptz as JSON text, e.g. "2026-11-24T17:00:00.123456+00:00".
    const stamp = await asUser(db, USER_A, async (tx) => {
      const { rows } = await tx.query<{ t: string }>("select to_json(updated_at) #>> '{}' as t from public.crm_contacts where id = $1", [ana]);
      return rows[0].t;
    });
    const save = (role: string) =>
      asUser(db, USER_A, (tx) =>
        tx.query("update public.crm_contacts set role = $1 where id = $2 and updated_at = $3::timestamptz", [role, ana, stamp]),
      );
    expect((await save("First")).affectedRows).toBe(1);
    // The touch trigger moved updated_at: the same stamp no longer matches.
    expect((await save("Second")).affectedRows).toBe(0);
  });
});
