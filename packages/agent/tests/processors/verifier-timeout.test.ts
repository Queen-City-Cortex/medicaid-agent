import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateObject } from 'ai';
import { verifyAnswer, VERIFICATION_UNAVAILABLE } from '../../src/processors/verifier/verify.js';
import { log } from '../../src/logger.js';

vi.mock('ai', async original => ({ ...await original<typeof import('ai')>(), generateObject: vi.fn() }));
vi.mock('../../src/model.js', () => ({ createModel: () => 'test-model' }));
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
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    const pending = verifyAnswer('question', 'draft', 'source');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(timeout).toHaveBeenCalledWith(30_000);
    const result = await pending;
    expect(result).toMatchObject({ failureRetryable: true, supported: false, unavailableReason: 'deadline',
      unsupportedClaims: [{ claim: 'Full answer', reason: VERIFICATION_UNAVAILABLE }] });
    // The reason is a fixed value; no error text travels in the result.
    expect(JSON.stringify(result)).not.toContain('timed out');
    // Our own deadline is not reported as a provider outage.
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('verifier.deadline_aborted', expect.objectContaining({ answerChars: 5, sourceChars: 6 }));
  });

  it('reports a caller cancellation as a failed-closed call, not a deadline abort', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    vi.mocked(generateObject).mockImplementation(({ abortSignal }) =>
      new Promise((_resolve, reject) => abortSignal!.addEventListener('abort', () => reject(abortSignal!.reason), { once: true })) as any);
    const controller = new AbortController();
    const pending = verifyAnswer('question', 'draft', 'source', undefined, controller.signal);
    controller.abort(new Error('client went away'));
    const result = await pending;
    expect(result.unsupportedClaims[0]?.reason).toBe(VERIFICATION_UNAVAILABLE);
    expect(result.unavailableReason).toBe('other');
    expect(JSON.stringify(result)).not.toContain('client went away');
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('verifier.failed_closed', expect.anything());
  });
});
