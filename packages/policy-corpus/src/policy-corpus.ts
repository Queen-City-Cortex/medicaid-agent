import type { PolicyCorpus, PolicyCorpusDependencies } from './types.js';
import { retrievalHitToSearchHit } from './internal/shared.js';
import { createHybridRetriever } from './retrieval/hybrid.js';
import { createLegalPrimitiveService } from './primitives/service.js';
import { createAnswerFrameResolver } from './frame/service.js';

export { SEARCH_SNIPPET_CHARS } from './internal/shared.js';

export function createNeo4jPolicyCorpus({
  withSession,
  embedQuery,
  rerankHits,
  defaultTopK = 10,
}: PolicyCorpusDependencies): PolicyCorpus {
  const primitives = createLegalPrimitiveService({ withSession });
  const retriever = createHybridRetriever({
    withSession,
    embedQuery,
    rerankHits,
    defaultTopK,
  });
  const frames = createAnswerFrameResolver({
    searchSectionsDetailed: retriever.searchSectionsDetailed,
    primitives,
    withSession,
  });

  return {
    async searchSections(input) {
      const hits = await retriever.searchSectionsDetailed(input);
      return hits.map(retrievalHitToSearchHit);
    },
    searchSectionsDetailed: retriever.searchSectionsDetailed,
    resolveAnswerFrame: frames.resolveAnswerFrame,
    resolveCoverageFrame: frames.resolveCoverageFrame,
    resolvePriorAuthFrame: frames.resolvePriorAuthFrame,
    resolveAmendmentFrame: frames.resolveAmendmentFrame,
    resolveFederalAuthorityFrame: frames.resolveFederalAuthorityFrame,
    resolvePolicyVariantFrame: frames.resolvePolicyVariantFrame,
    getSection: primitives.getSection,
    getDocument: primitives.getDocument,
    getSectionContext: primitives.getSectionContext,
    followReferences: primitives.followReferences,
    getAmendments: primitives.getAmendments,
    lookupPolicy: primitives.lookupPolicy,
    findConceptSections: primitives.findConceptSections,
  };
}
