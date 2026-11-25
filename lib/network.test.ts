import { describe, expect, it } from "vitest";
import { chainStarts, descendantsOf, introducerChoices, introductions, networkSummary, summaryText, type Link } from "./network";

// A > B > C, A > D; E alone; F introduced by someone not in the list.
const LINKS: Link[] = [
  { id: "A", introducedBy: null },
  { id: "B", introducedBy: "A" },
  { id: "C", introducedBy: "B" },
  { id: "D", introducedBy: "A" },
  { id: "E", introducedBy: null },
  { id: "F", introducedBy: "gone" },
];

describe("introductions", () => {
  it("lists who each person introduced; a missing introducer counts as you", () => {
    expect(Object.fromEntries(introductions(LINKS))).toEqual({ A: ["B", "D"], B: ["C"] });
  });
});

describe("descendantsOf", () => {
  it("finds everyone below, at any depth", () => {
    expect([...descendantsOf(LINKS, "A")].sort()).toEqual(["B", "C", "D"]);
    expect([...descendantsOf(LINKS, "C")]).toEqual([]);
  });

  it("stops on a loop that shouldn't exist, without hanging or including the start", () => {
    const loop: Link[] = [
      { id: "X", introducedBy: "Y" },
      { id: "Y", introducedBy: "X" },
      { id: "Z", introducedBy: "Y" },
    ];
    expect([...descendantsOf(loop, "X")].sort()).toEqual(["Y", "Z"]);
  });

  it("handles a 1,000-deep chain without recursion limits", () => {
    const deep = Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}`, introducedBy: i === 0 ? null : `p${i - 1}` }));
    expect(descendantsOf(deep, "p0").size).toBe(999);
  });
});

describe("introducerChoices", () => {
  it("leaves out the person and everyone below them", () => {
    expect(introducerChoices(LINKS, "B").sort()).toEqual(["A", "D", "E", "F"]);
    expect(introducerChoices(LINKS, "A").sort()).toEqual(["E", "F"]);
  });
  it("offers everyone for a new contact", () => {
    expect(introducerChoices(LINKS, null)).toHaveLength(LINKS.length);
  });
});

describe("chains and the summary", () => {
  it("a chain starts with someone you met who introduced someone", () => {
    expect(chainStarts(LINKS)).toEqual(["A"]);
    expect(networkSummary(LINKS)).toEqual({ people: 6, chains: 1 });
  });

  it("a self-link (refused by the database) still counts the person as yours", () => {
    expect(chainStarts([{ id: "S", introducedBy: "S" }, { id: "T", introducedBy: "S" }])).toEqual(["S"]);
  });

  it.each([
    [{ people: 0, chains: 0 }, "No one yet."],
    [{ people: 1, chains: 0 }, "1 person, no introductions yet."],
    [{ people: 2, chains: 1 }, "2 people, 1 introduction chain."],
    [{ people: 20, chains: 3 }, "20 people, 3 introduction chains."],
  ])("summaryText(%o) is %s", (summary, text) => {
    expect(summaryText(summary)).toBe(text);
  });
});
