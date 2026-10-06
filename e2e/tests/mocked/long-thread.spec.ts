import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI, pageOfMessages } from '../../helpers/mock-routes';

const THREAD = { id: 'thread-long', title: 'Long case thread', updatedAt: '2026-04-23T12:00:00Z' };
const POLICY_URL = 'https://medicaid.ncdhhs.gov/1f/download';

/**
 * `turns` stored turns, oldest first. Each is three rows, as the agent stores
 * it: the question, a tool-call row, and the released answer citing the tool's
 * section.
 */
function storedTurns(turns: number) {
  let second = 0;
  const createdAt = () => new Date(Date.UTC(2026, 3, 23, 12, 0, second++)).toISOString();
  return Array.from({ length: turns }, (_, i) => i + 1).flatMap((n) => [
    { id: `u${n}`, role: 'user', createdAt: createdAt(), content: `Question ${n}?` },
    { id: `t${n}`, role: 'assistant', createdAt: createdAt(), content: { format: 2, parts: [
      { type: 'tool-invocation', toolInvocation: { toolCallId: `call-${n}`, toolName: 'searchSections', state: 'result', args: {},
        result: { sections: [{ id: 's1', title: 'Visit Limits', sectionNumber: '5.6', policyNumber: '1F', url: POLICY_URL }] } } },
    ] } },
    { id: `a${n}`, role: 'assistant', createdAt: createdAt(), content: { format: 2, parts: [
      { type: 'text', text: `Answer ${n}: limited to 8 visits a year [Policy 1F § 5.6](${POLICY_URL}).` },
      { type: 'data-verification-status', data: { status: 'passed', passCount: 1 } },
    ] } },
  ]);
}

async function openThread(page: Page, threadMessages: ReturnType<typeof storedTurns>) {
  await mockMastraAPI(page, { threads: [THREAD], threadMessages });
  const chat = new ChatPage(page);
  await chat.goto();
  await chat.threadItems().first().click();
  return chat;
}

async function exportThread(page: Page): Promise<string> {
  await page.getByRole('button', { name: `Thread actions for ${THREAD.title}` }).click();
  const download = page.waitForEvent('download');
  await page.getByTestId('thread-export').click();
  return readFile(await (await download).path(), 'utf8');
}

test('a thread longer than one page reopens whole and exports from its first question', async ({ page }) => {
  // 40 turns are 120 stored rows: more than one page of 100, and three times
  // what the server returns when no page size is asked for.
  const chat = await openThread(page, storedTurns(40));

  await expect(chat.userMessages()).toHaveCount(40);
  await expect(chat.userMessages().first()).toHaveText('Question 1?');
  await expect(chat.userMessages().last()).toHaveText('Question 40?');
  await expect(page.getByTestId('earlier-messages')).toHaveCount(0);

  const markdown = await exportThread(page);
  expect(markdown).toContain('Question 1?');
  expect(markdown).toContain('Answer 40:');
  // The first answer's sources are in a tool row on the same page of results.
  expect(markdown).toContain(`Answer 1: limited to 8 visits a year [Policy 1F § 5.6](${POLICY_URL}) [1].`);
  expect(markdown.match(/^## Question$/gm)).toHaveLength(40);
});

test('a very long thread opens on its newest turns and loads the earlier ones on request', async ({ page }) => {
  // 110 turns are 330 rows; a thread opens on the newest 300, turns 11 to 110.
  const chat = await openThread(page, storedTurns(110));

  await expect(chat.userMessages()).toHaveCount(100);
  await expect(chat.userMessages().first()).toHaveText('Question 11?');
  const notice = page.getByTestId('earlier-messages');
  await expect(notice).toContainText('Earlier messages in this conversation are not shown.');

  await notice.getByRole('button', { name: 'Load earlier messages' }).click();

  await expect(chat.userMessages()).toHaveCount(110);
  await expect(chat.userMessages().first()).toHaveText('Question 1?');
  await expect(notice).toHaveCount(0);

  // The export never depends on what is on screen: it has every turn.
  const markdown = await exportThread(page);
  expect(markdown.match(/^## Question$/gm)).toHaveLength(110);
});

test('a failed page of earlier messages is reported and can be retried', async ({ page }) => {
  const stored = storedTurns(60);
  let failing = true;
  await mockMastraAPI(page, { threads: [THREAD], threadMessages: stored });
  // Registered after the shared mock, so it runs first: the second page of
  // the restore fails until told otherwise (the client retries a failure).
  await page.route('**/api/memory/threads/*/messages*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('page') === '1' && failing) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"storage unavailable"}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pageOfMessages(stored, url)) });
  });
  const chat = new ChatPage(page);
  await chat.goto();
  await chat.threadItems().first().click();

  // The newest page (rows 80 to 179) loaded; its first row is mid-turn, so
  // the transcript starts at the next question.
  const notice = page.getByTestId('earlier-messages');
  await expect(notice).toContainText('Earlier messages in this conversation could not be loaded.');
  await expect(chat.userMessages().first()).toHaveText('Question 28?');
  await expect(chat.userMessages().last()).toHaveText('Question 60?');

  failing = false;
  await notice.getByRole('button', { name: 'Try again' }).click();

  await expect(chat.userMessages()).toHaveCount(60);
  await expect(chat.userMessages().first()).toHaveText('Question 1?');
  await expect(notice).toHaveCount(0);
});
