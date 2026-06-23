import { describe, expect, it, vi } from 'vitest';
import { runWithFreshAuth } from '../../src/lib/mastra-client';

const UNAUTH = 'HTTP error! status: 401 - {"error":"Invalid or expired token"}';

describe('runWithFreshAuth', () => {
  it('runs the op with a freshly-fetched token and does not refresh on success', async () => {
    const getAccessToken = vi.fn(async () => 'tok-1');
    const refresh = vi.fn(async () => 'tok-2');
    const op = vi.fn(async () => 'ok');

    const result = await runWithFreshAuth({ getAccessToken, refresh }, op);

    expect(result).toBe('ok');
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('forces a refresh and retries once on a 401, then succeeds', async () => {
    const getAccessToken = vi.fn(async () => 'expired');
    const refresh = vi.fn(async () => 'fresh');
    let attempts = 0;
    const op = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error(UNAUTH);
      return 'recovered';
    });

    const result = await runWithFreshAuth({ getAccessToken, refresh }, op);

    expect(result).toBe('recovered');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('does not retry or refresh on a non-401 error', async () => {
    const getAccessToken = vi.fn(async () => 'tok');
    const refresh = vi.fn(async () => 'tok2');
    const op = vi.fn(async () => {
      throw new Error('HTTP error! status: 500');
    });

    await expect(runWithFreshAuth({ getAccessToken, refresh }, op)).rejects.toThrow('500');
    expect(refresh).not.toHaveBeenCalled();
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the refresh yields no token — surfaces the original 401', async () => {
    const getAccessToken = vi.fn(async () => 'expired');
    const refresh = vi.fn(async () => null); // session fully expired
    const op = vi.fn(async () => {
      throw new Error(UNAUTH);
    });

    await expect(runWithFreshAuth({ getAccessToken, refresh }, op)).rejects.toThrow('401');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(op).toHaveBeenCalledTimes(1); // no wasted token-less retry
  });

  it('retries at most once — a persistent 401 propagates after the refresh attempt', async () => {
    const getAccessToken = vi.fn(async () => 'a');
    const refresh = vi.fn(async () => 'b');
    const op = vi.fn(async () => {
      throw new Error(UNAUTH);
    });

    await expect(runWithFreshAuth({ getAccessToken, refresh }, op)).rejects.toThrow('401');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(op).toHaveBeenCalledTimes(2);
  });
});
