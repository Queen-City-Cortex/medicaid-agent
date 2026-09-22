import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';

const PRIVATE = 'PRIVATE_DRAFT_SENTINEL';
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
