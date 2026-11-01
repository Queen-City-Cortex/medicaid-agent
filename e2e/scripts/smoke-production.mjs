#!/usr/bin/env node

import { chromium } from '@playwright/test';
import { sealData } from 'iron-session';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { activeThreadForRestore, allowThreadWritesOnlyTo, deleteSmokeThread, finishSmokeThread, renameActiveThread,
  smokeThreadTitle, threadByExactTitle } from './smoke-thread.mjs';
import { verifyFeedbackRoundTrip, verifyLogout, recordSyntheticThread, writeDiagnosticReceipt } from './smoke-readiness.mjs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

// loadEnvFile never overwrites already-set keys, so earlier files win:
// list .env.local before .env so local overrides take precedence.
loadEnvFile(path.join(repoRoot, '.env.local'));
loadEnvFile(path.join(repoRoot, '.env'));
loadEnvFile(path.join(repoRoot, 'packages/web/.env.local'));
loadEnvFile(path.join(repoRoot, 'packages/web/.env'));

const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL ?? 'https://medicaid-agent.up.railway.app');
const question = process.env.SMOKE_QUESTION ?? 'What is EPSDT?';
const timeoutMs = parsePositiveInt(process.env.SMOKE_TIMEOUT_MS, 180_000);
const minAnswerChars = parsePositiveInt(process.env.SMOKE_MIN_ANSWER_CHARS, 200);
const screenshotPath = process.env.SMOKE_SCREENSHOT_PATH ?? '/tmp/nc-medicaid-prod-smoke.png';
const headless = process.env.SMOKE_HEADLESS !== 'false';
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

if (!email || !password) {
  throw new Error('Production smoke requires TEST_USER_EMAIL and TEST_USER_PASSWORD.');
}

const ignoredConsolePatterns = [
  /content security policy.*upgrade-insecure-requests/i,
  /canvas2d.*willreadfrequently/i,
  /no available adapters/i,
];

let browser;
let page;
let smokeError;
const existingTitle = process.env.SMOKE_RESTORE_THREAD_TITLE;
// Set once the fresh thread carries its own title.
let smokeTitle;
const readiness = process.env.SMOKE_READINESS_RECEIPT_PATH ? {
  schemaVersion: 1, mode: 'readiness_diagnostic', startedAt: new Date().toISOString(),
  releaseId: process.env.SMOKE_EXPECTED_RELEASE_ID, login: 'not_run',
  testRunId: process.env.SMOKE_TEST_RUN_ID ?? 'readiness', testThreads: [],
  answer: 'not_run', persistence: 'not_run', feedback: 'not_run', logout: 'not_run',
} : null;
// Threads this run creates. Readiness mode leaves them to the caller, who
// cleans up from the receipt; a restored thread is the operator's own.
const synthetic = readiness ?? { testThreads: [] };
const cleansUpThread = !readiness && !existingTitle;
if (readiness && (!readiness.releaseId || fs.existsSync(process.env.SMOKE_READINESS_RECEIPT_PATH))) {
  throw new Error('Readiness smoke requires an expected release and a new receipt path.');
}
if (readiness && (process.env.SMOKE_ACTIVATION_NONCE || process.env.SMOKE_RECEIPT_PATH)) {
  throw new Error('Readiness diagnostics cannot issue activation receipts.');
}
if (readiness && existingTitle) {
  throw new Error('Readiness smoke requires a fresh synthetic thread.');
}
if (readiness && (!path.isAbsolute(process.env.SMOKE_READINESS_RECEIPT_PATH)
  || (fs.statSync(path.dirname(process.env.SMOKE_READINESS_RECEIPT_PATH)).mode & 0o077))) {
  throw new Error('Readiness receipt requires an absolute path in an existing private directory.');
}

try {
  browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  page = await context.newPage();
  if (!existingTitle) {
    page.on('request', request => recordSyntheticThread(request, synthetic,
      new URL(process.env.AGENT_PUBLIC_URL ?? 'https://medicaid-agent-backend.up.railway.app').origin,
      new URL(baseUrl).origin));
    await allowThreadWritesOnlyTo(page, () => synthetic.testThreads);
  }

  const browserMessages = [];
  page.on('console', (message) => {
    if (!['error', 'warning'].includes(message.type())) return;
    const text = message.text();
    if (ignoredConsolePatterns.some((pattern) => pattern.test(text))) return;
    browserMessages.push(`[${message.type()}] ${text}`);
  });
  page.on('pageerror', (error) => {
    browserMessages.push(`[pageerror] ${error.message}`);
  });

  await openAuthenticatedChat(page);
  if (readiness) readiness.login = 'passed';
  await verifyExpectedRelease();
  if (existingTitle) {
    await threadByExactTitle(page, existingTitle).click({ timeout: 30_000 });
  } else {
    await startFreshThread(page);
  }
  const result = await askQuestion(page, Boolean(existingTitle));
  if (readiness) readiness.answer = { outcome: result.outcome, characters: result.answerLength };
  if (!existingTitle) {
    const title = smokeThreadTitle(process.env.SMOKE_TEST_RUN_ID);
    await renameActiveThread(page, title);
    smokeTitle = title;
  }
  await verifyRestoredAnswer(page, result);
  if (readiness) {
    if (readiness.testTrafficCaptureFailed) throw new Error('Could not identify synthetic chat traffic for cleanup.');
    readiness.persistence = 'passed';
    readiness.feedback = await verifyFeedbackRoundTrip(page);
    await verifyExpectedRelease();
    try { readiness.logout = await verifyLogout(page, baseUrl); }
    catch (error) {
      readiness.logout = { failed: true, error: error.message };
      throw error;
    }
  }
  if (process.env.SMOKE_EXPECTED_RELEASE_ID && !readiness) {
    const status = await verifyExpectedRelease();
    if (!process.env.SMOKE_ACTIVATION_NONCE || !process.env.SMOKE_RECEIPT_PATH) throw new Error('Activation receipt nonce and path required');
    const receipt = { releaseId: status.releaseId, activationNonce: process.env.SMOKE_ACTIVATION_NONCE,
      outcome: result.outcome, mode: existingTitle ? 'existing_verified_thread' : 'new_verified_answer', checks: ['thread_switch', 'reload'], checkedAt: new Date().toISOString() };
    fs.writeFileSync(process.env.SMOKE_RECEIPT_PATH + '.tmp', JSON.stringify(receipt));
    fs.renameSync(process.env.SMOKE_RECEIPT_PATH + '.tmp', process.env.SMOKE_RECEIPT_PATH);
  }
  await saveScreenshot(page, screenshotPath);
  if (cleansUpThread) {
    await finishSmokeThread({ succeeded: true, title: smokeTitle, threadIds: synthetic.testThreads,
      deleteThread: (title, threadId) => deleteSmokeThread(page, title, threadId) });
  }

  if (browserMessages.length > 0) {
    console.warn(`Browser reported ${browserMessages.length} warning/error event(s):`);
    for (const message of browserMessages.slice(0, 8)) {
      console.warn(`  ${message}`);
    }
  }

  console.log(`Production smoke passed at ${baseUrl}/chat`);
  console.log(`Question: ${question}`);
  console.log(`Answer characters: ${result.answerLength}`);
  console.log(`Tool steps: ${result.toolSteps}`);
  console.log(`Sources: ${result.sourcesLabel}`);
  console.log(`Screenshot: ${screenshotPath}`);
} catch (error) {
  smokeError = error;
  if (page) {
    const failedPath = screenshotPath.replace(/(\.[^.]+)?$/, '.failed$1');
    await saveScreenshot(page, failedPath).catch(() => undefined);
    console.error(`Failure screenshot: ${failedPath}`);
  }
  if (cleansUpThread && synthetic.testThreads.length > 0) {
    await finishSmokeThread({ succeeded: false, title: smokeTitle, threadIds: synthetic.testThreads, report: console.error });
  }
  if (readiness) {
    readiness.error = error.message;
    if (readiness.login === 'passed' && readiness.logout === 'not_run') {
      try { readiness.logout = await verifyLogout(page, baseUrl); }
      catch (logoutError) { readiness.logout = { failed: true, error: logoutError.message }; }
    }
  }
  throw error;
} finally {
  try {
    if (readiness) {
      readiness.completedAt = new Date().toISOString();
      writeDiagnosticReceipt(process.env.SMOKE_READINESS_RECEIPT_PATH, readiness, smokeError);
    }
  } finally { await browser?.close(); }
}

async function verifyExpectedRelease() {
  if (!process.env.SMOKE_EXPECTED_RELEASE_ID) return;
  const response = await fetch((process.env.AGENT_PUBLIC_URL ?? 'https://medicaid-agent-backend.up.railway.app') + '/readyz', { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error('Browser smoke readiness check failed');
  const status = await response.json();
  if (status.status !== 'ok' || status.releaseId !== process.env.SMOKE_EXPECTED_RELEASE_ID) throw new Error('Browser smoke observed a different corpus release');
  return status;
}

// WorkOS Production puts a bot check on the hosted sign-in page, which a
// headless browser cannot pass, and WorkOS advises against driving that page
// from automation. With the deployed web service's WorkOS settings in
// SMOKE_WORKOS_CLIENT_ID, SMOKE_WORKOS_API_KEY and SMOKE_WORKOS_COOKIE_PASSWORD,
// sign in through the API instead and hand the browser the same sealed
// `wos-session` cookie the web app's callback would set.
async function signInThroughApi(context) {
  const clientId = process.env.SMOKE_WORKOS_CLIENT_ID;
  const apiKey = process.env.SMOKE_WORKOS_API_KEY;
  const cookiePassword = process.env.SMOKE_WORKOS_COOKIE_PASSWORD;
  if (!clientId || !apiKey || !cookiePassword) return false;
  const response = await fetch('https://api.workos.com/user_management/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: apiKey, grant_type: 'password', email, password }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`WorkOS password sign-in failed with HTTP ${response.status}`);
  const auth = await response.json();
  const u = auth.user;
  const user = { object: 'user', id: u.id, email: u.email, emailVerified: u.email_verified,
    firstName: u.first_name, lastName: u.last_name, profilePictureUrl: u.profile_picture_url,
    lastSignInAt: u.last_sign_in_at, externalId: u.external_id, metadata: u.metadata ?? {},
    createdAt: u.created_at, updatedAt: u.updated_at };
  const sealed = await sealData({ accessToken: auth.access_token, refreshToken: auth.refresh_token, user,
    authenticationMethod: auth.authentication_method },
    { password: cookiePassword, ttl: 0 });
  await context.addCookies([{ name: 'wos-session', value: sealed, url: baseUrl, httpOnly: true,
    secure: baseUrl.startsWith('https:'), sameSite: 'Lax' }]);
  return true;
}

async function openAuthenticatedChat(page) {
  const signedInThroughApi = await signInThroughApi(page.context());
  await page.goto(`${baseUrl}/chat`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (signedInThroughApi) {
    if (await isChatReady(page, 45_000)) return;
    throw new Error(`Signed in through the WorkOS API, but /chat did not load the chat; the browser is at ${new URL(page.url()).origin}${new URL(page.url()).pathname}`);
  }

  if (await isChatReady(page, 8_000)) {
    return;
  }

  const emailInput = page
    .locator('input[type="email"], input[name="email"], input[autocomplete="email"]')
    .first();
  await emailInput.waitFor({ state: 'visible', timeout: 20_000 });
  await emailInput.fill(email);
  await clickAuthSubmit(page);

  const passwordInput = page
    .locator('input[type="password"], input[name="password"], input[autocomplete="current-password"]')
    .first();
  await passwordInput.waitFor({ state: 'visible', timeout: 20_000 });
  await passwordInput.fill(password);
  await clickAuthSubmit(page);

  await page.waitForURL((url) => url.pathname.endsWith('/chat'), { timeout: 60_000 });
  await page.getByTestId('chat-input').waitFor({ state: 'visible', timeout: 30_000 });
}

async function clickAuthSubmit(page) {
  const candidates = [
    page.getByRole('button', { name: /continue|sign in|log in|submit/i }).first(),
    page.locator('button[type="submit"]').first(),
  ];

  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click();
      return;
    }
  }

  throw new Error('Could not find the WorkOS submit button.');
}

async function startFreshThread(page) {
  const newThread = page.getByTestId('new-thread-button');
  if (await newThread.isVisible().catch(() => false)) {
    await newThread.click();
    await page.getByTestId('chat-input').waitFor({ state: 'visible', timeout: 10_000 });
  }
}

async function askQuestion(page, existing = false) {
  const input = page.getByTestId('chat-input');
  const sendButton = page.getByTestId('send-button');

  if (!existing) {
    await input.fill(question);
    await sendButton.click();
  }

  const assistant = page.getByTestId('assistant-message').last();
  await assistant.waitFor({ state: 'visible', timeout: 30_000 });

  await page.waitForFunction(() => {
    const send = document.querySelector('[data-testid="send-button"]');
    const loading = document.querySelector('[data-testid="loading-indicator"]');
    return send && !/Researching/i.test(send.textContent ?? '') && !loading;
  }, null, { timeout: timeoutMs });

  const endedWithoutAnswer = await assistant
    .getByTestId('ended-without-answer')
    .isVisible()
    .catch(() => false);
  if (endedWithoutAnswer) {
    throw new Error('Agent finished without a final answer.');
  }

  const assistantText = normalizeWhitespace((await assistant.textContent()) ?? '');
  if (/sorry, there was an error processing your question/i.test(assistantText)) {
    throw new Error(`Web UI rendered the chat error state: ${assistantText.slice(0, 200)}`);
  }

  const verification = assistant.getByTestId('verification-badge');
  await verification.waitFor({ state: 'visible', timeout: 15_000 });
  const outcome = await verification.getAttribute('data-outcome');
  if (!['passed', 'corrected'].includes(outcome)) {
    throw new Error(`Expected a verified release outcome, received ${outcome}.`);
  }

  const answer = assistant.locator('.prose').last();
  if ((await answer.count()) === 0) {
    throw new Error(`Assistant message did not contain final answer markup: ${assistantText.slice(0, 200)}`);
  }

  await answer.waitFor({ state: 'visible', timeout: 15_000 });
  const answerText = normalizeWhitespace((await answer.textContent()) ?? '');

  if (answerText.length < minAnswerChars) {
    throw new Error(`Answer was too short: ${answerText.length} chars; expected at least ${minAnswerChars}.`);
  }
  if (/error processing your question|agent finished without a final answer/i.test(answerText)) {
    throw new Error(`Agent returned an error-like answer: ${answerText.slice(0, 200)}`);
  }

  const sourcesPanel = assistant.getByTestId('sources-panel');
  await sourcesPanel.waitFor({ state: 'visible', timeout: 15_000 });
  const sourcesLabel = normalizeWhitespace(
    (await sourcesPanel.getByTestId('sources-panel-trigger').textContent()) ?? 'Sources panel visible',
  );
  // P2 UX: once a run completes, tool steps collapse into the "Research
  // trail" Collapsible and the step cards are UNMOUNTED until expanded —
  // expand it first or the count below reads 0 on every healthy answer.
  const trailTrigger = assistant.getByTestId('research-trail-trigger');
  if (await trailTrigger.count()) {
    await trailTrigger.click();
  }
  const toolSteps = await assistant.getByTestId('tool-step').count();

  if (toolSteps < 1) {
    throw new Error('Expected at least one visible tool step in the production answer.');
  }

  return {
    answerText,
    outcome,
    answerLength: answerText.length,
    sourcesLabel,
    toolSteps,
  };
}

async function verifyRestoredAnswer(page, expected) {
  const title = await activeThreadForRestore(page);
  await startFreshThread(page);
  await threadByExactTitle(page, title).click();
  for (const reload of [false, true]) {
    if (reload) {
      await page.reload();
      await threadByExactTitle(page, title).click();
    }
    const assistant = page.getByTestId('assistant-message').last();
    const badge = assistant.getByTestId('verification-badge');
    await badge.waitFor({ state: 'visible', timeout: 30_000 });
    if (await badge.getAttribute('data-outcome') !== expected.outcome) throw new Error('Verification outcome changed after history restore');
    const restoredText = normalizeWhitespace((await assistant.locator('.prose').last().textContent()) ?? '');
    if (restoredText !== expected.answerText) throw new Error('Released answer changed after history restore');
  }
}

async function isChatReady(page, timeout) {
  // isVisible() does not wait (its timeout option is ignored), so a chat that
  // renders after domcontentloaded would read as signed out.
  return page.getByTestId('chat-input').waitFor({ state: 'visible', timeout }).then(() => true, () => false);
}

async function saveScreenshot(page, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  await page.screenshot({ path: targetPath, fullPage: true });
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice('export '.length) : line;
    const separator = normalized.indexOf('=');
    if (separator <= 0) continue;

    const key = normalized.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let rawValue = normalized.slice(separator + 1).trim();
    if (!(rawValue.startsWith('"') || rawValue.startsWith("'"))) {
      const commentIndex = rawValue.search(/\s#/);
      if (commentIndex >= 0) {
        rawValue = rawValue.slice(0, commentIndex).trimEnd();
      }
    }

    if (process.env[key] !== undefined) continue;
    process.env[key] = stripMatchingQuotes(rawValue);
  }
}

function stripMatchingQuotes(value) {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];

  if (
    (first === '"' || first === "'") &&
    first === last
  ) {
    const inner = value.slice(1, -1);
    if (first === '"') {
      return inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    return inner.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }

  return value;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function parsePositiveInt(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
