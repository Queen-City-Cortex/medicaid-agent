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

  it('allows owned research routes and hides every generic workflow route', async () => {
    const gateway = app('user-1');
    for (const [method, path] of [
      ['POST', '/research/runs'],
      ['GET', '/research/runs/run-1'],
      ['GET', '/research/runs/current'],
      ['POST', '/research/runs/run-1/decision'],
      ['POST', '/research/runs/run-1/cancel'],
    ]) {
      expect((await gateway.request(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'POST' ? '{}' : undefined,
      })).status).toBe(200);
    }

    for (const path of [
      '/api/workflows/deepResearchWorkflow/create-run',
      '/api/workflows/deepResearchWorkflow/start-async',
      '/api/workflows/deepResearchWorkflow/resume-async',
    ]) {
      expect((await gateway.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })).status).toBe(404);
    }
  });

  it.each([
    ['GET', '/feedback'],
    ['POST', '/feedback'],
    ['DELETE', '/feedback/f-1'],
    ['GET', '/corpus-status'],
    ['GET', '/api/memory/threads'],
    ['GET', '/api/memory/threads/t-1'],
    ['PATCH', '/api/memory/threads/t-1', '{"title":"Renamed"}'],
    ['DELETE', '/api/memory/threads/t-1'],
    ['GET', '/api/memory/threads/t-1/messages'],
    ['POST', '/api/memory/threads/t-1/clone'],
  ])('allows the required owned operation %s %s', async (method, path, body = '{}') => {
    expect((await app('user-1').request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: ['POST', 'PATCH'].includes(method) ? body : undefined,
    })).status).toBe(200);
  });

  it('refuses a thread body that is not JSON or is larger than a title needs', async () => {
    const send = (body: string) => app('user-1').request('/api/memory/threads/t-1', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    });
    for (const body of ['', 'title=Renamed', '[]', 'null']) expect((await send(body)).status).toBe(400);
    const large = await send(JSON.stringify({ title: 'Renamed', padding: 'x'.repeat(4096) }));
    expect(large.status).toBe(413);
    expect(await large.json()).toEqual({ error: { code: 'payload_too_large', message: 'Request body is too large' } });
    // The body is still there for the framework's handler to read.
    const reads = new Hono();
    reads.use('*', async (c, next) => {
      (c as never as { set: (key: string, value: unknown) => void })
        .set('requestContext', new RequestContext([[MASTRA_RESOURCE_ID_KEY, 'user-1']]));
      await next();
    });
    reads.use('*', createExecutionGateway() as unknown as MiddlewareHandler);
    reads.patch('*', async (c) => c.json(await c.req.json()));
    const passed = await reads.request('/api/memory/threads/t-1', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"title":"Renamed"}',
    });
    expect(await passed.json()).toEqual({ title: 'Renamed' });
  });

  it('replaces a framework error body on a thread route and leaves an application refusal alone', async () => {
    const failing = (status: number, body: unknown) => {
      const instance = new Hono();
      instance.use('*', async (c, next) => {
        (c as never as { set: (key: string, value: unknown) => void })
          .set('requestContext', new RequestContext([[MASTRA_RESOURCE_ID_KEY, 'user-1']]));
        await next();
      });
      instance.use('*', createExecutionGateway() as unknown as MiddlewareHandler);
      instance.all('*', (c) => {
        // Stands in for a header an outer layer (CORS) already put on the response.
        c.header('access-control-allow-origin', 'https://app.example');
        return c.json(body as object, status as 500);
      });
      return instance.request('/api/memory/threads/t-1');
    };
    const raw = await failing(500, { error: 'SQLITE_ERROR: no such table: mastra_threads' });
    expect(raw.status).toBe(500);
    // Only the body is replaced: a browser on another origin must still be able to read it.
    expect(raw.headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect(raw.headers.get('content-type')).toContain('application/json');
    expect(await raw.text()).not.toContain('SQLITE');
    const limited = { error: { code: 'rate_limited', message: 'Too many requests', retryAfterSeconds: 60 } };
    const passed = await failing(429, limited);
    expect(passed.status).toBe(429);
    expect(await passed.json()).toEqual(limited);
  });

  it('refuses the message include parameter, which the framework does not scope by owner', async () => {
    for (const query of ['include=%5B%5D', 'include', 'agentId=a&include=x', '%69nclude=x']) {
      const response = await app('user-1').request(`/api/memory/threads/t-1/messages?${query}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: { code: 'bad_request', message: 'Query parameter "include" is not supported' },
      });
    }
    expect((await app('user-1').request('/api/memory/threads/t-1/messages?page=0&perPage=40')).status).toBe(200);
    expect((await app().request('/api/memory/threads/t-1/messages?include=x')).status).toBe(401);
  });

  it.each([
    ['POST', '/api/agents/ncMedicaidAgent/stream'],
    ['POST', '/api/agents/ncMedicaidAgent/tools/searchSections/execute'],
    ['GET', '/api/agents'],
    ['GET', '/api/workflows'],
    ['POST', '/api/workflows/deepResearchWorkflow/stream'],
    ['POST', '/api/memory/save-messages'],
  ])('hides unowned framework operation %s %s', async (method, path) => {
    expect((await app('user-1').request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'POST' ? '{}' : undefined,
    })).status).toBe(404);
  });

  it('does not let a client create a thread: the chat route creates it after the identifier screen', async () => {
    const created = await app('user-1').request('/api/memory/threads?agentId=ncMedicaidAgent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ threadId: 't-new', resourceId: 'user-1', agentId: 'ncMedicaidAgent', title: 'SSN 123-45-6789' }),
    });
    expect(created.status).toBe(404);
    expect(await created.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
    // The list on the same path, and the cross-origin preflight for it, still pass.
    expect((await app('user-1').request('/api/memory/threads?agentId=ncMedicaidAgent')).status).toBe(200);
    expect((await app().request('/api/memory/threads', { method: 'OPTIONS' })).status).toBe(200);
  });
});
