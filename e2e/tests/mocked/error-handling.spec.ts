import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';

test.describe('Error handling', () => {
  test('shows error message when agent returns 500', async ({ page }) => {
    await mockMastraAPI(page);

    // Override the chat route to return an error (POST only — avoid intercepting page navigation)
    await page.route('**/chat', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    const chat = new ChatPage(page);
    await chat.goto();

    await chat.sendMessage('This should fail');

    // Error message should appear as an assistant message
    const errorMsg = await chat.waitForAssistantMessage('error processing your question');
    await expect(errorMsg).toBeVisible();
  });

  test('input is re-enabled after an error', async ({ page }) => {
    await mockMastraAPI(page);

    await page.route('**/chat', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    const chat = new ChatPage(page);
    await chat.goto();

    await chat.sendMessage('This should fail');

    await chat.waitForAssistantMessage('error processing');

    // Input should be re-enabled so user can try again
    await expect(chat.input).toBeEnabled();
  });
});
