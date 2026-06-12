export const LUCENE_SPECIAL = /[+\-&|!(){}[\]^"~*?:\\/]/g;
export const SEARCH_DEBUG = process.env.POLICY_CORPUS_SEARCH_DEBUG === '1';
export const RERANK_DEBUG = process.env.POLICY_CORPUS_RERANK_DEBUG === '1' || process.env.POLICY_CORPUS_RERANK_DEBUG === 'true';

export function debugSearch(message: string): void {
  if (SEARCH_DEBUG) {
    console.error(`[policy-corpus] ${message}`);
  }
}

export function debugRerank(message: string): void {
  if (RERANK_DEBUG) {
    console.error(`[policy-corpus:rerank] ${message}`);
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
