import type { QueryAnalysis } from '../../contracts.js';
import type { AnswerFrame } from '../../types.js';
import type { FrameContext } from '../context.js';
import {
  COVERAGE_SUPPORT_TERMS,
  FRAME_PRIMARY_LIMIT,
  FRAME_SUPPORT_LIMIT,
  PRIOR_AUTH_SUPPORT_TERMS,
  buildSectionCandidates,
} from '../../internal/shared.js';

export async function resolveGeneralFrame(
  context: FrameContext,
  analysis: QueryAnalysis,
): Promise<AnswerFrame> {
  const { query, route, searchTerms } = analysis;
  const hits = await context.searchSectionsDetailed({
    query,
    topK: route.lane === 'deterministic_evidence' ? 8 : 10,
  });
  return context.finalizeFrame({
    questionType: 'general',
    route,
    primaryCandidates: buildSectionCandidates(hits, searchTerms, [], FRAME_PRIMARY_LIMIT * 2, 'Top search result.'),
    supportingCandidates: buildSectionCandidates(
      hits,
      [...COVERAGE_SUPPORT_TERMS, ...PRIOR_AUTH_SUPPORT_TERMS],
      [],
      FRAME_SUPPORT_LIMIT * 2,
      'Supporting result from the same search.',
    ),
  });
}
