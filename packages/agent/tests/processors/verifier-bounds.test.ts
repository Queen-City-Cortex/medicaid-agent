import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertVerifierModelUsable, getConfig } from '../../src/processors/verifier/config.js';
import { runVerificationForAnswer } from '../../src/processors/verifier/run.js';
import type { SourceEntry } from '../../src/processors/verifier/evidence.js';
import type { VerificationResult } from '../../src/processors/verifier/verify.js';

// Issue #18 fixes the verifier's model, effort, deadline, pass ceiling and
// retry count. Where each is pinned:
//   default model and the two-pass ceiling   here
//   low effort, storage off, schema mode     verifier-request-body.test.ts
//   30-second deadline and zero retries      verifier-timeout.test.ts

afterEach(() => vi.unstubAllEnvs());

describe('verifier bounds (issue #18)', () => {
  it('defaults to gpt-5.6-terra', () => {
    vi.stubEnv('VERIFIER_MODEL', '');
    expect(getConfig().model).toBe('gpt-5.6-terra');
  });

  it('makes at most two model passes, then withholds', async () => {
    const sources: SourceEntry[] = [{ toolName: 'getSection', key: 'sec:1', text: 'Section: 3.2\nContent:\nCovered when medically necessary.', link: 'https://example.test/policy' }];
    // Every pass rejects its candidate and offers a new correction, so only
    // the ceiling can stop the loop.
    let calls = 0;
    const verify = vi.fn(async (): Promise<VerificationResult> => ({
      supported: false, relevant: true, citationsComplete: true,
      unsupportedClaims: [{ claim: 'claim', reason: 'not in the sources' }],
      missingCitationClaims: [], relevanceIssues: [], correctedAnswer: `Correction ${++calls}.`,
    }));
    const result = await runVerificationForAnswer({ question: 'Is it covered?', answerText: 'It is always covered.', sources, verify, capture: () => {} });
    expect(verify).toHaveBeenCalledTimes(2);
    expect(result.outcome).toEqual({ status: 'withheld', reason: 'unsupported', passCount: 2 });
  });
});

describe('assertVerifierModelUsable', () => {
  it('accepts the default model with an OpenAI key', () => {
    expect(() => assertVerifierModelUsable({ OPENAI_API_KEY: 'sk-test' })).not.toThrow();
    expect(() => assertVerifierModelUsable({ VERIFIER_MODEL: '', OPENAI_API_KEY: 'sk-test' })).not.toThrow();
  });

  it('accepts a Claude model only with an Anthropic key', () => {
    expect(() => assertVerifierModelUsable({ VERIFIER_MODEL: 'claude-sonnet-4-6', ANTHROPIC_API_KEY: 'sk-ant-test' })).not.toThrow();
    expect(() => assertVerifierModelUsable({ VERIFIER_MODEL: 'claude-sonnet-4-6', OPENAI_API_KEY: 'sk-test' }))
      .toThrow('VERIFIER_MODEL claude-sonnet-4-6 requires ANTHROPIC_API_KEY');
    expect(() => assertVerifierModelUsable({ VERIFIER_MODEL: 'claude-sonnet-4-6', OPENAI_API_KEY: 'sk-test', ANTHROPIC_API_KEY: '  ' }))
      .toThrow('requires ANTHROPIC_API_KEY');
  });

  it('requires an OpenAI key for an OpenAI model', () => {
    expect(() => assertVerifierModelUsable({ VERIFIER_MODEL: 'gpt-5.4-mini', ANTHROPIC_API_KEY: 'sk-ant-test' }))
      .toThrow('VERIFIER_MODEL gpt-5.4-mini requires OPENAI_API_KEY');
    expect(() => assertVerifierModelUsable({ VERIFIER_MODEL: 'o3', OPENAI_API_KEY: 'sk-test' })).not.toThrow();
  });

  it('rejects an id that names neither provider, which createModel would send to Anthropic', () => {
    expect(() => assertVerifierModelUsable({ VERIFIER_MODEL: 'llama-4', OPENAI_API_KEY: 'sk-test', ANTHROPIC_API_KEY: 'sk-ant-test' }))
      .toThrow('VERIFIER_MODEL must be an OpenAI (gpt-, o1, o3, o4) or Anthropic (claude-) model id: llama-4');
  });

  it('refuses a VERIFIER_REASONING_EFFORT outside the allow-list', () => {
    expect(() => assertVerifierModelUsable({ OPENAI_API_KEY: 'sk-test', VERIFIER_REASONING_EFFORT: 'extreme' }))
      .toThrow('VERIFIER_REASONING_EFFORT must be one of: none, minimal, low, medium, high, xhigh, max');
    expect(() => assertVerifierModelUsable({ OPENAI_API_KEY: 'sk-test', VERIFIER_REASONING_EFFORT: 'medium' })).not.toThrow();
  });

  it('refuses an effort a GPT-6 verifier is documented to reject', () => {
    expect(() => assertVerifierModelUsable({ VERIFIER_MODEL: 'gpt-6.1-sol', OPENAI_API_KEY: 'sk-test', VERIFIER_REASONING_EFFORT: 'none' }))
      .toThrow('VERIFIER_REASONING_EFFORT none is not supported by gpt-6.1-sol');
    expect(() => assertVerifierModelUsable({ VERIFIER_MODEL: 'gpt-6.1-sol', OPENAI_API_KEY: 'sk-test', VERIFIER_REASONING_EFFORT: 'low' })).not.toThrow();
  });

  it('refuses none and minimal for a Claude verifier, which takes low through max', () => {
    for (const effort of ['none', 'minimal']) {
      expect(() => assertVerifierModelUsable({ VERIFIER_MODEL: 'claude-sonnet-5-5', ANTHROPIC_API_KEY: 'sk-ant-test', VERIFIER_REASONING_EFFORT: effort }))
        .toThrow(`VERIFIER_REASONING_EFFORT ${effort} is not supported by claude-sonnet-5-5`);
    }
    expect(() => assertVerifierModelUsable({ VERIFIER_MODEL: 'claude-sonnet-5-5', ANTHROPIC_API_KEY: 'sk-ant-test', VERIFIER_REASONING_EFFORT: 'max' })).not.toThrow();
  });

  it('checks nothing when the verifier is disabled', () => {
    expect(() => assertVerifierModelUsable({ VERIFIER_ENABLED: 'false', VERIFIER_MODEL: 'claude-sonnet-4-6' })).not.toThrow();
  });
});

describe('start-up validation of the verifier model', () => {
  it('stops start-up when the verifier model has no provider key', async () => {
    const { validateStartup } = await import('../../src/runtime.js');
    const env = { NODE_ENV: 'test', OPENAI_API_KEY: 'sk-test-stub-not-a-real-key', VOYAGE_API_KEY: 'stub' };
    expect(() => validateStartup({ ...env, VERIFIER_MODEL: 'claude-sonnet-5-5' }, { cli: true })).toThrow(/requires ANTHROPIC_API_KEY/);
    expect(() => validateStartup({ ...env, VERIFIER_MODEL: 'mystery-model' }, { cli: true })).toThrow(/VERIFIER_MODEL must be/);
    expect(() => validateStartup(env, { cli: true })).not.toThrow();
  });
});
