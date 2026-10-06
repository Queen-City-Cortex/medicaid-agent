// Document-level selection and narrowing: aggregate per-document coverage
// boosts from query-term spread across hits, pick which document titles get
// expanded by the document-expansion backend, rank document candidates for
// answer frames, and narrow multi-document sets (policy variants, HCWD manual
// sections, sibling policy families) down to the governing document(s).

import type { CorpusRetrievalHit, DocumentWithSectionsView } from '../types.js';
import { combineText, includesPhrase, matchesAnyTerm, normalizeSearchText, uniqueBy } from './base.js';
import { dedupeTerms, extractSearchTerms, scoreTermMatches } from './search.js';
import {
  DOCUMENT_COVERAGE_HIT_BOOST,
  DOCUMENT_COVERAGE_TERM_BOOST,
  DOCUMENT_EXPANSION_DOC_LIMIT,
  FRAME_DOCUMENT_LIMIT,
  MAX_DOCUMENT_COVERAGE_BOOST,
} from './scoring-constants.js';
import { VARIANT_SETTING_TERMS } from './term-lists.js';
import {
  includesCalendarYear,
  isAdministrativeFormTitle,
  isHcwdProcessTitle,
  isYearSpecificPremiumTitle,
} from './section-predicates.js';
import { extractDocumentView } from './record-mapping.js';
import { toAnswerFrameDocument, type DocumentCandidate } from './section-views.js';
import type { AnswerFrameDocument } from '../types.js';

export function documentKeyForHit(hit: CorpusRetrievalHit): string | null {
  const key = [hit.documentType ?? '', hit.policyNumber ?? '', hit.documentTitle ?? '']
    .map((part) => part.trim())
    .join('::');
  return key.replace(/:+/g, '').trim().length > 0 ? key : null;
}

export function computeDocumentCoverageBoosts(hits: CorpusRetrievalHit[], queryTerms: string[]): Map<string, number> {
  const byDocument = new Map<string, { terms: Set<string>; hitCount: number }>();

  for (const hit of hits) {
    const key = documentKeyForHit(hit);
    if (!key) continue;

    let entry = byDocument.get(key);
    if (!entry) {
      entry = { terms: new Set<string>(), hitCount: 0 };
      byDocument.set(key, entry);
    }

    entry.hitCount += 1;
    for (const term of queryTerms) {
      if (
        normalizeSearchText(hit.sectionTitle).includes(term) ||
        normalizeSearchText(hit.documentTitle).includes(term) ||
        normalizeSearchText(hit.content).includes(term)
      ) {
        entry.terms.add(term);
      }
    }
  }

  const boosts = new Map<string, number>();
  for (const [key, entry] of byDocument) {
    const boost = Math.min(
      MAX_DOCUMENT_COVERAGE_BOOST,
      entry.terms.size * DOCUMENT_COVERAGE_TERM_BOOST + Math.max(0, entry.hitCount - 1) * DOCUMENT_COVERAGE_HIT_BOOST,
    );
    boosts.set(key, boost);
  }
  return boosts;
}

export function selectDocumentTitlesForExpansion(
  hits: CorpusRetrievalHit[],
  documentCoverageBoosts: Map<string, number>,
): string[] {
  const scoresByTitle = new Map<string, number>();

  for (const hit of hits) {
    const title = hit.documentTitle;
    if (!title) continue;

    const key = documentKeyForHit(hit);
    const coverageBoost = key ? (documentCoverageBoosts.get(key) ?? 0) : 0;
    const score = hit.score + coverageBoost;
    const existing = scoresByTitle.get(title) ?? 0;
    scoresByTitle.set(title, existing + score);
  }

  return Array.from(scoresByTitle.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, DOCUMENT_EXPANSION_DOC_LIMIT)
    .map(([title]) => title);
}

export function pickTopDocumentCandidates(candidates: DocumentCandidate[], limit = FRAME_DOCUMENT_LIMIT): AnswerFrameDocument[] {
  return uniqueBy(
    candidates.sort((left, right) => right.score - left.score),
    (candidate) => candidate.document.id,
  )
    .slice(0, limit)
    .map((candidate) => toAnswerFrameDocument(candidate.document, candidate.reason));
}

type SettingVariant = (typeof VARIANT_SETTING_TERMS)[number];

function documentMatchesSetting(document: DocumentWithSectionsView, variant: SettingVariant): boolean {
  const policyNumber = document.policyNumber?.toUpperCase();
  if (policyNumber && variant.policyNumbers?.includes(policyNumber)) return true;
  return includesPhrase(combineText(document.title, document.policyNumber), variant.titleTerms);
}

export function scoreVariantDocument(document: DocumentWithSectionsView, queryLower: string, policyNumbers: string[]): DocumentCandidate {
  let score = 0;
  let reason = 'Relevant policy variant returned by policy lookup.';
  const titleText = combineText(document.title, document.policyNumber);

  if (document.policyNumber && policyNumbers.includes(document.policyNumber.toUpperCase())) {
    score += 2.5;
    reason = 'Exact policy-number match from the query.';
  }
  if (document.status === 'current') {
    score += 0.6;
  }
  // A proposed State Plan amendment is no more the current policy than a change notice.
  if (titleText.includes('change notice') || document.status === 'amendment' || document.status === 'proposed') {
    score -= 1.5;
  }
  for (const variant of VARIANT_SETTING_TERMS) {
    if (matchesAnyTerm(queryLower, variant.terms) && documentMatchesSetting(document, variant)) {
      score += 1.2;
      reason = variant.reason;
    }
  }
  score += scoreTermMatches(extractSearchTerms(queryLower), titleText) * 0.03;

  return {
    document: extractDocumentView(document),
    reason,
    score,
  };
}

export function scoreHcwdCoverageDocument(document: DocumentWithSectionsView, queryLower: string): number {
  const titleText = combineText(document.title, document.policyNumber);
  let score = 0;

  if (document.policyNumber?.toUpperCase() === 'MA-2180') {
    score += 2.5;
  }
  if (document.status === 'current') {
    score += 0.5;
  }
  if (titleText.includes('health coverage for workers with disabilities')) {
    score += 1.2;
  }
  if (titleText.includes('income') || titleText.includes('premium')) {
    score += 0.4;
  }
  if (isAdministrativeFormTitle(document.title)) {
    score -= 2.5;
  }
  if (isYearSpecificPremiumTitle(document.title) && !includesCalendarYear(queryLower) && !queryLower.includes('chart')) {
    score -= 1.8;
  }
  if (isHcwdProcessTitle(document.title) && !queryLower.includes('procedure') && !queryLower.includes('payment')) {
    score -= 1.0;
  }

  return score;
}

export function narrowHcwdCoverageDocuments(query: string, documents: DocumentWithSectionsView[]): DocumentWithSectionsView[] {
  if (documents.length <= 1) return documents;

  const queryLower = normalizeSearchText(query);
  const ranked = [...documents]
    .map((document) => ({
      document,
      score: scoreHcwdCoverageDocument(document, queryLower),
    }))
    .sort((left, right) => right.score - left.score);
  if (!includesCalendarYear(queryLower) && !queryLower.includes('chart')) {
    return ranked.slice(0, 1).map(({ document }) => document);
  }

  const topScore = ranked[0]?.score ?? 0;
  return ranked
    .filter(({ score }, index) => index === 0 || score >= topScore - 0.75)
    .slice(0, 2)
    .map(({ document }) => document);
}

/**
 * Prefer routing documents whose titles match the care setting the query asks
 * about (congregate/adult-care-home vs in-home). The same preference exists in
 * scoreVariantDocument, but that path only runs for sibling policy sets — a
 * non-sibling distractor (e.g. CAP/DA outranking the congregate PCS policy on
 * raw hit scores for an "adult care home" question) bypassed it entirely.
 * Returns the original documents and a null reason when the query names no
 * setting or no document matches it.
 */
export function selectSettingPreferredDocuments(
  queryLower: string,
  documents: DocumentWithSectionsView[],
): { documents: DocumentWithSectionsView[]; reason: string | null } {
  for (const variant of VARIANT_SETTING_TERMS) {
    if (!matchesAnyTerm(queryLower, variant.terms)) continue;
    const matching = documents.filter((document) => documentMatchesSetting(document, variant));
    if (matching.length > 0) {
      return { documents: matching, reason: variant.reason };
    }
  }
  return { documents, reason: null };
}

export function policyFamilyKey(policyNumber: string | null | undefined): string | null {
  if (!policyNumber) return null;
  return policyNumber.toUpperCase().replace(/-[A-Z0-9]+$/g, '');
}

export function looksLikeSiblingPolicySet(documents: DocumentWithSectionsView[]): boolean {
  const families = dedupeTerms(
    documents.map((document) => policyFamilyKey(document.policyNumber)).filter((family): family is string => Boolean(family)),
  );
  if (families.length === 0) return false;

  return families.some((family) => documents.filter((document) => policyFamilyKey(document.policyNumber) === family).length > 1);
}

/**
 * Keeps the top-ranked inferred document and the rest of its policy family, in
 * rank order. A family that repeats lower in the ranking never displaces the
 * top-ranked document.
 */
export function narrowInferredCoverageDocuments(documents: DocumentWithSectionsView[]): DocumentWithSectionsView[] {
  if (documents.length <= 1) return documents;

  const topFamily = policyFamilyKey(documents[0]?.policyNumber);
  if (!topFamily) return documents.slice(0, 1);

  return documents.filter((document) => policyFamilyKey(document.policyNumber) === topFamily);
}
