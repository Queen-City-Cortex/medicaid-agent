import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';

const PRIVATE = 'PRIVATE_DRAFT_SENTINEL';
test('corrected answers stay verified in the stream and after history reload', async ({ page }, testInfo) => {
  const stream = new AISdkStreamBuilder().start().textDelta('A corrected policy answer.')
    .dataPart('data-verification-status', { status: 'corrected', passCount: 2 }).finish();
  await mockMastraAPI(page, {
    streamResponse: stream,
    threads: [{ id: 'corrected', title: 'Corrected research' }],
    threadMessages: [{ id: 'a', role: 'assistant', content: { format: 2, parts: [
      { type: 'text', text: 'A corrected policy answer.' },
      { type: 'data-verification-status', data: { status: 'corrected', passCount: 2 } },
    ] } }],
  });
  const chat = new ChatPage(page);
  await chat.goto();
  await chat.sendMessage('What is covered?');
  const badge = page.getByTestId('verification-badge');
  await expect(badge).toHaveText('Corrected and verified against cited sources');
  await expect(badge).toHaveAttribute('data-outcome', 'corrected');
  await page.getByText('Corrected research', { exact: true }).click();
  await expect(badge).toHaveText('Corrected and verified against cited sources');
  await page.reload();
  await page.getByText('Corrected research', { exact: true }).click();
  await expect(badge).toHaveText('Corrected and verified against cited sources');
  await page.screenshot({ path: testInfo.outputPath('corrected-history.png'), fullPage: true });
});

test('withheld output cannot reveal draft prose and provides retry', async ({ page }) => {
  const stream = new AISdkStreamBuilder().start().textDelta(PRIVATE)
    .dataPart('data-verification-status', { status: 'withheld', reason: 'unavailable', passCount: 1 }).finish();
  await mockMastraAPI(page, { streamResponse: stream });
  const chat = new ChatPage(page);
  await chat.goto();
  await chat.sendMessage('What is covered?');
  await expect(page.getByTestId('verification-retry')).toBeVisible();
  await expect(page.getByText(PRIVATE)).toHaveCount(0);
  await expect(page.getByTestId('assistant-message')).toContainText('I could not verify this answer');
});

test('legacy unchecked history remains withheld after thread switching and reload', async ({ page }) => {
  await mockMastraAPI(page, { threads: [{ id: 'legacy', title: 'Legacy research' }],
    threadMessages: [{ id: 'u', role: 'user', content: 'Question' }, { id: 'a', role: 'assistant', content: PRIVATE }] });
  const chat = new ChatPage(page);
  await chat.goto();
  await page.getByText('Legacy research', { exact: true }).click();
  await expect(page.getByTestId('verification-retry')).toBeVisible();
  await expect(page.getByText(PRIVATE)).toHaveCount(0);
  await chat.newThread();
  await page.getByText('Legacy research', { exact: true }).click();
  await expect(page.getByTestId('verification-retry')).toBeVisible();
  await expect(page.getByText(PRIVATE)).toHaveCount(0);
  await page.reload();
  await page.getByText('Legacy research', { exact: true }).click();
  await expect(page.getByTestId('verification-retry')).toBeVisible();
  await expect(page.getByText(PRIVATE)).toHaveCount(0);
});
