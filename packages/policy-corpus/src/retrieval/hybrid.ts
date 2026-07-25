import type { EmbedQuery, SearchSectionsInput, SessionExecutor } from '../types.js';
import { analyzeQuery } from '../query/analysis.js';
import { selectRetrievalProfile } from '../profiles/retrieval.js';
import { debugSearch, timeSearchStep } from '../internal/shared.js';
import { RETRIEVAL_BACKENDS } from './backend-registry.js';
import { collectHybridHitMap, finalizeHybridHits } from './collector.js';

const VECTOR_BACKEND_NAMES = new Set(['section_vector', 'chunk_vector', 'policy_scoped']);

export function createHybridRetriever({
  withSession,
  embedQuery,
  defaultTopK = 10,
}: {
  withSession: SessionExecutor;
  embedQuery: EmbedQuery;
  defaultTopK?: number;
}) {
  const searchSectionsDetailed = async (input: SearchSectionsInput) => {
    const topK = Math.round(input.topK ?? defaultTopK);
    const queryInput = {
      ...input,
      topK,
    };
    const analysis = analyzeQuery(queryInput.query);
    const profile = selectRetrievalProfile(queryInput, analysis);

    debugSearch(`search start query="${queryInput.query}" topK=${topK}`);
    const embedding = await timeSearchStep('embed query', () => embedQuery(queryInput.query));
    const backends =
      embedding.length > 0
        ? RETRIEVAL_BACKENDS
        : new Map(
            [...RETRIEVAL_BACKENDS].filter(([name]) => !VECTOR_BACKEND_NAMES.has(name)),
          );

    debugSearch(`typeGroups=${profile.typeGroups.map((group) => group.join('+')).join(',')} perGroupK=${profile.perGroupK}`);
    // The collector acquires a session per concurrent query branch, so it
    // takes the executor rather than running inside a single session.
    const sectionMap = await collectHybridHitMap({
      withSession,
      input: queryInput,
      analysis,
      profile,
      embedding,
      backends,
    });
    const finalHits = finalizeHybridHits({
      sectionMap,
      analysis,
      topK,
    });
    debugSearch(`search end query="${queryInput.query}" hits=${finalHits.length}`);
    return finalHits;
  };

  return {
    searchSectionsDetailed,
  };
}
