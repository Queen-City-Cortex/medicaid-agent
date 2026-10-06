import type { Page } from '@playwright/test';
import type { AISdkStreamBuilder } from './stream-builder';

/**
 * Answers the agent's chat request with the start of a stream that then stays
 * open until the browser aborts it. `route.fulfill` can only send a complete
 * body, so the page's own `fetch` is wrapped instead.
 */
export async function holdChatStreamOpen(page: Page, partial: AISdkStreamBuilder) {
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
