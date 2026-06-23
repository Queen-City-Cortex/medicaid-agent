'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MastraClient } from '@mastra/client-js';
import { useAccessToken } from '@workos-inc/authkit-nextjs/components';
import { createMastraClient, runWithFreshAuth } from './mastra-client';

/**
 * Returns a MastraClient that automatically includes the current user's
 * WorkOS access token in the Authorization header.
 *
 * The client is recreated when the token changes (refresh).
 */
export function useMastraClient() {
  const { accessToken } = useAccessToken();
  return useMemo(() => createMastraClient(accessToken ?? undefined), [accessToken]);
}

/** True once the WorkOS access token is available. */
export function useMastraReady(): boolean {
  const { accessToken } = useAccessToken();
  return !!accessToken;
}

export type MastraRunner = <T>(op: (client: MastraClient) => Promise<T>) => Promise<T>;

/**
 * Returns a stable `run` that executes a Mastra memory/thread operation
 * against a client built from a freshly-fetched WorkOS token, transparently
 * refreshing + retrying once on a 401 (see `runWithFreshAuth`).
 *
 * Use this for thread CRUD / list / load — anything that must survive the
 * access token expiring mid-session. Unlike `useMastraClient` (which bakes a
 * render-time token snapshot into the client), `run` fetches the token at call
 * time. The returned function is referentially stable across renders (the live
 * WorkOS callbacks are read through a ref) so callers can safely use it in
 * effect/callback dependency arrays without triggering refetch loops.
 */
export function useMastraClientRunner(): { run: MastraRunner } {
  const { getAccessToken, refresh } = useAccessToken();
  // Keep the latest WorkOS callbacks in a ref so `run` can stay referentially
  // stable (empty deps) yet always call the current ones. Synced in an effect
  // rather than during render (refs must not be written while rendering).
  const tokensRef = useRef({ getAccessToken, refresh });
  useEffect(() => {
    tokensRef.current = { getAccessToken, refresh };
  }, [getAccessToken, refresh]);
  const run = useCallback(
    <T,>(op: (client: MastraClient) => Promise<T>): Promise<T> =>
      runWithFreshAuth(
        {
          getAccessToken: () => tokensRef.current.getAccessToken(),
          refresh: () => tokensRef.current.refresh(),
        },
        op,
      ),
    [],
  );
  return { run };
}
