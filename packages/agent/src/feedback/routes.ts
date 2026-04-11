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
