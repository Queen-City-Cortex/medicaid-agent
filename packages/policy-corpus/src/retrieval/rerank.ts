import type { CorpusReranker, RetrievalProfile, QueryAnalysis } from '../contracts.js';
import type { CorpusRetrievalHit, SearchSectionsInput } from '../types.js';
import { debugRerank, uniqueBy } from '../internal/shared.js';

export const MIN_RERANK_CANDIDATES = 6;
export const MIN_RERANK_WINDOW = 12;
export const MAX_RERANK_WINDOW = 20;

export interface RerankGateResult {
  enabled: boolean;
  reason: string;
  windowSize: number;
}

export function selectRerankWindowSize(topK: number, maxWindow = MAX_RERANK_WINDOW): number {
  return Math.min(maxWindow, Math.max(MIN_RERANK_WINDOW, topK * 2));
}

export function shouldAttemptRerank({
  input,
  analysis,
  hits,
  topK,
}: {
  input: SearchSectionsInput;
  analysis: QueryAnalysis;
  hits: CorpusRetrievalHit[];
  topK: number;
}): RerankGateResult {
  const windowSize = selectRerankWindowSize(topK);

  if (input.documentTypes && input.documentTypes.length > 0) {
    return { enabled: false, reason: 'explicit_document_types', windowSize };
  }
  if (analysis.route.lane === 'deterministic_evidence') {
    return { enabled: false, reason: 'deterministic_route', windowSize };
  }
  if (hits.length < MIN_RERANK_CANDIDATES) {
    return { enabled: false, reason: 'too_few_candidates', windowSize };
  }
  if (
    analysis.questionType === 'federal_authority' ||
    analysis.questionType === 'amendment' ||
    analysis.questionType === 'policy_variant'
  ) {
    return { enabled: true, reason: `hard_query:${analysis.questionType}`, windowSize };
  }
  if (analysis.flags.isHcwdIncomePremiumQuery) {
    return { enabled: true, reason: 'hard_query:hcwd_income_premium', windowSize };
  }

  const topHits = hits.slice(0, 8);
  if (topHits.length < 5) {
    return { enabled: false, reason: 'not_hard_query', windowSize };
  }

  const distinctDocuments = new Set(
    topHits.map((hit) => `${hit.documentTitle ?? ''}|${hit.policyNumber ?? ''}|${hit.documentType ?? ''}`),
  );
  const scoreGap = (topHits[0]?.score ?? 0) - (topHits[4]?.score ?? 0);
  if (distinctDocuments.size >= 3 && scoreGap <= 0.2) {
    return { enabled: true, reason: 'ambiguous_top_hits', windowSize };
  }

  return { enabled: false, reason: 'not_hard_query', windowSize };
}

function normalizeBaselineScores(hits: CorpusRetrievalHit[]): Map<string, number> {
  const scores = hits.map((hit) => hit.score);
  const maxScore = scores.length > 0 ? Math.max(...scores) : 1;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;
  const span = maxScore - minScore;

  return new Map(
    hits.map((hit) => [
      hit.sectionId,
      span > 0 ? (hit.score - minScore) / span : 1,
    ]),
  );
}

export function applyRerankOrdering({
  baselineHits,
  rerankedSectionIds,
  windowSize,
}: {
  baselineHits: CorpusRetrievalHit[];
  rerankedSectionIds: string[];
  windowSize: number;
}): CorpusRetrievalHit[] {
  const effectiveWindowSize = Math.min(windowSize, baselineHits.length);
  const windowHits = baselineHits.slice(0, effectiveWindowSize);
  const remainingHits = baselineHits.slice(effectiveWindowSize);
  const hitById = new Map(windowHits.map((hit) => [hit.sectionId, hit]));
  const selectedIds = uniqueBy(
    rerankedSectionIds.map((sectionId) => ({ sectionId })),
    (candidate) => candidate.sectionId,
  )
    .map((candidate) => candidate.sectionId)
    .filter((sectionId) => hitById.has(sectionId));
  const selectedIdSet = new Set(selectedIds);

  const reorderedWindow = [
    ...selectedIds.map((sectionId) => hitById.get(sectionId)!),
    ...windowHits.filter((hit) => !selectedIdSet.has(hit.sectionId)),
  ];

  const baselineScores = normalizeBaselineScores(windowHits);
  const upperBound = windowHits[0]?.score ?? 1;
  const lowerBound = remainingHits[0]?.score ?? ((windowHits[windowHits.length - 1]?.score ?? 0) - 0.01);
  const span = Math.max(upperBound - lowerBound, 0.0001);
  const rescoredWindow = reorderedWindow.map((hit, index) => {
    const rankWeight = (reorderedWindow.length - index) / (reorderedWindow.length + 1);
    const baselineWeight = baselineScores.get(hit.sectionId) ?? 0;
    const blendedWeight = rankWeight * 0.98 + baselineWeight * 0.02;
    return {
      ...hit,
      score: lowerBound + span * blendedWeight,
    };
  });

  return [...rescoredWindow, ...remainingHits];
}

export async function maybeRerankHits({
  input,
  analysis,
  profile,
  topK,
  baselineHits,
  rerankHits,
}: {
  input: SearchSectionsInput;
  analysis: QueryAnalysis;
  profile: RetrievalProfile;
  topK: number;
  baselineHits: CorpusRetrievalHit[];
  rerankHits?: CorpusReranker;
}): Promise<CorpusRetrievalHit[]> {
  const gate = shouldAttemptRerank({
    input,
    analysis,
    hits: baselineHits,
    topK,
  });

  if (!gate.enabled) {
    debugRerank(`skip reason=${gate.reason}`);
    return baselineHits;
  }
  if (!rerankHits) {
    debugRerank(`skip reason=no_reranker gate=${gate.reason}`);
    return baselineHits;
  }

  const candidateHits = baselineHits.slice(0, gate.windowSize);
  if (candidateHits.length < MIN_RERANK_CANDIDATES) {
    debugRerank(`skip reason=too_few_candidates_after_window count=${candidateHits.length}`);
    return baselineHits;
  }

  try {
    debugRerank(`attempt reason=${gate.reason} candidates=${candidateHits.length}`);
    const result = await rerankHits({
      query: input.query,
      analysis,
      profile,
      topK,
      candidates: candidateHits,
    });
    const returnedIds = result?.sectionIds ?? [];
    if (returnedIds.length === 0) {
      debugRerank('fail_open reason=empty_result');
      return baselineHits;
    }

    const candidateIdSet = new Set(candidateHits.map((hit) => hit.sectionId));
    const unknownIds = returnedIds.filter((sectionId) => !candidateIdSet.has(sectionId));
    if (unknownIds.length > 0) {
      debugRerank(`fail_open reason=unknown_ids ids=${unknownIds.join(',')}`);
      return baselineHits;
    }

    const validIds = uniqueBy(
      returnedIds.map((sectionId) => ({ sectionId })),
      (candidate) => candidate.sectionId,
    ).map((candidate) => candidate.sectionId);
    if (validIds.length === 0) {
      debugRerank('fail_open reason=no_valid_ids');
      return baselineHits;
    }

    debugRerank(`applied returned=${validIds.join(',')}`);
    return applyRerankOrdering({
      baselineHits,
      rerankedSectionIds: validIds,
      windowSize: gate.windowSize,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debugRerank(`fail_open reason=error message=${message}`);
    return baselineHits;
  }
}
