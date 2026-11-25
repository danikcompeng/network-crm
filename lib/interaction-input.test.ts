import { describe, expect, it } from "vitest";
import { checkInteraction, followUpOffer, loggedWords } from "./interaction-input";

const TODAY = "2026-11-24";

describe("checkInteraction", () => {
  it("a kind alone is enough: dated today, no note", () => {
    expect(checkInteraction({ kind: "call" }, TODAY)).toEqual({ ok: true, value: { kind: "call", note: null, day: TODAY } });
  });
  it("keeps a tidied note and an earlier day", () => {
    expect(checkInteraction({ kind: "email", note: "  Sent the deck \r\n", day: "2026-11-20" }, TODAY)).toEqual({
      ok: true,
      value: { kind: "email", note: "Sent the deck", day: "2026-11-20" },
    });
  });
  it.each([
    [{ kind: "lunch" }, /kind/],
    [{ kind: "call", day: "2026-11-25" }, /future/],
    [{ kind: "call", day: "2026-02-30" }, /real date/],
    [{ kind: "call", note: "x".repeat(1001) }, /1,000/],
  ])("refuses %o", (raw, words) => {
    expect(checkInteraction(raw, TODAY)).toMatchObject({ ok: false, message: expect.stringMatching(words) });
  });
});

describe("followUpOffer", () => {
  it("suggests a week after the log", () => {
    expect(followUpOffer(TODAY, null, TODAY)).toEqual({ suggested: "2026-12-01", replaces: null, question: "Follow up again on:" });
  });
  it("a back-dated log still suggests a day from today on, never in the past", () => {
    expect(followUpOffer("2026-11-01", null, TODAY).suggested).toBe("2026-12-01");
    expect(followUpOffer("2026-11-20", null, TODAY).suggested).toBe("2026-11-27");
  });
  it("a follow-up still set on the suggested day isn't offered as a move", () => {
    expect(followUpOffer(TODAY, "2026-12-01", TODAY)).toEqual({ suggested: "2026-12-01", replaces: null, question: "Follow up again on:" });
  });

  it("a log exactly a week ago suggests today", () => {
    expect(followUpOffer("2026-11-17", null, TODAY).suggested).toBe(TODAY);
  });

  it("offers to move a follow-up that's still set", () => {
    expect(followUpOffer(TODAY, "2026-12-09", TODAY)).toEqual({
      suggested: "2026-12-01",
      replaces: "2026-12-09",
      question: "Move the follow-up from Dec 9 to:",
    });
  });
});

describe("loggedWords", () => {
  it("says what was logged, with the right article", () => {
    expect(loggedWords("call", "Riya Patel")).toBe("Logged a call with Riya Patel.");
    expect(loggedWords("email", "Sam")).toBe("Logged an email with Sam.");
    expect(loggedWords("applied", "Sam")).toBe("Logged an application update with Sam.");
  });
});
