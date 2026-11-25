import { describe, expect, it } from "vitest";
import { CONTACT_COLUMNS, checkContact, checkDay, tidyLine, tidyText } from "./contact-input";

const TODAY = "2026-11-24";
const ID = "3f2c1a9e-1111-4222-8333-444455556666";
const OTHER = "7a7a7a7a-1111-4222-8333-444455556666";
const check = (raw: Record<string, unknown>, id: string | null = null) => checkContact(raw, { id, today: TODAY });

describe("tidying", () => {
  it("a line: any whitespace run is one space, trimmed, empty is null", () => {
    expect(tidyLine("  Sam  Okafor\t ")).toBe("Sam Okafor");
    expect(tidyLine(" 　")).toBeNull();
    expect(tidyLine(42)).toBeNull();
  });
  it("text: keeps line breaks, normalises Windows line ends, trims the ends", () => {
    expect(tidyText("\r\n line one\r\nline two  \n\n")).toBe("line one\nline two");
    expect(tidyText(" \n ")).toBeNull();
  });
});

describe("checkDay", () => {
  it("accepts real days in 2000-2100, empty as null, anything else is undefined", () => {
    expect(checkDay("2026-02-28")).toBe("2026-02-28");
    expect(checkDay("")).toBeNull();
    expect(checkDay(undefined)).toBeNull();
    expect(checkDay("2026-02-30")).toBeUndefined();
    expect(checkDay("1999-12-31")).toBeUndefined();
    expect(checkDay("2101-01-01")).toBeUndefined();
    expect(checkDay("11/24/2026")).toBeUndefined();
  });
});

describe("checkContact", () => {
  it("tidies a full contact, defaulting the stage to new and empties to null", () => {
    const result = check({
      name: "  Sam  Okafor ",
      company: "Kestrel Systems",
      role: "",
      stage: "",
      introduced_by: "",
      how_met: " Elena's student ",
      met_on: "2026-10-17",
      next_follow_up: "",
      notes: "Likes  motors.\r\n\r\nAsk about firmware. ",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        name: "Sam Okafor",
        company: "Kestrel Systems",
        role: null,
        stage: "new",
        introduced_by: null,
        how_met: "Elena's student",
        met_on: "2026-10-17",
        next_follow_up: null,
        notes: "Likes  motors.\n\nAsk about firmware.",
      },
    });
  });

  it("returns exactly the nine editable columns, whatever else is sent", () => {
    const result = check({ name: "A", id: ID, user_id: OTHER, updated_at: "2001-01-01", created_at: "x" });
    expect(result.ok && Object.keys(result.value).sort()).toEqual([...CONTACT_COLUMNS].sort());
  });

  it("counts a note's line breaks once, however the browser sent them", () => {
    const fits = "a\r\n".repeat(1999) + "ab"; // stored as 1,999 × "a\n" + "ab" = 4,000 characters
    expect(check({ name: "A", notes: fits })).toMatchObject({ ok: true });
    expect(check({ name: "A", notes: fits + "c" })).toMatchObject({ ok: false });
    expect(check({ name: "A\u0085" })).toMatchObject({ ok: true, value: { name: "A" } });
  });

  it("needs a name, and counts characters like the database (80 emoji fit, 81 don't)", () => {
    expect(check({ name: "   " })).toMatchObject({ ok: false, fieldErrors: { name: "Give them a name." } });
    expect(check({ name: "🙂".repeat(80) }).ok).toBe(true);
    expect(check({ name: "🙂".repeat(81) })).toMatchObject({ ok: false, fieldErrors: { name: expect.stringMatching(/80/) } });
  });

  it("company, role and how-met stop at 80 / 80 / 280 characters (emoji count once)", () => {
    expect(check({ name: "A", company: "🙂".repeat(80), role: "🙂".repeat(80), how_met: "🙂".repeat(280) }).ok).toBe(true);
    const over = check({ name: "A", company: "x".repeat(81), role: "x".repeat(81), how_met: "x".repeat(281) });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(Object.keys(over.fieldErrors).sort()).toEqual(["company", "how_met", "role"]);
  });

  it("odd types are refused, not crashed on", () => {
    expect(check({ name: "A", introduced_by: 5, stage: {} })).toMatchObject({ ok: false, fieldErrors: { introduced_by: expect.any(String), stage: expect.any(String) } });
  });

  it("refuses an unknown stage", () => {
    expect(check({ name: "A", stage: "friend" })).toMatchObject({ ok: false, fieldErrors: { stage: expect.any(String) } });
  });

  it("the introducer must be an id, and not the person themselves (any case)", () => {
    expect(check({ name: "A", introduced_by: "robert'); drop table" })).toMatchObject({ ok: false, fieldErrors: { introduced_by: expect.any(String) } });
    expect(check({ name: "A", introduced_by: ID.toUpperCase() }, ID)).toMatchObject({
      ok: false,
      fieldErrors: { introduced_by: "Someone can't introduce themselves." },
    });
    expect(check({ name: "A", introduced_by: OTHER.toUpperCase() }, ID)).toMatchObject({ ok: true, value: { introduced_by: OTHER } });
  });

  it("met on can be today but not tomorrow; a follow-up can be any real day (past ones are just overdue)", () => {
    expect(check({ name: "A", met_on: TODAY }).ok).toBe(true);
    expect(check({ name: "A", met_on: "2026-11-25" })).toMatchObject({ ok: false, fieldErrors: { met_on: expect.stringMatching(/future/) } });
    expect(check({ name: "A", next_follow_up: "2026-01-01" }).ok).toBe(true);
    expect(check({ name: "A", next_follow_up: "2026-13-01" })).toMatchObject({ ok: false, fieldErrors: { next_follow_up: expect.any(String) } });
  });

  it("reports every problem at once", () => {
    const result = check({ name: "", stage: "x", met_on: "nope", notes: "y".repeat(4001) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fieldErrors).sort()).toEqual(["met_on", "name", "notes", "stage"]);
  });
});
