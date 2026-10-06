import { readFile } from 'node:fs/promises';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';

const THREAD = { id: 'thread-case', title: 'Chiropractic coverage', updatedAt: '2026-06-22T12:40:00Z' };
const POLICY_1F = 'https://medicaid.ncdhhs.gov/1f/download';
const POLICY_3A = 'https://medicaid.ncdhhs.gov/3a/download';
const DRAFT = 'DRAFT: coverage is unlimited.';

const verification = (status: string) => ({ type: 'data-verification-status', data: { status, passCount: 1 } });
const search = (id: string, sections: unknown[]) => ({
  type: 'tool-invocation',
  toolInvocation: { toolCallId: id, toolName: 'searchSections', state: 'result', args: {}, result: { sections } },
});
const section = (policyNumber: string, sectionNumber: string, url: string) =>
  ({ id: `${policyNumber}-${sectionNumber}`, title: 'Section', sectionNumber, policyNumber, url });
const row = (id: string, role: string, minute: number, parts: unknown[]) => ({
  id,
  role,
  createdAt: `2026-06-22T12:${String(minute).padStart(2, '0')}:00Z`,
  content: { format: 2, parts },
});

/** A cited answer (stored before its tool row, as the agent stores it), a
 *  corrected one, a withheld one and a row stored before answers were checked. */
const STORED = [
  row('u1', 'user', 0, [{ type: 'text', text: 'Is chiropractic care covered?' }]),
  row('a1', 'assistant', 1, [
    { type: 'text', text: `## Coverage\n\nYes, up to 8 visits a year [Policy 1F § 5.6](${POLICY_1F}).` },
    verification('passed'),
  ]),
  row('t1', 'assistant', 2, [search('c1', [section('3A', '2.1', POLICY_3A), section('1F', '5.6', POLICY_1F)])]),

  row('u2', 'user', 10, [{ type: 'text', text: 'Is prior approval needed?' }]),
  row('t2', 'assistant', 11, [search('c2', [section('1F', '5.6', POLICY_1F)])]),
  row('a2', 'assistant', 12, [
    { type: 'text', text: `Not for the first visits [Policy 1F § 5.6](${POLICY_1F}).` },
    verification('corrected'),
  ]),

  row('u3', 'user', 20, [{ type: 'text', text: 'Are home visits covered?' }]),
  row('t3', 'assistant', 21, [search('c3', [section('1F', '5.6', POLICY_1F)])]),
  row('a3', 'assistant', 22, [{ type: 'text', text: DRAFT }, verification('withheld')]),

  row('u4', 'user', 30, [{ type: 'text', text: 'What about acupuncture?' }]),
  row('a4', 'assistant', 31, [{ type: 'text', text: `${DRAFT} Second draft.` }]),
];

async function openThread(page: Page) {
  await mockMastraAPI(page, { threads: [THREAD], threadMessages: STORED });
  const chat = new ChatPage(page);
  await chat.goto();
  await chat.threadItems().first().click();
  await expect(chat.userMessages()).toHaveCount(4);
  return chat;
}

test('the exported file has each answer with its links, numbered sources and verification status', async ({ page }) => {
  await openThread(page);
  const firstAnswer = page.getByTestId('assistant-message').first();
  await expect(firstAnswer.getByTestId('citation-footnote')).toHaveText('[1]');

  await page.getByRole('button', { name: `Thread actions for ${THREAD.title}` }).click();
  const download = page.waitForEvent('download');
  await page.getByTestId('thread-export').click();
  const markdown = await readFile(await (await download).path(), 'utf8');

  // The footnote number on screen is the number in the file's source list.
  expect(markdown).toContain(`[Policy 1F § 5.6](${POLICY_1F}) [1]`);
  expect(markdown).toContain(`1. [Policy 1F § 5.6](${POLICY_1F})`);
  expect(markdown).toContain(`2. [Policy 3A § 2.1](${POLICY_3A})`);
  expect(markdown).toContain('*Verified against cited sources · June 22, 2026');
  expect(markdown).toContain('*Corrected and verified against cited sources · June 22, 2026');
  // Withheld and unverified turns export as their notices, never as text.
  expect(markdown.match(/^## Answer$/gm)).toHaveLength(2);
  expect(markdown.match(/^## Answer withheld$/gm)).toHaveLength(2);
  expect(markdown).toContain("We couldn't verify an answer to this question against NC Medicaid policy, so we haven't shown one.");
  expect(markdown).toContain("This stored answer can't be shown because its verification could not be confirmed.");
  expect(markdown).not.toContain('review the sources below');
  expect(markdown).not.toContain('DRAFT');
});

/** Relative luminance of the element's text colour, 0 (black) to 1 (white). */
function textLuminance(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const context = document.createElement('canvas').getContext('2d')!;
    context.fillStyle = getComputedStyle(element).color;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`printing from the ${colorScheme} theme puts dark text on the page`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    const chat = await openThread(page);
    await expect(page.locator('html')).toHaveClass(colorScheme === 'dark' ? /dark/ : /^(?!.*dark)/);

    await page.emulateMedia({ media: 'print', colorScheme });

    // Paper is white and backgrounds do not print: 0.18 is 4.6:1 on white.
    const answer = page.getByTestId('assistant-message').first();
    expect(await textLuminance(chat.userMessages().first().locator('p'))).toBeLessThan(0.18);
    expect(await textLuminance(answer.getByRole('heading', { name: 'Coverage' }))).toBeLessThan(0.18);
    expect(await textLuminance(answer.locator('.prose p').first())).toBeLessThan(0.18);
    expect(await textLuminance(answer.getByTestId('generated-at'))).toBeLessThan(0.18);
  });
}
