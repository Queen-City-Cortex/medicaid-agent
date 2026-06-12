import { MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context';
import type { Context, Next } from 'hono';

/**
 * Binds Mastra memory access to the authenticated user.
 *
 * Mastra treats MASTRA_RESOURCE_ID_KEY in the request context as
 * authoritative over any client-supplied `memory.resource` / `resourceId`
 * (agent streams, memory API routes), and @mastra/memory rejects threads
 * owned by a different resource. Without this middleware the resource id is
 * entirely client-supplied, so any authenticated user could read, write, or
 * delete any other user's threads, messages, and working memory (IDOR).
 *
 * Must be registered as server middleware AFTER auth — Mastra mounts
 * `server.middleware` after its auth middleware, which stores the
 * authenticated user in the request context under 'user'.
 */
export async function bindResourceToAuthenticatedUser(c: Context, next: Next) {
  const rc = (c as any).get('requestContext');
  const user = rc?.get?.('user') as { userId?: string; id?: string } | undefined;
  const userId = user?.userId ?? user?.id;
  if (userId && rc?.set) {
    rc.set(MASTRA_RESOURCE_ID_KEY, String(userId));
  }
  await next();
}
