/** Additional live readiness checks; the caller owns the synthetic thread. */
import fs from 'node:fs';
import { activeThreadForRestore, threadByExactTitle } from './smoke-thread.mjs';

export async function verifyFeedbackRoundTrip(page) {
  const title = await activeThreadForRestore(page);
  const assistant = page.getByTestId('assistant-message').last();
  const helpful = assistant.getByRole('button', { name: 'Rate helpful', exact: true });
  await assistant.hover();
  const posted = page.waitForResponse(response => new URL(response.url()).pathname === '/feedback'
    && response.request().method() === 'POST');
  await helpful.click();
  if (!(await posted).ok()) throw new Error('Feedback creation failed');
  await page.reload();
  await threadByExactTitle(page, title).click({ timeout: 30_000 });
  const restored = page.getByTestId('assistant-message').last()
    .getByRole('button', { name: 'Rate helpful', exact: true });
  await page.waitForFunction(() => document.querySelector('[aria-label="Rate helpful"]')
    ?.className.includes('text-emerald-600'), null, { timeout: 30_000 });
  const removed = page.waitForResponse(response => new URL(response.url()).pathname.startsWith('/feedback/')
    && response.request().method() === 'DELETE');
  await restored.click();
  if ((await removed).status() !== 204) throw new Error('Feedback removal failed');
  await page.reload();
  await threadByExactTitle(page, title).click({ timeout: 30_000 });
  await page.getByTestId('chat-input').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('[aria-label="Rate helpful"]');
    return button && !button.className.includes('text-emerald-600');
  }, null, { timeout: 30_000 });
  return { created: true, persisted: true, removed: true };
}

export async function verifyLogout(page, baseUrl) {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  try {
    await page.waitForURL(url => url.origin === new URL(baseUrl).origin && !url.pathname.endsWith('/chat'),
      { timeout: 30_000, waitUntil: 'domcontentloaded' });
  } catch {
    throw new Error(`Sign-out navigation failed at ${new URL(page.url()).origin}`);
  }
  await page.goto(`${baseUrl}/chat`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.locator('input[type="email"], input[name="email"], input[autocomplete="email"]')
    .first().waitFor({ state: 'visible', timeout: 30_000 });
  if (await page.getByTestId('chat-input').isVisible()) throw new Error('Chat remained accessible after logout');
  return { signedOut: true, protectedChatRequiresLogin: true };
}

/** Capture creation requests as well as generation: a chat request may never follow. */
export function recordSyntheticThread(request, receipt, expectedOrigin, applicationOrigin) {
  const url = new URL(request.url());
  if (request.method() !== 'POST') return;
  // AuthKit uses Next server actions on the application's current /chat URL.
  // These are not agent generation requests and contain no memory thread.
  if (url.origin === applicationOrigin && request.headers?.()['next-action']) return;
  const creation = url.pathname.endsWith('/memory/threads');
  if (!creation && url.pathname !== '/chat') return;
  if (url.origin !== expectedOrigin) receipt.testTrafficCaptureFailed = true;
  try {
    const body = request.postDataJSON();
    const thread = creation ? body?.threadId : body?.memory?.thread;
    if (typeof thread !== 'string' || !thread) throw new Error('Missing synthetic thread');
    if (!receipt.testThreads.includes(thread)) receipt.testThreads.push(thread);
  } catch { receipt.testTrafficCaptureFailed = true; }
}

export function writeDiagnosticReceipt(target, receipt, originalError, reportError = console.error) {
  try {
    fs.writeFileSync(target, JSON.stringify(receipt, null, 2), { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if (!originalError) throw error;
    reportError(`Readiness receipt write failed: ${error.message}`);
  }
}
