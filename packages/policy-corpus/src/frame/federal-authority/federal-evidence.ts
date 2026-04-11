import type { DocumentWithSectionsView } from '../../types.js';
import type { FrameContext } from '../context.js';
import {
  FEDERAL_PRIMARY_TERMS,
  FRAME_PRIMARY_LIMIT,
  MLR_FEDERAL_PRIMARY_SECTION_TERMS,
  WAIVER_APPLICATION_AVOID_TERMS,
  WAIVER_APPLICATION_DOCUMENT_SECTION_TERMS,
  WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS,
  WAIVER_APPLICATION_PRIMARY_TERMS,
  buildHitText,
  buildSectionCandidates,
  dedupeTerms,
  extractDocumentView,
  filterHitsToFocusedContent,
  includesPhrase,
  normalizeSearchText,
  rankHitsByQueryFocus,
  scoreTermMatches,
  selectPreferredDocumentTitlesByFocus,
  uniqueBy,
} from '../../internal/shared.js';
import type { FederalAuthorityEvidence, FederalAuthoritySignals } from './types.js';

export async function collectFederalAuthorityEvidence(
  context: FrameContext,
  query: string,
  signals: FederalAuthoritySignals,
): Promise<FederalAuthorityEvidence> {
  const federalHits = await context.searchSectionsDetailed({
    query,
    topK: 8,
    documentTypes: ['federal_regulation', 'federal_statute'],
  });
  const focusedFederalHits =
    signals.focusedFederalQuery && signals.focusedFederalQuery !== query
      ? await context.searchSectionsDetailed({
          query: signals.focusedFederalQuery,
          topK: 8,
          documentTypes: ['federal_regulation', 'federal_statute'],
        })
      : [];
  const mergedFederalHits = uniqueBy(
    [
      ...focusedFederalHits.map((hit) => ({
        ...hit,
        score: hit.score + 0.08,
      })),
      ...federalHits,
    ],
    (hit) => hit.sectionId,
  );
  const rankedFederalHits = rankHitsByQueryFocus(mergedFederalHits, signals.focusTerms, signals.quotedPhrases);
  const waiverRankedFederalHits = signals.waiverApplicationQuery
    ? [...rankedFederalHits]
        .map((hit) => {
          const text = buildHitText(hit);
          const sectionNumber = normalizeSearchText(hit.sectionNumber);
          let score = hit.score;

          if (
            hit.policyNumber?.toUpperCase() === '42-CFR-441' ||
            normalizeSearchText(hit.documentTitle).includes('42 cfr part 441')
          ) {
            score += 0.34;
          } else if (normalizeSearchText(hit.documentTitle).includes('42 cfr part 440')) {
            score += 0.12;
          }

          if (WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS.has(sectionNumber)) {
            score += 0.45;
          }

          if (includesPhrase(text, WAIVER_APPLICATION_PRIMARY_TERMS)) {
            score += 0.18;
          }

          if (
            includesPhrase(text, WAIVER_APPLICATION_AVOID_TERMS) ||
            (!signals.publicNoticeQuery && sectionNumber === '431.408')
          ) {
            score -= 0.55;
          }

          return { ...hit, score };
        })
        .sort((left, right) => right.score - left.score)
    : rankedFederalHits;
  const preferredFederalDocumentTitles = selectPreferredDocumentTitlesByFocus(
    signals.waiverApplicationQuery ? waiverRankedFederalHits : mergedFederalHits,
    signals.waiverApplicationQuery
      ? dedupeTerms([...signals.focusTerms, ...WAIVER_APPLICATION_PRIMARY_TERMS])
      : signals.focusTerms,
    signals.quotedPhrases,
    1,
    0.08,
  );
  const primaryFederalHits =
    preferredFederalDocumentTitles.length === 0
      ? signals.waiverApplicationQuery
        ? waiverRankedFederalHits
        : rankedFederalHits
      : (() => {
          const candidateHits = signals.waiverApplicationQuery ? waiverRankedFederalHits : rankedFederalHits;
          const scoped = candidateHits.filter(
            (hit) => hit.documentTitle && preferredFederalDocumentTitles.includes(hit.documentTitle),
          );
          return scoped.length > 0 ? scoped : candidateHits;
        })();
  const scopedPrimaryFederalHits =
    signals.waiverApplicationQuery
      ? filterHitsToFocusedContent(
          primaryFederalHits,
          dedupeTerms([...signals.focusTerms, ...WAIVER_APPLICATION_PRIMARY_TERMS]),
          signals.quotedPhrases,
        )
      : signals.mlrQuery
        ? filterHitsToFocusedContent(
            primaryFederalHits,
            dedupeTerms([...signals.focusTerms, ...MLR_FEDERAL_PRIMARY_SECTION_TERMS]),
            signals.quotedPhrases,
          )
        : primaryFederalHits;
  const filteredPrimaryFederalHits =
    signals.waiverApplicationQuery
      ? (() => {
          const focused = scopedPrimaryFederalHits.filter((hit) => {
            const text = buildHitText(hit);
            const sectionNumber = normalizeSearchText(hit.sectionNumber);
            return (
              (hit.documentType === 'federal_regulation' || hit.documentType === 'federal_statute') &&
              !includesPhrase(text, WAIVER_APPLICATION_AVOID_TERMS) &&
              (sectionNumber.startsWith('441.30') || sectionNumber === '440.180')
            );
          });
          return focused.length > 0 ? focused : scopedPrimaryFederalHits;
        })()
      : signals.mlrQuery
        ? (() => {
            const focused = scopedPrimaryFederalHits.filter((hit) => {
              const mlrMatches =
                scoreTermMatches(MLR_FEDERAL_PRIMARY_SECTION_TERMS, hit.sectionTitle) +
                Math.min(scoreTermMatches(MLR_FEDERAL_PRIMARY_SECTION_TERMS, hit.content), 4);
              return mlrMatches >= 1;
            });
            return focused.length > 0 ? focused : scopedPrimaryFederalHits;
          })()
        : scopedPrimaryFederalHits;
  const primaryIncludeTerms = dedupeTerms([...FEDERAL_PRIMARY_TERMS, ...signals.focusTerms]);
  const initialPrimaryCandidates = buildSectionCandidates(
    filteredPrimaryFederalHits,
    primaryIncludeTerms,
    [],
    FRAME_PRIMARY_LIMIT * 2,
    'Primary federal authority section.',
  );
  const hydratedFederalPrimary = await context.hydrateSectionCandidates(initialPrimaryCandidates, FRAME_PRIMARY_LIMIT * 2);
  const primaryFederalDocumentIds = dedupeTerms(
    hydratedFederalPrimary
      .map((candidate) => candidate.section.documentId)
      .filter((documentId): documentId is string => Boolean(documentId)),
  );
  const primaryFederalDocuments = (
    await Promise.all(primaryFederalDocumentIds.map((documentId) => context.getDocument(documentId)))
  ).filter((document): document is DocumentWithSectionsView => document != null);
  const primaryDocumentCandidates = context.toSectionCandidates(
    signals.waiverApplicationQuery
      ? await context.collectDocumentSectionCandidates(
          primaryFederalDocuments,
          WAIVER_APPLICATION_DOCUMENT_SECTION_TERMS,
          signals.publicNoticeQuery ? [] : WAIVER_APPLICATION_AVOID_TERMS,
          'Primary federal waiver-authority or application-requirement section.',
          FRAME_PRIMARY_LIMIT * 2,
        )
      : signals.mlrQuery
        ? await context.collectDocumentSectionCandidates(
            primaryFederalDocuments,
            MLR_FEDERAL_PRIMARY_SECTION_TERMS,
            [],
            'Primary MLR calculation or reporting section from the governing regulation.',
            FRAME_PRIMARY_LIMIT * 2,
          )
        : [],
    0.08,
  );
  const primaryCandidates = uniqueBy(
    [...primaryDocumentCandidates, ...initialPrimaryCandidates],
    (candidate) => candidate.sectionId,
  );
  const authoritativeCandidates = primaryFederalDocuments.map((document, index) => ({
    document: extractDocumentView(document),
    reason: signals.waiverApplicationQuery
      ? 'Governing federal waiver authority document.'
      : 'Document containing primary federal evidence.',
    score: 1.1 - index * 0.05,
  }));

  return {
    waiverRankedFederalHits,
    filteredPrimaryFederalHits,
    primaryFederalDocuments,
    primaryCandidates,
    authoritativeCandidates,
  };
}
