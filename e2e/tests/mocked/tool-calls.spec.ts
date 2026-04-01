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

    // Research trace should show the tool labels from ResearchTrace TOOLS map
    const trace = page.getByTestId('research-trace');
    await expect(trace.first()).toBeVisible();
    await expect(trace.first()).toContainText('Searching policies');
    await expect(trace.first()).toContainText('Reading section');
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

    // No research trace should be visible
    const trace = page.getByTestId('research-trace');
    await expect(trace).toHaveCount(0);
  });
});
