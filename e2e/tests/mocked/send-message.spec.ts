import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { MastraStreamBuilder } from '../../helpers/stream-builder';

test.describe('Send message', () => {
  test('user message appears and assistant streams a response', async ({ page }) => {
    const stream = new MastraStreamBuilder()
      .textDelta('NC Medicaid covers ')
      .textDelta('dental services ')
      .textDelta('for children.')
      .finish()
      .done();

    await mockMastraAPI(page, { streamResponse: stream });
    const chat = new ChatPage(page);
    await chat.goto();

    await chat.sendMessage('Does NC Medicaid cover dental?');

    // User message should appear
    await expect(chat.userMessages().first()).toContainText('Does NC Medicaid cover dental?');

    // Assistant message should appear with the full streamed text
    const assistant = await chat.waitForAssistantMessage('NC Medicaid covers dental services for children.');
    await expect(assistant).toBeVisible();
  });

  test('input is re-enabled after response completes', async ({ page }) => {
    const stream = new MastraStreamBuilder()
      .textDelta('Response.')
      .finish()
      .done();

    await mockMastraAPI(page, { streamResponse: stream });
    const chat = new ChatPage(page);
    await chat.goto();

    await chat.sendMessage('Test question');

    // Wait for assistant message to confirm stream completed
    await chat.waitForAssistantMessage('Response.');

    // Input should be re-enabled
    await expect(chat.input).toBeEnabled();
    await expect(chat.sendButton).toBeDisabled(); // disabled because input is now empty
  });

  test('empty state disappears after sending a message', async ({ page }) => {
    const stream = new MastraStreamBuilder()
      .textDelta('Answer.')
      .finish()
      .done();

    await mockMastraAPI(page, { streamResponse: stream });
    const chat = new ChatPage(page);
    await chat.goto();

    await expect(chat.emptyHeading).toBeVisible();

    await chat.sendMessage('Test');

    // Empty state should be gone
    await expect(chat.emptyHeading).not.toBeVisible();
  });
});
