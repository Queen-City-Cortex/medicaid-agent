// Answer-frame building blocks: the candidate types used while assembling a
// frame (SectionCandidate / HydratedSectionCandidate / DocumentCandidate),
// converters from views to AnswerFrame documents/sections, the empty-frame
// constructor, and term-driven section picking within a single document
// (including the section-number heuristics for coverage-limitation sections).

import type {
  AnswerFrame,
  AnswerFrameDocument,
  AnswerFrameRoute,
  AnswerFrameSection,
  AnswerQuestionType,
  CorpusRetrievalHit,
  DocumentView,
  DocumentWithSectionsView,
  SectionView,
} from '../types.js';
import { combineText, normalizeSearchText, scorePhraseMatches, uniqueBy } from './base.js';
import { buildAnswerRoute } from './answer-routing.js';
import { DOCUMENT_SECTION_PICK_LIMIT } from './scoring-constants.js';

export interface SectionCandidate {
  sectionId: string;
  score: number;
  reason: string;
}

export interface HydratedSectionCandidate {
  section: AnswerFrameSection;
  score: number;
}

export interface DocumentCandidate {
  document: DocumentView;
  reason: string;
  score: number;
}

export function toAnswerFrameDocument(document: DocumentView, reason: string | null): AnswerFrameDocument {
  return {
    ...document,
    reason,
  };
}

export function toAnswerFrameSection(section: SectionView, reason: string | null): AnswerFrameSection {
  return {
    ...section,
    reason,
  };
}

export function buildSectionCandidates(
  hits: CorpusRetrievalHit[],
  includeTerms: readonly string[],
  avoidTerms: readonly string[],
  limit: number,
  fallbackReason: string,
): SectionCandidate[] {
  return uniqueBy(
    hits
      .map((hit) => {
        const sectionText = combineText(hit.sectionTitle, hit.content);
        const includeScore = scorePhraseMatches(sectionText, includeTerms, 1);
        const avoidScore = scorePhraseMatches(sectionText, avoidTerms, 1);
        const titleBonus = hit.sectionTitle ? scorePhraseMatches(normalizeSearchText(hit.sectionTitle), includeTerms, 0.75) : 0;
        const score = hit.score + includeScore * 0.12 + titleBonus * 0.08 - avoidScore * 0.1;
        return {
          sectionId: hit.sectionId,
          score,
          reason:
            includeScore > 0
              ? `Matched ${includeTerms.find((term) => sectionText.includes(term)) ?? fallbackReason}.`
              : fallbackReason,
        } satisfies SectionCandidate;
      })
      .filter((candidate) => Number.isFinite(candidate.score))
      .sort((left, right) => right.score - left.score),
    (candidate) => candidate.sectionId,
  ).slice(0, limit);
}

export function pickDocumentSectionsByTitle(
  document: DocumentWithSectionsView,
  includeTerms: readonly string[],
  avoidTerms: readonly string[],
  limit = DOCUMENT_SECTION_PICK_LIMIT,
): string[] {
  return document.sections
    .map((section) => {
      const titleText = combineText(section.number, section.title);
      const includeScore = scorePhraseMatches(titleText, includeTerms, 1);
      const avoidScore = scorePhraseMatches(titleText, avoidTerms, 1);
      return {
        id: section.id,
        score: includeScore * 2 - avoidScore,
      };
    })
    .filter((section) => section.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((section) => section.id);
}

export function sectionNumberDepth(sectionNumber: string | null | undefined): number {
  const normalized = normalizeSearchText(sectionNumber);
  if (normalized.length === 0) return 0;
  return normalized.split('.').filter((segment) => segment.length > 0).length;
}

export function isLikelyCoverageLimitationSectionNumber(sectionNumber: string | null | undefined): boolean {
  return /^4(\.|$)/.test(normalizeSearchText(sectionNumber));
}

export function pickLikelyCoverageLimitationSections(
  document: DocumentWithSectionsView,
  limit = DOCUMENT_SECTION_PICK_LIMIT,
): string[] {
  return document.sections
    .filter((section) => isLikelyCoverageLimitationSectionNumber(section.number))
    .sort((left, right) => {
      const depthDelta = sectionNumberDepth(right.number) - sectionNumberDepth(left.number);
      if (depthDelta !== 0) return depthDelta;
      return normalizeSearchText(left.number).localeCompare(normalizeSearchText(right.number));
    })
    .slice(0, limit)
    .map((section) => section.id);
}

export function buildEmptyAnswerFrame(questionType: AnswerQuestionType, route?: AnswerFrameRoute): AnswerFrame {
  return {
    questionType,
    route:
      route ??
      buildAnswerRoute({
        lane: 'baseline_hybrid',
        rationale: 'empty_frame',
        wideningPolicy: 'none',
      }),
    authoritativeDocuments: [],
    primarySections: [],
    supportingSections: [],
    avoidSections: [],
    latestRevision: null,
    variantReasoning: null,
  };
}
