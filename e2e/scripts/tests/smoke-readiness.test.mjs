import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyFeedbackRoundTrip, verifyLogout } from '../smoke-readiness.mjs';

async function fixture({ rejectPost = false, rejectDelete = false, brokenLogout = false } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let rated = false, signedOut = false;
  const methods = [];
  await page.route('https://readiness.invalid/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith('/feedback')) {
      methods.push(request.method());
      if (request.method() === 'POST') {
        if (!rejectPost) rated = true;
        return route.fulfill({ status: rejectPost ? 500 : 201, body: '{}' });
      }
      if (!rejectDelete) rated = false;
      return route.fulfill({ status: rejectDelete ? 500 : 204 });
    }
    if (url.pathname === '/logout') {
      signedOut = !brokenLogout;
      return route.fulfill({ status: 200, body: '{}' });
    }
    const html = signedOut ? '<input type="email">' : `
      <input data-testid="chat-input">
      <div class="group border-l-accent"><button data-testid="thread-item">Readiness fixture</button></div>
      <div data-testid="assistant-message"><button aria-label="Rate helpful"
        class="${rated ? 'text-emerald-600' : ''}"
        onclick="fetch('${rated ? '/feedback/test' : '/feedback'}', {method:'${rated ? 'DELETE' : 'POST'}'})">Helpful</button></div>
      <button onclick="fetch('/logout').then(()=>location.href='/login')">Sign out</button>`;
    return route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto('https://readiness.invalid/chat');
  return { browser, page, methods };
}

test('feedback must persist across reload and clear through a successful DELETE', async () => {
  const { browser, page, methods } = await fixture();
  try {
    assert.deepEqual(await verifyFeedbackRoundTrip(page), { created: true, persisted: true, removed: true });
    assert.deepEqual(methods, ['POST', 'DELETE']);
  } finally { await browser.close(); }
});

for (const [option, message] of [['rejectPost', 'creation'], ['rejectDelete', 'removal']]) {
  test(`feedback ${message} failure cannot produce a passing receipt`, async () => {
    const { browser, page } = await fixture({ [option]: true });
    try { await assert.rejects(verifyFeedbackRoundTrip(page), new RegExp(`Feedback ${message} failed`)); }
    finally { await browser.close(); }
  });
}

test('logout requires the protected chat route to show login again', async () => {
  const { browser, page } = await fixture();
  try { assert.deepEqual(await verifyLogout(page, 'https://readiness.invalid'), { signedOut: true, protectedChatRequiresLogin: true }); }
  finally { await browser.close(); }
});

test('a logout redirect alone cannot pass when the chat session remains active', async () => {
  const { browser, page } = await fixture({ brokenLogout: true });
  page.setDefaultTimeout(1000);
  try { await assert.rejects(verifyLogout(page, 'https://readiness.invalid')); }
  finally { await browser.close(); }
});

test('readiness cannot replace an activation receipt or overwrite earlier evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-receipt-'));
  try {
    fs.chmodSync(root, 0o700);
    const receipt = path.join(root, 'receipt.json');
    const env = { ...process.env, TEST_USER_EMAIL: 'test@example.invalid', TEST_USER_PASSWORD: 'fake',
      SMOKE_EXPECTED_RELEASE_ID: 'test-release', SMOKE_READINESS_RECEIPT_PATH: receipt };
    const script = fileURLToPath(new URL('../smoke-production.mjs', import.meta.url));
    const mixed = spawnSync(process.execPath, [script], { env: { ...env, SMOKE_ACTIVATION_NONCE: 'test-nonce' }, encoding: 'utf8', timeout: 5000 });
    assert.equal(mixed.status, 1);
    assert.match(mixed.stderr, /cannot issue activation receipts/);
    assert.equal(fs.existsSync(receipt), false);
    fs.writeFileSync(receipt, 'retained');
    const repeated = spawnSync(process.execPath, [script], { env, encoding: 'utf8', timeout: 5000 });
    assert.equal(repeated.status, 1);
    assert.match(repeated.stderr, /new receipt path/);
    assert.equal(fs.readFileSync(receipt, 'utf8'), 'retained');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
