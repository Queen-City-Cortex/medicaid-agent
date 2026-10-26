import type { ContextWithMastra } from '@mastra/core/server';
import type { Next } from 'hono';
import { z } from 'zod';
import { getBoundUserId } from './auth-middleware.js';
import { log } from './logger.js';
import type { GuardMiddleware } from './rate-limit/middleware.js';

type BodySchema = z.ZodType<{ title?: string; resourceId?: string }>;

interface RouteRule {
  methods: ReadonlySet<string>;
  pattern: RegExp;
  public: boolean;
  rejectedQuery: readonly string[];
  returnsThread: boolean;
  bodies: Readonly<Record<string, BodySchema>>;
  fixedErrors: boolean;
}

function rule(
  methods: string[],
  pattern: RegExp,
  options: Partial<Omit<RouteRule, 'methods' | 'pattern'>> = {},
): RouteRule {
  return {
    methods: new Set(methods),
    pattern,
    public: options.public ?? false,
    rejectedQuery: options.rejectedQuery ?? [],
    returnsThread: options.returnsThread ?? false,
    bodies: options.bodies ?? {},
    fixedErrors: options.fixedErrors ?? false,
  };
}

/** A rename or a copy may carry a longer title than the 60 characters the
 * chat route gives a new thread. */
const THREAD_TITLE_MAX = 200;
/** An allowed thread body is a title and an id; this is many times that. */
const THREAD_BODY_MAX_BYTES = 4096;
const threadTitle = z.string().min(1).max(THREAD_TITLE_MAX);

// Everything a client may put in a thread request, by method; any other key is
// refused. The framework stores `metadata` as sent and gives `metadata.mastra`
// to the model as system messages, past every input guard, so no client may
// write it. A copy may repeat `resourceId`, which must name the signed-in user.
const UPDATE_THREAD = { PATCH: z.object({ title: threadTitle }).strict() };
const CLONE_THREAD = { POST: z.object({
  title: threadTitle.optional(),
  resourceId: z.string().optional(),
}).strict() };

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
  // List only. The chat route creates a thread, after the identifier screen
  // and the ownership check; the framework's create route screens nothing.
  rule(['GET'], /^\/api\/memory\/threads$/, { returnsThread: true, fixedErrors: true }),
  rule(['GET', 'PATCH', 'DELETE'], /^\/api\/memory\/threads\/[^/]+$/, { returnsThread: true, fixedErrors: true, bodies: UPDATE_THREAD }),
  // The framework resolves `include` message ids without an owner filter, so
  // it would return another user's messages. The application never sends it.
  rule(['GET'], /^\/api\/memory\/threads\/[^/]+\/messages$/, { rejectedQuery: ['include'], fixedErrors: true }),
  rule(['POST'], /^\/api\/memory\/threads\/[^/]+\/clone$/, { returnsThread: true, fixedErrors: true, bodies: CLONE_THREAD }),
];

function badRequest(c: ContextWithMastra, message: string): Response {
  return c.json({ error: { code: 'bad_request', message } }, 400);
}

function notFound(c: ContextWithMastra): Response {
  return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
}

// The installed server (@mastra/deployer 1.79.0, createHonoServer) registers
// these before `server.middleware`: the browser screencast routes, including
// the WebSocket upgrade and its ticket, and its own health check. The gateway never sees
// them. They are refused by `createFrameworkRouteRefusal`, which runs ahead of
// them; `/health` is refused rather than ruled public because nothing uses it
// (Railway probes /readyz, the ops scripts /healthz). Keep this list equal to
// the set server-isolation.test.ts pins.
const ROUTES_AHEAD_OF_GATEWAY: readonly RegExp[] = [
  /^\/health$/,
  /^\/browser\/[^/]+\/stream$/,
  /^\/api\/agents\/[^/]+\/browser\/(?:session|close|stream-ticket)$/,
];

/** Answers the gateway's 404 to the routes the framework registers ahead of
 *  it, for every method and caller, and passes everything else on. It must
 *  be registered before those routes (see `refuseFrameworkRoutes`). */
export function createFrameworkRouteRefusal(): GuardMiddleware {
  return async function frameworkRouteRefusal(c: ContextWithMastra, next: Next): Promise<Response | void> {
    if (ROUTES_AHEAD_OF_GATEWAY.some((pattern) => pattern.test(c.req.path))) {
      return notFound(c);
    }
    await next();
  };
}

/** Reads at most `limit` bytes of the body from a copy of the request, or
 * returns null when it is longer. The framework's handler and its body-size
 * check read the original stream afterwards, and a stream can be read once. */
async function boundedBody(request: Request, limit: number): Promise<string | null> {
  const reader = request.clone().body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader?.read();
    if (!chunk || chunk.done) break;
    size += chunk.value.length;
    if (size > limit) {
      // Not awaited: a copy's cancel settles only once the original is cancelled too.
      void reader?.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Checks a request body against its route's schema and returns the refusal,
 * or null to continue. Nothing is rewritten, so what was checked is what the
 * framework parses. */
async function refusedBody(c: ContextWithMastra, schema: BodySchema, userId: string | null): Promise<Response | null> {
  const text = await boundedBody(c.req.raw, THREAD_BODY_MAX_BYTES);
  if (text === null) {
    return c.json({ error: { code: 'payload_too_large', message: 'Request body is too large' } }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return badRequest(c, 'Request body must be JSON');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return badRequest(c, parsed.error.issues.every((issue) => issue.path[0] === 'title')
      ? `A conversation title must be 1 to ${THREAD_TITLE_MAX} characters`
      : 'A conversation request may set a title only; other fields, including metadata, are not supported');
  }
  if (parsed.data.resourceId !== undefined && parsed.data.resourceId !== userId) {
    return badRequest(c, 'resourceId must be the signed-in user');
  }
  return null;
}

const FIXED_ERRORS: Readonly<Record<number, { code: string; message: string }>> = {
  400: { code: 'bad_request', message: 'The request was not valid.' },
  401: { code: 'unauthorized', message: 'Authentication required' },
  403: { code: 'forbidden', message: 'You do not have access to this conversation.' },
  404: { code: 'not_found', message: 'Conversation not found.' },
};
const FIXED_SERVER_ERROR = { code: 'internal_error', message: 'The conversation could not be loaded or saved. Please try again.' };

/** The framework's memory handlers answer a failure with the raw error, which
 * for a storage failure names tables and SQL. The client gets the status and a
 * fixed message. A server error's own text goes to the log; a client error's
 * text can quote the request, so only its status is logged, and the route is
 * logged as its pattern because a path holds a client-chosen thread id. Any
 * other client error, such as a rate limit, is the application's own and passes. */
async function withFixedError(route: RouteRule, method: string, response: Response): Promise<Response> {
  const status = response.status;
  if (status < 500 && !FIXED_ERRORS[status]) return response;
  const fields: Record<string, unknown> = { method, route: route.pattern.source, status };
  if (status >= 500) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    fields.error = typeof body?.error === 'string' ? body.error : 'unreadable error body';
    log.warn('memory_route.failed', fields);
  } else {
    log.info('memory_route.refused', fields);
  }
  // Keep the response's own headers (CORS among them); only the body changes.
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify({ error: FIXED_ERRORS[status] ?? FIXED_SERVER_ERROR }), { status, headers });
}

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
      const bodySchema = route.bodies[c.req.method.toUpperCase()];
      if (bodySchema) {
        const refusal = await refusedBody(c, bodySchema, getBoundUserId(c));
        if (refusal) return refusal;
      }
      await next();
      const failed = route.fixedErrors && c.res.status >= 400;
      if (failed || route.returnsThread) {
        const response = failed
          ? await withFixedError(route, c.req.method.toUpperCase(), c.res)
          : await withoutFrameworkMetadata(c.res);
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
    return notFound(c);
  };
}
