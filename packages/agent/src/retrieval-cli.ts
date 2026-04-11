import { z } from 'zod';
import { createAgentPolicyCorpus, embedQueries, policyCorpus } from './policy-corpus.js';
import { closeDriver } from './neo4j.js';

const RetrievalCliInput = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive().optional(),
  documentTypes: z.array(z.string()).optional(),
});
const RetrievalCliBatchInput = z.object({
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
const RetrievalCliAnyInput = z.union([RetrievalCliInput, RetrievalCliBatchInput]);
const BATCH_CONCURRENCY = 4;

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

function toCliResults(results: Awaited<ReturnType<typeof policyCorpus.searchSectionsDetailed>>) {
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

async function main() {
  const rawInput = await readStdin();
  const parsedJson = rawInput.length === 0 ? {} : JSON.parse(rawInput);
  const input = RetrievalCliAnyInput.parse(parsedJson);

  if ('requests' in input) {
    const embeddings = await embedQueries(input.requests.map((request) => request.query));
    const corpora = embeddings.map((embedding) =>
      createAgentPolicyCorpus({
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
    process.stdout.write(`${JSON.stringify({ results_by_request: resultsByRequest })}\n`);
    return;
  }

  const results = await policyCorpus.searchSectionsDetailed(input);
  process.stdout.write(`${JSON.stringify({ results: toCliResults(results) })}\n`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDriver();
  });
