import { MastraClient } from '@mastra/client-js';

const MASTRA_URL = process.env.NEXT_PUBLIC_MASTRA_URL || 'http://localhost:4111';

/** Create a MastraClient with an optional auth token. */
export function createMastraClient(accessToken?: string) {
  return new MastraClient({
    baseUrl: MASTRA_URL,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
}
