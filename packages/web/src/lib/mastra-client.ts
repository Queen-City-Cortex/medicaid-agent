import { MastraClient } from '@mastra/client-js';

export const mastraClient = new MastraClient({
  baseUrl: process.env.NEXT_PUBLIC_MASTRA_URL || 'http://localhost:4111',
});
