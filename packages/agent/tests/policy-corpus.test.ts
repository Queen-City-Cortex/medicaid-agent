import { afterEach, describe, expect, it, vi } from 'vitest';

describe('createAgentPolicyCorpus', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('wires the corpus with a session, query embedder, and default top-k', async () => {
    const createNeo4jPolicyCorpus = vi.fn(() => ({ searchSectionsDetailed: vi.fn() }));
    vi.doMock('@nc-medicaid/policy-corpus', () => ({
      createNeo4jPolicyCorpus,
    }));
    vi.doMock('../src/neo4j.js', () => ({
      withSession: vi.fn(),
    }));

    const { createAgentPolicyCorpus } = await import('../src/policy-corpus.js');
    createAgentPolicyCorpus();

    expect(createNeo4jPolicyCorpus).toHaveBeenCalledWith({
      withSession: expect.any(Function),
      embedQuery: expect.any(Function),
      defaultTopK: 10,
    });
  });

  it('rejects query embedding cardinality and dimension mismatches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
      })),
    );

    const { embedQueries } = await import('../src/policy-corpus.js');

    await expect(embedQueries(['one', 'two'])).rejects.toThrow(
      'returned 1 embeddings for 2 queries',
    );
    await expect(embedQueries(['one'])).rejects.toThrow(
      'expected 1024 finite dimensions',
    );
  });

  it('rejects non-finite query embeddings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [{ embedding: [...Array(1023).fill(0.1), Number.NaN] }],
        }),
      })),
    );

    const { embedQueries } = await import('../src/policy-corpus.js');

    await expect(embedQueries(['one'])).rejects.toThrow(
      'expected 1024 finite dimensions',
    );
  });
});
