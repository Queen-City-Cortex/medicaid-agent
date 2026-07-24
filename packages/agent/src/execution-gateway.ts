import type { ContextWithMastra } from '@mastra/core/server';
import type { Next } from 'hono';
import { getBoundUserId } from './auth-middleware.js';
import type { GuardMiddleware } from './rate-limit/middleware.js';

interface RouteRule {
  methods: ReadonlySet<string>;
  pattern: RegExp;
  public: boolean;
}

function rule(methods: string[], pattern: RegExp, options: { public?: boolean } = {}): RouteRule {
  return {
    methods: new Set(methods),
    pattern,
    public: options.public ?? false,
  };
}

// Positive list only: framework upgrades may add executable routes, and those
// routes must remain unreachable until the application explicitly adopts them.
const OWNED_ROUTES: readonly RouteRule[] = [
  rule(['POST'], /^\/chat$/),
  rule(['GET', 'POST'], /^\/feedback$/),
  rule(['DELETE'], /^\/feedback\/[^/]+$/),
  rule(['GET'], /^\/corpus-status$/),
  rule(['GET'], /^\/(?:livez|readyz|dependencyz|healthz)$/, { public: true }),
  rule(['GET', 'POST'], /^\/api\/memory\/threads$/),
  rule(['GET', 'PATCH', 'DELETE'], /^\/api\/memory\/threads\/[^/]+$/),
  rule(['GET'], /^\/api\/memory\/threads\/[^/]+\/messages$/),
  rule(['POST'], /^\/api\/memory\/threads\/[^/]+\/clone$/),
];

const LEGACY_RESEARCH_ROUTES: readonly RouteRule[] = [
  rule(['POST'], /^\/api\/workflows\/deepResearchWorkflow\/create-run$/),
  rule(['POST'], /^\/api\/workflows\/deepResearchWorkflow\/start-async$/),
  rule(['POST'], /^\/api\/workflows\/deepResearchWorkflow\/resume-async$/),
];

function matchingRule(
  method: string,
  path: string,
  allowLegacyResearchWorkflow: boolean,
): RouteRule | null {
  const candidates = allowLegacyResearchWorkflow
    ? [...OWNED_ROUTES, ...LEGACY_RESEARCH_ROUTES]
    : OWNED_ROUTES;
  const upperMethod = method.toUpperCase();
  if (upperMethod === 'OPTIONS') {
    return candidates.find((candidate) => candidate.pattern.test(path)) ?? null;
  }
  return candidates.find((candidate) =>
    candidate.methods.has(upperMethod) && candidate.pattern.test(path)) ?? null;
}

export interface ExecutionGatewayOptions {
  allowStudio?: boolean;
  allowLegacyResearchWorkflow?: boolean;
}

export function createExecutionGateway(options: ExecutionGatewayOptions = {}): GuardMiddleware {
  return async function executionGateway(c: ContextWithMastra, next: Next): Promise<Response | void> {
    const route = matchingRule(
      c.req.method,
      c.req.path,
      options.allowLegacyResearchWorkflow ?? false,
    );
    if (route) {
      if (c.req.method.toUpperCase() !== 'OPTIONS' && !route.public && !getBoundUserId(c)) {
        return c.json({
          error: { code: 'unauthorized', message: 'Authentication required' },
        }, 401);
      }
      await next();
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
