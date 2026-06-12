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
  };
}
