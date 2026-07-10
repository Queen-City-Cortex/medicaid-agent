import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { embedQueries } from '../src/policy-corpus.js';
import { log } from '../src/logger.js';

// embedQueries retries once with a 1s backoff on transient failures — drive
// the backoff with fake timers so these tests stay instant.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Runs embedQueries while auto-advancing the retry backoff timer. */
async function runWithTimers(promise: Promise<unknown>): Promise<unknown> {
  // Attach a no-op catch first so an expected rejection isn't "unhandled"
  // while the timers advance.
  const settled = promise.catch(() => {});
  await vi.runAllTimersAsync();
  await settled;
  return promise;
}

const okResponse = { ok: true, json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }) };

describe('embedQueries (Voyage) retry and failure logging', () => {
  it('logs and rethrows when the fetch fails on both attempts (network)', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(runWithTimers(embedQueries(['a', 'b']))).rejects.toThrow('ECONNREFUSED');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'voyage.embed_retrying',
      expect.objectContaining({ queries: 2, err: 'ECONNREFUSED' }),
    );
    expect(error).toHaveBeenCalledWith(
      'voyage.embed_request_failed',
      expect.objectContaining({ queries: 2, err: 'ECONNREFUSED' }),
    );
  });

  it('recovers when the retry succeeds after a network failure', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValueOnce(okResponse);
    vi.stubGlobal('fetch', fetchMock);

    await expect(runWithTimers(embedQueries(['a']))).resolves.toEqual([[0.1, 0.2]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(error).not.toHaveBeenCalled();
  });

  it('retries a 429 once, then logs the status and rethrows if it persists', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(runWithTimers(embedQueries(['a']))).rejects.toThrow('Voyage API error 429');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'voyage.embed_retrying',
      expect.objectContaining({ queries: 1, status: 429 }),
    );
    expect(error).toHaveBeenCalledWith(
      'voyage.embed_http_error',
      expect.objectContaining({ queries: 1, status: 429, errText: 'rate limited' }),
    );
  });

  it('does not retry a non-retryable HTTP error (400)', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, text: async () => 'bad input' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(runWithTimers(embedQueries(['a']))).rejects.toThrow('Voyage API error 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'voyage.embed_http_error',
      expect.objectContaining({ queries: 1, status: 400, errText: 'bad input' }),
    );
  });

  it('does not log on a successful embedding', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse));

    await expect(embedQueries(['a'])).resolves.toEqual([[0.1, 0.2]]);
    expect(error).not.toHaveBeenCalled();
  });
});
