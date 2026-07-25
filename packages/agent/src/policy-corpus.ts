import './load-env.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createNeo4jPolicyCorpus } from '@nc-medicaid/policy-corpus';
import type { SearchSectionsInput } from '@nc-medicaid/policy-corpus';
import { DEFAULT_TOP_K, VOYAGE_API_KEY, VOYAGE_API_URL, VOYAGE_MODEL } from './config.js';
import { intEnv } from './env.js';
import { withSession } from './neo4j.js';
import { log, errorFields } from './logger.js';

// Voyage is a hard dependency for every search. Two protections here:
// a per-request timeout (an unresponsive Voyage previously hung the agent
// until the 10-minute server timeout) and one retry with a short backoff for
// the transient failure classes (429, 5xx, network/abort) so a single blip
// doesn't fail the whole chat turn.
// Clamped: 0 would abort every request instantly and a negative value makes
// AbortSignal.timeout throw — one bad deploy variable must not kill retrieval.
const VOYAGE_TIMEOUT_MS = Math.max(1, intEnv('VOYAGE_TIMEOUT_MS', 15_000));
const VOYAGE_RETRY_BACKOFF_MS = 1_000;
const EMBEDDING_DIMENSIONS = Math.max(1, intEnv('EMBEDDING_DIMENSIONS', 1024));

export type RetrievalMode = 'hybrid' | 'lexical-degraded';
let retrievalMode: RetrievalMode = 'hybrid';
const retrievalModeContext = new AsyncLocalStorage<{ mode: RetrievalMode }>();

export function getRetrievalMode(): RetrievalMode {
  return retrievalMode;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function voyageRequest(queries: string[]): Promise<Response> {
  return fetch(VOYAGE_API_URL, {
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
    signal: AbortSignal.timeout(VOYAGE_TIMEOUT_MS),
  });
}

export async function embedQueries(queries: string[]): Promise<number[][]> {
  if (queries.length === 0) return [];

  // A failure here cascades to all retrieval, so make the cause (network vs
  // HTTP status vs empty body) visible rather than letting a bare throw
  // bubble up unattributed.
  let response: Response;
  try {
    response = await voyageRequest(queries);
    if (!response.ok && isRetryableStatus(response.status)) {
      log.warn('voyage.embed_retrying', { queries: queries.length, status: response.status });
      // Release the abandoned response's socket before retrying — during a
      // provider incident these would otherwise pile up undrained.
      await response.body?.cancel().catch(() => {});
      await new Promise((r) => setTimeout(r, VOYAGE_RETRY_BACKOFF_MS));
      response = await voyageRequest(queries);
    }
  } catch (err) {
    // Network error or timeout — retry once, then give up loudly.
    log.warn('voyage.embed_retrying', { queries: queries.length, ...errorFields(err) });
    await new Promise((r) => setTimeout(r, VOYAGE_RETRY_BACKOFF_MS));
    try {
      response = await voyageRequest(queries);
    } catch (retryErr) {
      log.error('voyage.embed_request_failed', { queries: queries.length, ...errorFields(retryErr) });
      throw retryErr;
    }
  }

  if (!response.ok) {
    const text = await response.text();
    // Keep the body out of long traces but make the reason queryable: a 400
    // InvalidInput and a 400 ModelNotFound are otherwise identical in the log.
    log.error('voyage.embed_http_error', {
      queries: queries.length,
      status: response.status,
      errText: text.slice(0, 500),
    });
    throw new Error(`Voyage API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
  if (!Array.isArray(data.data) || data.data.length !== queries.length) {
    throw new Error(
      `Voyage API returned ${data.data?.length ?? 0} embeddings for ${queries.length} queries`,
    );
  }

  const embeddings = data.data.map((item) => item.embedding);
  if (
    embeddings.some(
      (embedding) =>
        !Array.isArray(embedding) ||
        embedding.length !== EMBEDDING_DIMENSIONS ||
        embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value)),
    )
  ) {
    throw new Error(
      `Voyage API returned an invalid query embedding; expected ${EMBEDDING_DIMENSIONS} finite dimensions`,
    );
  }
  return embeddings as number[][];
}

async function embedQuery(query: string): Promise<number[]> {
  try {
    const [embedding] = await embedQueries([query]);
    retrievalMode = 'hybrid';
    const context = retrievalModeContext.getStore();
    if (context) context.mode = 'hybrid';
    return embedding;
  } catch (err) {
    retrievalMode = 'lexical-degraded';
    const context = retrievalModeContext.getStore();
    if (context) context.mode = 'lexical-degraded';
    log.warn('voyage.embed_degraded_to_lexical', errorFields(err));
    return [];
  }
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

export async function searchPolicySections(input: SearchSectionsInput) {
  return retrievalModeContext.run(
    { mode: 'hybrid' },
    async () => {
      const context = retrievalModeContext.getStore();
      const sections = await policyCorpus.searchSections(input);
      return {
        sections,
        retrievalMode: context?.mode ?? getRetrievalMode(),
      };
    },
  );
}
