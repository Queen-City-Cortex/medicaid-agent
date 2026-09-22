#!/usr/bin/env node

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
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

try {
  browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  page = await context.newPage();

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
  await startFreshThread(page);
  const result = await askQuestion(page);
  await saveScreenshot(page, screenshotPath);

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
  if (page) {
    const failedPath = screenshotPath.replace(/(\.[^.]+)?$/, '.failed$1');
    await saveScreenshot(page, failedPath).catch(() => undefined);
    console.error(`Failure screenshot: ${failedPath}`);
  }
  throw error;
} finally {
  await browser?.close();
}

async function openAuthenticatedChat(page) {
  await page.goto(`${baseUrl}/chat`, { waitUntil: 'domcontentloaded', timeout: 45_000 });

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

async function askQuestion(page) {
  const input = page.getByTestId('chat-input');
  const sendButton = page.getByTestId('send-button');

  await input.fill(question);
  await sendButton.click();

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

  const verification = assistant.getByTestId('verification-badge');
  await verification.waitFor({ state: 'visible', timeout: 15_000 });
  const outcome = await verification.getAttribute('data-outcome');
  if (!['passed', 'corrected'].includes(outcome)) {
    throw new Error(`Expected a verified release outcome, received ${outcome}.`);
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
    answerLength: answerText.length,
    sourcesLabel,
    toolSteps,
  };
}

async function isChatReady(page, timeout) {
  return page.getByTestId('chat-input').isVisible({ timeout }).catch(() => false);
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
