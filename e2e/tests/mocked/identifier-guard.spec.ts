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

  test('a refused first message leaves no thread, and the next question creates and titles it', async ({ page }) => {
    // The agent's side of the contract: the screen first, then a thread for
    // an id it has not seen, titled from the first 60 characters it accepted.
    const threads: Array<{ id: string; title: string; updatedAt: string }> = [];
    await mockMastraAPI(page, { threads });
    const creates: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/memory/threads')) creates.push(request.url());
    });
    const sentThreads: string[] = [];
    await page.route('**/chat', async (route) => {
      const headers = route.request().headers();
      if (route.request().method() !== 'POST' || headers['next-action'] || headers['next-router-state-tree']) {
        await route.fallback();
        return;
      }
      const body = route.request().postDataJSON() as { messages: Array<{ parts: Array<{ text?: string }> }>; memory: { thread: string } };
      const text = body.messages[0].parts.map(part => part.text ?? '').join('');
      sentThreads.push(body.memory.thread);
      if (/\d{3}-\d{2}-\d{4}/.test(text)) {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'client_identifier_detected', message: REJECTION } }),
        });
        return;
      }
      if (!threads.some(thread => thread.id === body.memory.thread)) {
        threads.unshift({ id: body.memory.thread, title: text.slice(0, 60), updatedAt: new Date().toISOString() });
      }
      await route.fulfill(new AISdkStreamBuilder().start().textDelta('Personal care services are covered.').stepFinish().finish().toFulfill());
    });

    const chat = new ChatPage(page);
    await chat.goto();
    await expect(chat.threadItems()).toHaveCount(0);

    await chat.sendMessage('My client Jane Roe, SSN 123-45-6789, was denied personal care services.');
    const error = page.getByTestId('chat-error-identifier-detected');
    await expect(error).toHaveText(REJECTION);
    await expect(chat.input).toBeEnabled();
    await expect(chat.input).toHaveValue('');
    // The sidebar re-reads the list when the turn ends; nothing was stored.
    await expect(chat.threadItems()).toHaveCount(0);
    expect(threads).toEqual([]);

    const accepted = 'Does North Carolina Medicaid cover personal care services for adults living at home?';
    await chat.sendMessage(accepted);
    await chat.waitForAssistantMessage('Personal care services are covered.');
    // No reload: the finished turn refreshes the sidebar, which shows the title the agent cut.
    await expect(chat.threadItems()).toHaveCount(1);
    await expect(chat.threadItems().first()).toContainText(accepted.slice(0, 60));
    await expect(page.locator('#thread-sidebar')).not.toContainText('Jane Roe');
    expect(sentThreads).toHaveLength(2);
    expect(sentThreads[1]).toBe(sentThreads[0]);
    expect(creates).toEqual([]);
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
