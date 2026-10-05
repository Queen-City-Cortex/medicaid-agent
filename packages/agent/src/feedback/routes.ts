import { registerApiRoute } from '@mastra/core/server';
import type { ContextWithMastra } from '@mastra/core/server';
import { FeedbackInputSchema } from '@nc-medicaid/contracts';
import type { FeedbackRepository } from './repository.js';
import { log } from '../logger.js';

export function getResourceId(c: ContextWithMastra): string | null {
  const rc = c.get('requestContext');
  const user = rc?.get?.('user') as { userId?: string; id?: string } | undefined;
  return user?.userId ?? user?.id ?? null;
}

export function createFeedbackRoutes(repo: FeedbackRepository): {
  post: (c: ContextWithMastra) => Promise<Response>;
  get: (c: ContextWithMastra) => Promise<Response>;
  del: (c: ContextWithMastra) => Promise<Response>;
} {
  const post = async (c: ContextWithMastra): Promise<Response> => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      log.warn('feedback.invalid_json', { resourceId: getResourceId(c) });
      return c.json({ error: { code: 'invalid_json', message: 'Invalid JSON' } }, 400);
    }

    const parsed = FeedbackInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: 'validation_failed', message: 'Validation failed', details: parsed.error.flatten() } }, 400);
    }

    const resourceId = getResourceId(c);
    if (!resourceId) return c.json({ error: { code: 'unauthorized', message: 'Not authenticated' } }, 401);
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

  const get = async (c: ContextWithMastra): Promise<Response> => {
    const threadId = c.req.query('threadId');
    if (!threadId) {
      return c.json({ error: { code: 'thread_id_required', message: 'threadId query parameter is required' } }, 400);
    }

    const resourceId = getResourceId(c);
    if (!resourceId) return c.json({ error: { code: 'unauthorized', message: 'Not authenticated' } }, 401);
    const feedback = await repo.getByThread(threadId, resourceId);
    return c.json({ feedback }, 200);
  };

  const del = async (c: ContextWithMastra): Promise<Response> => {
    const id = c.req.param('id');
    if (!id) return c.json({ error: { code: 'feedback_id_required', message: 'Feedback id is required' } }, 400);
    const resourceId = getResourceId(c);
    if (!resourceId) return c.json({ error: { code: 'unauthorized', message: 'Not authenticated' } }, 401);
    const deleted = await repo.delete(id, resourceId);

    if (!deleted) {
      return c.json({ error: { code: 'not_found', message: 'Feedback not found' } }, 404);
    }
    // 204 must not have a body — c.json(null, 204) throws in Hono.
    return c.body(null, 204);
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
