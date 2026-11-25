import { describe, expect, it } from "vitest";
import { byName, deleteSummary, filterPeople, fold, matches, parseStageFilter, searchWords, stageTone, type PersonRow } from "./people";

const person = (id: string, name: string, extra: Partial<PersonRow> = {}): PersonRow => ({
  id,
  name,
  company: null,
  role: null,
  stage: "new",
  introduced_by: null,
  next_follow_up: null,
  ...extra,
});

const PEOPLE = [
  person("1", "Sam Okafor", { company: "Kestrel Systems", role: "Firmware Engineer", stage: "talking" }),
  person("2", "José Álvarez", { company: "Halcyon Labs", stage: "new" }),
  person("3", "riya patel", { company: "Kestrel Systems", stage: "interviewing" }),
  person("4", "Émile Roux", { stage: "talking" }),
  person("5", "Ana Torres", { role: "Controls Engineer", stage: "parked" }),
];

describe("search", () => {
  it("folds case, accents and spaces", () => {
    expect(fold("  José   ÁLVAREZ ")).toBe("jose alvarez");
    expect(fold("Łódź Bjørn Straße Æsir")).toBe("lodz bjorn strasse aesir");
    expect(fold("Œuvre Đorđe Ðóra Þór Iıl ØLE")).toBe("oeuvre dorde dora thor iil ole");
    expect(searchWords("  Kestrel   SAM ")).toEqual(["kestrel", "sam"]);
    expect(searchWords("   ")).toEqual([]);
  });

  it("every word must appear in the name, company or role, in any order", () => {
    expect(matches(PEOPLE[0], searchWords("kestrel sam"))).toBe(true);
    expect(matches(PEOPLE[0], searchWords("firmware"))).toBe(true);
    expect(matches(PEOPLE[0], searchWords("kestrel riya"))).toBe(false);
    expect(matches(PEOPLE[1], searchWords("jose"))).toBe(true);
    expect(matches(PEOPLE[1], searchWords("JOSÉ halcyon"))).toBe(true);
  });

  it("an empty search matches everyone", () => {
    expect(PEOPLE.every((p) => matches(p, []))).toBe(true);
  });
});

describe("filterPeople", () => {
  it("orders by name ignoring case and accents", () => {
    expect(filterPeople(PEOPLE, "", "all").visible.map((p) => p.name)).toEqual([
      "Ana Torres",
      "Émile Roux",
      "José Álvarez",
      "riya patel",
      "Sam Okafor",
    ]);
  });

  it("combines search and stage, and the counts follow the search, not the stage", () => {
    const { visible, counts } = filterPeople(PEOPLE, "kestrel", "talking");
    expect(visible.map((p) => p.name)).toEqual(["Sam Okafor"]);
    expect(counts).toEqual({ all: 2, new: 0, reached_out: 0, talking: 1, interviewing: 1, offer: 0, parked: 0 });
  });

  it("doesn't reorder the list it was given", () => {
    const copy = [...PEOPLE];
    filterPeople(PEOPLE, "", "all");
    expect(PEOPLE).toEqual(copy);
  });

  it("ties on name keep a steady order (by id)", () => {
    const twins = [person("b", "Alex Kim"), person("a", "alex kim")];
    expect([...twins].sort(byName).map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("parseStageFilter", () => {
  it("accepts a stage, anything else is all", () => {
    expect(parseStageFilter("talking")).toBe("talking");
    expect(parseStageFilter("TALKING")).toBe("all");
    expect(parseStageFilter(null)).toBe("all");
    expect(parseStageFilter("constructor")).toBe("all");
  });
});

describe("stageTone", () => {
  it("is muted for new, reached out and parked; ink for talking; accent for interviewing and offer", () => {
    expect(["new", "reached_out", "parked"].map((s) => stageTone(s as never))).toEqual(["muted", "muted", "muted"]);
    expect(stageTone("talking")).toBe("ink");
    expect(stageTone("interviewing")).toBe("accent");
    expect(stageTone("offer")).toBe("accent");
  });
});

describe("deleteSummary", () => {
  it("says what happens, in numbers, singular where it should be", () => {
    expect(deleteSummary({ interactions: 3, introduced: ["Riya Patel"], applications: 2 })).toEqual([
      "Their 3 interactions are deleted.",
      "Riya Patel, whom they introduced, stays, with no introducer.",
      "2 applications stay, unlinked.",
    ]);
    expect(deleteSummary({ interactions: 1, introduced: ["A", "B"], applications: 1 })).toEqual([
      "Their 1 interaction is deleted.",
      "A and B, whom they introduced, stay, with no introducer.",
      "1 application stays, unlinked.",
    ]);
    expect(deleteSummary({ interactions: 0, introduced: ["A", "B", "C"], applications: 0 })).toEqual([
      "The 3 people they introduced stay, with no introducer.",
    ]);
    expect(deleteSummary({ interactions: 0, introduced: [], applications: 0 })).toEqual(["Nothing else is affected."]);
  });
});
