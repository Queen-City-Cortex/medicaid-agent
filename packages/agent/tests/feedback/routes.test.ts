import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFeedbackRoutes, getResourceId } from '../../src/feedback/routes.js';
import type { FeedbackRepository } from '../../src/feedback/repository.js';

function mockContext(overrides: {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
  param?: Record<string, string>;
  requestContext?: Map<string, unknown>;
} = {}) {
  const userMap = new Map<string, unknown>();
  userMap.set('user', { userId: 'user-123' });

  const rc = overrides.requestContext ?? userMap;

  return {
    req: {
      json: vi.fn().mockResolvedValue(overrides.body ?? {}),
      query: vi.fn((key: string) => overrides.query?.[key] ?? null),
      param: vi.fn((key: string) => overrides.param?.[key] ?? ''),
    },
    get: vi.fn((key: string) => {
      if (key === 'requestContext') return rc;
      return undefined;
    }),
    json: vi.fn((data: unknown, status?: number) => ({ __body: data, __status: status ?? 200 })),
  } as any;
}

function mockRepo(): FeedbackRepository {
  return {
    upsert: vi.fn().mockResolvedValue({ id: 'fb-1', isNew: true }),
    delete: vi.fn().mockResolvedValue(true),
    getByThread: vi.fn().mockResolvedValue([]),
  } as any;
}

describe('getResourceId', () => {
  it('extracts userId from request context', () => {
    const rc = new Map<string, unknown>();
    rc.set('user', { userId: 'u-abc' });
    const c = { get: vi.fn(() => rc) } as any;
    expect(getResourceId(c)).toBe('u-abc');
  });

  it('throws when no user in context', () => {
    const rc = new Map<string, unknown>();
    const c = { get: vi.fn(() => rc) } as any;
    expect(() => getResourceId(c)).toThrow();
  });
});

describe('POST /feedback handler', () => {
  let repo: ReturnType<typeof mockRepo>;
  let handlers: ReturnType<typeof createFeedbackRoutes>;

  beforeEach(() => {
    repo = mockRepo();
    handlers = createFeedbackRoutes(repo);
  });

  it('returns 201 on new feedback', async () => {
    const c = mockContext({
      body: { messageId: 'msg-1', threadId: 'thread-1', rating: 'up' },
    });
    const result = await handlers.post(c);
    expect(result.__status).toBe(201);
    expect(result.__body).toEqual({ id: 'fb-1' });
    expect(repo.upsert).toHaveBeenCalledWith({
      id: expect.any(String),
      messageId: 'msg-1',
      threadId: 'thread-1',
      resourceId: 'user-123',
      rating: 'up',
      comment: undefined,
    });
  });

  it('returns 200 on upsert', async () => {
    vi.mocked(repo.upsert).mockResolvedValue({ id: 'fb-2', isNew: false });
    const c = mockContext({
      body: { messageId: 'msg-1', threadId: 'thread-1', rating: 'down', comment: 'Bad' },
    });
    const result = await handlers.post(c);
    expect(result.__status).toBe(200);
  });

  it('returns 400 on missing rating', async () => {
    const c = mockContext({ body: { messageId: 'msg-1', threadId: 'thread-1' } });
    const result = await handlers.post(c);
    expect(result.__status).toBe(400);
  });

  it('returns 400 on invalid rating value', async () => {
    const c = mockContext({ body: { messageId: 'msg-1', threadId: 'thread-1', rating: 'maybe' } });
    const result = await handlers.post(c);
    expect(result.__status).toBe(400);
  });
});

describe('GET /feedback handler', () => {
  let repo: ReturnType<typeof mockRepo>;
  let handlers: ReturnType<typeof createFeedbackRoutes>;

  beforeEach(() => {
    repo = mockRepo();
    handlers = createFeedbackRoutes(repo);
  });

  it('returns feedback for thread', async () => {
    const feedback = [{ id: 'fb-1', messageId: 'msg-1', threadId: 't1', resourceId: 'user-123', rating: 'up', comment: null, createdAt: '2026-04-04T00:00:00Z' }];
    vi.mocked(repo.getByThread).mockResolvedValue(feedback as any);
    const c = mockContext({ query: { threadId: 't1' } });
    const result = await handlers.get(c);
    expect(result.__status).toBe(200);
    expect(result.__body).toEqual({ feedback });
    expect(repo.getByThread).toHaveBeenCalledWith('t1', 'user-123');
  });

  it('returns 400 when threadId is missing', async () => {
    const c = mockContext({ query: {} });
    const result = await handlers.get(c);
    expect(result.__status).toBe(400);
  });
});

describe('DELETE /feedback/:id handler', () => {
  let repo: ReturnType<typeof mockRepo>;
  let handlers: ReturnType<typeof createFeedbackRoutes>;

  beforeEach(() => {
    repo = mockRepo();
    handlers = createFeedbackRoutes(repo);
  });

  it('returns 204 on successful delete', async () => {
    const c = mockContext({ param: { id: 'fb-1' } });
    const result = await handlers.del(c);
    expect(result.__status).toBe(204);
    expect(repo.delete).toHaveBeenCalledWith('fb-1', 'user-123');
  });

  it('returns 404 when feedback not found or not owned', async () => {
    vi.mocked(repo.delete).mockResolvedValue(false);
    const c = mockContext({ param: { id: 'nonexistent' } });
    const result = await handlers.del(c);
    expect(result.__status).toBe(404);
  });
});
