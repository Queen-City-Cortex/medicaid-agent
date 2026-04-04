'use client';

import { useMemo } from 'react';
import { useAccessToken } from '@workos-inc/authkit-nextjs/components';
import { createMastraClient } from './mastra-client';

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
