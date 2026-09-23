import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runEpsdtBatch } from '../epsdt-smoke-batch.mjs';

test('runs exactly three fresh-auth attempts and retains a failed middle attempt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'epsdt-batch-'));
  try {
    const output = path.join(root, 'results.json');
    let calls = 0;
    const result = await runEpsdtBatch('legacy', output, { SYNTHETIC_USER_EMAIL: 'test', SYNTHETIC_USER_PASSWORD: 'private' }, async (_release, env) => {
      assert.equal(env.RELEASE_SMOKE_QUESTION, 'What does EPSDT require?');
      if (++calls === 2) throw new Error('Answer was not verified');
      return { outcome: 'passed', passCount: 1, answerCharacters: 300 };
    });
    assert.equal(calls, 3);
    assert.equal(result.passed, false);
    assert.deepEqual(result.attempts.map(row => row.passed), [true, false, true]);
    assert.deepEqual(JSON.parse(fs.readFileSync(output)), result);
    assert.equal(fs.statSync(output).mode & 0o777, 0o600);
    assert.ok(!fs.readFileSync(output, 'utf8').includes('private'));
    await assert.rejects(runEpsdtBatch('legacy', output, { SYNTHETIC_USER_EMAIL: 'test', SYNTHETIC_USER_PASSWORD: 'private' }), /overwrite/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a permanent access token cannot satisfy the fresh-auth batch', async () => {
  await assert.rejects(runEpsdtBatch('legacy', '/unused', { SYNTHETIC_ACCESS_TOKEN: 'old' }), /fresh/);
});
