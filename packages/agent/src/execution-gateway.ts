import type { ContextWithMastra } from '@mastra/core/server';
import type { Next } from 'hono';
import { getBoundUserId } from './auth-middleware.js';
import type { GuardMiddleware } from './rate-limit/middleware.js';

interface RouteRule {
  methods: ReadonlySet<string>;
  pattern: RegExp;
  public: boolean;
  rejectedQuery: readonly string[];
  returnsThread: boolean;
}

function rule(
  methods: string[],
  pattern: RegExp,
  options: { public?: boolean; rejectedQuery?: string[]; returnsThread?: boolean } = {},
): RouteRule {
  return {
    methods: new Set(methods),
    pattern,
    public: options.public ?? false,
    rejectedQuery: options.rejectedQuery ?? [],
    returnsThread: options.returnsThread ?? false,
  };
}

// Positive list only: framework upgrades may add executable routes, and those
// routes must remain unreachable until the application explicitly adopts them.
const OWNED_ROUTES: readonly RouteRule[] = [
  rule(['POST'], /^\/chat$/),
  rule(['GET', 'POST'], /^\/feedback$/),
  rule(['DELETE'], /^\/feedback\/[^/]+$/),
  rule(['GET'], /^\/corpus-status$/),
  rule(['POST'], /^\/research\/runs$/),
  rule(['GET'], /^\/research\/runs\/[^/]+$/),
  rule(['POST'], /^\/research\/runs\/[^/]+\/(?:decision|cancel)$/),
  rule(['GET'], /^\/(?:livez|readyz|dependencyz|healthz)$/, { public: true }),
  rule(['GET', 'POST'], /^\/api\/memory\/threads$/, { returnsThread: true }),
  rule(['GET', 'PATCH', 'DELETE'], /^\/api\/memory\/threads\/[^/]+$/, { returnsThread: true }),
  // The framework resolves `include` message ids without an owner filter, so
  // it would return another user's messages. The application never sends it.
  rule(['GET'], /^\/api\/memory\/threads\/[^/]+\/messages$/, { rejectedQuery: ['include'] }),
  rule(['POST'], /^\/api\/memory\/threads\/[^/]+\/clone$/, { returnsThread: true }),
];

/** The framework keeps observational-memory state under `metadata.mastra` on
 * the thread row, including the observer's unverified task and suggested
 * response. It reads that back from storage, so the row keeps it and only the
 * response loses it. A thread arrives alone, in a list, or beside its clone. */
async function withoutFrameworkMetadata(response: Response): Promise<Response> {
  if (!response.headers.get('content-type')?.includes('application/json')) return response;
  const body = await response.json() as Record<string, unknown> | null;
  const candidates = [body, body?.thread, ...(Array.isArray(body?.threads) ? body.threads : [])];
  for (const thread of candidates as Array<{ metadata?: Record<string, unknown> } | null | undefined>) {
    if (thread?.metadata && typeof thread.metadata === 'object') delete thread.metadata.mastra;
  }
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(JSON.stringify(body), { status: response.status, headers });
}

function matchingRule(
  method: string,
  path: string,
): RouteRule | null {
  const upperMethod = method.toUpperCase();
  if (upperMethod === 'OPTIONS') {
    return OWNED_ROUTES.find((candidate) => candidate.pattern.test(path)) ?? null;
  }
  return OWNED_ROUTES.find((candidate) =>
    candidate.methods.has(upperMethod) && candidate.pattern.test(path)) ?? null;
}

export interface ExecutionGatewayOptions {
  allowStudio?: boolean;
}

export function createExecutionGateway(options: ExecutionGatewayOptions = {}): GuardMiddleware {
  return async function executionGateway(c: ContextWithMastra, next: Next): Promise<Response | void> {
    const route = matchingRule(c.req.method, c.req.path);
    if (route) {
      if (c.req.method.toUpperCase() !== 'OPTIONS' && !route.public && !getBoundUserId(c)) {
        return c.json({
          error: { code: 'unauthorized', message: 'Authentication required' },
        }, 401);
      }
      // URLSearchParams decodes keys, so an encoded name cannot slip through.
      const query = new URL(c.req.url).searchParams;
      const rejected = route.rejectedQuery.find((name) => query.has(name));
      if (rejected) {
        return c.json({
          error: { code: 'bad_request', message: `Query parameter "${rejected}" is not supported` },
        }, 400);
      }
      await next();
      if (route.returnsThread) {
        const response = await withoutFrameworkMetadata(c.res);
        // Hono merges into an existing response; clear it to replace the body.
        c.res = undefined;
        c.res = response;
      }
      return;
    }

    // Mastra Studio is a local developer tool, never a production API.
    if (options.allowStudio && process.env.NODE_ENV !== 'production') {
      await next();
      return;
    }
    return c.json({
      error: { code: 'not_found', message: 'Not found' },
    }, 404);
  };
}
