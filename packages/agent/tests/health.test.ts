import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { checkProviders, resetProviderHealthCache } from '../src/health.js';
import { log } from '../src/logger.js';
import { CLASSIFIER_MODEL } from '../src/model.js';

beforeEach(() => {
  resetProviderHealthCache();
  vi.spyOn(log, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.AGENT_MODEL;
  delete process.env.ANTHROPIC_API_KEY;
});

describe('checkProviders', () => {
  it('reports ok when both providers respond', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await expect(checkProviders()).resolves.toEqual({ voyage: 'ok', openai: 'ok' });
  });

  it('checks Anthropic when the configured agent model requires it', async () => {
    process.env.AGENT_MODEL = 'claude-sonnet-4-5';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkProviders()).resolves.toEqual({
      voyage: 'ok',
      openai: 'ok',
      anthropic: 'ok',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports error per provider on non-OK responses and logs the status', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('voyageai')
        ? { ok: false, status: 401 }
        : { ok: true },
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkProviders()).resolves.toEqual({ voyage: 'error', openai: 'ok' });
    expect(log.error).toHaveBeenCalledWith('dependencyz.voyage_failed', { status: 401 });
  });

  it('reports error when the request throws (network / timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')));
    await expect(checkProviders()).resolves.toEqual({ voyage: 'error', openai: 'error' });
  });

  it('treats an OpenAI quota/rate 429 as an outage', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('openai')
        ? { ok: false, status: 429, text: async () => 'insufficient_quota' }
        : { ok: true },
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkProviders()).resolves.toEqual({ voyage: 'ok', openai: 'error' });
  });

  it('asks OpenAI not to store the probe completion', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await checkProviders();
    const probe = fetchMock.mock.calls.find(([url]) => String(url).includes('openai'))!;
    expect(JSON.parse(String(probe[1]!.body)).store).toBe(false);
  });

  it('treats an OpenAI 404 as an outage: the probed model no longer exists', async () => {
    // A retired classifier model switches both fail-open gates off.
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('openai')
        ? { ok: false, status: 404, text: async () => 'model_not_found' }
        : { ok: true },
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkProviders()).resolves.toEqual({ voyage: 'ok', openai: 'error' });
    expect(log.error).toHaveBeenCalledWith('dependencyz.openai_failed', { status: 404, errText: 'model_not_found' });
  });

  it('probes the classifier model unless overridden', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await checkProviders();
    const probe = fetchMock.mock.calls.find(([url]) => String(url).includes('openai'))!;
    expect(JSON.parse(String(probe[1]!.body)).model).toBe(CLASSIFIER_MODEL);
  });

  it('treats a non-auth/quota OpenAI 4xx as healthy (key and billing proven)', async () => {
    // gpt-5-mini spends the 1-token probe budget on reasoning and returns an
    // invalid_request 400 — the key and quota are fine, so this must not page.
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('openai')
        ? { ok: false, status: 400, text: async () => 'output limit was reached' }
        : { ok: true },
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkProviders()).resolves.toEqual({ voyage: 'ok', openai: 'ok' });
  });

  it('caches results so repeated probes do not re-hit the providers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await checkProviders();
    await checkProviders();
    await checkProviders();
    // One voyage + one openai call total, despite three probes.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight check across concurrent probes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([checkProviders(), checkProviders(), checkProviders()]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves the stale value instantly after expiry and refreshes in the background', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);

      await checkProviders(); // cold start populates the cache
      vi.advanceTimersByTime(61_000); // past PROVIDER_CACHE_MS

      // Providers are now failing — the expired probe must still answer with
      // the last-known value (no added latency) while refreshing behind it.
      fetchMock.mockResolvedValue({ ok: false, status: 500 });
      await expect(checkProviders()).resolves.toEqual({ voyage: 'ok', openai: 'ok' });

      await vi.runAllTimersAsync(); // let the background refresh land
      await expect(checkProviders()).resolves.toEqual({ voyage: 'error', openai: 'error' });
    } finally {
      vi.useRealTimers();
    }
  });
});
