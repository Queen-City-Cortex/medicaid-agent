import { normalizeSearchText } from './base.js';

export const MAX_QUERY_TERMS = 14;
export const PHRASE_MATCH_WEIGHT = 1.8;
export const LOW_SIGNAL_TERM_WEIGHT = 0.35;
export const SEARCH_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'apply',
  'are',
  'be',
  'can',
  'clinical',
  'coverage',
  'does',
  'for',
  'has',
  'have',
  'how',
  'in',
  'is',
  'it',
  'its',
  'need',
  'medicaid',
  'of',
  'on',
  'or',
  'policy',
  's',
  'service',
  'services',
  'the',
  'their',
  'there',
  'under',
  'what',
  'when',
  'which',
  'with',
]);
export const LOW_SIGNAL_SEARCH_TERMS = new Set([
  'document',
  'documentation',
  'provide',
  'provided',
  'requirement',
  'requirements',
]);
export const SERVICE_FOCUS_STOPWORDS = new Set([
  ...LOW_SIGNAL_SEARCH_TERMS,
  'cap',
  'carolina',
  'medicaid',
  'nc',
  'policy',
  'policies',
  'program',
  'question',
  'service',
  'services',
]);

export function isUsefulSearchTerm(term: string): boolean {
  if (!term || SEARCH_STOPWORDS.has(term)) return false;
  if (term.length >= 3) return true;
  return /\d/.test(term);
}

export function dedupeTerms(terms: string[]): string[] {
  return Array.from(new Set(terms.filter((term) => term.length > 0)));
}

export function expandSearchToken(token: string): string[] {
  const variants = [token];
  if (token.endsWith('ies') && token.length > 4) {
    variants.push(`${token.slice(0, -3)}y`);
  } else if (token.endsWith('s') && token.length > 4) {
    variants.push(token.slice(0, -1));
  }
  return variants;
}

export function extractSearchTerms(query: string): string[] {
  const rawTokens = normalizeSearchText(query).match(/[a-z0-9]+(?:[/-][a-z0-9]+)*/g) ?? [];
  // Only compound tokens contribute their split parts — for a plain token,
  // split() returns the token itself, and the old unconditional spread
  // duplicated every token (producing garbage "X X" phrases below and
  // wasting the MAX_QUERY_TERMS budget on duplicates).
  const tokens = dedupeTerms(
    rawTokens
      .flatMap((token) => {
        const parts = token.split(/[/-]+/).filter(Boolean);
        return parts.length > 1 ? [token, ...parts] : [token];
      })
      .flatMap(expandSearchToken)
      .filter(isUsefulSearchTerm),
  );
  // Phrases reflect actual adjacency in the query, so they are built from the
  // raw token sequence — not from the expanded variants, whose artificial
  // adjacency produced pairs like "policies policy".
  const phraseTokens = rawTokens.filter(isUsefulSearchTerm);
  const phrases: string[] = [];
  for (let index = 0; index < phraseTokens.length - 1; index++) {
    const left = phraseTokens[index];
    const right = phraseTokens[index + 1];
    if (!left || !right || left === right) continue;
    const phrase = `${left} ${right}`;
    if (phrase.length >= 7) {
      phrases.push(phrase);
    }
  }

  const expandedTerms = [...tokens, ...phrases];
  const queryLower = normalizeSearchText(query);
  if (queryLower.includes('multidisciplinary team')) {
    expandedTerms.push('mdt');
  }

  return dedupeTerms(expandedTerms).slice(0, MAX_QUERY_TERMS);
}

export function extractProcedureCodeTerms(query: string): string[] {
  return dedupeTerms(Array.from(query.toUpperCase().matchAll(/\b(?:[A-Z]\d{4}[A-Z]?|\d{5})\b/g), (match) => match[0] ?? ''));
}

export function extractServiceFocusTerms(query: string): string[] {
  return extractSearchTerms(query).filter(
    (term) => term.length >= 4 && !SERVICE_FOCUS_STOPWORDS.has(term) && !/^\d/.test(term),
  );
}

export function extractQuotedPhrases(query: string): string[] {
  return Array.from(query.matchAll(/["']([^"']{3,})["']/g), (match) => normalizeSearchText(match[1] ?? '').trim()).filter(
    (phrase) => phrase.length > 0,
  );
}

export function countPhraseMatches(text: string | null | undefined, phrases: string[]): number {
  const haystack = normalizeSearchText(text);
  if (!haystack) return 0;
  return phrases.reduce((count, phrase) => count + (haystack.includes(phrase) ? 1 : 0), 0);
}

export function countProcedureCodeMatches(text: string | null | undefined, codes: string[]): number {
  const haystack = (text ?? '').toUpperCase();
  if (!haystack) return 0;
  return codes.reduce((count, code) => count + (haystack.includes(code) ? 1 : 0), 0);
}

export function buildQueryFocusTerms(query: string, limit = MAX_QUERY_TERMS): string[] {
  return dedupeTerms([...extractQuotedPhrases(query), ...extractSearchTerms(query)])
    .filter((term) => term.length >= 4 || term.includes(' '))
    .slice(0, limit);
}

export function buildFocusedFederalQuery(query: string): string | null {
  const focusedTerms = buildQueryFocusTerms(query, 10);
  if (focusedTerms.length === 0) return null;
  return focusedTerms.join(' ');
}

export function scoreTermMatches(terms: string[], text: string | null | undefined): number {
  const haystack = normalizeSearchText(text);
  if (!haystack) return 0;

  let score = 0;
  for (const term of terms) {
    if (!haystack.includes(term)) continue;

    let weight = 1;
    if (term.includes(' ')) {
      weight *= PHRASE_MATCH_WEIGHT;
    }
    if (LOW_SIGNAL_SEARCH_TERMS.has(term)) {
      weight *= LOW_SIGNAL_TERM_WEIGHT;
    }

    score += weight;
  }

  return score;
}
