import './load-env.js';
import { createNeo4jPolicyCorpus } from '@nc-medicaid/policy-corpus';
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

  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return data.data.map((item) => item.embedding);
}

async function embedQuery(query: string): Promise<number[]> {
  const [embedding] = await embedQueries([query]);
  if (!embedding) {
    log.error('voyage.embed_empty', { queries: 1 });
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
