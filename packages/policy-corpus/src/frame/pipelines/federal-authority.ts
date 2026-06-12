import type { AnswerFrame, AnswerFrameRoute } from '../../types.js';
import type { FrameContext } from '../context.js';
import { selectAnswerRoute } from '../../internal/answer-routing.js';
import { rebalanceFederalAuthorityFrame } from '../rebalance/federal-authority.js';
import {
  buildFederalAuthorityCandidateSets,
  buildFederalAuthoritySignals,
  collectFederalAuthorityEvidence,
  collectFederalImplementationEvidence,
} from '../federal-authority.js';
import { normalizeSearchText } from '../../internal/shared.js';

export async function resolveFederalAuthorityFrame(
  context: FrameContext,
  query: string,
  route: AnswerFrameRoute = selectAnswerRoute(normalizeSearchText(query), 'federal_authority'),
): Promise<AnswerFrame> {
  const signals = buildFederalAuthoritySignals(query);
  const federalEvidence = await collectFederalAuthorityEvidence(context, query, signals);
  const implementationEvidence = await collectFederalImplementationEvidence(context, query, signals);
  const candidateSets = await buildFederalAuthorityCandidateSets(
    context,
    signals,
    federalEvidence,
    implementationEvidence,
  );

  const frame = await context.finalizeFrame({
    questionType: 'federal_authority',
    route,
    authoritativeCandidates: candidateSets.authoritativeCandidates,
    primaryCandidates: candidateSets.primaryCandidates,
    supportingCandidates: candidateSets.supportingCandidates,
    avoidCandidates: candidateSets.avoidCandidates,
  });
  return rebalanceFederalAuthorityFrame(frame, signals.queryLower);
}
