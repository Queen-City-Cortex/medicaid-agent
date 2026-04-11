import './load-env.js';
import { createNeo4jPolicyCorpus } from '@nc-medicaid/policy-corpus';
import { DEFAULT_TOP_K, VOYAGE_API_KEY, VOYAGE_API_URL, VOYAGE_MODEL } from './config.js';
import { withSession } from './neo4j.js';

export async function embedQueries(queries: string[]): Promise<number[][]> {
  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: queries,
      input_type: 'query',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Voyage API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return data.data.map((item) => item.embedding);
}

async function embedQuery(query: string): Promise<number[]> {
  const [embedding] = await embedQueries([query]);
  if (!embedding) {
    throw new Error('Voyage API returned no embedding for query');
  }
  return embedding;
}

export function createAgentPolicyCorpus({
  embedQuery: customEmbedQuery = embedQuery,
}: {
  embedQuery?: (query: string) => Promise<number[]>;
} = {}) {
  return createNeo4jPolicyCorpus({
    withSession,
    embedQuery: customEmbedQuery,
    defaultTopK: DEFAULT_TOP_K,
  });
}

export const policyCorpus = createAgentPolicyCorpus();
