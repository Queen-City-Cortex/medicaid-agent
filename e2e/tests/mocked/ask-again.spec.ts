import { test, expect, type Page } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';

interface StoredMessage { id: string; role: 'user' | 'assistant'; content: unknown }

/**
 * A stand-in for the agent's thread store: like the real chat route it keeps
 * only the newest user message of each request and appends it, with its
 * answer, to the end of the thread. Returns the request bodies it received.
 */
async function mockAppendingStore(page: Page) {
  const stored: StoredMessage[] = [];
  const requests: Array<{ messages: Array<{ role: string; parts: Array<{ type: string; text?: string }> }> }> = [];
  let threadId: string | null = null;

  await page.route('**/chat', async (route) => {
    const headers = route.request().headers();
    // Next server actions also POST to /chat; only the agent call is counted.
    if (route.request().method() !== 'POST' || headers['next-action'] || headers['next-router-state-tree']) {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON();
    requests.push(body);
    threadId = body.memory.thread;
    const question = [...body.messages].reverse().find((m: { role: string }) => m.role === 'user');
    const text = question.parts.map((part: { text?: string }) => part.text ?? '').join('');
    const reply = `Answer ${requests.length} to: ${text}`;
    stored.push(
      { id: `stored-u${requests.length}`, role: 'user', content: text },
      { id: `stored-a${requests.length}`, role: 'assistant', content: { format: 2, parts: [
        { type: 'text', text: reply },
        { type: 'data-verification-status', data: { status: 'passed', passCount: 1 } },
      ] } },
    );
    await route.fulfill(new AISdkStreamBuilder().start().textDelta(reply).stepFinish().finish().toFulfill());
  });

  await page.route('**/api/memory/threads?*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const threads = threadId ? [{ id: threadId, title: 'Stored thread' }] : [];
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ threads, total: threads.length, page: 0, perPage: 50, hasMore: false }) });
  });

  await page.route('**/api/memory/threads/*/messages*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ messages: stored, total: stored.length, page: 0, perPage: 100, hasMore: false }) });
  });

  return requests;
}

/** The questions and answers on screen, in order. */
function transcript(page: Page): Promise<string[]> {
  return page.locator('[data-testid="user-message"], [data-testid="assistant-message"]').evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('data-testid') === 'user-message'
      ? `Q: ${node.textContent?.trim()}`
      : `A: ${node.querySelector('.prose')?.textContent?.trim()}`));
}

test('asking an earlier question again adds a turn at the end, and a reload shows the same transcript', async ({ page }) => {
  await mockMastraAPI(page);
  const requests = await mockAppendingStore(page);
  const chat = new ChatPage(page);
  await chat.goto();

  await chat.sendMessage('Is dental covered?');
  await chat.waitForAssistantMessage('Answer 1 to: Is dental covered?');
  await chat.sendMessage('Is vision covered?');
  await chat.waitForAssistantMessage('Answer 2 to: Is vision covered?');

  await page.getByTestId('assistant-message').first().getByRole('button', { name: 'Ask again' }).click();
  await chat.waitForAssistantMessage('Answer 3 to: Is dental covered?');

  const expected = [
    'Q: Is dental covered?', 'A: Answer 1 to: Is dental covered?',
    'Q: Is vision covered?', 'A: Answer 2 to: Is vision covered?',
    'Q: Is dental covered?', 'A: Answer 3 to: Is dental covered?',
  ];
  expect(await transcript(page)).toEqual(expected);

  // The re-ask is one request carrying one user message: the question's text.
  expect(requests).toHaveLength(3);
  expect(requests[2].messages).toHaveLength(1);
  expect(requests[2].messages[0].role).toBe('user');
  expect(requests[2].messages[0].parts).toEqual([{ type: 'text', text: 'Is dental covered?' }]);

  await page.reload();
  await page.getByText('Stored thread', { exact: true }).click();
  await chat.waitForAssistantMessage('Answer 3 to: Is dental covered?');
  expect(await transcript(page)).toEqual(expected);
});
