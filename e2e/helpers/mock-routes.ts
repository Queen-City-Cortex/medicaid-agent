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

/**
 * One page of `stored` (oldest first), paged as the server pages it: 40 rows
 * unless `perPage` says otherwise; the newest rows first unless `orderBy` asks
 * for ascending; and the rows of a page oldest first whichever way it was cut.
 */
export function pageOfMessages(stored: MockMessage[], url: URL) {
  const page = Number(url.searchParams.get('page') ?? 0);
  const perPage = Number(url.searchParams.get('perPage') ?? 40);
  const orderBy = JSON.parse(url.searchParams.get('orderBy') ?? '{}') as { direction?: string };
  const offset = page * perPage;
  const messages = orderBy.direction === 'ASC'
    ? stored.slice(offset, offset + perPage)
    : stored.slice(Math.max(0, stored.length - offset - perPage), stored.length - offset);
  return { messages, total: stored.length, page, perPage, hasMore: offset + perPage < stored.length };
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

  // 2. GET /api/memory/threads — listMemoryThreads. The agent has no route
  // that creates a thread: it creates one itself when it accepts the first
  // message on /chat. A spec that needs the new thread listed adds it to the
  // `threads` array it passed in, from its own /chat handler.
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
    if (route.request().method() === 'POST') {
      // What the agent's gateway answers.
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }),
      });
      return;
    }

    await route.fallback();
  });

  // 3. GET /api/memory/threads/:id/messages — listMessages
  await page.route('**/api/memory/threads/*/messages*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(pageOfMessages(options.threadMessages ?? [], new URL(route.request().url()))),
    });
  });

  // 3b. GET /api/memory/threads/:id — the thread record, read by export
  await page.route('**/api/memory/threads/*', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    const thread = (options.threads ?? []).find((candidate) => candidate.id === id);
    if (route.request().method() !== 'GET' || !thread) {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(thread) });
  });

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

  // 4. POST /feedback — submitFeedback
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

  // 5. DELETE /feedback/* — deleteFeedback
  await page.route('**/feedback/*', async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 204 });
  });
  // 6. GET /research/runs/current — the chat page asks for the caller's active
  // deep-research run on load; 204 means there is none.
  await page.route('**/research/runs/current', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 204 });
  });
}
