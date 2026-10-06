export const LUCENE_SPECIAL = /[+\-&|!(){}[\]^"~*?:\\/]/g;
export const SEARCH_DEBUG = process.env.POLICY_CORPUS_SEARCH_DEBUG === '1';

export function debugSearch(message: string): void {
  if (SEARCH_DEBUG) {
    console.error(`[policy-corpus] ${message}`);
  }
}

export async function timeSearchStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    debugSearch(`${label} took ${Date.now() - startedAt}ms`);
  }
}

export function escapeLucene(query: string): string {
  return query.replace(LUCENE_SPECIAL, '\\$&');
}

export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase();
}

export function normalizeTitleKey(value: string | null | undefined): string {
  return normalizeSearchText(value).replace(/[:\s]+$/g, '').replace(/\s+/g, ' ').trim();
}

export function combineText(...values: Array<string | null | undefined>): string {
  return normalizeSearchText(values.filter(Boolean).join(' '));
}

export function includesPhrase(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

const naturalOrder = new Intl.Collator('en', { numeric: true });

/**
 * The graph stores no section position and returns a document's sections in
 * no fixed order. This is the one listing order: section number in natural
 * order ("2" before "10", "Attachment A" after the numbers), then the unique
 * id, which also keeps unnumbered sections (`_s0`, `_s1`, …) first and in
 * parse order.
 */
export function compareSectionListing(
  left: { id: string; number: string | null },
  right: { id: string; number: string | null },
): number {
  return (
    naturalOrder.compare(left.number ?? '', right.number ?? '') ||
    naturalOrder.compare(left.id, right.id) ||
    // The collator treats "01" and "1" as equal; ids are unique, so this makes the order total.
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

export function escapeRegExp(value: string): string {
  return value.replace(REGEX_SPECIAL, '\\$&');
}

/**
 * Token-boundary containment: the needle must not be embedded inside a longer
 * word/number token. Raw substring checks caused systematic misrouting — e.g.
 * any query containing the digit "9" (as in "1915(c)") "mentioned" Policy 9.
 * Hyphens count as token characters so "8C" does not match inside "8C-1".
 */
export function matchesToken(text: string, token: string): boolean {
  if (!token) return false;
  return new RegExp(`(?<![\\w-])${escapeRegExp(token)}(?![\\w-])`).test(text);
}

const termPatterns = new Map<string, RegExp>();

function termPattern(term: string): RegExp {
  let pattern = termPatterns.get(term);
  if (!pattern) {
    const words = term.split(/[\s-]+/).filter(Boolean).map(escapeRegExp);
    pattern = new RegExp(`(?<![a-z0-9])${words.join('[\\s-]+')}(?![a-z0-9])`);
    termPatterns.set(term, pattern);
  }
  return pattern;
}

/**
 * Whole-word vocabulary match for query-side router terms. Both arguments
 * must already be lower-case. A term never matches inside a longer word
 * ("ach" in "each", "form" in "information", "therapy" in "chemotherapy"),
 * and a multi-word term matches only as that sequence of whole words.
 *
 * - Hyphens and whitespace are interchangeable between words, so "in-home"
 *   also matches "in home" and "over the counter" matches "over-the-counter".
 *   A hyphen is therefore a word boundary: "covered" matches in "non-covered".
 * - A slash is a word boundary and is literal inside a term: "cap/c" matches
 *   "cap/c" but not "cap/choice", and "pcs" matches in "pcs/home health".
 * - A possessive is outside the word: "child" matches "child's".
 * - Plurals and other inflections are not inferred. List each form wanted.
 *
 * For policy numbers use matchesToken, which keeps the hyphen inside the
 * token so "8C" does not match "8C-1".
 */
export function matchesTerm(text: string, term: string): boolean {
  if (!term) return false;
  return termPattern(term).test(text);
}

export function matchesAnyTerm(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => matchesTerm(text, term));
}

export function scorePhraseMatches(text: string, phrases: readonly string[], weight = 1): number {
  return phrases.reduce((score, phrase) => score + (text.includes(phrase) ? weight : 0), 0);
}

export function uniqueBy<T>(items: T[], key: (item: T) => string | null | undefined): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const value = key(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    unique.push(item);
  }
  return unique;
}
