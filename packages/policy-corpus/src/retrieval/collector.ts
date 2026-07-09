import type { QueryAnalysis, RetrievalBackend, RetrievalProfile } from '../contracts.js';
import type { CorpusRetrievalHit, SearchSectionsInput, SessionExecutor } from '../types.js';
import {
  FULLTEXT_BOOST,
  buildRerankQueryContext,
  changeMarkerValueForHit,
  computeDocumentCoverageBoosts,
  dedupeTerms,
  normalizeSearchText,
  rerankRetrievalHit,
  selectDocumentTitlesForExpansion,
} from '../internal/shared.js';
import {
  retrieveAmendmentTitleExpansionHits,
  retrieveChangeNoticeHeaderHits,
  retrieveDocumentExpansionHits,
} from './backends/document-expansion.js';
import { fulltextBackend } from './backends/fulltext.js';

type HitMap = Map<string, CorpusRetrievalHit>;

// Merges hits into the map keyed by sectionId, keeping the highest-scored hit
// per section ("merge-max") — the default semantics for every pipeline stage
// except fulltext recovery.
function mergeMax(sectionMap: HitMap, hits: CorpusRetrievalHit[]) {
  for (const hit of hits) {
    const existing = sectionMap.get(hit.sectionId);
    if (!existing || hit.score > existing.score) {
      sectionMap.set(hit.sectionId, hit);
    }
  }
}

// Builds the hybrid hit map through one explicit merge pipeline. Merges are
// applied in stage order; each stage's merge semantics are stated where it
// runs. Queries that don't depend on earlier stages' results run
// concurrently, each on its own session — neo4j driver sessions don't
// support concurrent queries, so every parallel branch acquires a session
// via withSession instead of sharing one:
//
//   1. Independent backends — every profile.enabledBackends entry with a
//      registry implementation, merged with merge-max. ('fulltext' and
//      'document_expansion' in enabledBackends are stage flags for stages 2
//      and 4; they have no registry entry, so this loop skips them.)
//   2. Fulltext recovery — exact-phrase Lucene search that boosts sections
//      the other backends already found and inserts fulltext-only sections at
//      a mid-range score. (Its query runs concurrently with stage 1; its
//      merge still happens after stage 1's, which is what its semantics
//      depend on.)
//   3. Amendment-title expansion (change-notice queries only) — sections of
//      the base documents amended by change notices already in the map,
//      merge-max.
//   4. Document expansion (when 'document_expansion' is enabled) —
//      term-matched sections from the documents that dominate the map so far,
//      merge-max.
//   5. Change-notice header expansion (change-notice queries only) —
//      revision-header sections from those same dominant documents, merge-max.
//      (Queries for 4 and 5 run concurrently; merges apply in stage order.)
export async function collectHybridHitMap({
  withSession,
  input,
  analysis,
  profile,
  embedding,
  backends,
}: {
  withSession: SessionExecutor;
  input: SearchSectionsInput;
  analysis: QueryAnalysis;
  profile: RetrievalProfile;
  embedding: number[];
  backends: Map<string, RetrievalBackend>;
}): Promise<HitMap> {
  const sectionMap: HitMap = new Map();

  // Stages 1 and 2: query concurrently, then merge in stage order. Merge-max
  // is order-independent on scores (ties keep the first-merged hit), and
  // Promise.all preserves input order, so results are identical to the old
  // sequential loop.
  const stageOneBackends = profile.enabledBackends
    .map((name) => backends.get(name))
    .filter((backend): backend is RetrievalBackend => Boolean(backend));
  const fulltextEnabled = profile.enabledBackends.includes('fulltext');

  const [stageOneResults, fulltextHits] = await Promise.all([
    Promise.all(
      stageOneBackends.map((backend) =>
        withSession((session) => backend.retrieve({ session, input, analysis, profile, embedding })),
      ),
    ),
    fulltextEnabled
      ? withSession((session) => fulltextBackend.retrieve({ session, input, analysis, profile, embedding }))
      : Promise.resolve([]),
  ]);

  for (const hits of stageOneResults) {
    mergeMax(sectionMap, hits);
  }
  if (fulltextEnabled) {
    mergeFulltextHits(sectionMap, fulltextHits);
  }

  // Stage 3: amendment-title expansion for change-notice queries, merge-max.
  if (analysis.flags.isChangeNoticeQuery) {
    const changeNoticeTitles = dedupeTerms(
      Array.from(sectionMap.values())
        .map((hit) => hit.documentTitle)
        .filter((title): title is string => Boolean(title) && normalizeSearchText(title).includes('change notice')),
    ).slice(0, 5);

    mergeMax(
      sectionMap,
      await withSession((session) =>
        retrieveAmendmentTitleExpansionHits({
          session,
          titles: changeNoticeTitles,
          k: profile.perGroupK,
        }),
      ),
    );
  }

  // Stages 4 and 5 expand from the documents that dominate the map after the
  // earlier stages (including stage 3's amendment hits).
  const documentCoverageBoosts = computeDocumentCoverageBoosts(Array.from(sectionMap.values()), analysis.searchTerms);
  const documentTitlesForExpansion = selectDocumentTitlesForExpansion(
    Array.from(sectionMap.values()),
    documentCoverageBoosts,
  );

  // Stages 4 and 5: query concurrently, merge in stage order, merge-max.
  const [documentExpansionHits, changeNoticeHeaderHits] = await Promise.all([
    profile.enabledBackends.includes('document_expansion')
      ? withSession((session) =>
          retrieveDocumentExpansionHits({
            session,
            titles: documentTitlesForExpansion,
            terms: analysis.searchTerms,
            k: profile.perGroupK,
          }),
        )
      : Promise.resolve([]),
    analysis.flags.isChangeNoticeQuery
      ? withSession((session) =>
          retrieveChangeNoticeHeaderHits({
            session,
            titles: documentTitlesForExpansion,
            k: profile.perGroupK,
          }),
        )
      : Promise.resolve([]),
  ]);

  mergeMax(sectionMap, documentExpansionHits);
  mergeMax(sectionMap, changeNoticeHeaderHits);

  return sectionMap;
}

// Fulltext is the exact-phrase recovery path, so it doesn't merge-max:
// sections the other backends already found get FULLTEXT_BOOST added to their
// score, and fulltext-only sections are inserted at a mid-range score decaying
// by fulltext rank. (New fulltext-only hits used to be floored just below the
// weakest hit from every other backend, so they could effectively never
// survive topK. Mid-range placement keeps them competitive without outranking
// strong vector hits.)
function mergeFulltextHits(sectionMap: HitMap, fulltextHits: CorpusRetrievalHit[]) {
  if (fulltextHits.length === 0) return;

  const fulltextIds = new Set(fulltextHits.map((hit) => hit.sectionId));
  for (const [sectionId, hit] of sectionMap) {
    if (fulltextIds.has(sectionId)) {
      hit.score += FULLTEXT_BOOST;
    }
  }

  const scores = Array.from(sectionMap.values()).map((hit) => hit.score);
  const minScore = scores.length > 0 ? Math.min(...scores) : 0.5;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0.5;
  const midScore = (minScore + maxScore) / 2;
  for (let index = 0; index < fulltextHits.length; index += 1) {
    const hit = fulltextHits[index];
    if (!sectionMap.has(hit.sectionId)) {
      hit.score = Math.max(midScore - 0.02 * index, 0.01);
      sectionMap.set(hit.sectionId, hit);
    }
  }
}

export function finalizeHybridHits({
  sectionMap,
  analysis,
  topK,
}: {
  sectionMap: HitMap;
  analysis: QueryAnalysis;
  topK: number;
}): CorpusRetrievalHit[] {
  const hits = Array.from(sectionMap.values());
  const documentCoverageBoosts = computeDocumentCoverageBoosts(hits, analysis.searchTerms);
  const latestChangeMarkerValue = analysis.flags.isLatestChangeNoticeQuery
    ? hits.reduce<number | null>((latest, hit) => {
        const markerValue = changeMarkerValueForHit(hit);
        if (markerValue === null) return latest;
        return latest === null ? markerValue : Math.max(latest, markerValue);
      }, null)
    : null;

  // Per-query intent flags are computed once here instead of being re-derived
  // inside the rerank loop for every hit.
  const rerankContext = buildRerankQueryContext({
    queryLower: analysis.normalizedQuery,
    queryTerms: analysis.searchTerms,
    procedureCodes: analysis.procedureCodes,
    requestedYears: analysis.requestedYears,
    exactPolicyNumbers: analysis.explicitPolicyNumbers,
    documentCoverageBoosts,
    latestChangeMarkerValue,
  });

  const baselineHits = hits
    .map((hit) => rerankRetrievalHit(hit, rerankContext))
    .sort((left, right) => right.score - left.score);

  return baselineHits.slice(0, topK);
}
