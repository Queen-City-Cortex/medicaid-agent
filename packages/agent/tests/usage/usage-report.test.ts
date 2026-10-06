import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../../src/storage/app-database.js';
import { UsageRepository } from '../../src/usage/repository.js';

const SCRIPT = fileURLToPath(new URL('../../scripts/usage-report.ts', import.meta.url));

describe('usage report', () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
  });

  it('counts one run per chat turn while adding the verifier calls to the tokens and cost', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'usage-report-'));
    directories.push(directory);
    const url = `file:${directory}/test.db`;
    const database = new AppDatabase(url);
    const usage = new UsageRepository(database);
    const at = Date.parse('2026-10-05T12:00:00Z');
    const turn = { userId: 'user-1', route: 'chat' as const, threadId: 'thread-1', modelId: 'gpt-5.6-terra', outputTokens: 100 };
    // Two chat turns; the second needed a correction, so the verifier ran three times in all.
    await usage.record({ ...turn, inputTokens: 10_000 }, at);
    await usage.record({ ...turn, inputTokens: 10_000 }, at);
    for (let call = 0; call < 3; call++) await usage.record({ ...turn, phase: 'verifier', inputTokens: 30_000 }, at);
    database.close();

    const report = spawnSync(process.execPath, ['--import', 'tsx', SCRIPT, '--month', '2026-10', '--by', 'user'],
      { encoding: 'utf8', env: { ...process.env, DATABASE_URL: url } });
    expect(report.status).toBe(0);
    const line = report.stdout.split('\n').find(text => text.startsWith('user-1'))!;
    expect(line).toMatch(/runs=\s+2\b/);
    expect(line).toMatch(/calls=\s+5\b/);
    expect(line).toMatch(/in=\s+110000\b/);
  });
});
