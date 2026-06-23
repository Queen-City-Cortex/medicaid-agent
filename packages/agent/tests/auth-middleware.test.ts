import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { MASTRA_RESOURCE_ID_KEY, RequestContext } from '@mastra/core/request-context';
import { bindResourceToAuthenticatedUser } from '../src/auth-middleware.js';

// bindResourceToAuthenticatedUser is typed against Mastra's vendored hono
// Context, which is a distinct nominal copy from the top-level `hono` package
// used to build these test apps. Cast at the registration boundary.
const asMiddleware = bindResourceToAuthenticatedUser as unknown as MiddlewareHandler;

// Mimics Mastra's server assembly: a context middleware stores the
// RequestContext, the auth middleware sets 'user' into it, and
// server.middleware (under test) runs after both.
function buildApp(user?: unknown) {
  const app = new Hono();
  let observed: RequestContext | undefined;
  app.use('*', async (c, next) => {
    const rc = new RequestContext();
    if (user !== undefined) rc.set('user', user);
    (c as any).set('requestContext', rc);
    observed = rc;
    await next();
  });
  app.use('*', asMiddleware);
  app.get('/probe', (c) => c.json({ ok: true }));
  return { app, getContext: () => observed };
}

describe('bindResourceToAuthenticatedUser', () => {
  it('forces the resource id to the authenticated WorkOS user id', async () => {
    const { app, getContext } = buildApp({ id: 'user_A' });
    const res = await app.request('/probe');
    expect(res.status).toBe(200);
    expect(getContext()!.get(MASTRA_RESOURCE_ID_KEY)).toBe('user_A');
  });

  it('prefers userId over id when both are present', async () => {
    const { app, getContext } = buildApp({ userId: 'user_B', id: 'other' });
    await app.request('/probe');
    expect(getContext()!.get(MASTRA_RESOURCE_ID_KEY)).toBe('user_B');
  });

  it('overrides a client-supplied resource id already in context', async () => {
    const app = new Hono();
    let observed: RequestContext | undefined;
    app.use('*', async (c, next) => {
      const rc = new RequestContext();
      rc.set('user', { id: 'user_A' });
      // Simulates a hostile client smuggling another user's resource id.
      rc.set(MASTRA_RESOURCE_ID_KEY, 'user_B');
      (c as any).set('requestContext', rc);
      observed = rc;
      await next();
    });
    app.use('*', asMiddleware);
    app.get('/probe', (c) => c.json({ ok: true }));

    await app.request('/probe');
    expect(observed!.get(MASTRA_RESOURCE_ID_KEY)).toBe('user_A');
  });

  it('leaves the context untouched on unauthenticated routes', async () => {
    const { app, getContext } = buildApp();
    const res = await app.request('/probe');
    expect(res.status).toBe(200);
    expect(getContext()!.get(MASTRA_RESOURCE_ID_KEY)).toBeUndefined();
  });
});
