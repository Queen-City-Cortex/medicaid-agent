import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { MASTRA_RESOURCE_ID_KEY, RequestContext } from '@mastra/core/request-context';
import { createResourceBindingMiddleware, getBoundUserId, type TokenVerifier } from '../src/auth-middleware.js';
import { MastraAuthWorkos } from '@mastra/auth-workos';
import { AgentServerAuth } from '../src/workos-auth.js';
import { createExecutionGateway } from '../src/execution-gateway.js';
import { createRateLimitMiddleware } from '../src/rate-limit/middleware.js';
import { RateLimitRepository } from '../src/rate-limit/repository.js';
import { clientRequestContext } from './helpers/client-request-context.js';

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
// auth is per-route and runs AFTER server.middleware, so a merged `user` value
// is untrusted here — the middleware verifies the Bearer token itself.
function buildApp(verifier: TokenVerifier, user?: unknown) {
  const app = new Hono();
  let observed: RequestContext | undefined;
  app.use('*', async (c, next) => {
    const rc = await clientRequestContext(c.req.raw);
    if (user !== undefined) rc.set('user', user);
    (c as any).set('requestContext', rc);
    observed = rc;
    await next();
  });
  app.use('*', asMiddleware(verifier));
  app.get('/probe', (c) => c.json({ ok: true }));
  app.post('/probe', (c) => c.json({ ok: true }));
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

  it('binds the same resource id as route-level authentication', async () => {
    for (const user of [{ id: 'user_A' }, { userId: 'user_B', id: 'other' }]) {
      const verifier: TokenVerifier = { authenticateToken: async () => user };
      const { app, getContext } = buildApp(verifier);
      await app.request('/probe', { headers: { authorization: 'Bearer tok' } });
      const auth = new AgentServerAuth(verifier as ConstructorParameters<typeof AgentServerAuth>[0]);
      expect(auth.mapUserToResourceId?.(await auth.authenticateToken('tok', new Request('http://agent.test/')) as Parameters<NonNullable<AgentServerAuth['mapUserToResourceId']>>[0]))
        .toBe(getContext()!.get(MASTRA_RESOURCE_ID_KEY));
    }
  });

  it('passes route-level authentication the request WorkOS needs to read the token', async () => {
    // WorkOS dereferences the request before reading the token and swallows
    // the error, so a missing request answered every token with null (401).
    const workos = new MastraAuthWorkos({ apiKey: 'sk_test', clientId: 'client_test', session: { cookiePassword: 'p'.repeat(32) } });
    const jwksUrl = vi.spyOn(workos['workos'].userManagement, 'getJwksUrl').mockImplementation(() => {
      throw new Error('reached the token check');
    });
    await new AgentServerAuth(workos).authenticateToken('tok', new Request('http://agent.test/api/memory/threads'));
    expect(jwksUrl).toHaveBeenCalledWith('client_test');
  });

  it('prefers userId over id when the verifier returns both', async () => {
    const verifier: TokenVerifier = {
      authenticateToken: async () => ({ userId: 'user_B', id: 'other' }),
    };
    const { app, getContext } = buildApp(verifier);
    await app.request('/probe', { headers: { authorization: 'Bearer tok' } });
    expect(getContext()!.get(MASTRA_RESOURCE_ID_KEY)).toBe('user_B');
  });

  it('verifies the token even when a forged context user is already present', async () => {
    const verifier: TokenVerifier = { authenticateToken: vi.fn(async () => ({ id: 'verified_owner' })) };
    const { app, getContext } = buildApp(verifier, { id: 'ctx_user' });
    await app.request('/probe', { headers: { authorization: 'Bearer tok' } });
    expect(getContext()!.get(MASTRA_RESOURCE_ID_KEY)).toBe('verified_owner');
    expect(verifier.authenticateToken).toHaveBeenCalledWith('tok', expect.anything());
  });

  it.each(['POST', 'GET', 'GET-base64'])('ignores a client-forged owner in %s context', async method => {
    const verifier: TokenVerifier = { authenticateToken: vi.fn(async token =>
      token === 'valid' ? { id: 'verified_owner' } : null) };
    const clientContext = { user: { id: 'victim', userId: 'victim' } };
    for (const token of ['valid', 'invalid', undefined]) {
      const { app, getContext } = buildApp(verifier);
      const encoded = method === 'GET-base64'
        ? Buffer.from(JSON.stringify(clientContext)).toString('base64') : JSON.stringify(clientContext);
      const response = await app.request(method === 'POST' ? '/probe'
        : `/probe?requestContext=${encodeURIComponent(encoded)}`, {
        method: method === 'POST' ? 'POST' : 'GET',
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify({ requestContext: clientContext }) } : {}),
      });
      expect(response.status).toBe(200);
      expect(getContext()!.get('user')).toBeUndefined();
      expect(getContext()!.get(MASTRA_RESOURCE_ID_KEY)).toBe(token === 'valid' ? 'verified_owner' : undefined);
    }
    expect(verifier.authenticateToken).toHaveBeenCalledTimes(2);
  });

  it.each(['POST', 'GET', 'GET-base64'])('guards owned routes and usage against a forged %s identity', async method => {
    const verifier: TokenVerifier = { authenticateToken: vi.fn(async token => {
      if (token === 'throws') throw new Error('JWKS unavailable');
      return token === 'valid' ? { id: 'verified_owner' } : null;
    }) };
    const repo = new RateLimitRepository(':memory:');
    const charge = vi.spyOn(repo, 'checkAndRecord').mockResolvedValue({ allowed: true });
    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as any).set('requestContext', await clientRequestContext(c.req.raw));
      await next();
    });
    app.use('*', asMiddleware(verifier));
    app.use('*', createExecutionGateway() as unknown as MiddlewareHandler);
    app.use('*', createRateLimitMiddleware(repo) as unknown as MiddlewareHandler);
    const identity: MiddlewareHandler = async c => c.json({ owner: getBoundUserId(c as any) });
    app.post('/chat', identity);
    app.get('/api/memory/threads', identity);
    const clientContext = { user: { id: 'victim' } };
    const encoded = method === 'GET-base64'
      ? Buffer.from(JSON.stringify(clientContext)).toString('base64') : JSON.stringify(clientContext);
    for (const token of ['valid', 'invalid', undefined, 'throws']) {
      const response = await app.request(method === 'POST' ? '/chat'
        : `/api/memory/threads?requestContext=${encodeURIComponent(encoded)}`, {
        method: method === 'POST' ? 'POST' : 'GET',
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify({ requestContext: clientContext }) } : {}),
      });
      expect(response.status).toBe(token === 'valid' ? 200 : 401);
      expect(await response.json()).toEqual(token === 'valid' ? { owner: 'verified_owner' }
        : { error: { code: 'unauthorized', message: 'Authentication required' } });
    }
    expect(verifier.authenticateToken).toHaveBeenCalledTimes(3);
    if (method === 'POST') {
      expect(charge).toHaveBeenCalledExactlyOnceWith('verified_owner', 'chat');
    } else {
      expect(charge).not.toHaveBeenCalled();
    }
  });

  it.each(['missing', 'invalid', 'throws'])('clears a pre-existing resource owner when authentication is %s', async token => {
    const app = new Hono();
    const context = new RequestContext();
    context.set(MASTRA_RESOURCE_ID_KEY, 'stale_owner');
    context.set('user', { id: 'victim' });
    app.use('*', async (c, next) => { (c as any).set('requestContext', context); await next(); });
    app.use('*', asMiddleware({ authenticateToken: async () => {
      if (token === 'throws') throw new Error('JWKS unavailable');
      return null;
    } }));
    app.get('/probe', c => c.json({ owner: getBoundUserId(c as any) }));
    const response = await app.request('/probe', { headers: token === 'missing' ? {} : { authorization: `Bearer ${token}` } });
    expect(await response.json()).toEqual({ owner: null });
    expect(context.get(MASTRA_RESOURCE_ID_KEY)).toBeUndefined();
    expect(context.get('user')).toBeUndefined();
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
