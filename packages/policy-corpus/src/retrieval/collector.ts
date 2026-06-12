import type { CorpusReranker, QueryAnalysis, RetrievalBackend, RetrievalProfile } from '../contracts.js';
import type { CorpusRetrievalHit, SearchSectionsInput, SessionLike } from '../types.js';
import {
  FULLTEXT_BOOST,
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
import { maybeRerankHits } from './rerank.js';

type HitMap = Map<string, CorpusRetrievalHit>;

export async function collectHybridHitMap({
  session,
  input,
  analysis,
  profile,
  embedding,
  backends,
}: {
  session: SessionLike;
  input: SearchSectionsInput;
  analysis: QueryAnalysis;
  profile: RetrievalProfile;
  embedding: number[];
  backends: Map<string, RetrievalBackend>;
}): Promise<HitMap> {
  const sectionMap: HitMap = new Map();
  const mergeMax = (hits: CorpusRetrievalHit[]) => {
    for (const hit of hits) {
      const existing = sectionMap.get(hit.sectionId);
      if (!existing || hit.score > existing.score) {
        sectionMap.set(hit.sectionId, hit);
      }
    }
  };

  for (const backendName of profile.enabledBackends) {
    if (backendName === 'fulltext' || backendName === 'document_expansion' || backendName === 'change_notice_header') {
      continue;
    }
    const backend = backends.get(backendName);
    if (!backend) continue;
    const hits = await backend.retrieve({
      session,
      input,
      analysis,
      profile,
      embedding,
    });
    mergeMax(hits);
  }

  await mergeFulltextHits({
    sectionMap,
    session,
    input,
    analysis,
    profile,
    embedding,
  });
  await mergeExpansionHits({
    sectionMap,
    session,
    analysis,
    profile,
  });

  return sectionMap;
}

export async function finalizeHybridHits({
  input,
  sectionMap,
  analysis,
  profile,
  topK,
  rerankHits,
}: {
  input: SearchSectionsInput;
  sectionMap: HitMap;
  analysis: QueryAnalysis;
  profile: RetrievalProfile;
  topK: number;
  rerankHits?: CorpusReranker;
}): Promise<CorpusRetrievalHit[]> {
  const documentCoverageBoosts = computeDocumentCoverageBoosts(Array.from(sectionMap.values()), analysis.searchTerms);
  const latestChangeMarkerValue = analysis.flags.isLatestChangeNoticeQuery
    ? Array.from(sectionMap.values()).reduce<number | null>((latest, hit) => {
        const markerValue = changeMarkerValueForHit(hit);
        if (markerValue === null) return latest;
        return latest === null ? markerValue : Math.max(latest, markerValue);
      }, null)
    : null;

  const baselineHits = Array.from(sectionMap.values())
    .map((hit) =>
      rerankRetrievalHit(
        hit,
        analysis.normalizedQuery,
        analysis.searchTerms,
        analysis.procedureCodes,
        analysis.requestedYears,
        analysis.explicitPolicyNumbers,
        documentCoverageBoosts,
        latestChangeMarkerValue,
      ),
    )
    .sort((left, right) => right.score - left.score);

  const finalHits = await maybeRerankHits({
    input,
    analysis,
    profile,
    topK,
    baselineHits,
    rerankHits,
  });

  return finalHits.slice(0, topK);
}

async function mergeFulltextHits({
  sectionMap,
  session,
  input,
  analysis,
  profile,
  embedding,
}: {
  sectionMap: HitMap;
  session: SessionLike;
  input: SearchSectionsInput;
  analysis: QueryAnalysis;
  profile: RetrievalProfile;
  embedding: number[];
}) {
  const fulltextHits = profile.enabledBackends.includes('fulltext')
    ? await fulltextBackend.retrieve({
        session,
        input,
        analysis,
        profile,
        embedding,
      })
    : [];
  if (fulltextHits.length === 0) return;

  const fulltextIds = new Set(fulltextHits.map((hit) => hit.sectionId));
  for (const [sectionId, hit] of sectionMap) {
    if (fulltextIds.has(sectionId)) {
      hit.score += FULLTEXT_BOOST;
    }
  }

  // Fulltext is the exact-phrase recovery path. New fulltext-only hits used
  // to be floored just below the weakest hit from every other backend, so
  // they could effectively never survive topK. Place them mid-range instead,
  // decaying by fulltext rank: competitive without outranking strong vector
  // hits.
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

async function mergeExpansionHits({
  sectionMap,
  session,
  analysis,
  profile,
}: {
  sectionMap: HitMap;
  session: SessionLike;
  analysis: QueryAnalysis;
  profile: RetrievalProfile;
}) {
  const mergeMax = (hits: CorpusRetrievalHit[]) => {
    for (const hit of hits) {
      const existing = sectionMap.get(hit.sectionId);
      if (!existing || hit.score > existing.score) {
        sectionMap.set(hit.sectionId, hit);
      }
    }
  };

  if (analysis.flags.isChangeNoticeQuery) {
    const changeNoticeTitles = dedupeTerms(
      Array.from(sectionMap.values())
        .map((hit) => hit.documentTitle)
        .filter((title): title is string => Boolean(title) && normalizeSearchText(title).includes('change notice')),
    ).slice(0, 5);

    mergeMax(
      await retrieveAmendmentTitleExpansionHits({
        session,
        titles: changeNoticeTitles,
        k: profile.perGroupK,
      }),
    );
  }

  const documentCoverageBoosts = computeDocumentCoverageBoosts(Array.from(sectionMap.values()), analysis.searchTerms);
  const documentTitlesForExpansion = selectDocumentTitlesForExpansion(
    Array.from(sectionMap.values()),
    documentCoverageBoosts,
  );

  if (profile.enabledBackends.includes('document_expansion')) {
    mergeMax(
      await retrieveDocumentExpansionHits({
        session,
        titles: documentTitlesForExpansion,
        terms: analysis.searchTerms,
        k: profile.perGroupK,
      }),
    );
  }

  if (analysis.flags.isChangeNoticeQuery) {
    mergeMax(
      await retrieveChangeNoticeHeaderHits({
        session,
        titles: documentTitlesForExpansion,
        k: profile.perGroupK,
      }),
    );
  }
}
