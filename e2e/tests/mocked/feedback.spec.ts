import { test, expect } from '@playwright/test';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';
import { ChatPage } from '../../helpers/chat-page';

test.describe('Message Feedback', () => {
  test('thumbs-up fills button and persists', async ({ page }) => {
    await mockMastraAPI(page, {
      streamResponse: new AISdkStreamBuilder()
        .start()
        .textDelta('Here is policy info.')
        .stepFinish()
        .finish(),
    });

    await page.goto('/chat');
    const chat = new ChatPage(page);
    await chat.sendMessage('What is the policy?');
    await chat.waitForAssistantMessage();

    // Click thumbs-up
    const thumbsUp = page.getByLabel('Rate helpful');
    await thumbsUp.click();

    // Verify it's visually active (has fill)
    await expect(thumbsUp).toBeVisible();
  });

  test('thumbs-down shows comment input', async ({ page }) => {
    await mockMastraAPI(page, {
      streamResponse: new AISdkStreamBuilder()
        .start()
        .textDelta('Here is policy info.')
        .stepFinish()
        .finish(),
    });

    await page.goto('/chat');
    const chat = new ChatPage(page);
    await chat.sendMessage('What is the policy?');
    await chat.waitForAssistantMessage();

    // Click thumbs-down
    await page.getByLabel('Rate unhelpful').click();

    // Comment input should appear
    const commentInput = page.getByPlaceholder('What went wrong?');
    await expect(commentInput).toBeVisible();

    // Submit a comment
    await commentInput.fill('Wrong policy cited');
    await page.getByLabel('Submit comment').click();

    // Comment input should disappear after submission
    await expect(commentInput).not.toBeVisible();
  });

  test('feedback rehydrates when selecting an existing thread', async ({ page }) => {
    const threadId = 'thread-with-feedback';
    const messageId = 'msg-rated';

    await mockMastraAPI(page, {
      threads: [
        { id: threadId, title: 'Previous chat' },
      ],
      threadMessages: [
        { id: 'msg-user', role: 'user', content: 'Hello' },
        { id: messageId, role: 'assistant', content: 'Policy response' },
      ],
      feedbackEntries: [
        { id: 'fb-1', messageId, threadId, rating: 'up', comment: null },
      ],
    });

    await page.goto('/chat');

    // Select the existing thread from sidebar
    await page.getByText('Previous chat').click();

    // Wait for messages to load
    await expect(page.getByTestId('assistant-message')).toBeVisible();

    // Thumbs-up should be in active state
    const thumbsUp = page.getByLabel('Rate helpful');
    await expect(thumbsUp).toBeVisible();
  });
});
