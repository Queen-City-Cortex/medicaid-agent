// Feature: ask-question (features/ask-question.md).
// A signed-in user asks a policy question from the empty state; the answer is
// released with a citation footnote, a Sources row and the verified badge; the
// thread then reopens from the sidebar after a reload with the same verified answer.
// The agent is mocked at its HTTP boundary (http://localhost:4111) exactly as the
// repo's mocked e2e suite does; everything in the browser and Next.js is real.
import { test, expect, CORPUS_STATUS } from './agent-boundary';
import { ChatPage } from '../../../../e2e/helpers/chat-page';
import { mockMastraAPI } from '../../../../e2e/helpers/mock-routes';
import { AISdkStreamBuilder } from '../../../../e2e/helpers/stream-builder';
import { Evidence } from './evidence';

const QUESTION = 'Does NC Medicaid cover outpatient behavioral health services?';
const ANSWER = 'Policy 8C covers outpatient behavioral health services under ';
const SOURCE_URL = 'https://medicaid.ncdhhs.gov/8c/download';

test('ask a question and get a verified, cited answer that survives reload', async ({ page }) => {
  const ev = new Evidence('ask-question', 'chat input + Send button on /chat');
  const posts: Array<{ authorization: 'bearer' | 'missing'; body: any }> = [];
  const threads: Array<{ id: string; title: string }> = [];

  const stream = new AISdkStreamBuilder()
    .start()
    .toolCall('getSection', 'tc-8c', { sectionId: 'sec:doc:clinical_policy:8C:3.2.1' })
    .toolResult('tc-8c', {
      section: {
        id: 'sec:doc:clinical_policy:8C:3.2.1',
        title: 'Outpatient Behavioral Health Services',
        sectionNumber: '3.2.1',
        policyNumber: '8C',
        url: SOURCE_URL,
      },
    })
    .textDelta(`${ANSWER}[Policy 8C § 3.2.1](${SOURCE_URL}).`)
    .dataPart('data-verification-status', { status: 'passed', passCount: 1 })
    .stepFinish()
    .finish();

  await mockMastraAPI(page, {
    threads,
    threadMessages: [
      { id: 'u1', role: 'user', content: QUESTION },
      { id: 'a1', role: 'assistant', content: { format: 2, parts: [
        { type: 'text', text: `${ANSWER}[Policy 8C § 3.2.1](${SOURCE_URL}).` },
        { type: 'data-verification-status', data: { status: 'passed', passCount: 1 } },
      ] } },
    ],
  });
  // Registered after mockMastraAPI so it wins for POST /chat: record what the
  // browser sends to the agent boundary, list the new thread as the agent would.
  await page.route('**/chat', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST' || req.headers()['next-action']) return route.fallback();
    const body = req.postDataJSON();
    posts.push({ authorization: /^Bearer \S+/.test(req.headers()['authorization'] ?? '') ? 'bearer' : 'missing', body });
    threads.push({ id: body.memory.thread, title: 'Outpatient behavioral health coverage' });
    await route.fulfill(stream.toFulfill());
  });

  const chat = new ChatPage(page);
  // The page's first /corpus-status poll fires before the access token is ready and
  // gives up; the next one is a 60 s interval. A controllable clock lets the recipe
  // fast-forward to it instead of waiting (time otherwise runs normally).
  await page.clock.install();
  await chat.goto();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(chat.emptyHeading).toBeVisible();
  await page.clock.fastForward('01:01');
  // Corpus freshness comes from GET /corpus-status, served by the agent-boundary mock.
  await expect(page.getByTestId('empty-state-corpus-status')).toContainText(
    `${CORPUS_STATUS.documentCount.toLocaleString('en-US')} documents`,
  );
  await ev.capture(page, 'signed-in-empty-state', 'Signed in (hermetic session); /chat shows the empty state with the mocked corpus status.');

  await chat.input.fill(QUESTION);
  await ev.capture(page, 'question-typed', 'Question typed into the chat input before Send.');
  await chat.sendButton.click();

  await expect(chat.userMessages().last()).toContainText(QUESTION);
  const answer = await chat.waitForAssistantMessage('outpatient behavioral health services');
  const badge = page.getByTestId('verification-badge');
  await expect(badge).toHaveText('Verified against cited sources');
  await expect(badge).toHaveAttribute('data-outcome', 'passed');
  const footnote = page.getByTestId('citation-footnote').first();
  await expect(footnote).toHaveAttribute('data-source-number', '1');
  const source = page.getByTestId('source-item').first().getByRole('link');
  await expect(source).toHaveAttribute('href', SOURCE_URL);
  await expect(chat.input).toBeEnabled();
  await ev.capture(page, 'verified-answer', 'Answer released with verified badge, footnote [1] and Sources row.');

  // Side effect at the agent boundary: exactly one POST carrying the user's
  // question only, the signed-in resource and a thread id, with a bearer token.
  expect(posts).toHaveLength(1);
  const sent = posts[0];
  expect(sent.authorization).toBe('bearer');
  expect(sent.body.messages).toHaveLength(1);
  expect(JSON.stringify(sent.body.messages[0])).toContain(QUESTION);
  expect(sent.body.memory.resource).toBe('user_e2e_test');
  ev.json('agent-request.json', { authorization: sent.authorization, body: sent.body });

  // Second view: reload, reopen the thread from the sidebar, answer still verified.
  await page.reload();
  const item = chat.threadItems().filter({ hasText: 'Outpatient behavioral health coverage' });
  await expect(item).toHaveCount(1);
  await item.click();
  await expect(chat.userMessages().last()).toContainText(QUESTION);
  await expect(page.getByTestId('verification-badge')).toHaveText('Verified against cited sources');
  await ev.capture(page, 'reopened-after-reload', 'After reload, the thread reopens from the sidebar with the verified answer.');

  ev.write({
    result: 'passed',
    question: QUESTION,
    answerText: (await answer.innerText()).slice(0, 400),
    agentPosts: posts.length,
    threadId: sent.body.memory.thread,
  });
});
