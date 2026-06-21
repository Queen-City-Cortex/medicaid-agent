import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * REAL end-to-end smoke test for the Deep Research feature: real WorkOS session
 * (storageState), real Mastra agent server on :4111, real Neo4j corpus. Drives
 * the /chat UI: toggle Deep Research, ask, approve the plan, read the report.
 *
 * Requires the agent server running separately (npm run dev:agent). Not part of
 * the default smoke run timeout — deep research takes minutes.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, '../../deep-research-shots');

test('deep research: plan approval → cited report', async ({ page }) => {
  test.setTimeout(420_000);

  // Surface backend/stream errors in the test log.
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[browser console.error]', m.text());
  });
  page.on('requestfailed', (r) => console.log('[requestfailed]', r.url(), r.failure()?.errorText));

  await page.goto('/chat');
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 15_000 });

  // 1) Toggle Deep Research on.
  const toggle = page.getByTestId('deep-research-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  // 2) Ask a broad question.
  const q =
    'Does NC Medicaid cover bariatric (weight-loss) surgery for adults, and what are the prior authorization and medical-necessity criteria?';
  await page.getByTestId('chat-input').fill(q);
  await page.getByTestId('send-button').click();

  // 3) Plan-approval card should appear (planning can take ~30-60s).
  const planCard = page.getByTestId('deep-research-plan');
  await expect(planCard).toBeVisible({ timeout: 150_000 });
  await expect(planCard).toContainText(/research plan/i);
  await page.screenshot({ path: path.join(SHOTS, 'plan-approval.png'), fullPage: true });

  // 4) Approve and research.
  await page.getByTestId('approve-plan').click();

  // 5) Final report (research + synthesis + verify can take a few minutes).
  const report = page.getByTestId('deep-research-report');
  await expect(report).toBeVisible({ timeout: 360_000 });
  await expect(page.getByTestId('deep-research-verification')).toBeVisible({ timeout: 10_000 });

  // Let layout settle, then capture.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, 'report.png'), fullPage: true });

  // Assertions on the rendered report.
  const verificationText = await page.getByTestId('deep-research-verification').innerText();
  console.log('[verification]', verificationText);
  const reportText = await report.innerText();
  console.log('[report length]', reportText.length);
  expect(reportText.length).toBeGreaterThan(1500);
  // At least one resolvable corpus citation link rendered.
  const citationLinks = await report.locator('a[href*="ncdhhs.gov"], a[href*="ecfr"], a[href*="ssa.gov"]').count();
  console.log('[citation links]', citationLinks);
  expect(citationLinks).toBeGreaterThan(0);
});
