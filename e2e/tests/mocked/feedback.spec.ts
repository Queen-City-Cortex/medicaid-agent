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

  test('a comment refused for a client identifier stays in the box with the reason', async ({ page }) => {
    await mockMastraAPI(page, {
      streamResponse: new AISdkStreamBuilder()
        .start()
        .textDelta('Here is policy info.')
        .stepFinish()
        .finish(),
    });
    const message = 'Remove client-identifying information before sending this comment.';
    // Registered after the shared mock, so it answers comment submissions first.
    await page.route('**/feedback', async (route) => {
      const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
      if (!body?.comment?.includes('900123456K')) return route.fallback();
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'client_identifier_detected', message } }),
      });
    });

    await page.goto('/chat');
    const chat = new ChatPage(page);
    await chat.sendMessage('What is the policy?');
    await chat.waitForAssistantMessage();
    await page.getByLabel('Rate unhelpful').click();

    const commentInput = page.getByPlaceholder('What went wrong?');
    await expect(page.getByText(/Our team may read your rating, your comment/)).toBeVisible();
    await commentInput.fill('Her Medicaid ID is 900123456K');
    await page.getByLabel('Submit comment').click();
    await expect(page.getByText(message)).toBeVisible();
    await expect(commentInput).toHaveValue('Her Medicaid ID is 900123456K');

    await commentInput.fill('Her record has a different category');
    await page.getByLabel('Submit comment').click();
    await expect(commentInput).not.toBeVisible();
    await expect(page.getByText(message)).not.toBeVisible();
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

  test('research trace renders from V2 format messages on thread reload', async ({ page }) => {
    const threadId = 'thread-with-tools';

    await mockMastraAPI(page, {
      threads: [
        { id: threadId, title: 'Chiropractic coverage' },
      ],
      threadMessages: [
        { id: 'msg-q', role: 'user', content: 'Does NC Medicaid cover chiropractic?' },
        {
          id: 'msg-a',
          role: 'assistant',
          content: {
            format: 2,
            parts: [
              { type: 'text', text: 'Let me search for that policy.' },
              {
                type: 'tool-invocation',
                toolInvocation: {
                  toolCallId: 'tc-1',
                  toolName: 'searchSections',
                  args: { query: 'chiropractic' },
                  result: { sections: [{ id: 's1', title: 'Chiropractic Services' }] },
                  state: 'result',
                },
              },
              { type: 'text', text: '## Answer\n\nYes, NC Medicaid covers chiropractic services under Policy 1F.' },
              { type: 'data-verification-status', data: { status: 'passed', passCount: 1 } },
            ],
          },
        },
      ],
    });

    await page.goto('/chat');
    await page.getByText('Chiropractic coverage').click();

    // Wait for assistant message to load
    await expect(page.getByTestId('assistant-message')).toBeVisible();

    // P2 UX redesign: on a restored/completed message the tool steps collapse
    // into the "Research trail" Collapsible; expand it to see the tool name.
    await page.getByTestId('research-trail-trigger').click();
    // Research trace should show the tool call
    await expect(page.getByText('Searching policies')).toBeVisible();

    // Answer should render as markdown with heading
    await expect(page.getByRole('heading', { name: 'Answer', exact: true })).toBeVisible();
    await expect(page.getByText('Yes, NC Medicaid covers chiropractic services under Policy 1F.')).toBeVisible();
  });
});
