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

  it('fails expired leased work instead of replaying charged provider work', async () => {
    const startedAt = Date.parse('2026-07-23T12:00:00.000Z');
    await repository.create('run-1', 'user-1', 'First', startedAt);
    await repository.acquire('run-1', 'queued', 'planning', 'worker-1', 2, startedAt);

    expect(await repository.failExpiredLeases(startedAt + 15 * 60_000 + 1)).toBe(1);
    expect(await repository.get('run-1', 'user-1')).toMatchObject({
      state: 'failed',
      error: 'Research worker lease expired before completion',
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
