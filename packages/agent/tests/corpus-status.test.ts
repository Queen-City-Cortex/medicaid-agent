import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../src/neo4j.js', () => ({
  withSession: vi.fn(async () => {
    throw new Error('neo4j down');
  }),
}));
vi.mock('../src/sentry.js', () => ({ Sentry: { captureException: vi.fn() } }));

import { getCorpusStatus, handleCorpusStatusRequest, resetCorpusStatusCache } from '../src/corpus-status.js';
import { withSession } from '../src/neo4j.js';
import { log } from '../src/logger.js';

afterEach(() => {
  vi.restoreAllMocks();
  resetCorpusStatusCache();
});

describe('corpus-status route failure logging', () => {
  it('logs corpus_status.query_failed and returns 503 when the Neo4j query throws', async () => {
    resetCorpusStatusCache();
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    const json = vi.fn((body: unknown, status?: number) => ({ body, status }));

    const res = (await handleCorpusStatusRequest({ json })) as { status?: number };

    expect(error).toHaveBeenCalledWith(
      'corpus_status.query_failed',
      expect.objectContaining({ err: 'neo4j down' }),
    );
    expect(json).toHaveBeenCalledWith({ error: { code: 'corpus_status_unavailable', message: 'Corpus status unavailable' } }, 503);
    expect(res.status).toBe(503);
  });

  it('does not log on the success path', async () => {
    resetCorpusStatusCache();
    // withSession resolves directly to a status value (the callback's result).
    vi.mocked(withSession).mockResolvedValue({ lastUpdated: null, documentCount: 0, releaseMarkedAt: null } as never);
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    const json = vi.fn((body: unknown, status?: number) => ({ body, status }));

    await handleCorpusStatusRequest({ json });

    expect(json).toHaveBeenCalledWith({
      lastUpdated: null,
      documentCount: 0,
      releaseMarkedAt: null,
      releaseAgeDays: null,
      retrievalMode: 'hybrid',
    });
    expect(error).not.toHaveBeenCalled();
  });
});

describe('corpus-status release age', () => {
  const graph = (fields: Record<string, unknown>) => {
    const run = vi.fn(async (_query: string) => ({ records: [{ get: (key: string) => fields[key] }] }));
    vi.mocked(withSession).mockImplementation((async (fn: (session: { run: typeof run }) => Promise<unknown>) => fn({ run })) as never);
    return run;
  };
  const day = 24 * 60 * 60 * 1000;
  const marked = '2026-09-22T04:10:00.123456Z';

  it('returns the release marker time and its age in whole days, from the graph', async () => {
    resetCorpusStatusCache();
    const run = graph({ lastUpdated: null, documentCount: 1, releaseId: 'r1', releaseMarkedAt: marked });
    const status = await getCorpusStatus(() => Date.parse(marked) + 14 * day + day / 2);

    expect(status).toMatchObject({ releaseId: 'r1', releaseMarkedAt: '2026-09-22T04:10:00.123Z', releaseAgeDays: 14 });
    expect(run.mock.calls[0][0].replace(/\s+/g, ' ')).toContain('release.marked_at AS releaseMarkedAt');
  });

  it('ages the cached marker on every request rather than caching the age', async () => {
    resetCorpusStatusCache();
    const run = graph({ lastUpdated: null, documentCount: 1, releaseId: 'r1', releaseMarkedAt: marked });
    // A minute before the release turns four days old; the cache outlives it.
    const start = Date.parse(marked) + 4 * day - 60 * 1000;
    expect((await getCorpusStatus(() => start)).releaseAgeDays).toBe(3);
    expect((await getCorpusStatus(() => start + 2 * 60 * 1000)).releaseAgeDays).toBe(4);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('is null when the graph has no marker, or the marker time is unreadable', async () => {
    resetCorpusStatusCache();
    graph({ lastUpdated: null, documentCount: 1, releaseId: null, releaseMarkedAt: null });
    expect(await getCorpusStatus()).toMatchObject({ releaseId: null, releaseMarkedAt: null, releaseAgeDays: null });
    resetCorpusStatusCache();
    graph({ lastUpdated: null, documentCount: 1, releaseId: 'r1', releaseMarkedAt: 'not a time' });
    expect(await getCorpusStatus()).toMatchObject({ releaseId: 'r1', releaseMarkedAt: null, releaseAgeDays: null });
  });
});

describe('corpus-status document count', () => {
  it('leaves out revision rows a graph loaded before the relabel still holds as documents', async () => {
    resetCorpusStatusCache();
    const run = vi.fn(async (_query: string) => ({
      records: [{ get: (key: string) => ({ lastUpdated: null, documentCount: 3322, releaseId: 'r1' } as Record<string, unknown>)[key] }],
    }));
    vi.mocked(withSession).mockImplementation((async (fn: (session: { run: typeof run }) => Promise<unknown>) => fn({ run })) as never);

    const status = await getCorpusStatus();

    expect(status.documentCount).toBe(3322);
    const query = run.mock.calls[0][0].replace(/\s+/g, ' ');
    // Only :Document nodes count, so :PolicyRevision nodes never do.
    expect(query).toContain("MATCH (d:Document) WHERE coalesce(d.document_type, '') <> 'change_notice' OPTIONAL MATCH");
  });
});
