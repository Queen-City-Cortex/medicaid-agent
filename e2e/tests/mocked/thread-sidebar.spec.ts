import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { MastraStreamBuilder } from '../../helpers/stream-builder';

test.describe('Thread sidebar', () => {
  test('renders thread list from API', async ({ page }) => {
    await mockMastraAPI(page, {
      threads: [
        { id: 'thread-1', title: 'Does Medicaid cover dental?', updatedAt: new Date().toISOString() },
        { id: 'thread-2', title: 'EPSDT benefits for children', updatedAt: new Date(Date.now() - 86400000).toISOString() },
      ],
    });
    const chat = new ChatPage(page);
    await chat.goto();

    await expect(chat.threadItems()).toHaveCount(2);
    await expect(chat.threadItems().first()).toContainText('Does Medicaid cover dental?');
    await expect(chat.threadItems().nth(1)).toContainText('EPSDT benefits for children');
  });

  test('clicking + New clears the conversation', async ({ page }) => {
    const stream = new MastraStreamBuilder()
      .textDelta('Answer.')
      .finish()
      .done();

    await mockMastraAPI(page, { streamResponse: stream });
    const chat = new ChatPage(page);
    await chat.goto();

    // Send a message first
    await chat.sendMessage('Test question');
    await chat.waitForAssistantMessage('Answer.');

    // Click + New
    await chat.newThread();

    // Messages should be cleared, empty state should return
    await expect(chat.emptyHeading).toBeVisible();
    await expect(chat.userMessages()).toHaveCount(0);
  });

  test('shows "No threads yet" when empty', async ({ page }) => {
    await mockMastraAPI(page, { threads: [] });
    const chat = new ChatPage(page);
    await chat.goto();

    await expect(page.getByText('No threads yet')).toBeVisible();
  });
});
