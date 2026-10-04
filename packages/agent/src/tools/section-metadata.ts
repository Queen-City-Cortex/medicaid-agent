/** Classifier diagnostics stay inside PolicyCorpus; prompts receive policy text. */
export function visibleSection<T extends { sectionRoles?: unknown }>(section: T): Omit<T, 'sectionRoles'> {
  const { sectionRoles: _roles, ...visible } = section;
  return visible;
}
