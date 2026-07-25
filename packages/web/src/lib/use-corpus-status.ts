'use client';

import { useEffect, useState } from 'react';
import { useAccessToken } from '@workos-inc/authkit-nextjs/components';
import type { CorpusStatus } from '@nc-medicaid/contracts';
import { MASTRA_URL } from './mastra-url';

export type { CorpusStatus } from '@nc-medicaid/contracts';

/**
 * Fetches the corpus freshness signal shown in the empty state.
 *
 * Contract:
 * - Returns null until loaded; stays null on any failure (the UI renders
 *   nothing rather than an invented date — a wrong freshness claim is worse
 *   than no claim).
 * - Refreshes every minute so provider degradation becomes visible without a
 *   page reload. The server caches graph metadata while returning the current
 *   retrieval mode on every request.
 */
export function useCorpusStatus(): CorpusStatus | null {
  const { getAccessToken } = useAccessToken();
  const [status, setStatus] = useState<CorpusStatus | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const fetchStatus = async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch(`${MASTRA_URL}/corpus-status`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as CorpusStatus;
        if (active && body && typeof body.documentCount === 'number') {
          setStatus(body);
        }
      } catch {
        // Leave status null — the empty state simply omits the line.
      }
    };
    void fetchStatus();
    const interval = window.setInterval(() => void fetchStatus(), 60_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [getAccessToken]);

  return status;
}
