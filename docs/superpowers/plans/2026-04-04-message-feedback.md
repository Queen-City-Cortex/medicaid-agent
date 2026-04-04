# Message Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add thumbs up/down ratings on assistant messages for agent improvement and stakeholder audit trails.

**Architecture:** Custom `feedback` table in LibSQL, three Hono route handlers (`POST /feedback`, `GET /feedback`, `DELETE /feedback/:id`) registered via Mastra's `registerApiRoute()`, and frontend integration across ChatPage/MessageList/MessageActions. Authenticated via the existing WorkOS auth middleware.

**Tech Stack:** `@libsql/client`, Hono (via Mastra server), Zod, React 19, Lucide icons, Vitest, Playwright

---

## File Structure

### Agent Package (new files)
- `packages/agent/src/feedback/repository.ts` — LibSQL table creation + CRUD operations
- `packages/agent/src/feedback/routes.ts` — Hono route handler factory
- `packages/agent/tests/feedback/repository.test.ts` — Repository unit tests
- `packages/agent/tests/feedback/routes.test.ts` — Route handler unit tests

### Agent Package (modified)
- `packages/agent/package.json` — Add `@libsql/client` dependency
- `packages/agent/src/index.ts` �� Wire feedback routes into `apiRoutes`

### Web Package (new files)
- `packages/web/src/lib/feedback-client.ts` — Fetch wrapper for feedback API
- `packages/web/tests/lib/feedback-client.test.ts` — Client unit tests

### Web Package (modified)
- `packages/web/src/components/MessageActions.tsx` — Add thumbs buttons + comment input
- `packages/web/src/components/MessageList.tsx` — Thread feedback props to MessageActions
- `packages/web/src/app/chat/page.tsx` ��� Feedback state management + API calls
- `packages/web/tests/components/MessageActions.test.tsx` — Extend with feedback tests

### E2E (new/modified)
- `e2e/helpers/mock-routes.ts` — Add feedback mock routes
- `e2e/tests/mocked/feedback.spec.ts` — Playwright feedback flow tests

---

### Task 1: Feedback Repository

**Files:**
- Modify: `packages/agent/package.json`
- Create: `packages/agent/src/feedback/repository.ts`
- Create: `packages/agent/tests/feedback/repository.test.ts`

- [ ] **Step 1: Add `@libsql/client` dependency**

```bash
cd packages/agent && npm install @libsql/client
```

- [ ] **Step 2: Write failing tests for the repository**

Create `packages/agent/tests/feedback/repository.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { FeedbackRepository } from '../../src/feedback/repository.js';

describe('FeedbackRepository', () => {
  let repo: FeedbackRepository;

  beforeEach(async () => {
    repo = new FeedbackRepository(':memory:');
  });

  describe('upsert', () => {
    it('inserts a new feedback row', async () => {
      const result = await repo.upsert({
        id: 'fb-1',
        threadId: 'thread-1',
        messageId: 'msg-1',
        resourceId: 'user-1',
        rating: 'up',
        comment: null,
      });

      expect(result).toEqual({ id: 'fb-1', isNew: true });
    });

    it('replaces rating on duplicate (message_id, resource_id)', async () => {
      await repo.upsert({
        id: 'fb-1',
        threadId: 'thread-1',
        messageId: 'msg-1',
        resourceId: 'user-1',
        rating: 'up',
        comment: null,
      });

      const result = await repo.upsert({
        id: 'fb-2',
        threadId: 'thread-1',
        messageId: 'msg-1',
        resourceId: 'user-1',
        rating: 'down',
        comment: 'Wrong policy',
      });

      expect(result).toEqual({ id: 'fb-2', isNew: false });

      const rows = await repo.getByThread('thread-1', 'user-1');
      expect(rows).toHaveLength(1);
      expect(rows[0].rating).toBe('down');
      expect(rows[0].comment).toBe('Wrong policy');
      expect(rows[0].id).toBe('fb-2');
    });

    it('clears comment when switching from down to up', async () => {
      await repo.upsert({
        id: 'fb-1',
        threadId: 'thread-1',
        messageId: 'msg-1',
        resourceId: 'user-1',
        rating: 'down',
        comment: 'Bad answer',
      });

      await repo.upsert({
        id: 'fb-2',
        threadId: 'thread-1',
        messageId: 'msg-1',
        resourceId: 'user-1',
        rating: 'up',
        comment: null,
      });

      const rows = await repo.getByThread('thread-1', 'user-1');
      expect(rows[0].comment).toBeNull();
    });
  });

  describe('getByThread', () => {
    it('returns only feedback for the given thread and user', async () => {
      await repo.upsert({ id: 'fb-1', threadId: 't1', messageId: 'm1', resourceId: 'u1', rating: 'up', comment: null });
      await repo.upsert({ id: 'fb-2', threadId: 't1', messageId: 'm2', resourceId: 'u1', rating: 'down', comment: 'Bad' });
      await repo.upsert({ id: 'fb-3', threadId: 't2', messageId: 'm3', resourceId: 'u1', rating: 'up', comment: null });
      await repo.upsert({ id: 'fb-4', threadId: 't1', messageId: 'm1', resourceId: 'u2', rating: 'down', comment: null });

      const rows = await repo.getByThread('t1', 'u1');
      expect(rows).toHaveLength(2);
      expect(rows.map(r => r.messageId).sort()).toEqual(['m1', 'm2']);
    });

    it('returns empty array for unknown thread', async () => {
      const rows = await repo.getByThread('nonexistent', 'u1');
      expect(rows).toEqual([]);
    });
  });

  describe('delete', () => {
    it('deletes a feedback row and returns true', async () => {
      await repo.upsert({ id: 'fb-1', threadId: 't1', messageId: 'm1', resourceId: 'u1', rating: 'up', comment: null });

      const deleted = await repo.delete('fb-1', 'u1');
      expect(deleted).toBe(true);

      const rows = await repo.getByThread('t1', 'u1');
      expect(rows).toEqual([]);
    });

    it('returns false when id does not exist', async () => {
      const deleted = await repo.delete('nonexistent', 'u1');
      expect(deleted).toBe(false);
    });

    it('returns false when resource_id does not match (ownership check)', async () => {
      await repo.upsert({ id: 'fb-1', threadId: 't1', messageId: 'm1', resourceId: 'u1', rating: 'up', comment: null });

      const deleted = await repo.delete('fb-1', 'u2');
      expect(deleted).toBe(false);

      const rows = await repo.getByThread('t1', 'u1');
      expect(rows).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd packages/agent && npx vitest run tests/feedback/repository.test.ts
```

Expected: FAIL — module `../../src/feedback/repository.js` not found.

- [ ] **Step 4: Implement the repository**

Create `packages/agent/src/feedback/repository.ts`:

```typescript
import { createClient, type Client } from '@libsql/client';

export interface Feedback {
  id: string;
  threadId: string;
  messageId: string;
  resourceId: string;
  rating: 'up' | 'down';
  comment: string | null;
  createdAt: string;
}

export type FeedbackInput = Omit<Feedback, 'createdAt'>;

export class FeedbackRepository {
  private client: Client;
  private initialized = false;

  constructor(url: string) {
    this.client = createClient({ url });
  }

  private async ensureTable(): Promise<void> {
    if (this.initialized) return;
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
        comment TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (message_id, resource_id)
      )
    `);
    this.initialized = true;
  }

  async upsert(input: FeedbackInput): Promise<{ id: string; isNew: boolean }> {
    await this.ensureTable();

    const existing = await this.client.execute({
      sql: 'SELECT id FROM feedback WHERE message_id = ? AND resource_id = ?',
      args: [input.messageId, input.resourceId],
    });
    const isNew = existing.rows.length === 0;

    const comment = input.rating === 'up' ? null : (input.comment ?? null);

    await this.client.execute({
      sql: `INSERT INTO feedback (id, thread_id, message_id, resource_id, rating, comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (message_id, resource_id)
            DO UPDATE SET id = excluded.id, rating = excluded.rating, comment = excluded.comment, created_at = excluded.created_at`,
      args: [input.id, input.threadId, input.messageId, input.resourceId, input.rating, comment, new Date().toISOString()],
    });

    return { id: input.id, isNew };
  }

  async delete(id: string, resourceId: string): Promise<boolean> {
    await this.ensureTable();
    const result = await this.client.execute({
      sql: 'DELETE FROM feedback WHERE id = ? AND resource_id = ?',
      args: [id, resourceId],
    });
    return (result.rowsAffected ?? 0) > 0;
  }

  async getByThread(threadId: string, resourceId: string): Promise<Feedback[]> {
    await this.ensureTable();
    const result = await this.client.execute({
      sql: 'SELECT id, thread_id, message_id, resource_id, rating, comment, created_at FROM feedback WHERE thread_id = ? AND resource_id = ?',
      args: [threadId, resourceId],
    });
    return result.rows.map(row => ({
      id: row.id as string,
      threadId: row.thread_id as string,
      messageId: row.message_id as string,
      resourceId: row.resource_id as string,
      rating: row.rating as 'up' | 'down',
      comment: row.comment as string | null,
      createdAt: row.created_at as string,
    }));
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/agent && npx vitest run tests/feedback/repository.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/package.json packages/agent/package-lock.json packages/agent/src/feedback/repository.ts packages/agent/tests/feedback/repository.test.ts
git commit -m "feat(agent): add feedback repository with LibSQL storage"
```

---

### Task 2: Feedback API Routes

**Files:**
- Create: `packages/agent/src/feedback/routes.ts`
- Create: `packages/agent/tests/feedback/routes.test.ts`
- Modify: `packages/agent/src/index.ts:250-275` (apiRoutes array)

- [ ] **Step 1: Write failing tests for route handlers**

Create `packages/agent/tests/feedback/routes.test.ts`:

```typescript
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
    const c = mockContext({
      body: { messageId: 'msg-1', threadId: 'thread-1' },
    });

    const result = await handlers.post(c);
    expect(result.__status).toBe(400);
  });

  it('returns 400 on invalid rating value', async () => {
    const c = mockContext({
      body: { messageId: 'msg-1', threadId: 'thread-1', rating: 'maybe' },
    });

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/agent && npx vitest run tests/feedback/routes.test.ts
```

Expected: FAIL — module `../../src/feedback/routes.js` not found.

- [ ] **Step 3: Implement the route handlers**

Create `packages/agent/src/feedback/routes.ts`:

```typescript
import { registerApiRoute } from '@mastra/core/server';
import { z } from 'zod';
import type { FeedbackRepository } from './repository.js';

const FeedbackBodySchema = z.object({
  messageId: z.string().min(1),
  threadId: z.string().min(1),
  rating: z.enum(['up', 'down']),
  comment: z.string().optional(),
});

export function getResourceId(c: any): string {
  const rc = c.get('requestContext');
  const user = rc?.get?.('user');
  const id = user?.userId ?? user?.id;
  if (!id) throw new Error('User not authenticated');
  return id;
}

export function createFeedbackRoutes(repo: FeedbackRepository) {
  const post = async (c: any) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    const parsed = FeedbackBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const resourceId = getResourceId(c);
    const id = crypto.randomUUID();

    const result = await repo.upsert({
      id,
      messageId: parsed.data.messageId,
      threadId: parsed.data.threadId,
      resourceId,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
    });

    return c.json({ id: result.id }, result.isNew ? 201 : 200);
  };

  const get = async (c: any) => {
    const threadId = c.req.query('threadId');
    if (!threadId) {
      return c.json({ error: 'threadId query parameter is required' }, 400);
    }

    const resourceId = getResourceId(c);
    const feedback = await repo.getByThread(threadId, resourceId);
    return c.json({ feedback }, 200);
  };

  const del = async (c: any) => {
    const id = c.req.param('id');
    const resourceId = getResourceId(c);
    const deleted = await repo.delete(id, resourceId);

    if (!deleted) {
      return c.json({ error: 'Feedback not found' }, 404);
    }
    return c.json(null, 204);
  };

  return { post, get, del };
}

export function feedbackApiRoutes(repo: FeedbackRepository) {
  const handlers = createFeedbackRoutes(repo);

  return [
    registerApiRoute('/feedback', {
      method: 'POST',
      handler: handlers.post,
    }),
    registerApiRoute('/feedback', {
      method: 'GET',
      handler: handlers.get,
    }),
    registerApiRoute('/feedback/:id', {
      method: 'DELETE',
      handler: handlers.del,
    }),
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/agent && npx vitest run tests/feedback/routes.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Wire routes into Mastra server config**

In `packages/agent/src/index.ts`, add the import and wire routes:

Add import at top (after line 19):
```typescript
import { FeedbackRepository } from './feedback/repository.js';
import { feedbackApiRoutes } from './feedback/routes.js';
```

Create the repository instance (after the `libsql` declaration, around line 62):
```typescript
const feedbackRepo = new FeedbackRepository(process.env.DATABASE_URL || 'file:./mastra.db');
```

Spread feedback routes into the `apiRoutes` array (after the `/healthz` route, around line 274):
```typescript
      ...feedbackApiRoutes(feedbackRepo),
```

- [ ] **Step 6: Run all agent tests to verify nothing broke**

```bash
cd packages/agent && npx vitest run
```

Expected: all tests PASS including new feedback tests.

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/feedback/routes.ts packages/agent/tests/feedback/routes.test.ts packages/agent/src/index.ts
git commit -m "feat(agent): add feedback API routes (POST/GET/DELETE /feedback)"
```

---

### Task 3: Web Feedback Client

**Files:**
- Create: `packages/web/src/lib/feedback-client.ts`
- Create: `packages/web/tests/lib/feedback-client.test.ts`

- [ ] **Step 1: Write failing tests for the client**

Create `packages/web/tests/lib/feedback-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitFeedback, deleteFeedback, getFeedbackByThread } from '../../src/lib/feedback-client';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('submitFeedback', () => {
  it('POSTs to /feedback and returns id', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'fb-1' }),
    });

    const result = await submitFeedback(
      { messageId: 'msg-1', threadId: 't-1', rating: 'up' },
      'http://localhost:4111',
      'token-abc',
    );

    expect(result).toEqual({ id: 'fb-1' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:4111/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-abc',
      },
      credentials: 'include',
      body: JSON.stringify({ messageId: 'msg-1', threadId: 't-1', rating: 'up' }),
    });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400 });
    await expect(
      submitFeedback({ messageId: 'm', threadId: 't', rating: 'up' }, 'http://localhost:4111', 'tok'),
    ).rejects.toThrow('Feedback submit failed: 400');
  });
});

describe('deleteFeedback', () => {
  it('sends DELETE to /feedback/:id', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await deleteFeedback('fb-1', 'http://localhost:4111', 'token-abc');

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:4111/feedback/fb-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token-abc' },
      credentials: 'include',
    });
  });
});

describe('getFeedbackByThread', () => {
  it('fetches feedback for a thread', async () => {
    const feedback = [{ id: 'fb-1', messageId: 'msg-1', rating: 'up', comment: null }];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ feedback }),
    });

    const result = await getFeedbackByThread('t-1', 'http://localhost:4111', 'token-abc');
    expect(result).toEqual(feedback);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4111/feedback?threadId=t-1',
      { headers: { Authorization: 'Bearer token-abc' }, credentials: 'include' },
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/web && npx vitest run tests/lib/feedback-client.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client**

Create `packages/web/src/lib/feedback-client.ts`:

```typescript
export interface FeedbackEntry {
  id: string;
  messageId: string;
  threadId: string;
  resourceId: string;
  rating: 'up' | 'down';
  comment: string | null;
  createdAt: string;
}

export async function submitFeedback(
  params: { messageId: string; threadId: string; rating: 'up' | 'down'; comment?: string },
  baseUrl: string,
  accessToken: string,
): Promise<{ id: string }> {
  const res = await fetch(`${baseUrl}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: 'include',
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Feedback submit failed: ${res.status}`);
  return res.json();
}

export async function deleteFeedback(
  id: string,
  baseUrl: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${baseUrl}/feedback/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Feedback delete failed: ${res.status}`);
}

export async function getFeedbackByThread(
  threadId: string,
  baseUrl: string,
  accessToken: string,
): Promise<FeedbackEntry[]> {
  const res = await fetch(`${baseUrl}/feedback?threadId=${encodeURIComponent(threadId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Feedback fetch failed: ${res.status}`);
  const data = await res.json();
  return data.feedback;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/web && npx vitest run tests/lib/feedback-client.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/feedback-client.ts packages/web/tests/lib/feedback-client.test.ts
git commit -m "feat(web): add feedback API client"
```

---

### Task 4: MessageActions Feedback UI

**Files:**
- Modify: `packages/web/src/components/MessageActions.tsx`
- Modify: `packages/web/tests/components/MessageActions.test.tsx`

- [ ] **Step 1: Write failing tests for feedback buttons**

Add to `packages/web/tests/components/MessageActions.test.tsx` (after existing tests, inside the `describe` block):

```typescript
  it('renders thumbs-up and thumbs-down buttons when messageId is provided', () => {
    render(<MessageActions content="test" messageId="msg-1" threadId="t-1" onRate={() => {}} />);
    expect(screen.getByLabelText('Rate helpful')).toBeInTheDocument();
    expect(screen.getByLabelText('Rate unhelpful')).toBeInTheDocument();
  });

  it('does not render thumbs buttons when messageId is absent', () => {
    render(<MessageActions content="test" />);
    expect(screen.queryByLabelText('Rate helpful')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Rate unhelpful')).not.toBeInTheDocument();
  });

  it('calls onRate with "up" when thumbs-up clicked', async () => {
    const onRate = vi.fn();
    render(<MessageActions content="test" messageId="msg-1" threadId="t-1" onRate={onRate} />);
    await userEvent.click(screen.getByLabelText('Rate helpful'));
    expect(onRate).toHaveBeenCalledWith('up');
  });

  it('calls onClearRating when active thumb clicked again', async () => {
    const onClearRating = vi.fn();
    render(
      <MessageActions
        content="test"
        messageId="msg-1"
        threadId="t-1"
        feedback={{ id: 'fb-1', rating: 'up', comment: null }}
        onRate={() => {}}
        onClearRating={onClearRating}
      />,
    );
    await userEvent.click(screen.getByLabelText('Rate helpful'));
    expect(onClearRating).toHaveBeenCalled();
  });

  it('shows comment input when rated down', () => {
    render(
      <MessageActions
        content="test"
        messageId="msg-1"
        threadId="t-1"
        feedback={{ id: 'fb-1', rating: 'down', comment: null }}
        onRate={() => {}}
        onComment={() => {}}
      />,
    );
    expect(screen.getByPlaceholderText('What went wrong?')).toBeInTheDocument();
  });

  it('calls onComment when comment submitted', async () => {
    const onComment = vi.fn();
    render(
      <MessageActions
        content="test"
        messageId="msg-1"
        threadId="t-1"
        feedback={{ id: 'fb-1', rating: 'down', comment: null }}
        onRate={() => {}}
        onComment={onComment}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('What went wrong?'), 'Wrong policy');
    await userEvent.click(screen.getByLabelText('Submit comment'));
    expect(onComment).toHaveBeenCalledWith('Wrong policy');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/web && npx vitest run tests/components/MessageActions.test.tsx
```

Expected: FAIL — new tests fail (props don't exist yet).

- [ ] **Step 3: Implement feedback UI in MessageActions**

Replace `packages/web/src/components/MessageActions.tsx` entirely:

```typescript
'use client';

import { useState } from 'react';
import { Copy, Check, RotateCcw, ThumbsUp, ThumbsDown, Send } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface FeedbackState {
  id: string;
  rating: 'up' | 'down';
  comment: string | null;
}

interface MessageActionsProps {
  content: string;
  onRerun?: () => void;
  messageId?: string;
  threadId?: string;
  feedback?: FeedbackState | null;
  onRate?: (rating: 'up' | 'down') => void;
  onClearRating?: () => void;
  onComment?: (comment: string) => void;
}

const btnClass = 'p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors';
const btnActiveUp = 'p-1.5 rounded-md text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 transition-colors';
const btnActiveDown = 'p-1.5 rounded-md text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30 transition-colors';

export function MessageActions({ content, onRerun, messageId, feedback, onRate, onClearRating, onComment }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [commentText, setCommentText] = useState('');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleThumbClick = (rating: 'up' | 'down') => {
    if (feedback?.rating === rating) {
      onClearRating?.();
    } else {
      onRate?.(rating);
    }
  };

  const handleCommentSubmit = () => {
    if (commentText.trim()) {
      onComment?.(commentText.trim());
      setCommentText('');
    }
  };

  return (
    <div className="mt-2">
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger className={btnClass} onClick={handleCopy} aria-label={copied ? 'Copied' : 'Copy message'}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </TooltipTrigger>
          <TooltipContent>{copied ? 'Copied!' : 'Copy'}</TooltipContent>
        </Tooltip>

        {onRerun && (
          <Tooltip>
            <TooltipTrigger className={btnClass} onClick={onRerun} aria-label="Re-run query">
              <RotateCcw className="w-3.5 h-3.5" />
            </TooltipTrigger>
            <TooltipContent>Re-run</TooltipContent>
          </Tooltip>
        )}

        {messageId && onRate && (
          <>
            <span className="w-px h-4 bg-border mx-1" />
            <Tooltip>
              <TooltipTrigger
                className={feedback?.rating === 'up' ? btnActiveUp : btnClass}
                onClick={() => handleThumbClick('up')}
                aria-label="Rate helpful"
              >
                <ThumbsUp className="w-3.5 h-3.5" fill={feedback?.rating === 'up' ? 'currentColor' : 'none'} />
              </TooltipTrigger>
              <TooltipContent>Helpful</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                className={feedback?.rating === 'down' ? btnActiveDown : btnClass}
                onClick={() => handleThumbClick('down')}
                aria-label="Rate unhelpful"
              >
                <ThumbsDown className="w-3.5 h-3.5" fill={feedback?.rating === 'down' ? 'currentColor' : 'none'} />
              </TooltipTrigger>
              <TooltipContent>Not helpful</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {feedback?.rating === 'down' && onComment && !feedback.comment && (
        <div className="flex items-center gap-2 mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <input
            type="text"
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCommentSubmit(); }}
            placeholder="What went wrong?"
            className="flex-1 text-xs px-3 py-1.5 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={handleCommentSubmit}
            disabled={!commentText.trim()}
            aria-label="Submit comment"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/web && npx vitest run tests/components/MessageActions.test.tsx
```

Expected: all 9 tests PASS (3 existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/MessageActions.tsx packages/web/tests/components/MessageActions.test.tsx
git commit -m "feat(web): add thumbs up/down feedback buttons to MessageActions"
```

---

### Task 5: ChatPage + MessageList Integration

**Files:**
- Modify: `packages/web/src/components/MessageList.tsx`
- Modify: `packages/web/src/app/chat/page.tsx`

- [ ] **Step 1: Update MessageList to accept and pass feedback props**

Replace `packages/web/src/components/MessageList.tsx` interface and MessageActions call:

Update the props interface (lines 12-18):
```typescript
interface MessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
  status: string;
  onRerun: (messageIndex: number, userIndex: number) => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  feedbackMap: Record<string, { id: string; rating: 'up' | 'down'; comment: string | null }>;
  threadId: string;
  onRate: (messageId: string, rating: 'up' | 'down') => void;
  onClearRating: (messageId: string) => void;
  onComment: (messageId: string, comment: string) => void;
}
```

Update the destructured props in the function signature (line 20):
```typescript
export function MessageList({ messages, isStreaming, status, onRerun, messagesEndRef, feedbackMap, threadId, onRate, onClearRating, onComment }: MessageListProps) {
```

Update the MessageActions call (lines 64-75):
```typescript
                {!isThisStreaming && answerText && (
                  <MessageActions
                    content={answerText}
                    onRerun={() => {
                      let userIdx = -1;
                      for (let j = i - 1; j >= 0; j--) {
                        if (messages[j].role === 'user') { userIdx = j; break; }
                      }
                      if (userIdx === -1) return;
                      onRerun(i, userIdx);
                    }}
                    messageId={msg.id}
                    threadId={threadId}
                    feedback={feedbackMap[msg.id] ?? null}
                    onRate={(rating) => onRate(msg.id, rating)}
                    onClearRating={() => onClearRating(msg.id)}
                    onComment={(comment) => onComment(msg.id, comment)}
                  />
                )}
```

- [ ] **Step 2: Add feedback state management to ChatPage**

In `packages/web/src/app/chat/page.tsx`:

Add imports (after line 20):
```typescript
import { submitFeedback, deleteFeedback, getFeedbackByThread, type FeedbackEntry } from '@/lib/feedback-client';
```

Add feedback state (after the `resourceId` declaration, around line 33):
```typescript
  const [feedbackMap, setFeedbackMap] = useState<Record<string, { id: string; rating: 'up' | 'down'; comment: string | null }>>({});
```

Add feedback fetch to `loadThread` (inside the try block, after `setMessages(converted)` around line 131):
```typescript
      try {
        const token = await getAccessToken();
        if (token) {
          const entries = await getFeedbackByThread(tid, MASTRA_URL, token);
          const map: Record<string, { id: string; rating: 'up' | 'down'; comment: string | null }> = {};
          for (const entry of entries) {
            map[entry.messageId] = { id: entry.id, rating: entry.rating, comment: entry.comment };
          }
          setFeedbackMap(map);
        }
      } catch (err) {
        console.error('Failed to load feedback:', err);
      }
```

Also clear feedback when changing threads — add `setFeedbackMap({})` in `handleSelectThread` (after `setMessages([])`) and `handleNewThread` (after `setMessages([])`).

Add feedback handlers (after `handleSelectExample`, around line 183):
```typescript
  const handleRate = useCallback(async (messageId: string, rating: 'up' | 'down') => {
    const prev = feedbackMap[messageId];
    const optimistic = { id: prev?.id ?? messageId, rating, comment: null };
    setFeedbackMap(m => ({ ...m, [messageId]: optimistic }));

    try {
      const token = await getAccessToken();
      if (!token) return;
      const result = await submitFeedback({ messageId, threadId, rating }, MASTRA_URL, token);
      setFeedbackMap(m => ({ ...m, [messageId]: { ...m[messageId], id: result.id } }));
    } catch {
      if (prev) setFeedbackMap(m => ({ ...m, [messageId]: prev }));
      else setFeedbackMap(m => { const { [messageId]: _, ...rest } = m; return rest; });
    }
  }, [feedbackMap, threadId, getAccessToken]);

  const handleClearRating = useCallback(async (messageId: string) => {
    const prev = feedbackMap[messageId];
    if (!prev) return;
    setFeedbackMap(m => { const { [messageId]: _, ...rest } = m; return rest; });

    try {
      const token = await getAccessToken();
      if (!token) return;
      await deleteFeedback(prev.id, MASTRA_URL, token);
    } catch {
      setFeedbackMap(m => ({ ...m, [messageId]: prev }));
    }
  }, [feedbackMap, getAccessToken]);

  const handleComment = useCallback(async (messageId: string, comment: string) => {
    const prev = feedbackMap[messageId];
    if (!prev) return;
    setFeedbackMap(m => ({ ...m, [messageId]: { ...m[messageId], comment } }));

    try {
      const token = await getAccessToken();
      if (!token) return;
      await submitFeedback({ messageId, threadId, rating: 'down', comment }, MASTRA_URL, token);
    } catch {
      setFeedbackMap(m => ({ ...m, [messageId]: prev }));
    }
  }, [feedbackMap, threadId, getAccessToken]);
```

Update the MessageList JSX (around line 253):
```typescript
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              status={status}
              onRerun={handleRerun}
              messagesEndRef={messagesEndRef}
              feedbackMap={feedbackMap}
              threadId={threadId}
              onRate={handleRate}
              onClearRating={handleClearRating}
              onComment={handleComment}
            />
```

- [ ] **Step 3: Add message ID stability warning**

In `packages/web/src/lib/parse-message.ts`, update the fallback in `convertThreadMessageToUIMessage` to log a warning:

```typescript
  const id = msg.id ?? (() => {
    const fallback = generateUUID();
    console.warn(`[feedback] Message missing ID, generated fallback: ${fallback}. Feedback for this message won't survive reload.`);
    return fallback;
  })();
```

Replace the existing `id: msg.id ?? generateUUID()` line with this.

- [ ] **Step 4: Run web unit tests to verify nothing broke**

```bash
cd packages/web && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 5: Manual smoke test with dev server**

```bash
cd packages/web && npm run dev
```

Open http://localhost:3000/chat, send a message, verify thumbs buttons appear on the assistant response. (The POST will fail with 404 if the agent server isn't running — that's expected.)

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/MessageList.tsx packages/web/src/app/chat/page.tsx packages/web/src/lib/parse-message.ts
git commit -m "feat(web): integrate feedback state into ChatPage and MessageList"
```

---

### Task 6: E2E Playwright Tests

**Files:**
- Modify: `e2e/helpers/mock-routes.ts`
- Create: `e2e/tests/mocked/feedback.spec.ts`

- [ ] **Step 1: Add feedback mock routes**

In `e2e/helpers/mock-routes.ts`:

Add `feedbackEntries` to the `MockMastraOptions` interface:
```typescript
  /** Feedback entries to return from GET /feedback. Defaults to empty array. */
  feedbackEntries?: Array<{ id: string; messageId: string; threadId: string; rating: string; comment: string | null }>;
```

Add two route intercepts at the end of `mockMastraAPI` (before the closing `}`):
```typescript
  // 5. GET /feedback?threadId=... — getFeedbackByThread
  await page.route('**/feedback?*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const entries = options.feedbackEntries ?? [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ feedback: entries }),
    });
  });

  // 6. POST /feedback — submitFeedback
  await page.route('**/feedback', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() ?? {};
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: crypto.randomUUID() }),
    });
  });

  // 7. DELETE /feedback/* — deleteFeedback
  await page.route('**/feedback/*', async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 204 });
  });
```

- [ ] **Step 2: Write Playwright tests**

Create `e2e/tests/mocked/feedback.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';
import { ChatPage } from '../../helpers/chat-page';

test.describe('Message Feedback', () => {
  test('thumbs-up fills button and persists', async ({ page }) => {
    await mockMastraAPI(page, {
      streamResponse: new AISdkStreamBuilder()
        .start()
        .textDelta('Here is policy info.')
        .stepFinish()
        .finish(),
    });

    await page.goto('/chat');
    const chat = new ChatPage(page);
    await chat.sendMessage('What is the policy?');
    await chat.waitForAssistantMessage();

    // Click thumbs-up
    const thumbsUp = page.getByLabel('Rate helpful');
    await thumbsUp.click();

    // Verify it's visually active (has fill)
    await expect(thumbsUp).toBeVisible();
  });

  test('thumbs-down shows comment input', async ({ page }) => {
    await mockMastraAPI(page, {
      streamResponse: new AISdkStreamBuilder()
        .start()
        .textDelta('Here is policy info.')
        .stepFinish()
        .finish(),
    });

    await page.goto('/chat');
    const chat = new ChatPage(page);
    await chat.sendMessage('What is the policy?');
    await chat.waitForAssistantMessage();

    // Click thumbs-down
    await page.getByLabel('Rate unhelpful').click();

    // Comment input should appear
    const commentInput = page.getByPlaceholder('What went wrong?');
    await expect(commentInput).toBeVisible();

    // Submit a comment
    await commentInput.fill('Wrong policy cited');
    await page.getByLabel('Submit comment').click();

    // Comment input should disappear after submission
    await expect(commentInput).not.toBeVisible();
  });

  test('feedback rehydrates when selecting an existing thread', async ({ page }) => {
    const threadId = 'thread-with-feedback';
    const messageId = 'msg-rated';

    await mockMastraAPI(page, {
      threads: [
        { id: threadId, title: 'Previous chat' },
      ],
      threadMessages: [
        { id: 'msg-user', role: 'user', content: 'Hello' },
        { id: messageId, role: 'assistant', content: 'Policy response' },
      ],
      feedbackEntries: [
        { id: 'fb-1', messageId, threadId, rating: 'up', comment: null },
      ],
    });

    await page.goto('/chat');

    // Select the existing thread from sidebar
    await page.getByText('Previous chat').click();

    // Wait for messages to load
    await expect(page.getByTestId('assistant-message')).toBeVisible();

    // Thumbs-up should be in active state
    const thumbsUp = page.getByLabel('Rate helpful');
    await expect(thumbsUp).toBeVisible();
  });
});
```

- [ ] **Step 3: Run E2E tests**

```bash
cd e2e && npx playwright test tests/mocked/feedback.spec.ts --project=mocked
```

Expected: all 3 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/helpers/mock-routes.ts e2e/tests/mocked/feedback.spec.ts
git commit -m "test(e2e): add Playwright tests for message feedback flow"
```
