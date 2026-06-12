'use client';

import { useEffect, useState } from 'react';
import { useAccessToken } from '@workos-inc/authkit-nextjs/components';

const MASTRA_URL = process.env.NEXT_PUBLIC_MASTRA_URL || 'http://localhost:4111';

export interface CorpusStatus {
  /** ISO timestamp of the most recent document (re-)index, or null if unknown. */
  lastUpdated: string | null;
  documentCount: number;
}

/**
 * Fetches the corpus freshness signal shown in the empty state.
 *
 * Contract:
 * - Returns null until loaded; stays null on any failure (the UI renders
 *   nothing rather than an invented date — a wrong freshness claim is worse
 *   than no claim).
 * - Fetches once per mount; the server caches the value, so no polling.
 */
export function useCorpusStatus(): CorpusStatus | null {
  const { getAccessToken } = useAccessToken();
  const [status, setStatus] = useState<CorpusStatus | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch(`${MASTRA_URL}/corpus-status`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        });
        if (!res.ok) return;
        const body = (await res.json()) as CorpusStatus;
        if (active && body && typeof body.documentCount === 'number') {
          setStatus(body);
        }
      } catch {
        // Leave status null — the empty state simply omits the line.
      }
    })();
    return () => {
      active = false;
    };
  }, [getAccessToken]);

  return status;
}
