import type { QueryAnalysis } from '../contracts.js';
import type { AnswerFrame, AnswerQuestionType, ResolveAnswerFrameInput } from '../types.js';
import { analyzeQuery } from '../query/analysis.js';
import type { FrameContext } from './context.js';
import { resolveCoverageFrame } from './pipelines/coverage.js';
import { resolvePriorAuthFrame } from './pipelines/prior-auth.js';
import { resolveAmendmentFrame } from './pipelines/amendment.js';
import { resolveFederalAuthorityFrame } from './pipelines/federal-authority.js';
import { resolvePolicyVariantFrame } from './pipelines/policy-variant.js';
import { resolveGeneralFrame } from './pipelines/general.js';

export type EvidencePipeline = AnswerQuestionType;

export interface EvidencePlan {
  query: string;
  normalizedQuery: string;
  questionType: AnswerQuestionType;
  pipeline: EvidencePipeline;
  route: QueryAnalysis['route'];
}

export function buildEvidencePlan(input: ResolveAnswerFrameInput): EvidencePlan {
  const analysis = analyzeQuery(input.query, input.questionType);
  return {
    query: analysis.query,
    normalizedQuery: analysis.normalizedQuery,
    questionType: analysis.questionType,
    pipeline: analysis.questionType,
    route: analysis.route,
  };
}

async function resolvePlannedFrame(context: FrameContext, plan: EvidencePlan): Promise<AnswerFrame> {
  switch (plan.pipeline) {
    case 'coverage':
      return resolveCoverageFrame(context, plan.query, plan.route);
    case 'prior_authorization':
      return resolvePriorAuthFrame(context, plan.query, plan.route);
    case 'amendment':
      return resolveAmendmentFrame(context, plan.query, plan.route);
    case 'federal_authority':
      return resolveFederalAuthorityFrame(context, plan.query, plan.route);
    case 'policy_variant':
      return resolvePolicyVariantFrame(context, plan.query, plan.route);
    default:
      return resolveGeneralFrame(context, plan.query, plan.route);
  }
}

export function createEvidencePlanner(context: FrameContext) {
  return {
    resolveAnswerFrame(input: ResolveAnswerFrameInput): Promise<AnswerFrame> {
      return resolvePlannedFrame(context, buildEvidencePlan(input));
    },
  };
}
