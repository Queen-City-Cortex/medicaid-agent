import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { MASTRA_RESOURCE_ID_KEY, RequestContext } from '@mastra/core/request-context';
import { createBodySizeGuard, createRateLimitMiddleware } from '../../src/rate-limit/middleware.js';
import { RateLimitRepository } from '../../src/rate-limit/repository.js';

// Same nominal-Hono-copy cast as auth-middleware.test.ts: the middleware is
// typed against Mastra's vendored hono Context. The rate limiter reads the
// resource id bound by createResourceBindingMiddleware, which runs earlier in
// the middleware array — simulated here by seeding MASTRA_RESOURCE_ID_KEY.
function buildApp(middleware: unknown, boundUserId?: string) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    const rc = new RequestContext();
    if (boundUserId !== undefined) rc.set(MASTRA_RESOURCE_ID_KEY, boundUserId);
    (c as any).set('requestContext', rc);
    await next();
  });
  app.use('*', middleware as MiddlewareHandler);
  app.post('/chat', (c) => c.json({ ok: true }));
  app.get('/chat', (c) => c.json({ ok: true }));
  app.post('/feedback', (c) => c.json({ ok: true }));
  app.post('/api/workflows/deepResearchWorkflow/startAsync', (c) => c.json({ ok: true }));
  return app;
}

describe('createRateLimitMiddleware', () => {
  let repo: RateLimitRepository;

  beforeEach(() => {
    repo = new RateLimitRepository(':memory:');
    process.env.RATE_LIMIT_MESSAGES_PER_HOUR = '2';
    process.env.RATE_LIMIT_MESSAGES_PER_DAY = '100';
  });

  afterEach(() => {
    delete process.env.RATE_LIMIT_MESSAGES_PER_HOUR;
    delete process.env.RATE_LIMIT_MESSAGES_PER_DAY;
  });

  it('passes requests under the limit and 429s over it with a renderable body', async () => {
    const app = buildApp(createRateLimitMiddleware(repo), 'user_A');
    expect((await app.request('/chat', { method: 'POST' })).status).toBe(200);
    expect((await app.request('/chat', { method: 'POST' })).status).toBe(200);

    const denied = await app.request('/chat', { method: 'POST' });
    expect(denied.status).toBe(429);
    expect(denied.headers.get('Retry-After')).toMatch(/^\d+$/);
    const body = await denied.json();
    expect(body).toMatchObject({ error: 'rate_limited', limit: 2, window: 'hour' });
    expect(body.message).toContain('limit of 2 messages per hour');
  });

  it('counts deep-research workflow starts against the same quota', async () => {
    const app = buildApp(createRateLimitMiddleware(repo), 'user_A');
    await app.request('/chat', { method: 'POST' });
    await app.request('/api/workflows/deepResearchWorkflow/startAsync', { method: 'POST' });
    const denied = await app.request('/chat', { method: 'POST' });
    expect(denied.status).toBe(429);
  });

  it('does not count GET /chat or feedback posts', async () => {
    const app = buildApp(createRateLimitMiddleware(repo), 'user_A');
    for (let i = 0; i < 5; i++) {
      expect((await app.request('/chat', { method: 'GET' })).status).toBe(200);
      expect((await app.request('/feedback', { method: 'POST' })).status).toBe(200);
    }
    expect((await app.request('/chat', { method: 'POST' })).status).toBe(200);
  });

  it('passes through when no user was bound (route-level auth 401s those)', async () => {
    const app = buildApp(createRateLimitMiddleware(repo));
    for (let i = 0; i < 5; i++) {
      expect((await app.request('/chat', { method: 'POST' })).status).toBe(200);
    }
  });

  it('fails OPEN when the repository throws', async () => {
    vi.spyOn(repo, 'checkAndRecord').mockRejectedValue(new Error('disk full'));
    const app = buildApp(createRateLimitMiddleware(repo), 'user_A');
    expect((await app.request('/chat', { method: 'POST' })).status).toBe(200);
  });
});

describe('createBodySizeGuard', () => {
  afterEach(() => {
    delete process.env.MAX_BODY_BYTES;
  });

  it('413s a chat POST whose Content-Length exceeds the cap', async () => {
    process.env.MAX_BODY_BYTES = '100';
    const app = buildApp(createBodySizeGuard(), 'user_A');
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'content-length': '101' },
    });
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('payload_too_large');
  });

  it('passes a counted route under the cap', async () => {
    process.env.MAX_BODY_BYTES = '100';
    const app = buildApp(createBodySizeGuard(), 'user_A');
    expect((await app.request('/chat', { method: 'POST', headers: { 'content-length': '99' } })).status).toBe(200);
  });

  it('413s a counted route with no Content-Length (chunked bodies cannot skip the cap)', async () => {
    process.env.MAX_BODY_BYTES = '100';
    const app = buildApp(createBodySizeGuard(), 'user_A');
    // Hono only omits content-length when the body is truly absent.
    const res = await app.request('/chat', { method: 'POST' });
    expect(res.status).toBe(413);
  });

  it('does not police uncounted routes', async () => {
    process.env.MAX_BODY_BYTES = '100';
    const app = buildApp(createBodySizeGuard(), 'user_A');
    const res = await app.request('/feedback', {
      method: 'POST',
      headers: { 'content-length': '10000' },
    });
    expect(res.status).toBe(200);
  });
});
