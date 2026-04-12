import type { PolicyCorpus } from '@nc-medicaid/policy-corpus';
import { z } from 'zod';
import { createAgentPolicyCorpus, embedQueries, policyCorpus } from './policy-corpus.js';

export const RetrievalCliInput = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive().optional(),
  documentTypes: z.array(z.string()).optional(),
});

export const RetrievalCliBatchInput = z.object({
  requests: z
    .array(
      z.object({
        id: z.string().min(1),
        query: z.string().min(1),
        topK: z.number().int().positive().optional(),
        documentTypes: z.array(z.string()).optional(),
      }),
    )
    .min(1),
});

export const RetrievalCliAnyInput = z.union([RetrievalCliInput, RetrievalCliBatchInput]);

export const BATCH_CONCURRENCY = 4;

function toCliResults(results: Awaited<ReturnType<PolicyCorpus['searchSectionsDetailed']>>) {
  return results.map((hit) => ({
    section_id: hit.sectionId,
    section_number: hit.sectionNumber,
    section_title: hit.sectionTitle,
    doc_title: hit.documentTitle,
    document_type: hit.documentType,
    policy_number: hit.policyNumber,
    content: hit.content,
    score: hit.score,
  }));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await fn(items[currentIndex] as T, currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function executeRetrievalCli(
  rawInput: string,
  {
    livePolicyCorpus = policyCorpus,
    createCorpus = createAgentPolicyCorpus,
    embedQueryBatch = embedQueries,
  }: {
    livePolicyCorpus?: PolicyCorpus;
    createCorpus?: typeof createAgentPolicyCorpus;
    embedQueryBatch?: typeof embedQueries;
  } = {},
) {
  const parsedJson = rawInput.length === 0 ? {} : JSON.parse(rawInput);
  const input = RetrievalCliAnyInput.parse(parsedJson);

  if ('requests' in input) {
    const embeddings = await embedQueryBatch(input.requests.map((request) => request.query));
    const corpora = embeddings.map((embedding) =>
      createCorpus({
        embedQuery: async () => embedding,
      }),
    );

    const resultsByRequest = await mapWithConcurrency(
      input.requests,
      BATCH_CONCURRENCY,
      async (request, index) => {
        const corpus = corpora[index];
        if (!corpus) {
          throw new Error(`Missing precomputed corpus for batch request ${request.id}`);
        }

        const results = await corpus.searchSectionsDetailed(request);
        return {
          id: request.id,
          results: toCliResults(results),
        };
      },
    );
    return { results_by_request: resultsByRequest };
  }

  const results = await livePolicyCorpus.searchSectionsDetailed(input);
  return { results: toCliResults(results) };
}
