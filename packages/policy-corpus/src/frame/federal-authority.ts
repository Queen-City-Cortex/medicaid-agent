// Federal-authority evidence resolution, consumed by
// frame/pipelines/federal-authority.ts in four steps:
//
//   1. buildFederalAuthoritySignals          — query intent signals
//   2. collectFederalAuthorityEvidence       — federal regulation/statute hits,
//      waiver-aware ranking, primary candidates + authoritative documents
//   3. collectFederalImplementationEvidence  — NC implementation hits/documents
//   4. buildFederalAuthorityCandidateSets    — final candidate sets for finalizeFrame
//
// Internal ranking helpers stay private to this module.

import type { CorpusRetrievalHit, DocumentWithSectionsView } from '../types.js';
import type { FrameContext } from './context.js';
import {
  CONTRACT_ROLE_BOOST,
  COVERAGE_AVOID_TERMS,
  COVERAGE_PRIMARY_TERMS,
  FEDERAL_DOCUMENT_SUPPORT_TERMS,
  FEDERAL_PRIMARY_TERMS,
  FRAME_AVOID_LIMIT,
  FRAME_DOCUMENT_LIMIT,
  FRAME_PRIMARY_LIMIT,
  FRAME_SUPPORT_LIMIT,
  FEDERAL_PROGRAM_NAME_EXPANSIONS,
  MLR_FEDERAL_PRIMARY_SECTION_TERMS,
  MLR_FEDERAL_SUPPORT_SECTION_TERMS,
  WAIVER_APPLICATION_AVOID_TERMS,
  WAIVER_APPLICATION_DOCUMENT_SECTION_TERMS,
  WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS,
  WAIVER_APPLICATION_PRIMARY_TERMS,
  asksForAuthorityCitation,
  asksForImplementation,
  asksForPublicNoticeDetails,
  buildFocusedFederalQuery,
  buildFederalImplementationSectionTerms,
  buildHitText,
  buildQueryFocusTerms,
  buildSectionCandidates,
  dedupeTerms,
  extractDocumentView,
  extractQuotedPhrases,
  federalImplementationDocumentTypes,
  filterHitsToFocusedContent,
  includesPhrase,
  isMlrQuery,
  isWaiverApplicationQuery,
  isWaiverAuthorityQuery,
  matchesToken,
  normalizeSearchText,
  rankHitsByQueryFocus,
  scoreTermMatches,
  selectPreferredDocumentTitlesByFocus,
  uniqueBy,
  type DocumentCandidate,
  type SectionCandidate,
} from '../internal/shared.js';

// --- Signals -----------------------------------------------------------------

export interface FederalAuthoritySignals {
  queryLower: string;
  waiverApplicationQuery: boolean;
  waiverAuthorityQuery: boolean;
  authorityCitationQuery: boolean;
  publicNoticeQuery: boolean;
  mlrQuery: boolean;
  implementationQuery: boolean;
  focusTerms: string[];
  quotedPhrases: string[];
  implementationSectionTerms: string[];
  focusedFederalQuery: string | null;
}

// Expand bare program acronyms in the focus terms with the official names
// used in statute/CFR headings (and vice versa), so "federal authority for
// EPSDT" can title-match 441 Subpart B ("Early and periodic screening…")
// instead of only body-text acronym mentions in other parts.
function expandFocusTermsWithProgramNames(queryLower: string, focusTerms: string[]): string[] {
  const expanded = [...focusTerms];
  for (const entry of FEDERAL_PROGRAM_NAME_EXPANSIONS) {
    if (matchesToken(queryLower, entry.token)) {
      expanded.push(...entry.expansions);
    } else if (entry.expansions.some((expansion) => queryLower.includes(expansion))) {
      expanded.push(entry.token);
    }
  }
  return dedupeTerms(expanded);
}

export function buildFederalAuthoritySignals(query: string): FederalAuthoritySignals {
  const queryLower = normalizeSearchText(query);
  const focusTerms = expandFocusTermsWithProgramNames(queryLower, buildQueryFocusTerms(query));

  return {
    queryLower,
    waiverApplicationQuery: isWaiverApplicationQuery(queryLower),
    waiverAuthorityQuery: isWaiverAuthorityQuery(queryLower),
    authorityCitationQuery: asksForAuthorityCitation(queryLower),
    publicNoticeQuery: asksForPublicNoticeDetails(queryLower),
    mlrQuery: isMlrQuery(queryLower),
    implementationQuery: asksForImplementation(queryLower),
    focusTerms,
    quotedPhrases: extractQuotedPhrases(query),
    implementationSectionTerms: buildFederalImplementationSectionTerms(queryLower, focusTerms),
    focusedFederalQuery: buildFocusedFederalQuery(query),
  };
}

// --- Federal evidence ----------------------------------------------------------

export interface FederalAuthorityEvidence {
  waiverRankedFederalHits: CorpusRetrievalHit[];
  filteredPrimaryFederalHits: CorpusRetrievalHit[];
  primaryFederalDocuments: DocumentWithSectionsView[];
  primaryCandidates: SectionCandidate[];
  authoritativeCandidates: DocumentCandidate[];
}

const AUTHORITY_TITLE_PHRASE_BOOST = 0.3;

const FEDERAL_AUTHORITY_DOC_TYPES = ['federal_regulation', 'federal_statute'] as const;

// When the preferred titles cover only one of {statute, regulation} and the
// other type exists in the ranked hits, append the other type's top-ranked
// document title. Encodes "federal authority = statute + implementing
// regulation"; the specific document is whichever retrieval ranked highest.
function withStatuteRegulationTitlePairing(titles: string[], hits: CorpusRetrievalHit[]): string[] {
  if (titles.length === 0) return titles;
  const typeByTitle = new Map<string, string>();
  for (const hit of hits) {
    if (hit.documentTitle && hit.documentType && !typeByTitle.has(hit.documentTitle)) {
      typeByTitle.set(hit.documentTitle, hit.documentType);
    }
  }
  const presentTypes = new Set(titles.map((title) => typeByTitle.get(title)).filter(Boolean));
  const paired = [...titles];
  for (const docType of FEDERAL_AUTHORITY_DOC_TYPES) {
    if (presentTypes.has(docType)) continue;
    const topOfType = hits.find((hit) => hit.documentType === docType && hit.documentTitle);
    if (topOfType?.documentTitle) paired.push(topOfType.documentTitle);
  }
  return dedupeTerms(paired);
}

// Ensure the top primary candidates span both statute and regulation when
// both document types were retrieved: splice the missing type's top hit in at
// index 1 so the regulation document keeps the authoritative top slot.
function ensureStatuteRegulationCandidatePairing(
  candidates: SectionCandidate[],
  hits: CorpusRetrievalHit[],
  limit: number,
): SectionCandidate[] {
  const typeBySectionId = new Map<string, string>();
  for (const hit of hits) {
    if (hit.documentType) typeBySectionId.set(hit.sectionId, hit.documentType);
  }
  const availableTypes = new Set(typeBySectionId.values());
  const topTypes = new Set(
    candidates.slice(0, limit).map((candidate) => typeBySectionId.get(candidate.sectionId)).filter(Boolean),
  );

  const additions: SectionCandidate[] = [];
  for (const docType of FEDERAL_AUTHORITY_DOC_TYPES) {
    if (topTypes.has(docType) || !availableTypes.has(docType)) continue;
    const topHit = hits.find((hit) => typeBySectionId.get(hit.sectionId) === docType);
    if (topHit) {
      additions.push({
        sectionId: topHit.sectionId,
        reason: 'Federal statutory authority paired with its implementing regulation.',
      });
    }
  }
  if (additions.length === 0) return candidates;

  const spliced = [...candidates];
  spliced.splice(Math.min(1, spliced.length), 0, ...additions);
  return uniqueBy(spliced, (candidate) => candidate.sectionId);
}

function boostAuthorityTitleMatches(hits: CorpusRetrievalHit[], focusTerms: string[]): CorpusRetrievalHit[] {
  const phraseFocusTerms = focusTerms.filter((term) => term.includes(' '));
  if (phraseFocusTerms.length === 0) return hits;
  return [...hits]
    .map((hit) => ({
      ...hit,
      score: hit.score + Math.min(scoreTermMatches(phraseFocusTerms, hit.sectionTitle), 2) * AUTHORITY_TITLE_PHRASE_BOOST,
    }))
    .sort((left, right) => right.score - left.score);
}

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

// Federal hits after retrieval, merging, focus ranking, and the waiver-specific
// re-ranking. Threaded through the title-preference, scoping, and primary-
// candidate phases below.
interface RankedFederalHits {
  mergedFederalHits: CorpusRetrievalHit[];
  rankedFederalHits: CorpusRetrievalHit[];
  waiverRankedFederalHits: CorpusRetrievalHit[];
  waiverAnchorHits: CorpusRetrievalHit[];
}

// Phase 1: retrieve federal regulation/statute hits (raw + focused-query),
// merge, focus-rank, apply authority-title and waiver-application boosts, and
// pick the statutory/regulatory waiver anchors.
async function retrieveAndRankFederalHits(
  context: FrameContext,
  query: string,
  signals: FederalAuthoritySignals,
): Promise<RankedFederalHits> {
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
  const focusRankedFederalHits = rankHitsByQueryFocus(mergedFederalHits, signals.focusTerms, signals.quotedPhrases);
  // Authority-citation questions get a section-TITLE phrase boost: a section
  // whose heading carries the program's official multi-word name (e.g.
  // "Early and periodic screening…" in 441 Subpart B) is ABOUT the program,
  // while a section that merely mentions the acronym in another part's body
  // text (440.345, benchmark benefits) is context. Structural signal — no
  // hardcoded section numbers.
  const rankedFederalHits = signals.authorityCitationQuery
    ? boostAuthorityTitleMatches(focusRankedFederalHits, signals.focusTerms)
    : focusRankedFederalHits;
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
  return { mergedFederalHits, rankedFederalHits, waiverRankedFederalHits, waiverAnchorHits };
}

// Phase 2: choose which federal document titles to scope the primary set to.
// Waiver queries anchor on 42 CFR Part 441 + SSA Title 19; other queries fall
// back to focus-based title preference, with statute/regulation pairing for
// authority-citation questions.
function selectPreferredFederalDocumentTitles(
  signals: FederalAuthoritySignals,
  ranked: RankedFederalHits,
): string[] {
  const { mergedFederalHits, rankedFederalHits, waiverRankedFederalHits, waiverAnchorHits } = ranked;
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
        // for 1915(c) authority phrasing), just not top-1. The SSA §1915
        // statute anchors alongside it: "federal authority" answers should
        // pair the statute with its implementing regulation.
        waiverAnchorHits.find((hit) => hit.policyNumber?.toUpperCase() === '42-CFR-441')?.documentTitle,
        waiverAnchorHits.find((hit) => hit.policyNumber?.toUpperCase() === 'SSA-TITLE-19')?.documentTitle,
      ].filter((title): title is string => Boolean(title))
    : [];
  const focusPreferredFederalDocumentTitles =
    waiverPreferredFederalDocumentTitles.length > 0
      ? dedupeTerms(waiverPreferredFederalDocumentTitles)
      : selectPreferredDocumentTitlesByFocus(
          // Authority queries pass the title-boosted ranking so the document
          // whose section HEADINGS match the program name wins preference;
          // other queries keep the unadjusted merged hits (pinned behavior).
          signals.waiverApplicationQuery
            ? waiverRankedFederalHits
            : signals.authorityCitationQuery
              ? rankedFederalHits
              : mergedFederalHits,
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
  // Authority answers should pair the statute with its implementing
  // regulation. Title preference normally keeps ONE document, which scoped
  // statute hits out entirely (an EPSDT-authority question kept only the CFR
  // part; the SSA section never reached the primary set). When the preferred
  // titles are all one document type and the other type exists in the ranked
  // hits, admit the other type's top-ranked document title too.
  return signals.authorityCitationQuery
    ? withStatuteRegulationTitlePairing(focusPreferredFederalDocumentTitles, rankedFederalHits)
    : focusPreferredFederalDocumentTitles;
}

// Phase 3: scope the ranked hits to the preferred documents and focus content,
// producing the primary federal hit set (and the unfiltered primary hits used
// for statute/regulation candidate pairing downstream).
function scopeFederalPrimaryHits(
  signals: FederalAuthoritySignals,
  ranked: RankedFederalHits,
  preferredFederalDocumentTitles: string[],
): { primaryFederalHits: CorpusRetrievalHit[]; filteredPrimaryFederalHits: CorpusRetrievalHit[] } {
  const { rankedFederalHits, waiverRankedFederalHits, waiverAnchorHits } = ranked;
  const includeAnchorsInPrimary = signals.waiverApplicationQuery || signals.waiverAuthorityQuery;
  const primaryFederalHits =
    preferredFederalDocumentTitles.length === 0
      ? includeAnchorsInPrimary
        ? uniqueBy(
            [...waiverAnchorHits, ...(signals.waiverApplicationQuery ? waiverRankedFederalHits : rankedFederalHits)],
            (hit) => hit.sectionId,
          )
        : rankedFederalHits
      : (() => {
          const candidateHits = signals.waiverApplicationQuery ? waiverRankedFederalHits : rankedFederalHits;
          const scoped = candidateHits.filter(
            (hit) => hit.documentTitle && preferredFederalDocumentTitles.includes(hit.documentTitle),
          );
          const baseHits = scoped.length > 0 ? scoped : candidateHits;
          return includeAnchorsInPrimary
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
  return { primaryFederalHits, filteredPrimaryFederalHits };
}

// Phase 4: hydrate the primary candidates and their documents, add the waiver
// statutory anchor and document-level candidates, and assemble the evidence.
async function buildFederalPrimaryEvidence(
  context: FrameContext,
  signals: FederalAuthoritySignals,
  ranked: RankedFederalHits,
  primaryHits: { primaryFederalHits: CorpusRetrievalHit[]; filteredPrimaryFederalHits: CorpusRetrievalHit[] },
): Promise<FederalAuthorityEvidence> {
  const { waiverRankedFederalHits } = ranked;
  const { primaryFederalHits, filteredPrimaryFederalHits } = primaryHits;
  const primaryIncludeTerms = dedupeTerms([...FEDERAL_PRIMARY_TERMS, ...signals.focusTerms]);
  const unpairedPrimaryCandidates = buildSectionCandidates(
    filteredPrimaryFederalHits,
    primaryIncludeTerms,
    [],
    FRAME_PRIMARY_LIMIT * 2,
    'Primary federal authority section.',
  );
  const initialPrimaryCandidates = signals.authorityCitationQuery
    ? ensureStatuteRegulationCandidatePairing(unpairedPrimaryCandidates, primaryFederalHits, FRAME_PRIMARY_LIMIT)
    : unpairedPrimaryCandidates;
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
  );
  const waiverStatutoryCandidates =
    signals.waiverApplicationQuery || signals.waiverAuthorityQuery
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

// Orchestrates the four federal-evidence phases: retrieve & rank → select
// preferred document titles → scope primary hits → build primary candidates.
export async function collectFederalAuthorityEvidence(
  context: FrameContext,
  query: string,
  signals: FederalAuthoritySignals,
): Promise<FederalAuthorityEvidence> {
  const ranked = await retrieveAndRankFederalHits(context, query, signals);
  const preferredFederalDocumentTitles = selectPreferredFederalDocumentTitles(signals, ranked);
  const primaryHits = scopeFederalPrimaryHits(signals, ranked, preferredFederalDocumentTitles);
  return buildFederalPrimaryEvidence(context, signals, ranked, primaryHits);
}

// --- Implementation evidence ----------------------------------------------------

export interface FederalImplementationEvidence {
  scopedImplementationHits: CorpusRetrievalHit[];
  implementationDocuments: DocumentWithSectionsView[];
}

export async function collectFederalImplementationEvidence(
  context: FrameContext,
  query: string,
  signals: FederalAuthoritySignals,
): Promise<FederalImplementationEvidence> {
  const implementationLookupDocuments = signals.implementationQuery
    ? await context.collectImplementationLookupDocuments(query)
    : [];
  const implementationHits = signals.implementationQuery
    ? await context.searchSectionsDetailed({
        query,
        topK: signals.mlrQuery ? 8 : 6,
        documentTypes: federalImplementationDocumentTypes(signals.queryLower),
      })
    : [];
  const focusedImplementationHits = filterHitsToFocusedContent(
    implementationHits,
    signals.focusTerms,
    signals.quotedPhrases,
  );
  const rankedImplementationHits = (
    signals.mlrQuery
      ? focusedImplementationHits.map((hit) =>
          hit.answerRole === 'managed_care_contract'
            ? {
                ...hit,
                score: hit.score + CONTRACT_ROLE_BOOST,
              }
            : hit,
        )
      : focusedImplementationHits
  ).sort((left, right) => right.score - left.score);
  const preferredImplementationDocumentTitles = selectPreferredDocumentTitlesByFocus(
    rankedImplementationHits,
    signals.focusTerms,
    signals.quotedPhrases,
    signals.mlrQuery ? 2 : 1,
    0.08,
  );
  const scopedImplementationHits =
    preferredImplementationDocumentTitles.length === 0
      ? rankedImplementationHits
      : (() => {
          const scoped = rankedImplementationHits.filter(
            (hit) => hit.documentTitle && preferredImplementationDocumentTitles.includes(hit.documentTitle),
          );
          return scoped.length > 0 ? scoped : rankedImplementationHits;
        })();
  const implementationDocuments = uniqueBy(
    [
      ...implementationLookupDocuments,
      ...(await context.collectDocumentsForSectionIds(
        scopedImplementationHits.map((hit) => hit.sectionId),
        FRAME_DOCUMENT_LIMIT,
      )),
    ],
    (document) => document.id,
  );

  return {
    scopedImplementationHits,
    implementationDocuments,
  };
}

// --- Candidate sets ---------------------------------------------------------------

export async function buildFederalAuthorityCandidateSets(
  context: FrameContext,
  signals: FederalAuthoritySignals,
  federalEvidence: FederalAuthorityEvidence,
  implementationEvidence: FederalImplementationEvidence,
) {
  const federalDocumentSupportCandidates = context.toSectionCandidates(
    await context.collectDocumentSectionCandidates(
      federalEvidence.primaryFederalDocuments,
      dedupeTerms([
        ...FEDERAL_DOCUMENT_SUPPORT_TERMS,
        ...signals.focusTerms,
        ...(signals.waiverApplicationQuery ? WAIVER_APPLICATION_PRIMARY_TERMS : []),
        ...(signals.mlrQuery ? MLR_FEDERAL_SUPPORT_SECTION_TERMS : []),
      ]),
      signals.publicNoticeQuery || !signals.waiverApplicationQuery ? [] : WAIVER_APPLICATION_AVOID_TERMS,
      'Supporting federal reporting or enforcement section from the same authority document.',
      FRAME_SUPPORT_LIMIT * 2,
    ),
  );
  const implementationDocumentSupportCandidates = context.toSectionCandidates(
    await context.collectDocumentSectionCandidates(
      implementationEvidence.implementationDocuments,
      signals.implementationSectionTerms,
      COVERAGE_AVOID_TERMS,
      'State implementation section from the NC policy document named by the question.',
      FRAME_SUPPORT_LIMIT * 2,
    ),
  );
  const implementationSupportCandidates = buildSectionCandidates(
    implementationEvidence.scopedImplementationHits,
    signals.implementationSectionTerms,
    [],
    FRAME_SUPPORT_LIMIT * 2,
    'NC implementation or oversight evidence related to the federal rule.',
  );
  const avoidCandidates = buildSectionCandidates(
    signals.waiverApplicationQuery
      ? uniqueBy(
          [
            ...implementationEvidence.scopedImplementationHits,
            ...federalEvidence.waiverRankedFederalHits.filter((hit) =>
              includesPhrase(buildHitText(hit), WAIVER_APPLICATION_AVOID_TERMS),
            ),
          ],
          (hit) => hit.sectionId,
        )
      : implementationEvidence.scopedImplementationHits,
    signals.waiverApplicationQuery ? WAIVER_APPLICATION_AVOID_TERMS : COVERAGE_PRIMARY_TERMS,
    [],
    FRAME_AVOID_LIMIT,
    signals.waiverApplicationQuery
      ? 'Procedural federal section that should stay secondary to the waiver authority and application requirements.'
      : 'Service-specific policy evidence that should not displace the federal authority.',
  );

  return {
    primaryCandidates: federalEvidence.primaryCandidates,
    supportingCandidates: uniqueBy(
      signals.implementationQuery
        ? [
            ...implementationDocumentSupportCandidates,
            ...implementationSupportCandidates,
            ...federalDocumentSupportCandidates,
          ]
        : [...federalDocumentSupportCandidates, ...implementationSupportCandidates],
      (candidate) => candidate.sectionId,
    ),
    avoidCandidates,
    authoritativeCandidates: federalEvidence.authoritativeCandidates,
  };
}
