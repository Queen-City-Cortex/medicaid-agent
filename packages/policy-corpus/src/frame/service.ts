import type { FrameResolver, LegalPrimitiveService, SearchService } from '../contracts.js';
import type { SessionExecutor } from '../types.js';
import { createFrameContext } from './context.js';
import { createEvidencePlanner } from './evidence-plan.js';

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

  const planner = createEvidencePlanner(context);

  return {
    resolveAnswerFrame: planner.resolveAnswerFrame,
    resolveCoverageFrame: (query) => planner.resolveTypedFrame(query, 'coverage'),
    resolvePriorAuthFrame: (query) => planner.resolveTypedFrame(query, 'prior_authorization'),
    resolveAmendmentFrame: (query) => planner.resolveTypedFrame(query, 'amendment'),
    resolveFederalAuthorityFrame: (query) => planner.resolveTypedFrame(query, 'federal_authority'),
    resolvePolicyVariantFrame: (query) => planner.resolveTypedFrame(query, 'policy_variant'),
  };
}
