import { afterEach, describe, expect, it, vi } from 'vitest';

describe('createAgentPolicyCorpus', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('injects reranker by default', async () => {
    delete process.env.POLICY_CORPUS_RERANK_ENABLED;

    const createNeo4jPolicyCorpus = vi.fn(() => ({ searchSectionsDetailed: vi.fn() }));
    vi.doMock('@nc-medicaid/policy-corpus', () => ({
      createNeo4jPolicyCorpus,
    }));
    vi.doMock('../src/neo4j.js', () => ({
      withSession: vi.fn(),
    }));

    const { createAgentPolicyCorpus } = await import('../src/policy-corpus.js');
    createAgentPolicyCorpus();

    expect(createNeo4jPolicyCorpus).toHaveBeenCalledWith(
      expect.objectContaining({
        rerankHits: expect.any(Function),
      }),
    );
  });

  it('does not inject reranker when disabled', async () => {
    process.env.POLICY_CORPUS_RERANK_ENABLED = 'false';

    const createNeo4jPolicyCorpus = vi.fn(() => ({ searchSectionsDetailed: vi.fn() }));
    vi.doMock('@nc-medicaid/policy-corpus', () => ({
      createNeo4jPolicyCorpus,
    }));
    vi.doMock('../src/neo4j.js', () => ({
      withSession: vi.fn(),
    }));

    const { createAgentPolicyCorpus } = await import('../src/policy-corpus.js');
    createAgentPolicyCorpus();

    expect(createNeo4jPolicyCorpus).toHaveBeenCalledWith(
      expect.objectContaining({
        rerankHits: undefined,
      }),
    );
  });
});
