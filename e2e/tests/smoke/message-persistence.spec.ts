import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';

const AGENT_URL = process.env.MASTRA_URL || 'http://localhost:4111';

test.beforeAll(async () => {
  try {
    const res = await fetch(`${AGENT_URL}/healthz`);
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
  } catch {
    test.skip(true, `Agent not reachable at ${AGENT_URL} — skipping smoke tests`);
  }
});

test.describe('Message persistence', () => {
  // Agent research can take several minutes with multiple tool calls
  test.setTimeout(5 * 60 * 1000);

  test('reloaded thread preserves research trace and formatted answer', async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.goto();

    // Use a focused question that resolves quickly (1-2 tool calls)
    await chat.sendMessage('What is EPSDT?');

    // Wait for streaming to COMPLETE — the "Rate helpful" button only appears after streaming ends
    await expect(page.getByLabel('Rate helpful')).toBeVisible({ timeout: 4 * 60 * 1000 });

    // Capture the answer text length
    const assistantMsg = page.getByTestId('assistant-message').last();
    const answerText = await assistantMsg.textContent();
    expect(answerText!.length).toBeGreaterThan(100);

    // Verify research trace appeared (tool call icons)
    const traceLabels = [
      'Searching policies',
      'Reading section',
      'Looking up policy',
      'Checking amendments',
      'Finding concepts',
    ];
    let traceFoundDuringStream = false;
    for (const label of traceLabels) {
      if (await page.getByText(label).first().isVisible().catch(() => false)) {
        traceFoundDuringStream = true;
        break;
      }
    }
    expect(traceFoundDuringStream).toBe(true);

    // Find the thread in sidebar
    const threadButton = page.locator('button').filter({ hasText: /epsdt/i }).first();
    await expect(threadButton).toBeVisible({ timeout: 10_000 });

    // ─── RELOAD AND VERIFY PERSISTENCE ───────────────────────────────
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Select the thread from sidebar
    const reloadedThreadButton = page.locator('button').filter({ hasText: /epsdt/i }).first();
    await expect(reloadedThreadButton).toBeVisible({ timeout: 10_000 });
    await reloadedThreadButton.click();

    // Wait for the assistant message to load from memory
    const reloadedMsg = page.getByTestId('assistant-message').last();
    await expect(reloadedMsg).toBeVisible({ timeout: 10_000 });

    // KEY ASSERTION 1: Answer text is present and substantial
    const reloadedText = await reloadedMsg.textContent();
    expect(reloadedText!.length).toBeGreaterThan(100);
    expect(reloadedText!.toLowerCase()).toContain('epsdt');

    // KEY ASSERTION 2: Research trace rendered from stored tool parts
    let traceFoundAfterReload = false;
    for (const label of traceLabels) {
      if (await page.getByText(label).first().isVisible().catch(() => false)) {
        traceFoundAfterReload = true;
        break;
      }
    }
    expect(traceFoundAfterReload).toBe(true);

    // KEY ASSERTION 3: Feedback buttons present (confirms MessageActions rendered)
    await expect(page.getByLabel('Rate helpful')).toBeVisible();
  });
});
