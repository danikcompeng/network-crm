// The people list: search, stage filter, counts and order (plans/crm.md,
// Feature 2). Pure, so it's tested and runs in the browser on the one
// list the page loads.

import { STAGES, type Stage } from "./crm";

export type PersonRow = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  stage: Stage;
  introduced_by: string | null;
  next_follow_up: string | null;
};

/** Letters that don't come apart into a base letter and an accent. */
const SPECIAL: Record<string, string> = { ł: "l", ø: "o", ß: "ss", æ: "ae", œ: "oe", đ: "d", ð: "d", þ: "th", ı: "i" };

/** Lower case, accents removed, every run of spaces one space: "  José  " → "jose", "Łódź" → "lodz". */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[łøßæœđðþı]/g, (c) => SPECIAL[c])
    .replace(/\s+/gu, " ")
    .trim();
}

/** The words of a search, folded: "  Kestrel   SAM " → ["kestrel", "sam"]. */
export function searchWords(query: string): string[] {
  const folded = fold(query);
  return folded === "" ? [] : folded.split(" ");
}

/** True if every word appears somewhere in the name, company or role (any order). No words: everyone. */
export function matches(person: Pick<PersonRow, "name" | "company" | "role">, words: readonly string[]): boolean {
  if (words.length === 0) return true;
  const haystack = fold([person.name, person.company ?? "", person.role ?? ""].join(" "));
  return words.every((word) => haystack.includes(word));
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** By name, ignoring case and accents ("Émile" sits with the E's); ties by id so the order never wobbles. */
export function byName<T extends { name: string; id: string }>(a: T, b: T): number {
  return collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export type StageFilter = Stage | "all";

export function parseStageFilter(value: string | null | undefined): StageFilter {
  return (STAGES as readonly string[]).includes(value ?? "") ? (value as Stage) : "all";
}

/**
 * The visible list, and the count for each stage chip. The counts follow
 * the search (so "Talking 3" means 3 people matching what you typed), not
 * the stage filter (or every other chip would read 0).
 */
export function filterPeople<T extends PersonRow>(
  people: readonly T[],
  query: string,
  stage: StageFilter,
): { visible: T[]; counts: Record<StageFilter, number> } {
  const words = searchWords(query);
  const found = people.filter((p) => matches(p, words));
  const counts = Object.fromEntries([["all", found.length], ...STAGES.map((s) => [s, 0])]) as Record<StageFilter, number>;
  for (const p of found) counts[p.stage] += 1;
  const visible = (stage === "all" ? found : found.filter((p) => p.stage === stage)).sort(byName);
  return { visible, counts };
}

/** How loudly a stage shows (plans/crm.md, Design direction): the shape and word carry it; colour only adds emphasis. */
export function stageTone(stage: Stage): "muted" | "ink" | "accent" {
  if (stage === "interviewing" || stage === "offer") return "accent";
  if (stage === "talking") return "ink";
  return "muted";
}

/**
 * What deleting someone does, in numbers, for the confirmation:
 * "Their 3 interactions are deleted. Riya Patel stays, with no introducer.
 * 2 applications stay, unlinked."
 */
export function deleteSummary(person: { interactions: number; introduced: readonly string[]; applications: number }): string[] {
  const lines: string[] = [];
  if (person.interactions > 0) {
    lines.push(person.interactions === 1 ? "Their 1 interaction is deleted." : `Their ${person.interactions} interactions are deleted.`);
  }
  const n = person.introduced.length;
  if (n === 1) lines.push(`${person.introduced[0]}, whom they introduced, stays, with no introducer.`);
  else if (n === 2) lines.push(`${person.introduced[0]} and ${person.introduced[1]}, whom they introduced, stay, with no introducer.`);
  else if (n > 2) lines.push(`The ${n} people they introduced stay, with no introducer.`);
  if (person.applications > 0) {
    lines.push(person.applications === 1 ? "1 application stays, unlinked." : `${person.applications} applications stay, unlinked.`);
  }
  if (lines.length === 0) lines.push("Nothing else is affected.");
  return lines;
}
