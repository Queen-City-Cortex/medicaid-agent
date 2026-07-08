import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));
import { generateObject } from 'ai';

import {
  createPolicyCorpusReranker,
  createRerankerModel,
  getPolicyCorpusRerankerDiagnostics,
  resetPolicyCorpusRerankerDiagnostics,
  type PolicyCorpusRerankConfig,
} from '../src/policy-corpus-reranker.js';

const mockGenerateObject = generateObject as unknown as ReturnType<typeof vi.fn>;

const baseConfig: PolicyCorpusRerankConfig = {
  enabled: true,
  model: 'gpt-5.4-mini',
  timeoutMs: 500,
  maxCandidates: 6,
  debug: false,
};

function makeArgs(candidateCount: number) {
  return {
    query: 'test',
    analysis: {
      questionType: 'coverage_question',
      route: { lane: 'baseline_hybrid', rationale: '' },
    } as any,
    profile: {} as any,
    topK: 10,
    candidates: Array.from({ length: candidateCount }, (_, i) => ({
      sectionId: `sec-${i}`,
      sectionNumber: null,
      sectionTitle: null,
      documentTitle: null,
      documentType: null,
      policyNumber: null,
      content: null,
      score: 1 - i * 0.1,
    })) as any,
  };
}

describe('createPolicyCorpusReranker', () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
    resetPolicyCorpusRerankerDiagnostics();
  });

  it('returns undefined when disabled', () => {
    expect(createPolicyCorpusReranker({ ...baseConfig, enabled: false })).toBeUndefined();
  });

  it('returns null without calling generateObject when there are no candidates', async () => {
    const reranker = createPolicyCorpusReranker(baseConfig)!;
    const result = await reranker(makeArgs(0));
    expect(result).toBeNull();
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it('returns the reranker output on success', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { sectionIds: ['sec-1', 'sec-0'], reason: 'because' },
    });
    const reranker = createPolicyCorpusReranker(baseConfig)!;
    const result = await reranker(makeArgs(3));
    expect(result).toEqual({ sectionIds: ['sec-1', 'sec-0'], reason: 'because' });
    expect(getPolicyCorpusRerankerDiagnostics().fallbackCount).toBe(0);
  });

  it('falls back to null (callers use vector ranks) when generateObject throws', async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error('rate limit'));
    const reranker = createPolicyCorpusReranker(baseConfig)!;
    const result = await reranker(makeArgs(3));
    expect(result).toBeNull();
    const diag = getPolicyCorpusRerankerDiagnostics();
    expect(diag.fallbackCount).toBe(1);
    expect(diag.lastError).toContain('rate limit');
    expect(diag.lastErrorAt).not.toBeNull();
  });

  it('marks aborts as timeout in diagnostics', async () => {
    const timeoutErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    mockGenerateObject.mockRejectedValueOnce(timeoutErr);
    const reranker = createPolicyCorpusReranker(baseConfig)!;
    await reranker(makeArgs(3));
    const diag = getPolicyCorpusRerankerDiagnostics();
    expect(diag.fallbackCount).toBe(1);
    expect(diag.lastError).toContain('timeout');
  });

  it('accumulates fallback counts across failures', async () => {
    mockGenerateObject.mockRejectedValue(new Error('boom'));
    const reranker = createPolicyCorpusReranker(baseConfig)!;
    await reranker(makeArgs(3));
    await reranker(makeArgs(3));
    expect(getPolicyCorpusRerankerDiagnostics().fallbackCount).toBe(2);
  });
});

describe('createRerankerModel routing', () => {
  // LanguageModel is a union that admits bare string ids; the router always
  // returns a provider model object, so narrow before reading its fields.
  function routedModel(modelId: string) {
    const model = createRerankerModel(modelId);
    if (typeof model === 'string') throw new Error(`expected a model object for ${modelId}`);
    return model;
  }

  it('routes groq/ ids to the Groq provider, keeping Groq-internal slashes', () => {
    process.env.GROQ_API_KEY = 'test-key';
    try {
      const model = routedModel('groq/openai/gpt-oss-20b');
      expect(model.modelId).toBe('openai/gpt-oss-20b');
      expect(model.provider).toContain('groq');
    } finally {
      delete process.env.GROQ_API_KEY;
    }
  });

  it('throws a clear error for groq/ ids without GROQ_API_KEY (never falls back to OPENAI_API_KEY)', () => {
    delete process.env.GROQ_API_KEY;
    expect(() => createRerankerModel('groq/openai/gpt-oss-20b')).toThrow(/GROQ_API_KEY/);
  });

  it('routes openai/ ids to OpenAI', () => {
    const model = routedModel('openai/gpt-5-mini');
    expect(model.modelId).toBe('gpt-5-mini');
    expect(model.provider).toContain('openai');
  });

  it('routes bare gpt- ids to OpenAI', () => {
    const model = routedModel('gpt-5-mini');
    expect(model.modelId).toBe('gpt-5-mini');
    expect(model.provider).toContain('openai');
  });

  it('routes anthropic/ ids to Anthropic', () => {
    const model = routedModel('anthropic/claude-haiku-4-5');
    expect(model.modelId).toBe('claude-haiku-4-5');
    expect(model.provider).toContain('anthropic');
  });
});
