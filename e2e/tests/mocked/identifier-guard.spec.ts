import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';

const REJECTION = 'Remove client-identifying information before sending this question.';

test.describe('Identifier guard', () => {
  test('a second turn posts only its own message and shows the 422 rejection', async ({ page }) => {
    await mockMastraAPI(page);

    // The agent screens only the newest user message, so the client must not
    // replay the thread: this first answer carries an agency phone number that
    // would otherwise travel back in every later request.
    const firstAnswer = new AISdkStreamBuilder()
      .start()
      .textDelta('Call the NC Medicaid Contact Center at (888) 245-0179.')
      .stepFinish()
      .finish();

    const bodies: Array<{ messages: Array<{ role: string; parts: Array<{ type: string; text?: string }> }>; memory: { thread: string } }> = [];
    await page.route('**/chat', async (route) => {
      // The page at /chat also posts Next server actions to this URL; only the
      // agent call may take a turn, so leave those to the default mock.
      const headers = route.request().headers();
      if (route.request().method() !== 'POST' || headers['next-action'] || headers['next-router-state-tree']) {
        await route.fallback();
        return;
      }
      bodies.push(route.request().postDataJSON());
      if (bodies.length === 1) {
        await route.fulfill(firstAnswer.toFulfill());
        return;
      }
      // The agent's real rejection body for an identifier in the question.
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'client_identifier_detected', message: REJECTION } }),
      });
    });

    const chat = new ChatPage(page);
    await chat.goto();
    await chat.sendMessage('Who do I call about transportation?');
    await chat.waitForAssistantMessage('(888) 245-0179');

    await chat.sendMessage('My Medicaid ID is 945123456K, am I covered?');
    const error = page.getByTestId('chat-error-identifier-detected');
    await expect(error).toBeVisible();
    await expect(error).toHaveText(REJECTION);
    // Sending the same text again would be rejected again: no Try again button.
    await expect(error.getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('chat-error')).toHaveCount(0);
    await expect(chat.input).toBeEnabled();

    const sent = (body: (typeof bodies)[number]) =>
      body.messages.map(m => ({ role: m.role, text: m.parts.filter(p => p.type === 'text').map(p => p.text).join('') }));
    expect(bodies).toHaveLength(2);
    expect(sent(bodies[0])).toEqual([{ role: 'user', text: 'Who do I call about transportation?' }]);
    expect(sent(bodies[1])).toEqual([{ role: 'user', text: 'My Medicaid ID is 945123456K, am I covered?' }]);
    expect(JSON.stringify(bodies[1])).not.toContain('245-0179');
    expect(bodies[0].memory.thread).toBeTruthy();
    expect(bodies[1].memory.thread).toBe(bodies[0].memory.thread);
  });

  test('a question quoting a notice phone number is answered, with no identifier error', async ({ page }) => {
    // The agent replaces the number with a marker and answers; it no longer
    // returns 422 for a phone number or an e-mail address.
    await mockMastraAPI(page, {
      streamResponse: new AISdkStreamBuilder()
        .start()
        .textDelta('Legal Aid of North Carolina gives free help with Medicaid appeals.')
        .stepFinish()
        .finish(),
    });

    const chat = new ChatPage(page);
    await chat.goto();
    await chat.sendMessage('My notice says to call 866-219-5262 for free legal help. Should I?');
    await chat.waitForAssistantMessage('Legal Aid of North Carolina');
    await expect(page.getByTestId('chat-error-identifier-detected')).toHaveCount(0);
    await expect(page.getByTestId('chat-error')).toHaveCount(0);
  });
});
