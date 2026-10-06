import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';

test.describe('Keyboard interactions', () => {
  test('Enter on a footnote moves focus to its source link, opening the Sources panel if it was closed', async ({ page }) => {
    const stream = new AISdkStreamBuilder()
      .start()
      .toolCall('getSection', 'tc-get-8c', {})
      .toolResult('tc-get-8c', {
        section: {
          id: 'sec:doc:clinical_policy:8C:3.2.1',
          title: 'Outpatient Behavioral Health Services',
          sectionNumber: '3.2.1',
          policyNumber: '8C',
          url: 'https://medicaid.ncdhhs.gov/8c/download',
        },
      })
      .textDelta('Covered under [Policy 8C § 3.2.1](https://medicaid.ncdhhs.gov/8c/download).')
      .stepFinish()
      .finish();
    await mockMastraAPI(page, { streamResponse: stream });
    const chat = new ChatPage(page);
    await chat.goto();
    await chat.sendMessage('What does Policy 8C cover?');
    await chat.waitForAssistantMessage('Covered under');

    const footnote = page.getByTestId('citation-footnote');
    const sourceLink = page.getByTestId('source-item').getByRole('link');
    await footnote.focus();
    await page.keyboard.press('Enter');
    await expect(sourceLink).toBeFocused();

    // Close the panel; the footnote opens it again and focus still arrives.
    await page.getByTestId('sources-panel-trigger').click();
    await expect(sourceLink).toBeHidden();
    await footnote.focus();
    await expect(footnote).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(sourceLink).toBeFocused();
  });

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
