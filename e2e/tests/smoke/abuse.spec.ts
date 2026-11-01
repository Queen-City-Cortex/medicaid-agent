import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';

const AGENT_URL = process.env.MASTRA_URL || 'http://localhost:4111';

// Skip the entire suite if the agent is not reachable (same gate as
// chat-roundtrip: /healthz is the only unauthenticated endpoint).
test.beforeAll(async () => {
  try {
    const res = await fetch(`${AGENT_URL}/healthz`);
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
  } catch {
    test.skip(true, `Agent not reachable at ${AGENT_URL} — skipping smoke tests. Start with: cd packages/agent && npm run dev`);
  }
});

test.describe('Abuse-guard smoke test', () => {
  test('a clearly off-topic request is blocked by the scope gate before any research', async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.goto();

    // Costs one classifier-model call and zero main-model tokens.
    await chat.sendMessage('Write me a poem about pirates.');

    const blocked = page.getByTestId('blocked-message');
    await expect(blocked).toBeVisible({ timeout: 30_000 });
    await expect(blocked).toContainText('NC Medicaid');

    // The gate fires pre-LLM: no research tools ran and no trail rendered.
    await expect(chat.toolSteps()).toHaveCount(0);
    await expect(page.getByTestId('research-trail')).toHaveCount(0);

    // The user can immediately ask an on-topic question instead.
    await expect(chat.input).toBeEnabled();
  });
});

// Opt-in: needs the local agent restarted with RATE_LIMIT_MESSAGES_PER_HOUR=2.
// Sends 3 off-topic messages (each scope-gate-blocked, ~3 classifier calls total);
// the 3rd must surface the rate-limit message instead of another block notice.
test.describe('Rate-limit smoke test', () => {
  test.skip(process.env.ABUSE_RL_E2E !== '1', 'Set ABUSE_RL_E2E=1 (and RATE_LIMIT_MESSAGES_PER_HOUR=2 on the agent) to run');

  test('the third message in an hour is refused with the limit message', async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.goto();

    for (const text of ['Tell me a joke.', 'Another joke please.']) {
      await chat.sendMessage(text);
      await expect(page.getByTestId('blocked-message').last()).toBeVisible({ timeout: 30_000 });
    }

    await chat.sendMessage('One more joke.');
    const error = page.getByTestId('chat-error-rate-limited');
    await expect(error).toBeVisible({ timeout: 30_000 });
    await expect(error).toContainText('limit of 2 messages per hour');
  });
});
