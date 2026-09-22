import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateObject } from 'ai';
import { verifyAnswer, VERIFICATION_UNAVAILABLE } from '../../src/processors/verifier/verify.js';

vi.mock('ai', () => ({ generateObject: vi.fn() }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: () => () => 'test-model' }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('verification deadline', () => {
  it('aborts a hanging provider at 30 seconds without provider retries', async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Verification timed out', 'TimeoutError')), ms);
      return controller.signal;
    });
    vi.mocked(generateObject).mockImplementation(({ abortSignal, maxRetries }) => {
      expect(maxRetries).toBe(0);
      return new Promise((_resolve, reject) => abortSignal!.addEventListener('abort', () => reject(abortSignal!.reason), { once: true })) as any;
    });
    const pending = verifyAnswer('question', 'draft', 'source');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(await pending).toMatchObject({ failureRetryable: true, supported: false,
      unsupportedClaims: [{ claim: 'Full answer', reason: VERIFICATION_UNAVAILABLE }] });
  });
});
