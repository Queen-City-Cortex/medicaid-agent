import { registerApiRoute } from '@mastra/core/server';
import type { CorpusStatus } from '@nc-medicaid/contracts';
import { getRetrievalMode } from './policy-corpus.js';
import { withSession } from './neo4j.js';
import { Sentry } from './sentry.js';
import { log, errorFields } from './logger.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

// The age is derived from the cached marker time at each request, never cached.
type CachedCorpusStatus = Omit<CorpusStatus, 'retrievalMode' | 'releaseAgeDays'>;
let cached: { value: CachedCorpusStatus; expiresAt: number } | null = null;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `release.marked_at` is the ISO string `release-mark-graph` stamps when the
 *  graph is validated and again when it is promoted, so on the serving graph
 *  it is the promotion time (or the validation time after a legacy restore).
 *  The pipeline writes no separate promoted_at on the node. */
function markerTime(value: unknown): string | null {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function withAge(value: CachedCorpusStatus, now: number): CorpusStatus {
  const markedAt = value.releaseMarkedAt ? Date.parse(value.releaseMarkedAt) : NaN;
  return {
    ...value,
    releaseAgeDays: Number.isNaN(markedAt) ? null : Math.max(0, Math.floor((now - markedAt) / DAY_MS)),
    retrievalMode: getRetrievalMode(),
  };
}

// Every Document node carries last_indexed (set by the pipeline loader), so
// max(last_indexed) is the real "corpus last updated" moment — not an
// invented date. Cached for 5 minutes: the value changes only when the
// pipeline runs, and the empty state requests it on every page load.
// Transitional: a graph loaded before clinical-policy revision entries became
// :PolicyRevision nodes holds them as :Document rows of type 'change_notice'
// (over half the count). Delete the type filter once the serving graph is
// loaded with :PolicyRevision.
export async function getCorpusStatus(now: () => number = Date.now): Promise<CorpusStatus> {
  if (cached && cached.expiresAt > now()) {
    return withAge(cached.value, now());
  }

  const value = await withSession(async (session) => {
    const result = await session.run(
      `MATCH (d:Document)
       WHERE coalesce(d.document_type, '') <> 'change_notice'
       OPTIONAL MATCH (release:CorpusRelease {id: 'current'})
       RETURN max(d.last_indexed) AS lastUpdated,
              count(DISTINCT d) AS documentCount,
              release.release_id AS releaseId,
              release.marked_at AS releaseMarkedAt`,
    );
    const record = result.records[0];
    const lastUpdated = record?.get('lastUpdated');
    const documentCount = record?.get('documentCount');
    const releaseId = record?.get('releaseId');
    return {
      lastUpdated: lastUpdated ? new Date(lastUpdated.toString()).toISOString() : null,
      documentCount: typeof documentCount?.toNumber === 'function' ? documentCount.toNumber() : Number(documentCount ?? 0),
      releaseId: typeof releaseId === 'string' ? releaseId : null,
      releaseMarkedAt: markerTime(record?.get('releaseMarkedAt')),
    };
  });

  cached = { value, expiresAt: now() + CACHE_TTL_MS };
  return withAge(value, now());
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
    return c.json({ error: { code: 'corpus_status_unavailable', message: 'Corpus status unavailable' } }, 503);
  }
}

export function corpusStatusRoute() {
  return registerApiRoute('/corpus-status', {
    method: 'GET',
    handler: (c) => handleCorpusStatusRequest(c),
  });
}
