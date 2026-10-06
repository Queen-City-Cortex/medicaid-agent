import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { activeThreadForRestore, allowThreadWritesOnlyTo, deleteSmokeThread, finishSmokeThread, renameActiveThread,
  smokeThreadTitle, threadIdFromUrl } from '../smoke-thread.mjs';
import { startFakeChatApp } from './fake-chat-app.mjs';

test('waits for the active thread when the previous answer still leads the sidebar', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<div class="group"><button data-testid="thread-item">Old EPSDT answer</button></div>');
    const title = activeThreadForRestore(page);
    await page.evaluate(() => setTimeout(() => {
      document.body.insertAdjacentHTML('beforeend', '<div class="group border-l-accent"><button data-testid="thread-item">New EPSDT answer</button></div>');
    }, 100));
    assert.equal(await title, 'New EPSDT answer');
  } finally { await browser.close(); }
});

test('rejects ambiguous sidebar titles instead of selecting the first match', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<div class="group"><button data-testid="thread-item">EPSDT</button></div><div class="group border-l-accent"><button data-testid="thread-item">EPSDT</button></div>');
    await assert.rejects(activeThreadForRestore(page), /uniquely identify/);
  } finally { await browser.close(); }
});

const LEFTOVER = { id: 'leftover', title: 'What is EPSDT?', answer: 'An earlier run.' };

// Opens the fake signed in, with a fresh thread asked and active, as the smoke
// script has it when it reaches the rename.
async function askedThread(options) {
  const app = await startFakeChatApp(options);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(3000);
  await page.goto(`${app.origin}/chat`);
  await page.getByTestId('chat-input').fill('What is EPSDT?');
  await page.getByTestId('send-button').click();
  await page.locator('.group.border-l-accent').waitFor();
  const created = app.threads[0].id;
  return { app, page, created, close: async () => { await browser.close(); await app.close(); } };
}

test('smoke titles carry the run id and differ between runs', () => {
  const first = smokeThreadTitle(undefined, new Date('2026-10-05T10:00:00Z'));
  assert.equal(first, 'smoke 2026-10-05T10:00:00.000Z');
  assert.notEqual(first, smokeThreadTitle(undefined, new Date('2026-10-05T10:00:01Z')));
  assert.equal(smokeThreadTitle('run-7', new Date('2026-10-05T10:00:00Z')), 'smoke run-7 2026-10-05T10:00:00.000Z');
});

test('only the active row is renamed when an earlier run left the same title', async () => {
  const { app, page, created, close } = await askedThread({ threads: [{ ...LEFTOVER }] });
  try {
    await assert.rejects(activeThreadForRestore(page), /uniquely identify/);
    await renameActiveThread(page, 'smoke run-1');
    assert.deepEqual(app.threads.map(thread => [thread.id, thread.title]),
      [[created, 'smoke run-1'], ['leftover', 'What is EPSDT?']]);
    assert.deepEqual(app.writes.filter(write => write.startsWith('PATCH')), [`PATCH ${created}`]);
    assert.equal(await activeThreadForRestore(page), 'smoke run-1');
  } finally { await close(); }
});

test('deleting the smoke thread removes that thread and no other', async () => {
  const { app, page, created, close } = await askedThread({ threads: [{ ...LEFTOVER }] });
  try {
    await renameActiveThread(page, 'smoke run-1');
    await deleteSmokeThread(page, 'smoke run-1', created);
    assert.deepEqual(app.threads.map(thread => thread.id), ['leftover']);
    assert.deepEqual(app.writes.filter(write => write.startsWith('DELETE')), [`DELETE ${created}`]);
  } finally { await close(); }
});

test('a write to a thread the run did not create never leaves the browser', async () => {
  // The leftover already carries the title this run is about to delete, so the
  // title alone would pick it; only the recorded id tells them apart.
  const { app, page, close } = await askedThread({ threads: [{ ...LEFTOVER, title: 'smoke run-1' }] });
  const blocked = [];
  try {
    await allowThreadWritesOnlyTo(page, () => ['some-other-thread'], message => blocked.push(message));
    await assert.rejects(deleteSmokeThread(page, 'smoke run-1', 'some-other-thread'));
    await assert.rejects(renameActiveThread(page, 'smoke run-2'));
    assert.deepEqual(blocked.map(message => message.split(' ')[1]), ['DELETE', 'PATCH']);
    assert.equal(app.threads.length, 2);
    assert.deepEqual(app.writes.filter(write => /^(DELETE|PATCH)/.test(write)), []);
  } finally { await close(); }
});

test('memory API URLs yield their thread id and nothing else does', () => {
  assert.equal(threadIdFromUrl('https://agent.invalid/api/memory/threads/abc%20d?agentId=x'), 'abc d');
  assert.equal(threadIdFromUrl('https://agent.invalid/api/memory/threads?agentId=x'), null);
  assert.equal(threadIdFromUrl('https://agent.invalid/api/memory/threads/abc/messages'), null);
});

test('a passing run deletes the thread it recorded; a failing run keeps it and names it', async () => {
  const deleted = [];
  const reports = [];
  const deleteThread = async (...args) => { deleted.push(args); };
  const report = message => reports.push(message);

  assert.equal(await finishSmokeThread({ succeeded: true, title: 'smoke a', threadIds: ['id-a'], deleteThread, report }), 'deleted');
  assert.deepEqual(deleted, [['smoke a', 'id-a']]);
  assert.deepEqual(reports, []);

  assert.equal(await finishSmokeThread({ succeeded: false, title: 'smoke b', threadIds: ['id-b'], deleteThread, report }), 'kept');
  assert.equal(deleted.length, 1);
  assert.match(reports[0], /kept for diagnosis: "smoke b" \(thread id-b\)/);

  // Failed before the rename: there is no unique title, so the id is the handle.
  assert.equal(await finishSmokeThread({ succeeded: false, title: undefined, threadIds: ['id-c'], deleteThread, report }), 'kept');
  assert.match(reports[1], /still titled with its question \(thread id-c\)/);
});

test('cleanup trouble warns and never fails a passing run', async () => {
  const reports = [];
  const report = message => reports.push(message);
  const failing = async () => { throw new Error('menu did not open'); };
  const unreachable = async () => assert.fail('must not delete without exactly one recorded thread');

  assert.equal(await finishSmokeThread({ succeeded: true, title: 'smoke a', threadIds: ['id-a'], deleteThread: failing, report }), 'kept');
  assert.match(reports[0], /cleanup failed; delete it by hand: "smoke a" \(thread id-a\): menu did not open/);
  for (const threadIds of [[], ['id-a', 'id-b']]) {
    assert.equal(await finishSmokeThread({ succeeded: true, title: 'smoke a', threadIds, deleteThread: unreachable, report }), 'kept');
  }
  assert.equal(await finishSmokeThread({ succeeded: true, title: undefined, threadIds: ['id-a'], deleteThread: unreachable, report }), 'kept');
  assert.equal(reports.length, 4);
});

// The whole script against the fake, as an operator runs it. Nothing here can
// reach the deployed app: both URLs are pinned to the local fake.
async function runSmoke(app, extra = {}) {
  const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-thread-'));
  const env = { ...process.env, TEST_USER_EMAIL: 'test@example.invalid', TEST_USER_PASSWORD: 'fake',
    SMOKE_BASE_URL: app.origin, AGENT_PUBLIC_URL: app.origin, SMOKE_SCREENSHOT_PATH: path.join(shots, 'smoke.png'),
    SMOKE_QUESTION: 'What is EPSDT?', SMOKE_TIMEOUT_MS: '10000', SMOKE_MIN_ANSWER_CHARS: '', SMOKE_HEADLESS: '',
    SMOKE_RESTORE_THREAD_TITLE: '', SMOKE_READINESS_RECEIPT_PATH: '', SMOKE_EXPECTED_RELEASE_ID: '',
    SMOKE_ACTIVATION_NONCE: '', SMOKE_RECEIPT_PATH: '', SMOKE_TEST_RUN_ID: '', ...extra };
  const script = fileURLToPath(new URL('../smoke-production.mjs', import.meta.url));
  try {
    return await new Promise(resolve => execFile(process.execPath, [script], { env, timeout: 60_000 },
      (error, stdout, stderr) => resolve({ status: error ? error.code ?? 1 : 0, stdout, stderr })));
  } finally { fs.rmSync(shots, { recursive: true, force: true }); }
}

test('the smoke passes run after run and leaves the account as it found it', async () => {
  const app = await startFakeChatApp({ threads: [{ ...LEFTOVER }] });
  try {
    for (const run of [1, 2]) {
      const result = await runSmoke(app);
      assert.equal(result.status, 0, `run ${run}: ${result.stderr}`);
      assert.match(result.stdout, /Production smoke passed/);
      assert.deepEqual(app.threads, [LEFTOVER]);
    }
    const created = app.writes.filter(write => write.startsWith('POST')).map(write => write.split(' ')[1]);
    assert.equal(new Set(created).size, 2);
    assert.deepEqual(app.writes.filter(write => write.startsWith('DELETE')), [...new Set(created)].map(id => `DELETE ${id}`));
  } finally { await app.close(); }
});

test('a failed smoke keeps its renamed thread and prints the title', async () => {
  const app = await startFakeChatApp({ forgetAnswers: true });
  try {
    const result = await runSmoke(app, { SMOKE_TEST_RUN_ID: 'run-9' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Released answer changed after history restore/);
    assert.equal(app.threads.length, 1);
    assert.match(app.threads[0].title, /^smoke run-9 \d{4}-/);
    assert.ok(result.stderr.includes(`Smoke thread kept for diagnosis: "${app.threads[0].title}" (thread ${app.threads[0].id})`));
    assert.deepEqual(app.writes.filter(write => write.startsWith('DELETE')), []);
  } finally { await app.close(); }
});

test('a rejected cleanup warns but the smoke still passes', async () => {
  const app = await startFakeChatApp({ rejectDelete: true });
  try {
    const result = await runSmoke(app);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Smoke thread cleanup failed; delete it by hand: "smoke /);
    assert.equal(app.threads.length, 1);
  } finally { await app.close(); }
});

test('restoring an existing thread neither renames nor deletes it', async () => {
  const kept = { id: 'kept', title: 'Operator thread', answer: 'EPSDT covers medically necessary services. '.repeat(6).trim() };
  const app = await startFakeChatApp({ threads: [{ ...kept }] });
  try {
    const result = await runSmoke(app, { SMOKE_RESTORE_THREAD_TITLE: 'Operator thread' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(app.threads, [kept]);
    assert.deepEqual(app.writes, []);
  } finally { await app.close(); }
});
