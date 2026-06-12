import { registerApiRoute } from '@mastra/core/server';
import { withSession } from './neo4j.js';

export interface CorpusStatus {
  /** ISO timestamp of the most recent document (re-)index, or null if the graph is empty. */
  lastUpdated: string | null;
  documentCount: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { value: CorpusStatus; expiresAt: number } | null = null;

// Every Document node carries last_indexed (set by the pipeline loader), so
// max(last_indexed) is the real "corpus last updated" moment — not an
// invented date. Cached for 5 minutes: the value changes only when the
// pipeline runs, and the empty state requests it on every page load.
export async function getCorpusStatus(now: () => number = Date.now): Promise<CorpusStatus> {
  if (cached && cached.expiresAt > now()) return cached.value;

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
  return value;
}

export function resetCorpusStatusCache() {
  cached = null;
}

export function corpusStatusRoute() {
  return registerApiRoute('/corpus-status', {
    method: 'GET',
    handler: async (c) => {
      try {
        return c.json(await getCorpusStatus());
      } catch (err) {
        console.error('[corpus-status] query failed:', err);
        return c.json({ error: 'Corpus status unavailable' }, 503);
      }
    },
  });
}
