import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../../src/storage/app-database.js';
import {
  ResearchRepository,
  ResearchStartRejectedError,
} from '../../src/deep-research/repository.js';

describe('ResearchRepository', () => {
  let database: AppDatabase;
  let repository: ResearchRepository;

  beforeEach(() => {
    database = new AppDatabase(':memory:');
    repository = new ResearchRepository(database);
  });

  afterEach(() => {
    database.close();
  });

  it('durably creates a queued run that only its owner can read', async () => {
    const created = await repository.create('run-1', 'user-1', 'What does Policy 3L cover?');

    expect(created).toMatchObject({
      runId: 'run-1',
      state: 'queued',
      question: 'What does Policy 3L cover?',
      plan: null,
      report: null,
      error: null,
    });
    expect(created.createdAt).toBe(created.updatedAt);
    expect(await repository.get('run-1', 'user-1')).toEqual(created);
    expect(await repository.get('run-1', 'user-2')).toBeNull();
  });

  it('atomically permits only one active run per user', async () => {
    await repository.create('run-1', 'user-1', 'First');

    await expect(repository.create('run-2', 'user-1', 'Second')).rejects.toMatchObject({
      reason: 'active_run',
    } satisfies Partial<ResearchStartRejectedError>);
  });

  it('permits only two starts in a rolling 24-hour window', async () => {
    const dayStart = Date.parse('2026-07-23T12:00:00.000Z');
    await repository.create('run-1', 'user-1', 'First', dayStart);
    await repository.cancel('run-1', 'user-1', dayStart + 1);
    await repository.create('run-2', 'user-1', 'Second', dayStart + 2);
    await repository.cancel('run-2', 'user-1', dayStart + 3);

    await expect(
      repository.create('run-3', 'user-1', 'Third', dayStart + 4),
    ).rejects.toMatchObject({ reason: 'daily_quota' });

    await expect(
      repository.create('run-4', 'user-1', 'Tomorrow', dayStart + 86_400_001),
    ).resolves.toMatchObject({ runId: 'run-4' });
  });

  it('leases work idempotently and enforces the global concurrency bound', async () => {
    await repository.create('run-1', 'user-1', 'First');
    await repository.create('run-2', 'user-2', 'Second');

    expect(await repository.acquire('run-1', 'queued', 'planning', 'worker-1', 1))
      .toBe(true);
    expect(await repository.acquire('run-1', 'queued', 'planning', 'worker-1', 1))
      .toBe(false);
    expect(await repository.acquire('run-2', 'queued', 'planning', 'worker-2', 1))
      .toBe(false);
  });

  it('queues expired leased work for bounded recovery', async () => {
    const startedAt = Date.parse('2026-07-23T12:00:00.000Z');
    await repository.create('run-1', 'user-1', 'First', startedAt);
    await repository.acquire('run-1', 'queued', 'planning', 'worker-1', 2, startedAt);

    expect(await repository.recoverExpiredLeases(startedAt + 15 * 60_000 + 1)).toBe(1);
    expect(await repository.get('run-1', 'user-1')).toMatchObject({
      state: 'recovering',
      recoveryCount: 0,
    });
  });

  it('persists the verifying phase under the active research lease', async () => {
    await repository.create('run-1', 'user-1', 'First');
    await repository.acquire('run-1', 'queued', 'planning', 'planner', 2);
    await repository.awaitingApproval('run-1', {
      brief: 'Brief',
      subQuestions: [{
        question: 'Question',
        rationale: 'Reason',
        channels: ['vector'],
        useWeb: false,
      }],
    }, 'planner');
    await repository.acquire('run-1', 'awaiting_approval', 'researching', 'worker', 2);

    expect(await repository.markVerifying('run-1', 'worker')).toBe(true);
    expect(await repository.get('run-1', 'user-1')).toMatchObject({ state: 'verifying' });
  });

  it('renews an active lease without changing its owner or phase', async () => {
    const startedAt = Date.parse('2026-07-24T12:00:00.000Z');
    await repository.create('run-1', 'user-1', 'First', startedAt);
    await repository.acquire('run-1', 'queued', 'planning', 'worker-1', 2, startedAt);
    const before = await repository.getInternal('run-1');

    expect(await repository.renewLease('run-1', 'worker-1', startedAt + 60_000)).toBe(true);
    const after = await repository.getInternal('run-1');
    expect(after).toMatchObject({ state: 'planning', leaseOwner: 'worker-1' });
    expect(after!.leaseExpiresAt).toBeGreaterThan(before!.leaseExpiresAt!);
  });
});

describe('recovery lease and budget invariants', () => {
  let db: AppDatabase;
  let repo: ResearchRepository;
  beforeEach(async () => { db = new AppDatabase(':memory:'); repo = new ResearchRepository(db); await repo.create('run', 'owner', 'q'); });
  afterEach(() => db.close());

  it('allows only two recovery claims and never creates another daily start', async () => {
    let now = Date.now();
    await repo.acquire('run', 'queued', 'researching', 'worker0', 2, now);
    for (let attempt = 1; attempt <= 2; attempt++) {
      now += 16 * 60_000;
      await repo.recoverExpiredLeases(now);
      const claims = await Promise.all([
        repo.acquire('run', 'recovering', 'researching', `worker${attempt}`, 2, now),
        repo.acquire('run', 'recovering', 'researching', 'competitor', 2, now),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect((await repo.get('run', 'owner'))?.recoveryCount).toBe(attempt);
    }
    await repo.recoverExpiredLeases(now + 16 * 60_000);
    expect((await repo.get('run', 'owner'))?.state).toBe('failed');
    expect((await db.client.execute('SELECT count(*) AS n FROM research_runs')).rows[0].n).toBe(1);
  });
  it('rejects stale writes, renewal, and late failures after cancellation', async () => {
    await repo.acquire('run', 'queued', 'researching', 'worker', 2);
    await repo.cancel('run', 'owner');
    await expect(repo.saveCheckpoint('run', 'worker', 'draft', 'PRIVATE_DRAFT_SENTINEL')).rejects.toThrow('lease');
    await expect(repo.reserveStep('run', 'worker', 'worker', 3)).rejects.toThrow();
    expect(await repo.renewLease('run', 'worker')).toBe(false);
    await repo.failOrRetry('run', new Error('ECONNRESET'), 'worker');
    expect((await repo.get('run', 'owner'))?.state).toBe('cancelled');
  });
  it('does not reset consumed steps after reacquiring a run', async () => {
    await repo.acquire('run', 'queued', 'researching', 'worker', 2);
    await repo.reserveStep('run', 'worker', 'question', 1);
    await expect(repo.reserveStep('run', 'worker', 'question', 100)).rejects.toThrow('budget');
    await repo.failOrRetry('run', new Error('ECONNRESET'), 'worker');
    const retry = (await repo.get('run', 'owner'))!.nextRetryAt!;
    await repo.acquire('run', 'recovering', 'researching', 'new', 2, Date.parse(retry));
    await expect(repo.reserveStep('run', 'new', 'question', 100)).rejects.toThrow('budget');
  });
  it('cleans private checkpoints and budgets on account deletion', async () => {
    await repo.acquire('run', 'queued', 'researching', 'worker', 2);
    await repo.saveCheckpoint('run', 'worker', 'draft', 'PRIVATE_DRAFT_SENTINEL');
    await repo.reserveStep('run', 'worker', 'question', 3);
    await db.deleteUserData('owner');
    for (const table of ['research_checkpoints', 'research_budgets']) {
      expect((await db.client.execute(`SELECT * FROM ${table}`)).rows).toHaveLength(0);
    }
  });
  it('rejects incompatible checkpoint versions', async () => {
    await repo.acquire('run', 'queued', 'researching', 'worker', 2);
    await repo.saveCheckpoint('run', 'worker', 'draft', 'private');
    await db.client.execute('UPDATE research_checkpoints SET version = 999');
    await expect(repo.checkpoint('run', 'draft')).rejects.toThrow('Incompatible');
  });
  it.each(['401 invalid API key', '403 unauthorized', 'Research step budget exhausted', 'Answer grounding failed'])('never retries %s', async error => {
    await repo.acquire('run', 'queued', 'researching', 'worker', 2);
    await repo.failOrRetry('run', new Error(error), 'worker');
    expect((await repo.get('run', 'owner'))?.state).toBe('failed');
  });
});
