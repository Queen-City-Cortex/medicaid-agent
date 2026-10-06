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
    vi.mocked(withSession).mockResolvedValue({ lastUpdated: null, documentCount: 0 } as never);
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    const json = vi.fn((body: unknown, status?: number) => ({ body, status }));

    await handleCorpusStatusRequest({ json });

    expect(json).toHaveBeenCalledWith({
      lastUpdated: null,
      documentCount: 0,
      retrievalMode: 'hybrid',
    });
    expect(error).not.toHaveBeenCalled();
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
