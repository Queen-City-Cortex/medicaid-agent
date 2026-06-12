import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';

const AGENT_URL = process.env.MASTRA_URL || 'http://localhost:4111';

// Skip the entire suite if the agent is not reachable.
// /healthz is the only unauthenticated endpoint (requiresAuth: false) — probing
// an authed route like /api/agents always returns 401 and silently skips forever.
test.beforeAll(async () => {
  try {
    const res = await fetch(`${AGENT_URL}/healthz`);
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
  } catch (err) {
    test.skip(true, `Agent not reachable at ${AGENT_URL} — skipping smoke tests. Start with: cd packages/agent && npm run dev`);
  }
});

test.describe('Full-stack smoke test', () => {
  test('send a question and receive a real agent response', async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.goto();

    // Use a known question that should match clinical coverage policies
    await chat.sendMessage('Does NC Medicaid cover dental services?');

    // The loading indicator should appear
    await expect(chat.startingResearch).toBeVisible({ timeout: 5_000 });

    // Wait for the assistant response — this involves real Neo4j queries and Claude
    const assistant = await chat.waitForAssistantMessage();

    // The response should contain substantive content (not an error)
    const text = await assistant.textContent();
    expect(text!.length).toBeGreaterThan(50);

    // Should not be an error message
    expect(text).not.toContain('error processing your question');

    // Tool steps should have appeared (agent uses tools)
    const toolSteps = page.getByTestId('tool-step');
    await expect(toolSteps.first()).toBeVisible();
  });
});
