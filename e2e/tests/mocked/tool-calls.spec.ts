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

  test('Sources panel appears when tool outputs carry policy URLs', async ({ page }) => {
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
      .toolCall('lookupPolicy', 'tc-lookup-3k2', {})
      .toolResult('tc-lookup-3k2', {
        documents: [
          {
            id: 'doc:clinical_policy:3K-2',
            title: 'CAP/DA Waiver',
            policyNumber: '3K-2',
            url: 'https://medicaid.ncdhhs.gov/3k-2/download',
          },
        ],
      })
      .textDelta('Here is the answer.')
      .stepFinish()
      .finish();

    await mockMastraAPI(page, { streamResponse: stream });
    const chat = new ChatPage(page);
    await chat.goto();

    await chat.sendMessage('Test sources panel');
    await chat.waitForAssistantMessage('Here is the answer.');

    // Panel appears and shows the count.
    const panel = page.getByTestId('sources-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Sources');
    await expect(panel).toContainText('2 sources');

    // Expand and verify the links.
    await page.getByTestId('sources-panel-trigger').click();
    const items = page.getByTestId('source-item');
    await expect(items).toHaveCount(2);

    // First link goes to the 8C section PDF in a new tab.
    const firstLink = items.nth(0).getByRole('link');
    await expect(firstLink).toHaveAttribute('href', 'https://medicaid.ncdhhs.gov/8c/download');
    await expect(firstLink).toHaveAttribute('target', '_blank');
    await expect(firstLink).toContainText('Policy 8C § 3.2.1');

    // Second entry is the policy lookup document.
    const secondLink = items.nth(1).getByRole('link');
    await expect(secondLink).toHaveAttribute('href', 'https://medicaid.ncdhhs.gov/3k-2/download');
    await expect(secondLink).toContainText('Policy 3K-2');
  });
});
