// The schema's functions (plans/crm.md, Feature 1): logging and undoing
// an interaction, the per-contact stats, and the demo reseed. Real
// Postgres with Supabase's roles (tests/db/supabase-pglite.ts).

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { demoSeedPayload, DEMO_PEOPLE } from "@/lib/demo-seed";
import { USER_A, USER_B, asAnon, asUser, errorCode, freshDatabase, utcToday } from "./supabase-pglite";

const TODAY = utcToday();
const day = (n: number) => addDays(TODAY, n);

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

async function contact(user: string, name: string, followUp: string | null = null): Promise<string> {
  return asUser(db, user, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "insert into public.crm_contacts (name, next_follow_up) values ($1, $2) returning id",
      [name, followUp],
    );
    return rows[0].id;
  });
}

async function followUpOf(id: string): Promise<string | null> {
  const { rows } = await db.query<{ f: string | null }>("select next_follow_up::text as f from public.crm_contacts where id = $1", [id]);
  return rows[0].f;
}

type Logged = { id: string; cleared_follow_up: string | null };
function log(user: string, contactId: string, onDay: string, kind = "call", note: string | null = null) {
  return asUser(db, user, async (tx) => {
    const { rows } = await tx.query<{ r: Logged }>("select public.crm_log_interaction($1, $2, $3, $4) as r", [contactId, onDay, kind, note]);
    return rows[0].r;
  });
}

type Undone = { deleted: boolean; restored_follow_up: string | null };
function undo(user: string, id: string) {
  return asUser(db, user, async (tx) => {
    const { rows } = await tx.query<{ r: Undone }>("select public.crm_undo_interaction($1) as r", [id]);
    return rows[0].r;
  });
}

describe("crm_log_interaction", () => {
  it.each([
    ["overdue", -3],
    ["due today", 0],
  ])("clears a follow-up that's %s, and remembers it", async (_label, offset) => {
    const ana = await contact(USER_A, "Ana", day(offset));
    const logged = await log(USER_A, ana, TODAY, "call", "Caught up");
    expect(logged.cleared_follow_up).toBe(day(offset));
    expect(await followUpOf(ana)).toBeNull();
    const { rows } = await db.query<{ cleared: string; note: string; kind: string }>(
      "select cleared_follow_up::text as cleared, note, kind from public.crm_interactions where id = $1",
      [logged.id],
    );
    expect(rows[0]).toEqual({ cleared: day(offset), note: "Caught up", kind: "call" });
  });

  it("keeps a follow-up that's later than the interaction", async () => {
    const ana = await contact(USER_A, "Ana", day(5));
    expect((await log(USER_A, ana, TODAY)).cleared_follow_up).toBeNull();
    expect(await followUpOf(ana)).toBe(day(5));
  });

  it("a back-dated log from before the follow-up doesn't resolve it", async () => {
    const ana = await contact(USER_A, "Ana", day(-2));
    expect((await log(USER_A, ana, day(-6))).cleared_follow_up).toBeNull();
    expect(await followUpOf(ana)).toBe(day(-2));
  });

  it("works with no follow-up at all", async () => {
    const ana = await contact(USER_A, "Ana");
    expect((await log(USER_A, ana, TODAY)).cleared_follow_up).toBeNull();
  });

  it("can't log for someone else's contact (it isn't found), and changes nothing of theirs", async () => {
    const ben = await contact(USER_B, "Ben", day(-1));
    expect(await errorCode(log(USER_A, ben, TODAY))).toBe("P0002");
    expect(await followUpOf(ben)).toBe(day(-1));
  });

  it("still refuses a bad kind or a far-future day, and keeps the follow-up then", async () => {
    const ana = await contact(USER_A, "Ana", day(-1));
    expect(await errorCode(log(USER_A, ana, TODAY, "lunch"))).toBe("23514");
    expect(await errorCode(log(USER_A, ana, day(9)))).toBe("42501");
    expect(await followUpOf(ana)).toBe(day(-1));
  });

  it("anon can't call it", async () => {
    expect(
      await errorCode(asAnon(db, (tx) => tx.query("select public.crm_log_interaction(gen_random_uuid(), current_date, 'call', null)"))),
    ).toBe("42501");
  });
});

describe("crm_undo_interaction", () => {
  it("deletes the log and puts the follow-up back", async () => {
    const ana = await contact(USER_A, "Ana", day(-1));
    const logged = await log(USER_A, ana, TODAY);
    expect(await undo(USER_A, logged.id)).toEqual({ deleted: true, restored_follow_up: day(-1) });
    expect(await followUpOf(ana)).toBe(day(-1));
    expect((await db.query("select * from public.crm_interactions")).rows).toHaveLength(0);
  });

  it("doesn't overwrite a follow-up set since (the newer one wins)", async () => {
    const ana = await contact(USER_A, "Ana", day(-1));
    const logged = await log(USER_A, ana, TODAY);
    await asUser(db, USER_A, (tx) => tx.query("update public.crm_contacts set next_follow_up = $1 where id = $2", [day(7), ana]));
    expect(await undo(USER_A, logged.id)).toEqual({ deleted: true, restored_follow_up: null });
    expect(await followUpOf(ana)).toBe(day(7));
  });

  it("doesn't bring back a follow-up that another logged interaction also resolved (two logs the same day, undo the first)", async () => {
    const ana = await contact(USER_A, "Ana", day(-4));
    const first = await log(USER_A, ana, TODAY, "call");
    const second = await log(USER_A, ana, TODAY, "email");
    expect(second.cleared_follow_up).toBeNull();
    expect(await undo(USER_A, first.id)).toEqual({ deleted: true, restored_follow_up: null });
    expect(await followUpOf(ana)).toBeNull();
  });

  it("still restores it when the only other interaction is from before that follow-up", async () => {
    const ana = await contact(USER_A, "Ana", day(-4));
    await log(USER_A, ana, day(-10)); // older, cleared nothing
    const logged = await log(USER_A, ana, TODAY);
    expect(await undo(USER_A, logged.id)).toEqual({ deleted: true, restored_follow_up: day(-4) });
  });

  it("an interaction that cleared nothing restores nothing", async () => {
    const ana = await contact(USER_A, "Ana");
    const logged = await log(USER_A, ana, TODAY);
    expect(await undo(USER_A, logged.id)).toEqual({ deleted: true, restored_follow_up: null });
    expect(await followUpOf(ana)).toBeNull();
  });

  it("says so when there's nothing to undo (twice, or someone else's)", async () => {
    const ana = await contact(USER_A, "Ana", day(-1));
    const logged = await log(USER_A, ana, TODAY);
    expect(await undo(USER_B, logged.id)).toEqual({ deleted: false, restored_follow_up: null });
    await undo(USER_A, logged.id);
    expect(await undo(USER_A, logged.id)).toEqual({ deleted: false, restored_follow_up: null });
  });
});

describe("crm_contact_stats", () => {
  it("counts each contact's interactions and their last day, for you only", async () => {
    const ana = await contact(USER_A, "Ana");
    const ben = await contact(USER_A, "Ben");
    await contact(USER_A, "Cy"); // no interactions: no row (0)
    await log(USER_A, ana, day(-10));
    await log(USER_A, ana, day(-2));
    await log(USER_A, ben, day(-5));
    const theirs = await contact(USER_B, "Dee");
    await log(USER_B, theirs, TODAY);

    const stats = await asUser(db, USER_A, (tx) =>
      tx.query<{ contact_id: string; interactions: number; last_day: string }>(
        "select contact_id, interactions, last_day::text from public.crm_contact_stats() order by interactions desc",
      ),
    );
    expect(stats.rows).toEqual([
      { contact_id: ana, interactions: 2, last_day: day(-2) },
      { contact_id: ben, interactions: 1, last_day: day(-5) },
    ]);
  });
});

describe("reseed_demo_crm", () => {
  function reseed(user: string, seed: unknown) {
    return asUser(db, user, (tx) => tx.query<{ added: number }>("select public.reseed_demo_crm($1::jsonb) as added", [JSON.stringify(seed)]));
  }
  const SAMPLE = demoSeedPayload(TODAY, "UTC");
  const tiny = (contacts: unknown[], interactions: unknown[] = [], applications: unknown[] = []) => ({ contacts, interactions, applications });

  async function namesOf(user: string) {
    const { rows } = await db.query<{ name: string }>("select name from public.crm_contacts where user_id = $1 order by name", [user]);
    return rows.map((r) => r.name);
  }

  it("seeds the demo network: everyone, their introducers by key, interactions and follow-ups", async () => {
    const { rows } = await reseed(USER_A, SAMPLE);
    expect(rows[0].added).toBe(DEMO_PEOPLE.length);

    const links = await db.query<{ name: string; introducer: string | null }>(
      `select c.name, i.name as introducer from public.crm_contacts c
         left join public.crm_contacts i on i.id = c.introduced_by where c.user_id = $1`,
      [USER_A],
    );
    const byName = Object.fromEntries(links.rows.map((r) => [r.name, r.introducer]));
    for (const person of DEMO_PEOPLE) {
      const introducer = DEMO_PEOPLE.find((p) => p.key === person.introducedBy)?.name ?? null;
      expect(byName[person.name], person.name).toBe(introducer);
    }

    const interactions = await db.query<{ n: number }>("select count(*)::int as n from public.crm_interactions where user_id = $1", [USER_A]);
    expect(interactions.rows[0].n).toBe(SAMPLE.interactions.length);
    const riya = await db.query<{ f: string; met: string }>(
      "select next_follow_up::text as f, met_on::text as met from public.crm_contacts where name = 'Riya Patel'",
    );
    expect(riya.rows[0]).toEqual({ f: TODAY, met: day(-19) });
  });

  it("replaces, never duplicates, and never touches anyone else", async () => {
    await contact(USER_B, "B keeps this");
    await contact(USER_A, "A's old contact");
    await reseed(USER_A, SAMPLE);
    await reseed(USER_A, SAMPLE);
    expect(await namesOf(USER_A)).toHaveLength(DEMO_PEOPLE.length);
    expect(await namesOf(USER_A)).not.toContain("A's old contact");
    expect(await namesOf(USER_B)).toEqual(["B keeps this"]);
  });

  it("seeds applications, linked to a contact by key or to nobody", async () => {
    await reseed(
      USER_A,
      tiny(
        [{ key: "ana", name: "Ana" }],
        [],
        [
          { company: "Kestrel", role: "Firmware Intern", status: "interviewing", applied_on: day(-10), contact: "ana", link: "https://example.com/jobs/1" },
          { company: "Halcyon", role: "Hardware Intern", status: "saved" },
        ],
      ),
    );
    const { rows } = await db.query<{ company: string; contact: string | null; status: string }>(
      `select a.company, c.name as contact, a.status from public.crm_applications a
         left join public.crm_contacts c on c.id = a.contact_id order by a.company`,
    );
    expect(rows).toEqual([
      { company: "Halcyon", contact: null, status: "saved" },
      { company: "Kestrel", contact: "Ana", status: "interviewing" },
    ]);
  });

  it.each([
    ["a duplicate key", tiny([{ key: "a", name: "A" }, { key: "a", name: "B" }])],
    ["a missing key", tiny([{ name: "A" }])],
    ["an introducer listed later", tiny([{ key: "b", name: "B", introduced_by: "a" }, { key: "a", name: "A" }])],
    ["an interaction for nobody", tiny([{ key: "a", name: "A" }], [{ contact: "zz", day: "2026-01-01", kind: "call" }])],
    ["an application for nobody", tiny([{ key: "a", name: "A" }], [], [{ company: "X", role: "Y", contact: "zz" }])],
    ["a missing list", { contacts: [], interactions: [] }],
    ["something that isn't an object", [1, 2]],
  ])("is all or nothing: %s fails with 22023 and keeps the old data", async (_label, seed) => {
    await reseed(USER_A, SAMPLE);
    expect(await errorCode(reseed(USER_A, seed))).toBe("22023");
    expect(await namesOf(USER_A)).toHaveLength(DEMO_PEOPLE.length);
  });

  it("is all or nothing when a row breaks a check (a javascript: link)", async () => {
    await reseed(USER_A, SAMPLE);
    expect(await errorCode(reseed(USER_A, tiny([{ key: "a", name: "A" }], [], [{ company: "X", role: "Y", link: "javascript:alert(1)" }])))).toBe(
      "23514",
    );
    expect(await namesOf(USER_A)).toHaveLength(DEMO_PEOPLE.length);
  });

  it("an empty seed leaves you with nothing", async () => {
    await reseed(USER_A, SAMPLE);
    await reseed(USER_A, tiny([]));
    expect(await namesOf(USER_A)).toEqual([]);
  });

  it("anon can't run it", async () => {
    expect(
      await errorCode(asAnon(db, (tx) => tx.query("select public.reseed_demo_crm('{\"contacts\":[],\"interactions\":[],\"applications\":[]}'::jsonb)"))),
    ).toBe("42501");
  });
});
