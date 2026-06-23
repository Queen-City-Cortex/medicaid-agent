import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';

test.describe('Empty state', () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    await mockMastraAPI(page);
    chat = new ChatPage(page);
    await chat.goto();
  });

  test('shows the welcome heading', async () => {
    await expect(chat.emptyHeading).toBeVisible();
    await expect(chat.emptyHeading).toHaveText('What would you like to know?');
  });

  test('renders persona-grouped example cards', async ({ page }) => {
    // P2 UX redesign: the empty state shows 3 personas (attorneys / case
    // managers / beneficiaries) × 2 questions each = 6 example cards.
    await expect(chat.exampleCards).toHaveCount(6);
    await expect(page.getByTestId('example-persona')).toHaveCount(3);
    await expect(chat.exampleCards.first()).toContainText('42 CFR Part 431');
  });

  test('clicking an example card fills the input', async () => {
    const cardText = await chat.exampleCards.first().textContent();
    await chat.exampleCards.first().click();
    await expect(chat.input).toHaveValue(cardText!);
  });

  test('input is enabled on page load', async () => {
    await expect(chat.input).toBeEnabled();
  });

  test('send button is disabled when input is empty', async () => {
    await expect(chat.sendButton).toBeDisabled();
  });
});
