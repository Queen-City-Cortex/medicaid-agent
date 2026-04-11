import type { FrameResolver, LegalPrimitiveService, SearchService } from '../contracts.js';
import type { ResolveAnswerFrameInput, SessionExecutor } from '../types.js';
import { createFrameContext } from './context.js';
import { analyzeQuery } from '../query/analysis.js';
import { resolveCoverageFrame } from './pipelines/coverage.js';
import { resolvePriorAuthFrame } from './pipelines/prior-auth.js';
import { resolveAmendmentFrame } from './pipelines/amendment.js';
import { resolveFederalAuthorityFrame } from './pipelines/federal-authority.js';
import { resolvePolicyVariantFrame } from './pipelines/policy-variant.js';
import { resolveGeneralFrame } from './pipelines/general.js';

export function createAnswerFrameResolver({
  searchSectionsDetailed,
  primitives,
  withSession,
}: {
  searchSectionsDetailed: SearchService['searchSectionsDetailed'];
  primitives: LegalPrimitiveService;
  withSession: SessionExecutor;
}): FrameResolver {
  const context = createFrameContext({
    searchSectionsDetailed,
    primitives,
    withSession,
  });

  const resolveAnswerFrame = async ({ query, questionType }: ResolveAnswerFrameInput) => {
    const analysis = analyzeQuery(query, questionType);
    switch (analysis.questionType) {
      case 'coverage':
        return resolveCoverageFrame(context, query, analysis.route);
      case 'prior_authorization':
        return resolvePriorAuthFrame(context, query, analysis.route);
      case 'amendment':
        return resolveAmendmentFrame(context, query, analysis.route);
      case 'federal_authority':
        return resolveFederalAuthorityFrame(context, query, analysis.route);
      case 'policy_variant':
        return resolvePolicyVariantFrame(context, query, analysis.route);
      default:
        return resolveGeneralFrame(context, query, analysis.route);
    }
  };

  return {
    resolveAnswerFrame,
    resolveCoverageFrame: (query) => resolveCoverageFrame(context, query),
    resolvePriorAuthFrame: (query) => resolvePriorAuthFrame(context, query),
    resolveAmendmentFrame: (query) => resolveAmendmentFrame(context, query),
    resolveFederalAuthorityFrame: (query) => resolveFederalAuthorityFrame(context, query),
    resolvePolicyVariantFrame: (query) => resolvePolicyVariantFrame(context, query),
  };
}
