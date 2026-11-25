// The introduction graph, as pure functions (plans/crm.md, Feature 1).
// Every contact points at whoever introduced them, or at nobody, which
// means they hang off you.
//
// Every walk here keeps a visited set: the database refuses loops
// (crm_contacts_no_loops), but if one ever existed anyway, nothing here
// may run forever or drop people.

export type Link = { id: string; introducedBy: string | null };

/** Who each contact introduced, by id. An introducer missing from `links` counts as nobody (you). */
export function introductions(links: readonly Link[]): Map<string, string[]> {
  const ids = new Set(links.map((l) => l.id));
  const children = new Map<string, string[]>();
  for (const link of links) {
    if (!link.introducedBy || !ids.has(link.introducedBy) || link.introducedBy === link.id) continue;
    const list = children.get(link.introducedBy) ?? [];
    list.push(link.id);
    children.set(link.introducedBy, list);
  }
  return children;
}

/** Everyone `id` introduced, and everyone they introduced, and so on (never `id` itself). */
export function descendantsOf(links: readonly Link[], id: string): Set<string> {
  const children = introductions(links);
  const found = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (next === id || found.has(next)) continue;
    found.add(next);
    stack.push(...(children.get(next) ?? []));
  }
  return found;
}

/**
 * Who can be picked as `id`'s introducer: anyone except them and the
 * people below them (picking one of those would make a loop). With no
 * `id` (a new contact), everyone.
 */
export function introducerChoices(links: readonly Link[], id: string | null): string[] {
  if (!id) return links.map((l) => l.id);
  const below = descendantsOf(links, id);
  return links.filter((l) => l.id !== id && !below.has(l.id)).map((l) => l.id);
}

/** True if this contact hangs off you: no introducer, or one that isn't among `links`. */
function hangsOffYou(link: Link, ids: Set<string>): boolean {
  return !link.introducedBy || !ids.has(link.introducedBy) || link.introducedBy === link.id;
}

/**
 * The introduction chains: each starts with someone you met yourself who
 * introduced at least one person. (People you met yourself who haven't
 * introduced anyone aren't a chain.)
 */
export function chainStarts(links: readonly Link[]): string[] {
  const ids = new Set(links.map((l) => l.id));
  const children = introductions(links);
  return links.filter((l) => hangsOffYou(l, ids) && (children.get(l.id)?.length ?? 0) > 0).map((l) => l.id);
}

/** "20 people, 3 introduction chains". */
export function networkSummary(links: readonly Link[]): { people: number; chains: number } {
  return { people: links.length, chains: chainStarts(links).length };
}

/** "20 people, 3 introduction chains" in words, singular where it should be. */
export function summaryText({ people, chains }: { people: number; chains: number }): string {
  if (people === 0) return "No one yet.";
  const who = `${people} ${people === 1 ? "person" : "people"}`;
  if (chains === 0) return `${who}, no introductions yet.`;
  return `${who}, ${chains} introduction ${chains === 1 ? "chain" : "chains"}.`;
}
