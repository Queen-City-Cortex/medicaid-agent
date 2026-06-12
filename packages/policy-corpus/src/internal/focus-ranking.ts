// Query-focus ranking: re-scores hits against extracted focus terms and quoted
// phrases (independent of the main rerank pass), ranks/filters hit lists by
// that focus score, and selects the preferred document titles for a question.
// Includes the CFR-part tiebreaker that keeps base-Medicaid CFR parts ahead of
// CHIP (42 CFR 457) when titles share vocabulary and the question does not
// mention CHIP.

import type { CorpusRetrievalHit } from '../types.js';
import { combineText } from './base.js';
import { countPhraseMatches, scoreTermMatches } from './search.js';

export function scoreHitForQueryFocus(
  hit: CorpusRetrievalHit,
  focusTerms: string[],
  quotedPhrases: string[],
): number {
  const titlePhraseMatches = countPhraseMatches(hit.sectionTitle, quotedPhrases);
  const textPhraseMatches = countPhraseMatches(combineText(hit.sectionTitle, hit.content), quotedPhrases);
  const titleMatches = scoreTermMatches(focusTerms, hit.sectionTitle);
  const contentMatches = Math.min(scoreTermMatches(focusTerms, hit.content), 6);
  const numberedBonus = hit.sectionNumber ? 0.02 : 0;

  return (
    hit.score +
    titlePhraseMatches * 0.32 +
    textPhraseMatches * 0.1 +
    titleMatches * 0.05 +
    contentMatches * 0.015 +
    numberedBonus
  );
}

export function rankHitsByQueryFocus(
  hits: CorpusRetrievalHit[],
  focusTerms: string[],
  quotedPhrases: string[],
): CorpusRetrievalHit[] {
  return [...hits].sort(
    (left, right) =>
      scoreHitForQueryFocus(right, focusTerms, quotedPhrases) - scoreHitForQueryFocus(left, focusTerms, quotedPhrases),
  );
}

// CFR-part routing constants. The hybrid retriever + focus-score path has no
// built-in way to prefer base-Medicaid CFR parts over CHIP when titles share
// vocabulary ("state plan amendment", "managed care", "requirement"); the
// tiebreaker below enforces domain preference so Medicaid questions don't drift
// into 42 CFR 457.
const CFR_POLICY_NUMBER_RE = /^(\d+)-CFR-(\d+)$/;
const BASE_MEDICAID_CFR_PARTS = new Set([430, 431, 432, 433, 435, 436, 438, 440, 441, 442, 447, 455, 456, 460]);
const CHIP_CFR_PARTS = new Set([457]);
const CHIP_QUESTION_TOKENS = [
  'chip',
  "children's health insurance",
  "childrens health insurance",
  'title xxi',
  'title 21',
];

// Independent window for the CFR-part tiebreaker. The general scoreWindow used
// to pick multiple preferred documents is tight (~0.08) to keep the candidate
// set tight; the CFR tiebreaker operates on a wider window because the focus-
// adjusted score between a CHIP and a base-Medicaid candidate can differ by
// the weight of a single title-phrase match (~0.1) even when the two are
// domain-distinct.
const CFR_TIEBREAKER_WINDOW = 0.2;

interface CfrPartInfo {
  title: number;
  part: number;
}

function cfrPartFromPolicyNumber(policyNumber: string | null): CfrPartInfo | null {
  if (!policyNumber) return null;
  const match = CFR_POLICY_NUMBER_RE.exec(policyNumber);
  if (!match) return null;
  return { title: Number.parseInt(match[1], 10), part: Number.parseInt(match[2], 10) };
}

function isChipCfrPart(partInfo: CfrPartInfo | null): boolean {
  return partInfo !== null && partInfo.title === 42 && CHIP_CFR_PARTS.has(partInfo.part);
}

function isBaseMedicaidCfrPart(partInfo: CfrPartInfo | null): boolean {
  return partInfo !== null && partInfo.title === 42 && BASE_MEDICAID_CFR_PARTS.has(partInfo.part);
}

function questionMentionsChip(questionText: string | undefined): boolean {
  if (!questionText) return false;
  const lower = questionText.toLowerCase();
  return CHIP_QUESTION_TOKENS.some((token) => lower.includes(token));
}

interface RankedDocumentEntry {
  title: string;
  score: number;
  policyNumber: string | null;
}

/**
 * Promote the best base-Medicaid CFR document above any CHIP document that
 * outranks it within `CFR_TIEBREAKER_WINDOW`, as long as the question does not
 * explicitly mention CHIP. Mutates `ranked` in place.
 */
function applyCfrPartPreferenceTiebreaker(ranked: RankedDocumentEntry[]): void {
  if (ranked.length < 2) return;
  const topScore = ranked[0]?.score ?? 0;

  let firstChipIndex = -1;
  let bestBaseMedicaidIndex = -1;
  for (let i = 0; i < ranked.length; i++) {
    if (ranked[i].score < topScore - CFR_TIEBREAKER_WINDOW) break;
    const partInfo = cfrPartFromPolicyNumber(ranked[i].policyNumber);
    if (firstChipIndex === -1 && isChipCfrPart(partInfo)) {
      firstChipIndex = i;
    }
    if (bestBaseMedicaidIndex === -1 && isBaseMedicaidCfrPart(partInfo)) {
      bestBaseMedicaidIndex = i;
    }
  }

  if (
    firstChipIndex !== -1
    && bestBaseMedicaidIndex !== -1
    && firstChipIndex < bestBaseMedicaidIndex
  ) {
    const [baseMedicaid] = ranked.splice(bestBaseMedicaidIndex, 1);
    ranked.splice(firstChipIndex, 0, baseMedicaid);
  }
}

export function selectPreferredDocumentTitlesByFocus(
  hits: CorpusRetrievalHit[],
  focusTerms: string[],
  quotedPhrases: string[],
  maxDocuments = 2,
  scoreWindow = 0.1,
  questionText?: string,
): string[] {
  const bestByDocumentTitle = new Map<string, { score: number; policyNumber: string | null }>();
  for (const hit of hits) {
    if (!hit.documentTitle) continue;
    const score = scoreHitForQueryFocus(hit, focusTerms, quotedPhrases);
    const existing = bestByDocumentTitle.get(hit.documentTitle);
    if (existing == null || score > existing.score) {
      bestByDocumentTitle.set(hit.documentTitle, { score, policyNumber: hit.policyNumber });
    }
  }

  const ranked: RankedDocumentEntry[] = Array.from(bestByDocumentTitle.entries())
    .map(([title, value]) => ({ title, score: value.score, policyNumber: value.policyNumber }))
    .sort((left, right) => right.score - left.score);
  if (ranked.length === 0) return [];

  // Only run the CFR-part tiebreaker when the caller explicitly passed question
  // text — without it we can't tell whether this is a CHIP-targeted query, and
  // we don't want to silently reorder results for callers that haven't opted in.
  if (questionText !== undefined && !questionMentionsChip(questionText)) {
    applyCfrPartPreferenceTiebreaker(ranked);
  }

  const topScore = ranked[0]?.score ?? 0;
  return ranked
    .filter((entry, index) => index === 0 || (index < maxDocuments && entry.score >= topScore - scoreWindow))
    .slice(0, maxDocuments)
    .map((entry) => entry.title);
}

export function filterHitsToFocusedContent(
  hits: CorpusRetrievalHit[],
  focusTerms: string[],
  quotedPhrases: string[],
): CorpusRetrievalHit[] {
  const ranked = rankHitsByQueryFocus(hits, focusTerms, quotedPhrases);
  const filtered = ranked.filter((hit) => {
    const phraseMatches = countPhraseMatches(combineText(hit.sectionTitle, hit.content), quotedPhrases);
    const titleMatches = scoreTermMatches(focusTerms, hit.sectionTitle);
    const contentMatches = Math.min(scoreTermMatches(focusTerms, hit.content), 6);
    return phraseMatches > 0 || titleMatches + contentMatches >= 2;
  });
  return filtered.length > 0 ? filtered : ranked;
}
