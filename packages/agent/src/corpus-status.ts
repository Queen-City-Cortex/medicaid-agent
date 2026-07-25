import { registerApiRoute } from '@mastra/core/server';
import type { CorpusStatus } from '@nc-medicaid/contracts';
import { getRetrievalMode } from './policy-corpus.js';
import { withSession } from './neo4j.js';
import { Sentry } from './sentry.js';
import { log, errorFields } from './logger.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

type CachedCorpusStatus = Omit<CorpusStatus, 'retrievalMode'>;
let cached: { value: CachedCorpusStatus; expiresAt: number } | null = null;

// Every Document node carries last_indexed (set by the pipeline loader), so
// max(last_indexed) is the real "corpus last updated" moment — not an
// invented date. Cached for 5 minutes: the value changes only when the
// pipeline runs, and the empty state requests it on every page load.
export async function getCorpusStatus(now: () => number = Date.now): Promise<CorpusStatus> {
  if (cached && cached.expiresAt > now()) {
    return { ...cached.value, retrievalMode: getRetrievalMode() };
  }

  const value = await withSession(async (session) => {
    const result = await session.run(
      'MATCH (d:Document) RETURN max(d.last_indexed) AS lastUpdated, count(d) AS documentCount',
    );
    const record = result.records[0];
    const lastUpdated = record?.get('lastUpdated');
    const documentCount = record?.get('documentCount');
    return {
      lastUpdated: lastUpdated ? new Date(lastUpdated.toString()).toISOString() : null,
      documentCount: typeof documentCount?.toNumber === 'function' ? documentCount.toNumber() : Number(documentCount ?? 0),
    };
  });

  cached = { value, expiresAt: now() + CACHE_TTL_MS };
  return { ...value, retrievalMode: getRetrievalMode() };
}

export function resetCorpusStatusCache() {
  cached = null;
}

/** Route handler, extracted so the failure-logging path is unit-testable. */
export async function handleCorpusStatusRequest(c: {
  json: (body: unknown, status?: number) => unknown;
}) {
  try {
    return c.json(await getCorpusStatus());
  } catch (err) {
    log.error('corpus_status.query_failed', errorFields(err));
    Sentry.captureException(err, { tags: { route: 'corpus-status' } });
    return c.json({ error: 'Corpus status unavailable' }, 503);
  }
}

export function corpusStatusRoute() {
  return registerApiRoute('/corpus-status', {
    method: 'GET',
    handler: (c) => handleCorpusStatusRequest(c),
  });
}
