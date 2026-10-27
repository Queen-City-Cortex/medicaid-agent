import { MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context';
import type { ContextWithMastra } from '@mastra/core/server';
import type { Next } from 'hono';
import { log, errorFields } from './logger.js';

/** The subset of MastraAuthWorkos the middleware needs — kept minimal so
 *  tests can stub it without WorkOS env or network. */
export interface TokenVerifier {
  authenticateToken(
    token: string,
    request?: unknown,
  ): Promise<{ userId?: string; id?: string } | null | undefined>;
}

/** The resource id for a verified user: its `userId`, else its `id`. */
export function userIdOf(user: { userId?: string; id?: string }): string | null {
  const userId = user.userId ?? user.id;
  return userId ? String(userId) : null;
}

/**
 * Resolves the authenticated user id at middleware time.
 *
 * Mastra authenticates per-route (`checkRouteAuth` inside route handling),
 * which runs AFTER `server.middleware`. Its legacy `user` context key can
 * already contain client input, so it cannot establish authenticated identity.
 * The middleware therefore verifies the Bearer token itself. The verifier is
 * a `MastraAuthWorkos` constructed with `trustJwtClaims: true`: a local
 * JWKS signature check (no per-request WorkOS API call) whose JWT-derived
 * `user.id` is the same WorkOS user id the route-level full path produces.
 *
 * Returns null for missing/invalid tokens — route-level auth 401s those.
 */
async function resolveAuthenticatedUserId(
  c: ContextWithMastra,
  verifier: TokenVerifier,
): Promise<string | null> {
  const authHeader = c.req.header('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!token) return null;
  try {
    const user = await verifier.authenticateToken(token, c.req.raw);
    return user ? userIdOf(user) : null;
  } catch (err) {
    log.warn('auth_middleware.token_verify_failed', errorFields(err));
    return null;
  }
}

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
 * Route-level authentication binds the same id later through
 * `AgentServerAuth.mapUserToResourceId`, but Mastra runs it after every
 * `server.middleware` entry. The gateway, the rate limiter and the application
 * routes need the user before then, so they read the MASTRA_RESOURCE_ID_KEY
 * bound here instead of re-verifying the token, and this must be first in the
 * `server.middleware` array.
 */
export function createResourceBindingMiddleware(verifier: TokenVerifier) {
  return async function bindResourceToAuthenticatedUser(c: ContextWithMastra, next: Next): Promise<void> {
    const rc = c.get('requestContext');
    // The framework's legacy user key is not reserved from client merges.
    // Per-route authentication will populate it with a verified user later.
    rc?.set?.('user', undefined);
    const userId = await resolveAuthenticatedUserId(c, verifier);
    if (rc?.set) {
      rc.set(MASTRA_RESOURCE_ID_KEY, userId ?? undefined);
    }
    await next();
  };
}

/** The user id bound by createResourceBindingMiddleware, or null for
 *  unauthenticated requests. For use by later server.middleware entries. */
export function getBoundUserId(c: ContextWithMastra): string | null {
  const rc = c.get('requestContext');
  const bound = rc?.get?.(MASTRA_RESOURCE_ID_KEY);
  return typeof bound === 'string' && bound ? bound : null;
}
