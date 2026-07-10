import { VOYAGE_API_KEY, VOYAGE_API_URL, VOYAGE_MODEL } from './config.js';
import { log, errorFields } from './logger.js';

// Provider reachability checks for /healthz. Neo4j and LibSQL decide the
// health status (they gate deploy promotion); these are informational — an
// expired OpenAI key or a Voyage outage previously passed healthchecks and
// only surfaced on the first real chat. Results are cached so Railway's
// frequent probes (and any external uptime monitor) don't burn provider
// quota: at most one real check per provider per minute.
export type ProviderHealth = 'ok' | 'error';

const PROVIDER_CACHE_MS = 60_000;
const PROVIDER_CHECK_TIMEOUT_MS = 5_000;

interface ProviderStatuses {
  voyage: ProviderHealth;
  openai: ProviderHealth;
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
      log.error('healthz.voyage_failed', { status: response.status });
      return 'error';
    }
    return 'ok';
  } catch (err) {
    log.error('healthz.voyage_failed', errorFields(err));
    return 'error';
  }
}

async function checkOpenAI(): Promise<ProviderHealth> {
  try {
    // GET /v1/models validates the key and reachability with no token cost.
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}` },
      signal: AbortSignal.timeout(PROVIDER_CHECK_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.error('healthz.openai_failed', { status: response.status });
      return 'error';
    }
    return 'ok';
  } catch (err) {
    log.error('healthz.openai_failed', errorFields(err));
    return 'error';
  }
}

function refreshProviders(): Promise<ProviderStatuses> {
  // Concurrent callers share one in-flight check instead of stampeding.
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const [voyage, openai] = await Promise.all([checkVoyage(), checkOpenAI()]);
        const value = { voyage, openai };
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
  // hung provider must not add latency to /healthz and trip tight-budget
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
