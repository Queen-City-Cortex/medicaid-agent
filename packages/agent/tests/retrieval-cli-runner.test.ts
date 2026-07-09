import { describe, expect, it, vi } from 'vitest';
import type { PolicyCorpus } from '@nc-medicaid/policy-corpus';
import { executeRetrievalCli } from '../src/retrieval-cli-runner.js';

function makeHit(sectionId: string, query: string) {
  return {
    sectionId,
    sectionNumber: '1.0',
    sectionTitle: `Title for ${query}`,
    documentTitle: `Document for ${query}`,
    documentType: 'clinical_policy',
    policyNumber: '3K-2',
    content: `Content for ${query}`,
    score: 0.9,
    authorityTier: null,
    answerRole: null,
    sourceFormat: null,
    answerReady: true,
    corpusBucket: null,
    variantGroup: null,
    variantDate: null,
    retrievalReady: true,
  };
}

describe('executeRetrievalCli', () => {
  it('uses the live corpus for single requests', async () => {
    const livePolicyCorpus = {
      searchSectionsDetailed: vi.fn(async () => [makeHit('sec-single', 'single')]),
    } as unknown as PolicyCorpus;

    const result = await executeRetrievalCli(JSON.stringify({ query: 'single', topK: 5 }), {
      livePolicyCorpus,
    });

    expect(livePolicyCorpus.searchSectionsDetailed).toHaveBeenCalledWith({
      query: 'single',
      topK: 5,
    });
    expect(result).toEqual({
      results: [
        expect.objectContaining({
          section_id: 'sec-single',
          doc_title: 'Document for single',
        }),
      ],
    });
  });

  it('uses createAgentPolicyCorpus for each batch request so the injected batch embedder is used', async () => {
    const createCorpus = vi.fn((options?: { embedQuery?: (query: string) => Promise<number[]> }) => ({
      searchSectionsDetailed: vi.fn(async (input: { query: string }) => {
        const embedQuery = options?.embedQuery;
        if (!embedQuery) throw new Error('expected createCorpus to receive embedQuery');
        const embedding = await embedQuery(input.query);
        return [makeHit(`sec-${embedding[0]}`, input.query)];
      }),
    }) as unknown as PolicyCorpus);
    const embedQueryBatch = vi.fn(async (queries: string[]) => queries.map((_, index) => [index + 1]));

    const result = await executeRetrievalCli(
      JSON.stringify({
        requests: [
          { id: 'q1', query: 'first', topK: 5 },
          { id: 'q2', query: 'second', topK: 5 },
        ],
      }),
      {
        createCorpus,
        embedQueryBatch,
      },
    );

    expect(embedQueryBatch).toHaveBeenCalledWith(['first', 'second']);
    expect(createCorpus).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      results_by_request: [
        {
          id: 'q1',
          results: [
            expect.objectContaining({
              section_id: 'sec-1',
              doc_title: 'Document for first',
            }),
          ],
        },
        {
          id: 'q2',
          results: [
            expect.objectContaining({
              section_id: 'sec-2',
              doc_title: 'Document for second',
            }),
          ],
        },
      ],
    });
  });
});
