import { registerApiRoute, type ContextWithMastra } from '@mastra/core/server';
import {
  IdentifierSchema,
  ResearchDecisionInputSchema,
  ResearchStartInputSchema,
} from '@nc-medicaid/contracts';
import { resolveCoverageScope } from '@nc-medicaid/policy-corpus';
import { getBoundUserId } from '../auth-middleware.js';
import { findSensitiveIdentifiers } from '../sensitive-data.js';
import {
  ResearchStartRejectedError,
} from './repository.js';
import { ResearchService, type ResearchMastra } from './service.js';

function apiError(
  c: ContextWithMastra,
  status: 400 | 401 | 404 | 409 | 422 | 429,
  code: string,
  message: string,
): Response {
  return c.json({ error: { code, message } }, status);
}

async function parseBody(c: ContextWithMastra): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

export function createResearchHandlers(service: ResearchService) {
  const start = async (c: ContextWithMastra): Promise<Response> => {
    const resourceId = getBoundUserId(c);
    if (!resourceId) return apiError(c, 401, 'not_authenticated', 'Authentication is required.');
    const parsed = ResearchStartInputSchema.safeParse(await parseBody(c));
    if (!parsed.success) {
      return apiError(c, 400, 'invalid_request', 'Question must be between 1 and 10,000 characters.');
    }
    if (findSensitiveIdentifiers(parsed.data.question).length) {
      return apiError(
        c,
        422,
        'client_identifier_detected',
        'Remove client-identifying information before starting research.',
      );
    }

    const scope = resolveCoverageScope(parsed.data.question);
    if (scope?.notice) return apiError(c, 422, 'coverage-limitation', scope.notice);

    try {
      const run = await service.repository.create(
        crypto.randomUUID(),
        resourceId,
        parsed.data.question,
      );
      void service.plan(run.runId, c.get('mastra') as unknown as ResearchMastra);
      return c.json(run, 202);
    } catch (error) {
      if (error instanceof ResearchStartRejectedError) {
        return error.reason === 'active_run'
          ? apiError(c, 409, 'active_research_run', 'Only one active research run is allowed per user.')
          : apiError(c, 429, 'research_daily_quota', 'The daily limit is two research starts per user.');
      }
      throw error;
    }
  };

  const get = async (c: ContextWithMastra): Promise<Response> => {
    const resourceId = getBoundUserId(c);
    if (!resourceId) return apiError(c, 401, 'not_authenticated', 'Authentication is required.');
    const runId = IdentifierSchema.safeParse(c.req.param('runId'));
    if (!runId.success) {
      return apiError(c, 404, 'research_run_not_found', 'Research run not found.');
    }
    const run = await service.repository.get(runId.data, resourceId);
    return run
      ? c.json(run, 200)
      : apiError(c, 404, 'research_run_not_found', 'Research run not found.');
  };

  const decision = async (c: ContextWithMastra): Promise<Response> => {
    const resourceId = getBoundUserId(c);
    if (!resourceId) return apiError(c, 401, 'not_authenticated', 'Authentication is required.');
    const runId = IdentifierSchema.safeParse(c.req.param('runId'));
    const body = ResearchDecisionInputSchema.safeParse(await parseBody(c));
    if (!runId.success) {
      return apiError(c, 404, 'research_run_not_found', 'Research run not found.');
    }
    if (!body.success) {
      return apiError(c, 400, 'invalid_decision', 'The research decision is invalid.');
    }
    const result = await service.decide(
      runId.data,
      resourceId,
      body.data,
      c.get('mastra') as unknown as ResearchMastra,
    );
    if (result === 'not_found') {
      return apiError(c, 404, 'research_run_not_found', 'Research run not found.');
    }
    if (result === 'conflict') {
      return apiError(c, 409, 'invalid_research_state', 'The research run is not awaiting approval or capacity is unavailable.');
    }
    return c.json(await service.repository.get(runId.data, resourceId), 202);
  };

  const cancel = async (c: ContextWithMastra): Promise<Response> => {
    const resourceId = getBoundUserId(c);
    if (!resourceId) return apiError(c, 401, 'not_authenticated', 'Authentication is required.');
    const runId = IdentifierSchema.safeParse(c.req.param('runId'));
    if (!runId.success) {
      return apiError(c, 404, 'research_run_not_found', 'Research run not found.');
    }
    const cancelled = await service.cancel(
      runId.data,
      resourceId,
      c.get('mastra') as unknown as ResearchMastra,
    );
    return cancelled
      ? c.body(null, 204)
      : apiError(c, 404, 'research_run_not_found', 'Research run not found or is already terminal.');
  };

  return { start, get, decision, cancel };
}

export function researchApiRoutes(service: ResearchService) {
  const handlers = createResearchHandlers(service);
  return [
    registerApiRoute('/research/runs', { method: 'POST', handler: handlers.start }),
    registerApiRoute('/research/runs/:runId', { method: 'GET', handler: handlers.get }),
    registerApiRoute('/research/runs/:runId/decision', { method: 'POST', handler: handlers.decision }),
    registerApiRoute('/research/runs/:runId/cancel', { method: 'POST', handler: handlers.cancel }),
  ];
}
