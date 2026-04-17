import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';

test.describe('Tool calls', () => {
  test('research trace shows tool names and marks them done', async ({ page }) => {
    const stream = new AISdkStreamBuilder()
      .start()
      .toolCall('searchSections', 'tc-searchSections', {})
      .toolResult('tc-searchSections', [{ id: 'sec-1', title: 'Test Section' }])
      .toolCall('getSection', 'tc-getSection', {})
      .toolResult('tc-getSection', { content: 'Section content' })
      .textDelta('Based on the policy, coverage is available.')
      .stepFinish()
      .finish();

    await mockMastraAPI(page, { streamResponse: stream });
    const chat = new ChatPage(page);
    await chat.goto();

    await chat.sendMessage('Does NC Medicaid cover dental?');

    // Wait for the assistant message to confirm everything completed
    await chat.waitForAssistantMessage('coverage is available');

    // One ToolStep renders per tool call, each with its own label.
    const steps = page.getByTestId('tool-step');
    await expect(steps).toHaveCount(2);
    await expect(steps.nth(0)).toContainText('Searching policies');
    await expect(steps.nth(1)).toContainText('Reading section');
  });

  test('stream with only text and no tools renders without trace', async ({ page }) => {
    const stream = new AISdkStreamBuilder()
      .start()
      .textDelta('Simple answer with no tools.')
      .stepFinish()
      .finish();

    await mockMastraAPI(page, { streamResponse: stream });
    const chat = new ChatPage(page);
    await chat.goto();

    await chat.sendMessage('Simple question');

    await chat.waitForAssistantMessage('Simple answer with no tools.');

    // No ToolStep should render when the stream has no tool calls.
    const steps = page.getByTestId('tool-step');
    await expect(steps).toHaveCount(0);
  });
});
