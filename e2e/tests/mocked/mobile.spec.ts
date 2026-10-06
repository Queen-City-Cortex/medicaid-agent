import { test, expect, type Page } from '@playwright/test';
import { expectNoNewViolations } from '../../helpers/axe';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';

// A small phone. The layout switches on a `(max-width: 767px)` media query, so
// a viewport is enough to render the real mobile layout in the Chromium the
// mocked project already uses; no separate device project is needed.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const THREADS = [
  { id: 'thread-1', title: 'Does Medicaid cover dental?', updatedAt: new Date().toISOString() },
  { id: 'thread-2', title: 'EPSDT benefits for children', updatedAt: new Date(Date.now() - 86_400_000).toISOString() },
];

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Phone viewport', () => {
  test('the composer sends from the button and the page never scrolls sideways', async ({ page }) => {
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
      .textDelta(
        'Policy 8C covers outpatient behavioral health services under ' +
          '[Policy 8C § 3.2.1](https://medicaid.ncdhhs.gov/8c/download).',
      )
      .stepFinish()
      .finish();
    await mockMastraAPI(page, { streamResponse: stream });
    const chat = new ChatPage(page);
    await chat.goto();

    await expect(chat.emptyHeading).toBeVisible();
    await expect(chat.input).toBeInViewport();
    await expectNoHorizontalScroll(page);

    // Phone keyboards have no Shift+Enter, so Enter adds a line and only the
    // button sends.
    await chat.input.fill('What does Policy 8C cover?');
    await chat.input.press('Enter');
    await expect(chat.userMessages()).toHaveCount(0);
    await expect(chat.sendButton).toBeInViewport();
    await chat.sendButton.click();

    await chat.waitForAssistantMessage('outpatient behavioral health services');
    await expect(page.getByTestId('sources-panel')).toBeVisible();
    await expect(chat.input).toBeInViewport();
    await expectNoHorizontalScroll(page);
  });

  test('the sidebar opens over the chat, reaches Sign out, and Escape returns focus', async ({ page }) => {
    await mockMastraAPI(page, { threads: THREADS });
    const chat = new ChatPage(page);
    await chat.goto();

    const sidebar = page.locator('#thread-sidebar');
    const open = page.getByRole('button', { name: 'Open sidebar' });
    const signOut = page.getByRole('button', { name: 'Sign out', exact: true });

    // Closed to begin with: off screen and out of the tab order.
    await expect(open).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).toHaveAttribute('inert', '');
    await expect(sidebar).not.toBeInViewport();

    await open.click();
    const toggle = page.locator('[aria-controls="thread-sidebar"]');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebar).toBeInViewport();
    await expect(chat.threadItems()).toHaveCount(2);
    await expect(signOut).toBeInViewport();
    // Open, it is a modal dialog, and focus lands on its own close button:
    // the masthead toggle is behind it and cannot be reached.
    await expect(page.getByRole('dialog', { name: 'Conversations' })).toHaveAttribute('id', 'thread-sidebar');
    await expect(sidebar.getByRole('button', { name: 'Close sidebar' })).toBeFocused();
    // The chat behind the overlay cannot be reached while it is open.
    expect(await chat.input.evaluate((element) => element.closest('[inert]') !== null)).toBe(true);
    await expectNoHorizontalScroll(page);
    await expectNoNewViolations(page);

    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).not.toBeInViewport();
    await expect(toggle).toBeFocused();
    expect(await chat.input.evaluate((element) => element.closest('[inert]') === null)).toBe(true);
  });

  test('the sidebar closes from the backdrop and after picking a thread', async ({ page }) => {
    await mockMastraAPI(page, { threads: THREADS });
    const chat = new ChatPage(page);
    await chat.goto();

    const sidebar = page.locator('#thread-sidebar');
    const toggle = page.locator('[aria-controls="thread-sidebar"]');

    // The sidebar is 280px wide; this point is on the backdrop beside it.
    await toggle.click();
    await expect(sidebar).toBeInViewport();
    await page.mouse.click(350, 400);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).not.toBeInViewport();

    await toggle.click();
    await chat.threadItems().first().click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).not.toBeInViewport();
    await expect(chat.input).toBeInViewport();

    // Its own close button, the only close control a touch screen reader can reach.
    await toggle.click();
    await sidebar.getByRole('button', { name: 'Close sidebar' }).tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).not.toBeInViewport();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(toggle).toBeFocused();
  });
});
