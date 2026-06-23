import { MastraClient } from '@mastra/client-js';
import { MASTRA_URL } from './mastra-url';

/** Create a MastraClient with an optional auth token. */
export function createMastraClient(accessToken?: string) {
  return new MastraClient({
    baseUrl: MASTRA_URL,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
}

export interface MastraTokenProvider {
  /** Returns a guaranteed-fresh access token (auto-refreshes if expired). */
  getAccessToken: () => Promise<string | null | undefined>;
  /** Forces a token refresh; used to recover from a 401. */
  refresh: () => Promise<string | null | undefined>;
}

/** MastraClient errors stringify as `HTTP error! status: 401 - …`. */
function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && err.message.includes('401');
}

/**
 * Run a Mastra memory/thread operation against a client built from a
 * freshly-fetched WorkOS token, forcing a refresh and retrying once on a 401.
 *
 * `@mastra/client-js` only accepts a static `headers` object, so a client
 * created once at render time carries a point-in-time token. After it expires,
 * memory ops (list/load/create/clone/rename/delete) 401 with no recovery,
 * while the chat transport sidesteps this by fetching a fresh token per
 * request. This brings thread management to parity: fetch fresh, and on the
 * rare 401 (token rejected server-side / clock skew), force a refresh and
 * retry exactly once.
 */
export async function runWithFreshAuth<T>(
  tokens: MastraTokenProvider,
  op: (client: MastraClient) => Promise<T>,
): Promise<T> {
  const token = await tokens.getAccessToken();
  try {
    return await op(createMastraClient(token ?? undefined));
  } catch (err) {
    if (!isUnauthorized(err)) throw err;
    // Force a refresh and retry once. If the refresh yields no token (the
    // session is fully expired, not just clock-skewed), a retry would send an
    // Authorization-less request that 401s again — skip the wasted round-trip
    // and surface the original error instead.
    const refreshed = await tokens.refresh();
    if (!refreshed) throw err;
    return await op(createMastraClient(refreshed));
  }
}
