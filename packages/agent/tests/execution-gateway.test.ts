import { MASTRA_RESOURCE_ID_KEY, RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import {
  createExecutionGateway,
  type ExecutionGatewayOptions,
} from '../src/execution-gateway.js';

function app(boundUserId?: string, options: ExecutionGatewayOptions = {}) {
  const instance = new Hono();
  instance.use('*', async (c, next) => {
    const requestContext = new RequestContext();
    if (boundUserId) requestContext.set(MASTRA_RESOURCE_ID_KEY, boundUserId);
    (c as never as { set: (key: string, value: unknown) => void })
      .set('requestContext', requestContext);
    await next();
  });
  instance.use('*', createExecutionGateway(options) as unknown as MiddlewareHandler);
  instance.all('*', (c) => c.json({ reached: true }));
  return instance;
}

describe('execution gateway', () => {
  it('allows the owned chat route but hides generic agent execution', async () => {
    const gateway = app('user-1');

    expect((await gateway.request('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })).status).toBe(200);

    const blocked = await gateway.request('/api/agents/ncMedicaidAgent/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(blocked.status).toBe(404);
    expect(await blocked.json()).toEqual({
      error: { code: 'not_found', message: 'Not found' },
    });
  });

  it('requires authentication for owned data routes but not health or preflight', async () => {
    const gateway = app();

    expect((await gateway.request('/corpus-status')).status).toBe(401);
    expect((await gateway.request('/livez')).status).toBe(200);
    expect((await gateway.request('/chat', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.example.test',
        'access-control-request-method': 'POST',
      },
    })).status).toBe(200);
  });

  it('can preserve only the legacy deep-research calls needed until PR 3', async () => {
    const gateway = app('user-1', { allowLegacyResearchWorkflow: true });

    for (const path of [
      '/api/workflows/deepResearchWorkflow/create-run',
      '/api/workflows/deepResearchWorkflow/start-async',
      '/api/workflows/deepResearchWorkflow/resume-async',
    ]) {
      expect((await gateway.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })).status).toBe(200);
    }

    expect((await gateway.request('/api/workflows/otherWorkflow/start-async', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })).status).toBe(404);
  });

  it.each([
    ['GET', '/feedback'],
    ['POST', '/feedback'],
    ['DELETE', '/feedback/f-1'],
    ['GET', '/corpus-status'],
    ['GET', '/api/memory/threads'],
    ['POST', '/api/memory/threads'],
    ['GET', '/api/memory/threads/t-1'],
    ['PATCH', '/api/memory/threads/t-1'],
    ['DELETE', '/api/memory/threads/t-1'],
    ['GET', '/api/memory/threads/t-1/messages'],
    ['POST', '/api/memory/threads/t-1/clone'],
  ])('allows the required owned operation %s %s', async (method, path) => {
    expect((await app('user-1').request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: ['POST', 'PATCH'].includes(method) ? '{}' : undefined,
    })).status).toBe(200);
  });

  it.each([
    ['POST', '/api/agents/ncMedicaidAgent/stream'],
    ['POST', '/api/agents/ncMedicaidAgent/tools/searchSections/execute'],
    ['GET', '/api/agents'],
    ['GET', '/api/workflows'],
    ['POST', '/api/workflows/deepResearchWorkflow/stream'],
    ['POST', '/api/memory/save-messages'],
  ])('hides unowned framework operation %s %s', async (method, path) => {
    expect((await app('user-1', { allowLegacyResearchWorkflow: true }).request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'POST' ? '{}' : undefined,
    })).status).toBe(404);
  });
});
