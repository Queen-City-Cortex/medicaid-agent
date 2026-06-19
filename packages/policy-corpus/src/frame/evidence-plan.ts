import type { QueryAnalysis } from '../contracts.js';
import type { AnswerFrame, ResolveAnswerFrameInput } from '../types.js';
import { analyzeQuery } from '../query/analysis.js';
import type { FrameContext } from './context.js';
import { resolveCoverageFrame } from './pipelines/coverage.js';
import { resolvePriorAuthFrame } from './pipelines/prior-auth.js';
import { resolveAmendmentFrame } from './pipelines/amendment.js';
import { resolveFederalAuthorityFrame } from './pipelines/federal-authority.js';
import { resolvePolicyVariantFrame } from './pipelines/policy-variant.js';
import { resolveGeneralFrame } from './pipelines/general.js';

// The analysis IS the plan: its questionType selects the pipeline and it
// carries every query-derived value each pipeline needs.
export function buildEvidencePlan(input: ResolveAnswerFrameInput): QueryAnalysis {
  return analyzeQuery(input.query, input.questionType);
}

async function resolvePlannedFrame(context: FrameContext, analysis: QueryAnalysis): Promise<AnswerFrame> {
  switch (analysis.questionType) {
    case 'coverage':
      return resolveCoverageFrame(context, analysis);
    case 'prior_authorization':
      return resolvePriorAuthFrame(context, analysis);
    case 'amendment':
      return resolveAmendmentFrame(context, analysis);
    case 'federal_authority':
      return resolveFederalAuthorityFrame(context, analysis);
    case 'policy_variant':
      return resolvePolicyVariantFrame(context, analysis);
    default:
      return resolveGeneralFrame(context, analysis);
  }
}

export function createEvidencePlanner(context: FrameContext) {
  return {
    resolveAnswerFrame(input: ResolveAnswerFrameInput): Promise<AnswerFrame> {
      return resolvePlannedFrame(context, buildEvidencePlan(input));
    },
  };
}
