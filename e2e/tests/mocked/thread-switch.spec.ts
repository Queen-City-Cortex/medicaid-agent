import { test, expect, type Page } from '@playwright/test';
import { expectNoNewViolations } from '../../helpers/axe';
import { ChatPage } from '../../helpers/chat-page';
import { holdChatStreamOpen } from '../../helpers/held-stream';
import { mockMastraAPI, pageOfMessages } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';

const THREADS = [
  { id: 'thread-answered', title: 'Does Medicaid cover dental?', updatedAt: new Date().toISOString() },
  { id: 'thread-unfinished', title: 'EPSDT benefits for children', updatedAt: new Date(Date.now() - 86_400_000).toISOString() },
];

const SEARCH = {
  type: 'tool-invocation',
  toolInvocation: { toolCallId: 'tc-stored', toolName: 'searchSections', args: { query: 'EPSDT' }, result: { sections: [] }, state: 'result' },
};

// What the server holds for each thread: one finished turn, and one turn that
// has tool steps and no answer, which is how a run still going looks.
const STORED: Record<string, Array<{ id: string; role: string; content: string | Record<string, unknown>; createdAt: string }>> = {
  'thread-answered': [
    { id: 'answered-q', role: 'user', content: 'Does Medicaid cover dental?', createdAt: '2026-06-22T15:30:00.000Z' },
    {
      id: 'answered-a', role: 'assistant', createdAt: '2026-06-22T15:30:05.000Z',
      content: { format: 2, parts: [{ type: 'text', text: 'Dental services are covered.' }, { type: 'data-verification-status', data: { status: 'passed', passCount: 1 } }] },
    },
  ],
  'thread-unfinished': [
    { id: 'unfinished-q', role: 'user', content: 'What does EPSDT cover?', createdAt: '2026-06-22T16:30:00.000Z' },
    { id: 'unfinished-a', role: 'assistant', createdAt: '2026-06-22T16:30:05.000Z', content: { format: 2, parts: [SEARCH] } },
  ],
};

async function mockThreads(page: Page) {
  await mockMastraAPI(page, { threads: THREADS });
  await page.route('**/api/memory/threads/*/messages*', async (route) => {
    const url = new URL(route.request().url());
    const threadId = url.pathname.split('/').at(-2) ?? '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(pageOfMessages(STORED[threadId] ?? [], url)),
    });
  });
}

test.describe('Switching threads', () => {
  test('an answer on its way keeps streaming while another thread is open, and can be stopped on return', async ({ page }) => {
    await mockThreads(page);
    await holdChatStreamOpen(page, new AISdkStreamBuilder().start()
      .toolCall('searchSections', 'tc-1', { query: 'dental' })
      .toolResult('tc-1', { sections: [] })
      .toolCall('getSection', 'tc-2', { sectionId: 'section-1' }));
    const chat = new ChatPage(page);
    await chat.goto();

    await page.getByText('Does Medicaid cover dental?').click();
    await expect(page.getByText('Dental services are covered.')).toBeVisible();
    await chat.sendMessage('And for adults?');
    await expect(page.getByTestId('progress-narration')).toBeVisible();

    // Away: the other thread is shown as it is stored, idle, and nothing is
    // announced as finished.
    await page.getByText('EPSDT benefits for children').click();
    await expect(page.getByTestId('stored-without-answer')).toBeVisible();
    await expect(chat.userMessages()).toHaveCount(1);
    await expect(page.getByTestId('progress-narration')).toHaveCount(0);
    await expect(page.getByTestId('stop-button')).toHaveCount(0);
    await expect(page.getByTestId('chat-status-announcer')).toHaveText('');

    // Back: still researching, not a stored copy of half a turn.
    await page.getByText('Does Medicaid cover dental?').click();
    await expect(page.getByTestId('progress-narration')).toBeVisible();
    await expect(chat.userMessages()).toHaveCount(2);
    await expect(page.getByTestId('stored-without-answer')).toHaveCount(0);
    await expect(page.getByTestId('ended-without-answer')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);

    await page.getByTestId('stop-button').click();
    await expect(page.getByTestId('ended-without-answer')).toContainText('You stopped this answer.');
    await expect(page.getByTestId('progress-narration')).toHaveCount(0);
  });

  test('a stored turn with steps and no answer is a plain note with no retry', async ({ page }) => {
    await mockThreads(page);
    const chatRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/chat' && !request.headers()['next-action']) {
        chatRequests.push(request.url());
      }
    });
    const chat = new ChatPage(page);
    await chat.goto();

    await page.getByText('EPSDT benefits for children').click();

    const note = page.getByTestId('stored-without-answer');
    await expect(note).toContainText('No answer has been saved for this question.');
    await expect(note).toContainText('It may still be in progress. Reload the page to check.');
    await expect(note).toHaveAttribute('role', 'note');
    await expect(page.getByTestId('ended-without-answer')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /try again|ask again/i })).toHaveCount(0);
    await expect(page.locator('main [role="alert"]')).toHaveCount(0);
    await expect(page.locator('main .animate-spin')).toHaveCount(0);
    expect(chatRequests).toEqual([]);
    await expectNoNewViolations(page);
  });

  test('"+ New" leaves the thread it came from as it was', async ({ page }) => {
    await mockThreads(page);
    const chat = new ChatPage(page);
    await chat.goto();

    await page.getByText('Does Medicaid cover dental?').click();
    await expect(page.getByText('Dental services are covered.')).toBeVisible();
    await chat.sendMessage('And for adults?');
    await chat.waitForAssistantMessage('Mock response.');

    await chat.newThread();
    await expect(chat.emptyHeading).toBeVisible();
    await expect(chat.userMessages()).toHaveCount(0);

    await page.getByText('Does Medicaid cover dental?').click();
    await expect(chat.userMessages()).toHaveCount(2);
    await expect(page.getByText('Mock response.')).toBeVisible();
  });
});
