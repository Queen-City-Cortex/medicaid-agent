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

function isWaiverAuthorityAnchorHit(hit: {
  policyNumber?: string | null;
  sectionNumber?: string | null;
}): boolean {
  const sectionNumber = normalizeSearchText(hit.sectionNumber);
  const policyNumber = hit.policyNumber?.toUpperCase();

  if (policyNumber === 'SSA-TITLE-19') {
    return sectionNumber === '1915';
  }

  if (policyNumber === '42-CFR-441') {
    return /^441\.(30\d|35\d)$/.test(sectionNumber);
  }

  return false;
}

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
  const waiverAnchorHits = signals.waiverApplicationQuery || signals.waiverAuthorityQuery
    ? (signals.waiverApplicationQuery ? waiverRankedFederalHits : mergedFederalHits)
        .filter((hit) => isWaiverAuthorityAnchorHit(hit))
    : [];
  const waiverPreferredFederalDocumentTitles = signals.waiverApplicationQuery
    ? [
        waiverAnchorHits.find((hit) => hit.policyNumber?.toUpperCase() === '42-CFR-441')?.documentTitle,
        waiverAnchorHits.find((hit) => hit.policyNumber?.toUpperCase() === 'SSA-TITLE-19')?.documentTitle,
      ].filter((title): title is string => Boolean(title))
    : signals.waiverAuthorityQuery
    ? [
        // Authority questions must anchor on 42 CFR Part 441 Subpart G. If the
        // part's title isn't in the retrieved hits at all, fall back to focus
        // scoring — but typically it is (§§ 441.301–441.303 are strong hits
        // for 1915(c) authority phrasing), just not top-1.
        waiverAnchorHits.find((hit) => hit.policyNumber?.toUpperCase() === '42-CFR-441')?.documentTitle,
      ].filter((title): title is string => Boolean(title))
    : [];
  const preferredFederalDocumentTitles =
    waiverPreferredFederalDocumentTitles.length > 0
      ? dedupeTerms(waiverPreferredFederalDocumentTitles)
      : selectPreferredDocumentTitlesByFocus(
          signals.waiverApplicationQuery ? waiverRankedFederalHits : mergedFederalHits,
          signals.waiverApplicationQuery
            ? dedupeTerms([...signals.focusTerms, ...WAIVER_APPLICATION_PRIMARY_TERMS])
            : signals.focusTerms,
          signals.quotedPhrases,
          signals.waiverApplicationQuery ? 2 : 1,
          0.08,
          // Pass the raw (lowercased) question so the CFR-part tiebreaker in
          // selectPreferredDocumentTitlesByFocus can suppress itself when the
          // query actually targets CHIP (42 CFR 457).
          signals.queryLower,
        );
  const primaryFederalHits =
    preferredFederalDocumentTitles.length === 0
      ? signals.waiverApplicationQuery
        ? uniqueBy([...waiverAnchorHits, ...waiverRankedFederalHits], (hit) => hit.sectionId)
        : rankedFederalHits
      : (() => {
          const candidateHits = signals.waiverApplicationQuery ? waiverRankedFederalHits : rankedFederalHits;
          const scoped = candidateHits.filter(
            (hit) => hit.documentTitle && preferredFederalDocumentTitles.includes(hit.documentTitle),
          );
          const baseHits = scoped.length > 0 ? scoped : candidateHits;
          return signals.waiverApplicationQuery
            ? uniqueBy([...waiverAnchorHits, ...baseHits], (hit) => hit.sectionId)
            : baseHits;
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
          const focused = primaryFederalHits.filter((hit) => {
            const text = buildHitText(hit);
            return (
              (hit.documentType === 'federal_regulation' || hit.documentType === 'federal_statute') &&
              !includesPhrase(text, WAIVER_APPLICATION_AVOID_TERMS) &&
              isWaiverAuthorityAnchorHit(hit)
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
  const waiverPrimaryApplicationDocuments = signals.waiverApplicationQuery
    ? primaryFederalDocuments.filter(
        (document) =>
          document.policyNumber?.toUpperCase() === '42-CFR-441' ||
          normalizeSearchText(document.title).includes('42 cfr part 441'),
      )
    : [];
  const primaryDocumentCandidates = context.toSectionCandidates(
    signals.waiverApplicationQuery
      ? await context.collectDocumentSectionCandidates(
          waiverPrimaryApplicationDocuments.length > 0 ? waiverPrimaryApplicationDocuments : primaryFederalDocuments,
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
  const waiverStatutoryCandidates =
    signals.waiverApplicationQuery
      ? buildSectionCandidates(
          filteredPrimaryFederalHits.filter(
            (hit) => hit.policyNumber?.toUpperCase() === 'SSA-TITLE-19' && normalizeSearchText(hit.sectionNumber) === '1915',
          ),
          primaryIncludeTerms,
          [],
          1,
          'Primary federal statutory waiver authority section.',
        )
      : [];
  const primaryCandidates = uniqueBy(
    [...primaryDocumentCandidates, ...waiverStatutoryCandidates, ...initialPrimaryCandidates],
    (candidate) => candidate.sectionId,
  );
  const authoritativeCandidates = primaryFederalDocuments.map((document, index) => ({
    document: extractDocumentView(document),
    reason: signals.waiverApplicationQuery
      ? 'Governing federal waiver authority document.'
      : 'Document containing primary federal evidence.',
    score:
      signals.waiverApplicationQuery &&
      (
        document.policyNumber?.toUpperCase() === '42-CFR-441' ||
        normalizeSearchText(document.title).includes('42 cfr part 441')
      )
        ? 1.25 - index * 0.03
        : 1.1 - index * 0.05,
  }));

  return {
    waiverRankedFederalHits,
    filteredPrimaryFederalHits,
    primaryFederalDocuments,
    primaryCandidates,
    authoritativeCandidates,
  };
}
