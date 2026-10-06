import { test, expect, type Page } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';

const PRIVATE = 'PRIVATE_DRAFT_SENTINEL';

/**
 * Answers the agent's chat request with the start of a stream that then stays
 * open until the browser aborts it. `route.fulfill` can only send a complete
 * body, so the page's own `fetch` is wrapped instead.
 */
async function holdChatStreamOpen(page: Page, partial: AISdkStreamBuilder) {
  await page.addInitScript((body) => {
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      const headers = new Headers(init?.headers);
      // Next server actions also POST to /chat; leave those alone.
      const isAgentChat = init?.method === 'POST' && url.pathname === '/chat'
        && !headers.has('next-action') && !headers.has('next-router-state-tree');
      if (!isAgentChat) return realFetch(input, init);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
        },
      });
      return Promise.resolve(new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
      }));
    };
  }, partial.toBody());
}

test.describe('Stopped and dropped answers', () => {
  test('Stop during the tool loop shows a stopped notice and no progress indicator', async ({ page }) => {
    await mockMastraAPI(page);
    await holdChatStreamOpen(page, new AISdkStreamBuilder().start()
      .toolCall('searchSections', 'tc-1', { query: 'dental' })
      .toolResult('tc-1', { sections: [] })
      .toolCall('getSection', 'tc-2', { sectionId: 'section-1' }));
    const chat = new ChatPage(page);
    await chat.goto();
    await chat.sendMessage('Is dental covered?');

    const answer = page.getByTestId('assistant-message');
    await expect(page.getByTestId('progress-narration')).toBeVisible();
    await expect(answer.locator('.animate-spin')).not.toHaveCount(0);

    await page.getByTestId('stop-button').click();

    const notice = page.getByTestId('ended-without-answer');
    await expect(notice).toContainText('You stopped this answer.');
    await expect(notice).not.toContainText(/error/i);
    await expect(answer.getByText('Interrupted')).toBeVisible();
    await expect(page.locator('.animate-spin')).toHaveCount(0);
    await expect(page.getByTestId('progress-narration')).toHaveCount(0);
    await expect(page.getByTestId('loading-indicator')).toHaveCount(0);
    await expect(page.getByTestId('chat-error')).toHaveCount(0);
    await expect(page.getByTestId('chat-status-announcer')).toHaveText('Answer stopped');
    await expect(chat.input).toBeEnabled();
  });

  test('Stop while the answer is being checked drops the checking line and keeps the draft hidden', async ({ page }) => {
    await mockMastraAPI(page);
    await holdChatStreamOpen(page, new AISdkStreamBuilder().start()
      .textDelta(PRIVATE)
      .dataPart('data-verification-status', { status: 'verifying' }));
    const chat = new ChatPage(page);
    await chat.goto();
    await chat.sendMessage('Is dental covered?');

    await expect(page.getByTestId('verification-progress')).toBeVisible();

    await page.getByTestId('stop-button').click();

    await expect(page.getByTestId('ended-without-answer')).toContainText('You stopped this answer.');
    await expect(page.getByTestId('verification-progress')).toHaveCount(0);
    await expect(page.locator('.animate-spin')).toHaveCount(0);
    await expect(page.getByText(PRIVATE)).toHaveCount(0);
  });

  test('Stop before the answer begins puts the stopped notice under the question', async ({ page }) => {
    await mockMastraAPI(page);
    await holdChatStreamOpen(page, new AISdkStreamBuilder());
    const chat = new ChatPage(page);
    await chat.goto();
    await chat.sendMessage('Is dental covered?');

    await expect(chat.startingResearch).toBeVisible();

    await page.getByTestId('stop-button').click();

    await expect(page.getByTestId('stopped-before-answer')).toContainText('You stopped this answer.');
    await expect(chat.startingResearch).toHaveCount(0);
    await expect(chat.userMessages()).toHaveCount(1);
  });

  test('a dropped connection says so, with one retry and no stopped notice', async ({ page }) => {
    await mockMastraAPI(page);
    await page.route('**/chat', async (route) => {
      const headers = route.request().headers();
      if (route.request().method() !== 'POST' || headers['next-action'] || headers['next-router-state-tree']) {
        await route.fallback();
        return;
      }
      await route.abort('connectionreset');
    });
    const chat = new ChatPage(page);
    await chat.goto();
    await chat.sendMessage('Is dental covered?');

    const box = page.getByTestId('chat-error-disconnected');
    await expect(box).toContainText('The connection dropped before the answer finished.');
    await expect(page.getByRole('button', { name: /try again|ask again/i })).toHaveCount(1);
    await expect(page.getByTestId('stopped-before-answer')).toHaveCount(0);
    await expect(page.getByTestId('ended-without-answer')).toHaveCount(0);
  });
});
