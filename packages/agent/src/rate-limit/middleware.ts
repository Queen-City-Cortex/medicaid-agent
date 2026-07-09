import type { ContextWithMastra } from '@mastra/core/server';
import type { Next } from 'hono';
import { intEnv } from '../env.js';
import { getBoundUserId } from '../auth-middleware.js';
import { log, errorFields } from '../logger.js';
import { Sentry } from '../sentry.js';
import type { RateLimitRepository, RateLimitRoute } from './repository.js';

/** Explicit middleware type: inferred Hono types are non-portable in
 *  declaration emit (TS2883 — same lesson as the reranker's model router). */
export type GuardMiddleware = (c: ContextWithMastra, next: Next) => Promise<Response | void>;

/**
 * Which requests count against the per-user quota: the two calls that start
 * an (expensive) agent run. Reads, feedback, thread listing, resume, and
 * healthz are uncounted.
 */
function countedRoute(c: ContextWithMastra): RateLimitRoute | null {
  if (c.req.method !== 'POST') return null;
  const path = c.req.path;
  if (path === '/chat') return 'chat';
  if (/^\/api\/workflows\/deepResearchWorkflow\/.*start/.test(path)) return 'deep-research';
  return null;
}

/**
 * Rejects oversized chat bodies on the Content-Length header alone — no body
 * read, so a multi-hundred-MB payload is refused before it is ever parsed.
 * The body carries the whole thread history (useChat transport), so the cap
 * is per-request, not per-message; MessageLengthGuard enforces the
 * per-message limit in the processor chain.
 */
export function createBodySizeGuard(): GuardMiddleware {
  return async function bodySizeGuard(c: ContextWithMastra, next: Next): Promise<Response | void> {
    const maxBytes = intEnv('MAX_BODY_BYTES', 2 * 1024 * 1024);
    if (maxBytes > 0 && countedRoute(c) !== null) {
      const rawLength = c.req.header('content-length');
      // A chunked / lengthless body would otherwise skip the cap and get
      // buffered downstream unbounded. The web client always sends
      // Content-Length for its JSON body, so requiring it here only rejects
      // direct callers that omit it — reject rather than let an unmeasured
      // body through.
      if (rawLength === undefined) {
        return c.json(
          { error: 'payload_too_large', message: 'Requests must include a Content-Length header.' },
          413,
        );
      }
      const contentLength = Number(rawLength);
      if (!Number.isFinite(contentLength) || contentLength > maxBytes) {
        return c.json(
          {
            error: 'payload_too_large',
            message: 'That request is too large. Start a new conversation or shorten your message.',
          },
          413,
        );
      }
    }
    await next();
  };
}

/**
 * Per-user sliding-window rate limit on agent-run starts. Reads the user id
 * bound by createResourceBindingMiddleware (which must run earlier in the
 * middleware array — Mastra's own auth is per-route and runs too late).
 * Fails OPEN on storage errors — a limiter outage must not take down chat —
 * and requests with no bound user pass through (route-level auth 401s them).
 */
export function createRateLimitMiddleware(repo: RateLimitRepository): GuardMiddleware {
  return async function chatRateLimiter(c: ContextWithMastra, next: Next): Promise<Response | void> {
    const route = countedRoute(c);
    if (!route) {
      await next();
      return;
    }
    const userId = getBoundUserId(c);
    if (!userId) {
      await next();
      return;
    }

    try {
      const decision = await repo.checkAndRecord(userId, route);
      if (!decision.allowed) {
        const retryText =
          decision.retryAfterSeconds >= 3600
            ? `${Math.ceil(decision.retryAfterSeconds / 3600)} hour(s)`
            : `${Math.ceil(decision.retryAfterSeconds / 60)} minute(s)`;
        log.warn('rate_limit.blocked', { userId, route, window: decision.window, limit: decision.limit });
        c.header('Retry-After', String(decision.retryAfterSeconds));
        return c.json(
          {
            error: 'rate_limited',
            message: `You've reached the limit of ${decision.limit} messages per ${decision.window}. Please try again in ${retryText}.`,
            retryAfterSeconds: decision.retryAfterSeconds,
            limit: decision.limit,
            window: decision.window,
          },
          429,
        );
      }
    } catch (err) {
      log.error('rate_limit.failed_open', errorFields(err));
      Sentry.captureException(err, { tags: { component: 'rate-limit' } });
    }
    await next();
  };
}
