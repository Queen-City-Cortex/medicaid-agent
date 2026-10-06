import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';

test.describe('Abuse-guard UI', () => {
  test('renders a 429 rate-limit response as the server message without Try again', async ({ page }) => {
    await mockMastraAPI(page);

    await page.route('**/chat', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'retry-after': '720' },
        body: JSON.stringify({
          error: {
            code: 'rate_limited',
            message: "You've reached the limit of 30 messages per hour. Please try again in 12 minute(s).",
            retryAfterSeconds: 720,
            details: { limit: 30, window: 'hour' },
          },
        }),
      });
    });

    const chat = new ChatPage(page);
    await chat.goto();
    await chat.sendMessage('any question');

    const error = page.getByTestId('chat-error-rate-limited');
    await expect(error).toBeVisible();
    // Every dead end carries the reviewed help contacts.
    await expect(error.getByTestId('get-help')).toBeVisible();
    await expect(error).toContainText('limit of 30 messages per hour');
    // Retrying immediately would just re-429 — no Try again button.
    await expect(error.getByRole('button')).toHaveCount(0);
    // The user can still type (e.g. come back later or rephrase elsewhere).
    await expect(chat.input).toBeEnabled();
  });

  test('renders a 413 payload-too-large response with the server message', async ({ page }) => {
    await mockMastraAPI(page);

    await page.route('**/chat', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 413,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'payload_too_large',
            message: 'That request is too large. Start a new conversation or shorten your message.',
          },
        }),
      });
    });

    const chat = new ChatPage(page);
    await chat.goto();
    await chat.sendMessage('any question');

    const error = page.getByTestId('chat-error-payload-too-large');
    await expect(error).toBeVisible();
    await expect(error).toContainText('too large');
  });

  test('renders a guard tripwire stream as a friendly blocked-message notice', async ({ page }) => {
    await mockMastraAPI(page);

    // A tripwire aborts before generation: the transformer emits the
    // data-tripwire part and a finish with reason "other", never a text block.
    const stream = new AISdkStreamBuilder()
      .start()
      .dataPart('data-tripwire', {
        reason: 'off-topic request blocked',
        metadata: {
          code: 'off-topic',
          userMessage:
            'I can only help with NC Medicaid and related public-benefits questions — eligibility, coverage, appeals, notices, and how other programs interact with Medicaid. Try asking one of those.',
        },
        processorId: 'scope-gate',
      })
      .finish('other');

    await page.route('**/chat', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await route.fulfill(stream.toFulfill());
    });

    const chat = new ChatPage(page);
    await chat.goto();
    await chat.sendMessage('Write me a poem about pirates');

    const blocked = page.getByTestId('blocked-message');
    await expect(blocked).toBeVisible();
    await expect(blocked).toContainText('I can only help with NC Medicaid');
    // Not the generic error box, and input is re-enabled for a rephrase.
    await expect(page.getByTestId('chat-error')).toHaveCount(0);
    await expect(chat.input).toBeEnabled();
  });
});
