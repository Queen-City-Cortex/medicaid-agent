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
});
