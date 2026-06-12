import type { EmbedQuery, SearchSectionsInput, SessionExecutor } from '../types.js';
import type { CorpusReranker } from '../contracts.js';
import { analyzeQuery } from '../query/analysis.js';
import { selectRetrievalProfile } from '../profiles/retrieval.js';
import { debugSearch, timeSearchStep } from '../internal/shared.js';
import { RETRIEVAL_BACKENDS } from './backend-registry.js';
import { collectHybridHitMap, finalizeHybridHits } from './collector.js';

export function createHybridRetriever({
  withSession,
  embedQuery,
  rerankHits,
  defaultTopK = 10,
}: {
  withSession: SessionExecutor;
  embedQuery: EmbedQuery;
  rerankHits?: CorpusReranker;
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

    debugSearch(`typeGroups=${profile.typeGroups.map((group) => group.join('+')).join(',')} perGroupK=${profile.perGroupK}`);
    // The collector acquires a session per concurrent query branch, so it
    // takes the executor rather than running inside a single session.
    const sectionMap = await collectHybridHitMap({
      withSession,
      input: queryInput,
      analysis,
      profile,
      embedding,
      backends: RETRIEVAL_BACKENDS,
    });
    const finalHits = await finalizeHybridHits({
      input: queryInput,
      sectionMap,
      analysis,
      profile,
      topK,
      rerankHits,
    });
    debugSearch(`search end query="${queryInput.query}" hits=${finalHits.length}`);
    return finalHits;
  };

  return {
    searchSectionsDetailed,
  };
}
