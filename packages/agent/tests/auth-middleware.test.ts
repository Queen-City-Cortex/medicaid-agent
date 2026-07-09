import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { MASTRA_RESOURCE_ID_KEY, RequestContext } from '@mastra/core/request-context';
import { createResourceBindingMiddleware, type TokenVerifier } from '../src/auth-middleware.js';

// The middleware is typed against Mastra's vendored hono Context, which is a
// distinct nominal copy from the top-level `hono` package used to build these
// test apps. Cast at the registration boundary.
function asMiddleware(verifier: TokenVerifier): MiddlewareHandler {
  return createResourceBindingMiddleware(verifier) as unknown as MiddlewareHandler;
}

const rejectingVerifier: TokenVerifier = {
  authenticateToken: vi.fn(async () => null),
};

// Mimics Mastra's server assembly: a context middleware stores the
// RequestContext, then server.middleware (under test) runs. Note Mastra's own
// auth is per-route and runs AFTER server.middleware, so `user` is normally
// absent here — the middleware verifies the Bearer token itself.
function buildApp(verifier: TokenVerifier, user?: unknown) {
  const app = new Hono();
  let observed: RequestContext | undefined;
  app.use('*', async (c, next) => {
    const rc = new RequestContext();
    if (user !== undefined) rc.set('user', user);
    (c as any).set('requestContext', rc);
    observed = rc;
    await next();
  });
  app.use('*', asMiddleware(verifier));
  app.get('/probe', (c) => c.json({ ok: true }));
  return { app, getContext: () => observed };
}

describe('createResourceBindingMiddleware', () => {
  it('verifies the Bearer token and binds the resource id to the WorkOS user id', async () => {
    const verifier: TokenVerifier = {
      authenticateToken: vi.fn(async () => ({ id: 'user_A' })),
    };
    const { app, getContext } = buildApp(verifier);
    const res = await app.request('/probe', { headers: { authorization: 'Bearer tok-123' } });
    expect(res.status).toBe(200);
    expect(getContext()!.get(MASTRA_RESOURCE_ID_KEY)).toBe('user_A');
    expect(verifier.authenticateToken).toHaveBeenCalledWith('tok-123', expect.anything());
  });

  it('prefers userId over id when the verifier returns both', async () => {
    const verifier: TokenVerifier = {
      authenticateToken: async () => ({ userId: 'user_B', id: 'other' }),
    };
    const { app, getContext } = buildApp(verifier);
    await app.request('/probe', { headers: { authorization: 'Bearer tok' } });
    expect(getContext()!.get(MASTRA_RESOURCE_ID_KEY)).toBe('user_B');
  });

  it('uses a context user without calling the verifier when one is already present', async () => {
    const verifier: TokenVerifier = { authenticateToken: vi.fn(async () => ({ id: 'ignored' })) };
    const { app, getContext } = buildApp(verifier, { id: 'ctx_user' });
    await app.request('/probe', { headers: { authorization: 'Bearer tok' } });
    expect(getContext()!.get(MASTRA_RESOURCE_ID_KEY)).toBe('ctx_user');
    expect(verifier.authenticateToken).not.toHaveBeenCalled();
  });

  it('overrides a client-supplied resource id already in context', async () => {
    const verifier: TokenVerifier = { authenticateToken: async () => ({ id: 'user_A' }) };
    const app = new Hono();
    let observed: RequestContext | undefined;
    app.use('*', async (c, next) => {
      const rc = new RequestContext();
      // Simulates a hostile client smuggling another user's resource id.
      rc.set(MASTRA_RESOURCE_ID_KEY, 'user_B');
      (c as any).set('requestContext', rc);
      observed = rc;
      await next();
    });
    app.use('*', asMiddleware(verifier));
    app.get('/probe', (c) => c.json({ ok: true }));

    await app.request('/probe', { headers: { authorization: 'Bearer tok' } });
    expect(observed!.get(MASTRA_RESOURCE_ID_KEY)).toBe('user_A');
  });

  it('leaves the context untouched when there is no Authorization header', async () => {
    const verifier: TokenVerifier = { authenticateToken: vi.fn(async () => ({ id: 'x' })) };
    const { app, getContext } = buildApp(verifier);
    const res = await app.request('/probe');
    expect(res.status).toBe(200);
    expect(getContext()!.get(MASTRA_RESOURCE_ID_KEY)).toBeUndefined();
    expect(verifier.authenticateToken).not.toHaveBeenCalled();
  });

  it('leaves the context untouched when the token is invalid', async () => {
    const { app, getContext } = buildApp(rejectingVerifier);
    const res = await app.request('/probe', { headers: { authorization: 'Bearer bad' } });
    expect(res.status).toBe(200);
    expect(getContext()!.get(MASTRA_RESOURCE_ID_KEY)).toBeUndefined();
  });

  it('does not block the request when the verifier throws', async () => {
    const verifier: TokenVerifier = {
      authenticateToken: async () => {
        throw new Error('jwks unreachable');
      },
    };
    const { app, getContext } = buildApp(verifier);
    const res = await app.request('/probe', { headers: { authorization: 'Bearer tok' } });
    expect(res.status).toBe(200);
    expect(getContext()!.get(MASTRA_RESOURCE_ID_KEY)).toBeUndefined();
  });
});
