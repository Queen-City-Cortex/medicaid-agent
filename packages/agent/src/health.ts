import { VOYAGE_API_KEY, VOYAGE_API_URL, VOYAGE_MODEL } from './config.js';
import { strEnv } from './env.js';
import { CLASSIFIER_MODEL } from './model.js';
import { log, errorFields } from './logger.js';

// Provider reachability checks for /dependencyz. Neo4j and LibSQL belong to
// /readyz; keeping upstream providers separate prevents a transient provider
// outage from rolling back an otherwise healthy deploy while still giving
// monitors a required-provider 503. Results are cached so frequent probes
// don't burn quota: at most one real check per provider per minute.
export type ProviderHealth = 'ok' | 'error';

const PROVIDER_CACHE_MS = 60_000;
const PROVIDER_CHECK_TIMEOUT_MS = 5_000;

export interface ProviderStatuses {
  voyage: ProviderHealth;
  openai: ProviderHealth;
  anthropic?: ProviderHealth;
}

let cache: { at: number; value: ProviderStatuses } | null = null;
let inFlight: Promise<ProviderStatuses> | null = null;

async function checkVoyage(): Promise<ProviderHealth> {
  try {
    // Minimal single-token embed — validates key, model, and reachability.
    // Deliberately NOT embedQueries(): that path retries with backoff, which
    // a 5s health probe must not do.
    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({ model: VOYAGE_MODEL, input: ['healthz'], input_type: 'query' }),
      signal: AbortSignal.timeout(PROVIDER_CHECK_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.error('dependencyz.voyage_failed', { status: response.status });
      return 'error';
    }
    return 'ok';
  } catch (err) {
    log.error('dependencyz.voyage_failed', errorFields(err));
    return 'error';
  }
}

async function checkOpenAI(): Promise<ProviderHealth> {
  try {
    // A minimal 1-token completion, NOT GET /v1/models: the models endpoint
    // is free and returns 200 even when the account's quota is exhausted —
    // which is exactly the failure mode that takes every chat down (observed
    // in production 2026-07-10). Cost is ~nothing at one call per cache
    // window; during an actual quota outage the call is free (it fails).
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`,
      },
      body: JSON.stringify({
        // The classifier model is itself on the chat request path
        // (prompt-injection detector, scope gate), so a key that can't call
        // it can't serve chats either. Override if that ever diverges, so the
        // probe can't page on a model the deployment doesn't actually use.
        model: strEnv('HEALTHZ_OPENAI_PROBE_MODEL', CLASSIFIER_MODEL),
        messages: [{ role: 'user', content: 'ok' }],
        max_completion_tokens: 1,
        store: false,
      }),
      signal: AbortSignal.timeout(PROVIDER_CHECK_TIMEOUT_MS),
    });
    // Classify by status, not response.ok: 401/403 (bad key), 404 (the model
    // is gone: a retired classifier model makes both gates fail open), 429
    // (quota / rate) and 5xx (provider down) are the outages chats would hit.
    // Other 4xx prove the key AND billing work — e.g. a reasoning classifier model spends its 1-token
    // budget on reasoning and returns an invalid_request "output limit
    // reached" 400 (observed 2026-07-10 right after the quota top-up), which
    // must not read as an outage.
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      const text = await response.text().catch(() => '');
      log.error('dependencyz.openai_failed', { status: response.status, errText: text.slice(0, 300) });
      return 'error';
    }
    return 'ok';
  } catch (err) {
    log.error('dependencyz.openai_failed', errorFields(err));
    return 'error';
  }
}

async function checkAnthropic(): Promise<ProviderHealth> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.AGENT_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ok' }],
      }),
      signal: AbortSignal.timeout(PROVIDER_CHECK_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.error('dependencyz.anthropic_failed', { status: response.status });
      return 'error';
    }
    return 'ok';
  } catch (err) {
    log.error('dependencyz.anthropic_failed', errorFields(err));
    return 'error';
  }
}

function refreshProviders(): Promise<ProviderStatuses> {
  // Concurrent callers share one in-flight check instead of stampeding.
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const requiresAnthropic = process.env.AGENT_MODEL?.trim().startsWith('claude-') ?? false;
        const [voyage, openai, anthropic] = await Promise.all([
          checkVoyage(),
          checkOpenAI(),
          requiresAnthropic ? checkAnthropic() : Promise.resolve(undefined),
        ]);
        const value: ProviderStatuses = {
          voyage,
          openai,
          ...(anthropic ? { anthropic } : {}),
        };
        cache = { at: Date.now(), value };
        return value;
      } finally {
        inFlight = null;
      }
    })();
  }
  return inFlight;
}

export async function checkProviders(): Promise<ProviderStatuses> {
  // Stale-while-revalidate: only the first probe after boot waits on the
  // network (bounded by the 5s probe timeout). Every later probe answers
  // instantly from cache, kicking an expired refresh in the background — a
  // hung provider must not add latency to /dependencyz and trip tight-budget
  // uptime monitors.
  if (cache) {
    if (Date.now() - cache.at >= PROVIDER_CACHE_MS) void refreshProviders();
    return cache.value;
  }
  return refreshProviders();
}

/** Test hook: drop the memoized result so the next check hits the network. */
export function resetProviderHealthCache(): void {
  cache = null;
  inFlight = null;
}
