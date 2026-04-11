import type { AnswerFrame, AnswerFrameRoute } from '../../types.js';
import type { FrameContext } from '../context.js';
import { selectAnswerRoute } from '../../internal/answer-routing.js';
import {
  COVERAGE_SUPPORT_TERMS,
  FRAME_PRIMARY_LIMIT,
  FRAME_SUPPORT_LIMIT,
  PRIOR_AUTH_SUPPORT_TERMS,
  buildSectionCandidates,
  extractSearchTerms,
  normalizeSearchText,
} from '../../internal/shared.js';

export async function resolveGeneralFrame(
  context: FrameContext,
  query: string,
  route: AnswerFrameRoute = selectAnswerRoute(normalizeSearchText(query), 'general'),
): Promise<AnswerFrame> {
  const hits = await context.searchSectionsDetailed({
    query,
    topK: route.lane === 'deterministic_evidence' ? 8 : 10,
  });
  return context.finalizeFrame({
    questionType: 'general',
    route,
    primaryCandidates: buildSectionCandidates(hits, extractSearchTerms(query), [], FRAME_PRIMARY_LIMIT * 2, 'Top search result.'),
    supportingCandidates: buildSectionCandidates(
      hits,
      [...COVERAGE_SUPPORT_TERMS, ...PRIOR_AUTH_SUPPORT_TERMS],
      [],
      FRAME_SUPPORT_LIMIT * 2,
      'Supporting result from the same search.',
    ),
  });
}
