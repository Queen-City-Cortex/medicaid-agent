import { describe, it, expect, vi, afterEach } from 'vitest';
import { embedQueries } from '../src/policy-corpus.js';
import { log } from '../src/logger.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('embedQueries (Voyage) failure logging', () => {
  it('logs and rethrows when the fetch itself fails (network)', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(embedQueries(['a', 'b'])).rejects.toThrow('ECONNREFUSED');
    expect(error).toHaveBeenCalledWith(
      'voyage.embed_request_failed',
      expect.objectContaining({ queries: 2, err: 'ECONNREFUSED' }),
    );
  });

  it('logs the status and rethrows on a non-OK HTTP response', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' }),
    );

    await expect(embedQueries(['a'])).rejects.toThrow('Voyage API error 429');
    expect(error).toHaveBeenCalledWith(
      'voyage.embed_http_error',
      expect.objectContaining({ queries: 1, status: 429, errText: 'rate limited' }),
    );
  });

  it('does not log on a successful embedding', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }) }),
    );

    await expect(embedQueries(['a'])).resolves.toEqual([[0.1, 0.2]]);
    expect(error).not.toHaveBeenCalled();
  });
});
