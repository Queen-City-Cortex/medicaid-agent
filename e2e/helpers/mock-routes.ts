import type { Page } from '@playwright/test';
import { AISdkStreamBuilder } from './stream-builder';

interface MockThread {
  id: string;
  title: string;
  resourceId?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

interface MockMessage {
  id?: string;
  role: string;
  content: string | Record<string, unknown>;
  createdAt?: string;
}

export interface MockMastraOptions {
  /** Response for the /chat endpoint. Defaults to a single text-delta "Mock response." */
  streamResponse?: AISdkStreamBuilder;
  /** Threads to return from listMemoryThreads. Defaults to empty array. */
  threads?: MockThread[];
  /** Messages to return from listMessages. Defaults to empty array. */
  threadMessages?: MockMessage[];
  /** Feedback entries to return from GET /feedback. Defaults to empty array. */
  feedbackEntries?: Array<{ id: string; messageId: string; threadId: string; rating: string; comment: string | null }>;
}

function isNextServerAction(headers: Record<string, string>): boolean {
  return Boolean(headers['next-action'] || headers['next-router-state-tree']);
}

/**
 * Set up page.route() intercepts for all Mastra API endpoints the frontend calls.
 * Call this before navigating to the chat page.
 */
export async function mockMastraAPI(page: Page, options: MockMastraOptions = {}): Promise<void> {
  // 1. POST /chat
  await page.route('**/chat', async (route) => {
    if (route.request().method() !== 'POST' || isNextServerAction(route.request().headers())) {
      await route.fallback();
      return;
    }
    const stream = options.streamResponse
      ?? new AISdkStreamBuilder()
          .start()
          .textDelta('Mock response.')
          .stepFinish()
          .finish();
    await route.fulfill(stream.toFulfill());
  });

  // 2. GET /api/memory/threads — listMemoryThreads
  await page.route('**/api/memory/threads?*', async (route) => {
    if (route.request().method() === 'GET') {
      const threads = options.threads ?? [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          threads,
          total: threads.length,
          page: 0,
          perPage: 50,
          hasMore: false,
        }),
      });
      return;
    }

    // 3. POST /api/memory/threads — createMemoryThread
    if (route.request().method() === 'POST') {
      let body: Record<string, unknown> = {};
      try {
        body = route.request().postDataJSON() ?? {};
      } catch {
        // empty body is fine
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: (body.threadId as string) ?? crypto.randomUUID(),
          title: (body.title as string) ?? 'New conversation',
          resourceId: 'anonymous',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          metadata: {},
        }),
      });
      return;
    }

    await route.fallback();
  });

  // 4. GET /api/memory/threads/:id/messages — listMessages
  await page.route('**/api/memory/threads/*/messages*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const messages = options.threadMessages ?? [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        messages,
        total: messages.length,
        page: 0,
        perPage: 100,
        hasMore: false,
      }),
    });
  });

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
  // 8. GET /research/runs/current — the chat page asks for the caller's active
  // deep-research run on load; 204 means there is none.
  await page.route('**/research/runs/current', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 204 });
  });
}
