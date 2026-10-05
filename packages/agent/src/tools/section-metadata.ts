/** Classifier diagnostics stay inside PolicyCorpus; prompts receive policy text. */
export function visibleSection<T extends { sectionRoles?: unknown }>(section: T): Omit<T, 'sectionRoles'> {
  const { sectionRoles: _roles, ...visible } = section;
  return visible;
}

const naturalOrder = new Intl.Collator('en', { numeric: true });

/**
 * The graph stores no section position and returns a document's sections in
 * no fixed order, so a capped or paged listing sorts them first: by section
 * number in natural order ("2" before "10"), then by the unique id, which also
 * keeps unnumbered sections (`_s0`, `_s1`, …) in parse order.
 */
export function inListingOrder<T extends { id: string; number: string | null }>(sections: T[]): T[] {
  return [...sections].sort(
    (a, b) =>
      naturalOrder.compare(a.number ?? '', b.number ?? '') ||
      naturalOrder.compare(a.id, b.id) ||
      // The collator treats "01" and "1" as equal; ids are unique, so this makes the order total.
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
