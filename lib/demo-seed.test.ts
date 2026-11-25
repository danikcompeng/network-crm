import { describe, expect, it } from "vitest";
import { addDays, daysBetween, todayIn } from "./dates";
import { LIMITS, isInteractionKind, isStage } from "./crm";
import {
  DEMO_PEOPLE,
  RESEED_AFTER_MS,
  SEED_DB_AT_KEY,
  SEEDED_AT_KEY,
  SEEDED_DAY_KEY,
  demoSeedPayload,
  needsReseed,
  seedCounts,
  seedLooksChanged,
  seededMarkers,
  type DemoState,
} from "./demo-seed";
import { networkSummary } from "./network";

const TODAY = "2026-11-24";
const payload = demoSeedPayload(TODAY, "America/Toronto");

describe("the sample network", () => {
  it("is 20 people: three introduction chains and five met directly", () => {
    expect(DEMO_PEOPLE).toHaveLength(20);
    const links = DEMO_PEOPLE.map((p) => ({ id: p.key, introducedBy: p.introducedBy ?? null }));
    expect(networkSummary(links)).toEqual({ people: 20, chains: 3 });
    const direct = DEMO_PEOPLE.filter((p) => !p.introducedBy && !DEMO_PEOPLE.some((q) => q.introducedBy === p.key));
    expect(direct).toHaveLength(5);
  });

  it("has unique keys and names, and every introducer comes earlier in the list (the database needs that)", () => {
    expect(new Set(DEMO_PEOPLE.map((p) => p.key)).size).toBe(DEMO_PEOPLE.length);
    expect(new Set(DEMO_PEOPLE.map((p) => p.name)).size).toBe(DEMO_PEOPLE.length);
    DEMO_PEOPLE.forEach((p, i) => {
      if (p.introducedBy) expect(DEMO_PEOPLE.slice(0, i).map((q) => q.key), p.name).toContain(p.introducedBy);
    });
  });

  it("introducers were met before the people they introduced, and interactions fall after meeting and by today", () => {
    for (const p of DEMO_PEOPLE) {
      const introducer = DEMO_PEOPLE.find((q) => q.key === p.introducedBy);
      if (introducer) expect(introducer.addedDaysAgo, p.name).toBeGreaterThanOrEqual(p.addedDaysAgo);
      for (const i of p.interactions) {
        expect(i.daysAgo, `${p.name}: ${i.note}`).toBeLessThanOrEqual(p.addedDaysAgo);
        expect(i.daysAgo).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("only uses stages and kinds the database accepts, within its text limits", () => {
    for (const p of DEMO_PEOPLE) {
      expect(isStage(p.stage), p.name).toBe(true);
      expect(p.name.length).toBeLessThanOrEqual(LIMITS.contactName);
      expect((p.company ?? "").length).toBeLessThanOrEqual(LIMITS.company);
      expect((p.role ?? "").length).toBeLessThanOrEqual(LIMITS.role);
      expect((p.howMet ?? "").length).toBeLessThanOrEqual(LIMITS.howMet);
      for (const i of p.interactions) {
        expect(isInteractionKind(i.kind)).toBe(true);
        expect((i.note ?? "").length).toBeLessThanOrEqual(LIMITS.interactionNote);
      }
    }
  });

  it("spreads follow-ups across overdue, today, the next 7 days, later and none", () => {
    const due = DEMO_PEOPLE.map((p) => p.followUpIn);
    const count = (test: (n: number | undefined) => boolean) => due.filter(test).length;
    expect(count((n) => n !== undefined && n < 0)).toBeGreaterThanOrEqual(3);
    expect(count((n) => n === 0)).toBeGreaterThanOrEqual(2);
    expect(count((n) => n !== undefined && n >= 1 && n <= 7)).toBeGreaterThanOrEqual(4);
    expect(count((n) => n !== undefined && n > 7)).toBeGreaterThanOrEqual(2);
    expect(count((n) => n === undefined)).toBeGreaterThanOrEqual(1);
  });
});

describe("demoSeedPayload", () => {
  it("dates everything from today: follow-ups, met_on, interaction days", () => {
    const riya = payload.contacts.find((c) => c.name === "Riya Patel")!;
    expect(riya.next_follow_up).toBe(TODAY);
    expect(riya.met_on).toBe(addDays(TODAY, -19));
    const isabel = payload.contacts.find((c) => c.name === "Isabel Cruz")!;
    expect(isabel.next_follow_up).toBe(addDays(TODAY, -9));
    expect(payload.contacts.find((c) => c.name === "Leo Park")!.next_follow_up).toBeNull();
    for (const i of payload.interactions) expect(daysBetween(i.day, TODAY)).toBeGreaterThanOrEqual(0);
  });

  it("introducers are keys, never ids; interactions name their contact by key", () => {
    const keys = new Set(payload.contacts.map((c) => c.key));
    for (const c of payload.contacts) if (c.introduced_by) expect(keys).toContain(c.introduced_by);
    for (const i of payload.interactions) expect(keys).toContain(i.contact);
  });

  it("each contact's created_at falls on its met_on day in the visitor's timezone", () => {
    for (const c of payload.contacts) expect(todayIn("America/Toronto", new Date(c.created_at)), c.name).toBe(c.met_on);
  });

  it("empty texts are null, not empty strings (the database refuses '')", () => {
    for (const c of payload.contacts) for (const v of [c.company, c.role, c.how_met, c.notes]) expect(v).not.toBe("");
    for (const i of payload.interactions) expect(i.note).not.toBe("");
  });
});

describe("seedLooksChanged", () => {
  const mark = "2026-11-24T17:00:00.5+00:00";
  const expected = seedCounts(payload);
  const untouched = (): DemoState => ({
    contacts: { count: expected.contacts, latest: mark },
    interactions: { count: expected.interactions, latest: "2026-11-23T17:00:00+00:00" }, // back-dated by the seed
    applications: { count: expected.applications, latest: null },
  });
  const meta = { [SEED_DB_AT_KEY]: mark };

  it("an untouched seed hasn't changed (its own rows carry exactly the mark)", () => {
    expect(seedLooksChanged(meta, untouched(), expected)).toBe(false);
  });
  it("a deleted contact, a logged interaction or an edit after the mark has", () => {
    const deleted = untouched();
    deleted.contacts.count -= 1;
    expect(seedLooksChanged(meta, deleted, expected)).toBe(true);
    const logged = untouched();
    logged.interactions = { count: expected.interactions + 1, latest: "2026-11-24T17:05:00+00:00" };
    expect(seedLooksChanged(meta, logged, expected)).toBe(true);
    const edited = untouched();
    edited.contacts.latest = "2026-11-24T17:00:00.6+00:00";
    expect(seedLooksChanged(meta, edited, expected)).toBe(true);
  });
  it("microsecond stamps: an identical latest isn't 'after' the mark; an added application is a change", () => {
    const precise = "2026-11-24T17:00:00.123456+00:00";
    const state = untouched();
    state.contacts.latest = precise;
    expect(seedLooksChanged({ [SEED_DB_AT_KEY]: precise }, state, expected)).toBe(false);
    const added = untouched();
    added.applications = { count: expected.applications + 1, latest: "2026-11-24T17:10:00+00:00" };
    expect(seedLooksChanged(meta, added, expected)).toBe(true);
  });

  it("no mark (an older seed) counts as changed", () => {
    expect(seedLooksChanged({}, untouched(), expected)).toBe(true);
  });
});

describe("needsReseed", () => {
  const now = new Date("2026-11-24T15:00:00Z");
  const marked = (at: Date, day: string) => seededMarkers(at, day);

  it("yes if never seeded, or the markers are unreadable", () => {
    expect(needsReseed(undefined, now, TODAY)).toBe(true);
    expect(needsReseed({ [SEEDED_AT_KEY]: "nonsense", [SEEDED_DAY_KEY]: TODAY }, now, TODAY)).toBe(true);
  });
  it("no right after a seed; yes once it's over an hour old", () => {
    expect(needsReseed(marked(now, TODAY), now, TODAY)).toBe(false);
    expect(needsReseed(marked(new Date(now.getTime() - RESEED_AFTER_MS - 1), TODAY), now, TODAY)).toBe(true);
  });
  it("yes for an earlier day; no for a later day (a visitor further west)", () => {
    expect(needsReseed(marked(now, "2026-11-23"), now, TODAY)).toBe(true);
    expect(needsReseed(marked(now, "2026-11-25"), now, TODAY)).toBe(false);
  });
  it("yes when seeded 'in the future' (a hand-set clock), allowing a little clock slack", () => {
    expect(needsReseed(marked(new Date(now.getTime() + 60 * 60 * 1000), TODAY), now, TODAY)).toBe(true);
    expect(needsReseed(marked(new Date(now.getTime() + 60 * 1000), TODAY), now, TODAY)).toBe(false);
  });
  it("ignores Hold's markers in the shared account", () => {
    expect(needsReseed({ hold_demo_seeded_at: now.toISOString(), hold_demo_seeded_day: TODAY }, now, TODAY)).toBe(true);
  });
});
