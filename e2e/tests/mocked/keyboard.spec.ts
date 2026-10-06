import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';

test.describe('Keyboard interactions', () => {
  test('Enter key sends the message', async ({ page }) => {
    const stream = new AISdkStreamBuilder()
      .start()
      .textDelta('Response.')
      .stepFinish()
      .finish();

    await mockMastraAPI(page, { streamResponse: stream });
    const chat = new ChatPage(page);
    await chat.goto();

    await chat.input.fill('Test via Enter');
    await chat.input.press('Enter');

    await expect(chat.userMessages().first()).toContainText('Test via Enter');
    await chat.waitForAssistantMessage('Response.');
  });

  test('Enter with empty input does nothing', async ({ page }) => {
    await mockMastraAPI(page);
    const chat = new ChatPage(page);
    await chat.goto();

    // Press Enter with empty input
    await chat.input.press('Enter');

    // No messages should appear
    await expect(chat.userMessages()).toHaveCount(0);
    await expect(chat.emptyHeading).toBeVisible();
  });

  test('input stays enabled across a run and can send again after completion', async ({ page }) => {
    // The textarea is intentionally NOT disabled while streaming (users can
    // draft their next question; the action button becomes Stop). route.fulfill
    // resolves instantly, so this asserts the post-run state.
    const stream = new AISdkStreamBuilder()
      .start()
      .textDelta('Done.')
      .stepFinish()
      .finish();

    await mockMastraAPI(page, { streamResponse: stream });
    const chat = new ChatPage(page);
    await chat.goto();

    await chat.input.fill('Test');
    await chat.sendButton.click();

    // After completion, input should be re-enabled
    await chat.waitForAssistantMessage('Done.');
    await expect(chat.input).toBeEnabled();
  });

  test('Tab moves through the composer in reading order', async ({ page }) => {
    await mockMastraAPI(page);
    const chat = new ChatPage(page);
    await chat.goto();

    // The Ask button only joins the tab order once there is something to send.
    await chat.input.fill('Draft question');
    await expect(chat.input).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(chat.sendButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Terms' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' })).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(chat.input).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('deep-research-toggle')).toBeFocused();
  });
});
