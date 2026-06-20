import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createFeedbackRoutes, getResourceId } from '../../src/feedback/routes.js';
import type { FeedbackRepository } from '../../src/feedback/repository.js';
import { log } from '../../src/logger.js';

// Tests run against a real Hono app so response semantics (e.g. 204 bodies,
// thrown errors becoming 500s) are exercised for real — a stubbed context
// previously masked a crash in the DELETE handler.
function buildApp(repo: FeedbackRepository, user?: unknown) {
  const handlers = createFeedbackRoutes(repo);
  const app = new Hono();
  app.use('*', async (c, next) => {
    const rc = new Map<string, unknown>();
    if (user !== undefined) rc.set('user', user);
    (c as any).set('requestContext', rc);
    await next();
  });
  app.post('/feedback', handlers.post);
  app.get('/feedback', handlers.get);
  app.delete('/feedback/:id', handlers.del);
  return app;
}

function mockRepo(): FeedbackRepository {
  return {
    upsert: vi.fn().mockResolvedValue({ id: 'fb-1', isNew: true }),
    delete: vi.fn().mockResolvedValue(true),
    getByThread: vi.fn().mockResolvedValue([]),
  } as any;
}

const USER = { userId: 'user-123' };

function postJson(app: Hono, body: unknown) {
  return app.request('/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('getResourceId', () => {
  it('extracts userId from request context', () => {
    const rc = new Map<string, unknown>();
    rc.set('user', { userId: 'u-abc' });
    const c = { get: vi.fn(() => rc) } as any;
    expect(getResourceId(c)).toBe('u-abc');
  });

  it('returns null when no user in context', () => {
    const rc = new Map<string, unknown>();
    const c = { get: vi.fn(() => rc) } as any;
    expect(getResourceId(c)).toBeNull();
  });
});

describe('POST /feedback', () => {
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(() => {
    repo = mockRepo();
  });

  it('returns 201 on new feedback', async () => {
    const app = buildApp(repo, USER);
    const res = await postJson(app, { messageId: 'msg-1', threadId: 'thread-1', rating: 'up' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'fb-1' });
    expect(repo.upsert).toHaveBeenCalledWith({
      id: expect.any(String),
      messageId: 'msg-1',
      threadId: 'thread-1',
      resourceId: 'user-123',
      rating: 'up',
      comment: null,
    });
  });

  it('returns 200 on upsert of existing feedback', async () => {
    vi.mocked(repo.upsert).mockResolvedValue({ id: 'fb-2', isNew: false });
    const app = buildApp(repo, USER);
    const res = await postJson(app, { messageId: 'msg-1', threadId: 'thread-1', rating: 'down', comment: 'Bad' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'fb-2' });
  });

  it('returns 400 on missing rating', async () => {
    const app = buildApp(repo, USER);
    const res = await postJson(app, { messageId: 'msg-1', threadId: 'thread-1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid rating value', async () => {
    const app = buildApp(repo, USER);
    const res = await postJson(app, { messageId: 'msg-1', threadId: 'thread-1', rating: 'maybe' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on malformed JSON and logs it', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const app = buildApp(repo, USER);
    const res = await app.request('/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    expect(warn).toHaveBeenCalledWith('feedback.invalid_json', expect.objectContaining({ resourceId: 'user-123' }));
    warn.mockRestore();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(repo);
    const res = await postJson(app, { messageId: 'msg-1', threadId: 'thread-1', rating: 'up' });
    expect(res.status).toBe(401);
    expect(repo.upsert).not.toHaveBeenCalled();
  });
});

describe('GET /feedback', () => {
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(() => {
    repo = mockRepo();
  });

  it('returns feedback for thread', async () => {
    const feedback = [{ id: 'fb-1', messageId: 'msg-1', threadId: 't1', resourceId: 'user-123', rating: 'up', comment: null, createdAt: '2026-04-04T00:00:00Z' }];
    vi.mocked(repo.getByThread).mockResolvedValue(feedback as any);
    const app = buildApp(repo, USER);
    const res = await app.request('/feedback?threadId=t1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ feedback });
    expect(repo.getByThread).toHaveBeenCalledWith('t1', 'user-123');
  });

  it('returns 400 when threadId is missing', async () => {
    const app = buildApp(repo, USER);
    const res = await app.request('/feedback');
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(repo);
    const res = await app.request('/feedback?threadId=t1');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /feedback/:id', () => {
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(() => {
    repo = mockRepo();
  });

  it('returns 204 with an empty body on successful delete', async () => {
    const app = buildApp(repo, USER);
    const res = await app.request('/feedback/fb-1', { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(repo.delete).toHaveBeenCalledWith('fb-1', 'user-123');
  });

  it('returns 404 when feedback not found or not owned', async () => {
    vi.mocked(repo.delete).mockResolvedValue(false);
    const app = buildApp(repo, USER);
    const res = await app.request('/feedback/nonexistent', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(repo);
    const res = await app.request('/feedback/fb-1', { method: 'DELETE' });
    expect(res.status).toBe(401);
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
