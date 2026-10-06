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

  describe('daily limits', () => {
    const DAY = 86_400_000;
    const dayStart = Date.parse('2026-07-23T12:00:00.000Z');
    const PLAN = {
      brief: 'Find coverage',
      subQuestions: [{ question: 'Scope?', rationale: 'Establish scope', channels: ['vector' as const], useWeb: false }],
    };
    const REPORT = {
      verification: { status: 'passed' as const, passCount: 1 },
      status: 'completed' as const,
      question: 'Q',
      brief: PLAN.brief,
      reportMarkdown: 'Supported report.',
      subQuestions: PLAN.subQuestions,
      corpusSources: [],
      webSources: [],
      workerFailures: [],
      citationProvenance: null,
      stats: { reflectionRounds: 0, subQuestionCount: 1, corpusSourceCount: 0, webSourceCount: 0 },
    };

    async function proposePlan(runId: string, now: number) {
      await repository.create(runId, 'user-1', 'Q', now);
      expect(await repository.acquire(runId, 'queued', 'planning', runId, 2, now)).toBe(true);
      expect(await repository.awaitingApproval(runId, PLAN, runId, now)).toBe(true);
    }
    async function approvePlan(runId: string, now: number) {
      await proposePlan(runId, now);
      expect(await repository.acquire(
        runId, 'awaiting_approval', 'researching', runId, 2, now,
        { approved: true, editedSubQuestions: PLAN.subQuestions },
      )).toBe(true);
    }
    const start = (runId: string, now: number) => repository.create(runId, 'user-1', 'Q', now);

    it('does not count a plan the user declined or cancelled before approving', async () => {
      await proposePlan('declined-1', dayStart);
      await repository.cancel('declined-1', 'user-1', dayStart + 1);
      await proposePlan('declined-2', dayStart + 2);
      await repository.cancel('declined-2', 'user-1', dayStart + 3);
      // Cancelled while still queued, before any plan existed.
      await start('cancelled-early', dayStart + 4);
      await repository.cancel('cancelled-early', 'user-1', dayStart + 5);

      await expect(start('run-4', dayStart + 6)).resolves.toMatchObject({ runId: 'run-4' });
    });

    it('does not count a run whose planning failed', async () => {
      for (const [index, runId] of ['failed-1', 'failed-2'].entries()) {
        await start(runId, dayStart + index * 10);
        await repository.acquire(runId, 'queued', 'planning', runId, 2, dayStart + index * 10);
        expect(await repository.fail(runId, new Error('Planner did not produce a research plan'), runId, dayStart + index * 10 + 1)).toBe(true);
      }

      await expect(start('run-3', dayStart + 30)).resolves.toMatchObject({ runId: 'run-3' });
    });

    it('does not count a plan that expired unanswered', async () => {
      await proposePlan('abandoned', dayStart);
      expect(await repository.expireAwaitingApproval(dayStart + DAY)).toEqual([{ runId: 'abandoned', workflowRunId: null }]);
      await approvePlan('report-1', dayStart + DAY + 1);
      await repository.complete('report-1', REPORT, 'report-1', dayStart + DAY + 2);

      await expect(start('run-3', dayStart + DAY + 3)).resolves.toMatchObject({ runId: 'run-3' });
    });

    it('counts approved runs whether they completed, failed or were cancelled afterwards', async () => {
      await approvePlan('completed', dayStart);
      expect(await repository.complete('completed', REPORT, 'completed', dayStart + 1)).toBe(true);
      await approvePlan('failed', dayStart + 2);
      expect(await repository.fail('failed', new Error('Answer grounding failed'), 'failed', dayStart + 3)).toBe(true);

      const refused = await start('run-3', dayStart + 4).catch(error => error);
      expect(refused).toBeInstanceOf(ResearchStartRejectedError);
      // The older approved run leaves the window first and frees one report.
      expect(refused).toMatchObject({ reason: 'daily_quota', retryAt: dayStart + DAY });
      await expect(start('still-refused', dayStart + DAY - 1)).rejects.toMatchObject({ reason: 'daily_quota', retryAt: dayStart + DAY });

      await approvePlan('cancelled-after-approval', dayStart + DAY);
      await repository.cancel('cancelled-after-approval', 'user-1', dayStart + DAY + 1);
      await expect(start('run-5', dayStart + DAY + 1)).rejects.toMatchObject({ reason: 'daily_quota', retryAt: dayStart + DAY + 2 });
    });

    it('stops a create-and-cancel loop at six plans in a rolling 24-hour window', async () => {
      for (let index = 0; index < 6; index += 1) {
        await proposePlan(`plan-${index}`, dayStart + index * 10);
        await repository.cancel(`plan-${index}`, 'user-1', dayStart + index * 10 + 1);
      }

      await expect(start('plan-6', dayStart + 100)).rejects.toMatchObject({ reason: 'planning_limit', retryAt: dayStart + DAY });
      await expect(repository.create('theirs', 'user-2', 'Q', dayStart + 100)).resolves.toMatchObject({ runId: 'theirs' });
      await expect(start('plan-7', dayStart + DAY + 1)).resolves.toMatchObject({ runId: 'plan-7' });
    });

    it('reports the active run ahead of either daily limit', async () => {
      await approvePlan('report-1', dayStart);
      await repository.complete('report-1', REPORT, 'report-1', dayStart + 1);
      await approvePlan('report-2', dayStart + 2);

      await expect(start('run-3', dayStart + 3)).rejects.toMatchObject({ reason: 'active_run', retryAt: null });
    });
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

  it('cancels a plan left awaiting approval for a day and frees the owner to start again', async () => {
    const plannedAt = Date.parse('2026-07-23T12:00:00.000Z');
    const plan = {
      brief: 'Brief',
      subQuestions: [{ question: 'Question', rationale: 'Reason', channels: ['vector' as const], useWeb: false }],
    };
    for (const [runId, userId] of [['run-1', 'user-1'], ['run-2', 'user-2']]) {
      await repository.create(runId, userId, 'First', plannedAt - 60_000);
      await repository.acquire(runId, 'queued', 'planning', 'planner', 2, plannedAt - 60_000);
    }
    await repository.awaitingApproval('run-1', plan, 'planner', plannedAt);
    // run-2 is older but still leased planning work: only waiting plans expire.

    expect(await repository.expireAwaitingApproval(plannedAt + 86_400_000 - 1)).toEqual([]);
    await expect(repository.create('run-3', 'user-1', 'Second', plannedAt + 86_400_000 - 1))
      .rejects.toMatchObject({ reason: 'active_run' });

    expect(await repository.expireAwaitingApproval(plannedAt + 86_400_000))
      .toEqual([{ runId: 'run-1', workflowRunId: null }]);
    expect(await repository.get('run-1', 'user-1')).toMatchObject({ state: 'cancelled' });
    expect(await repository.get('run-2', 'user-2')).toMatchObject({ state: 'planning' });
    expect(await repository.create('run-3', 'user-1', 'Second', plannedAt + 86_400_000))
      .toMatchObject({ state: 'queued' });
  });

  it('finds only the owner\'s active run', async () => {
    expect(await repository.getActive('user-1')).toBeNull();
    await repository.create('run-1', 'user-1', 'First');

    expect(await repository.getActive('user-1')).toMatchObject({ runId: 'run-1', state: 'queued' });
    expect(await repository.getActive('user-2')).toBeNull();

    await repository.cancel('run-1', 'user-1');
    expect(await repository.getActive('user-1')).toBeNull();
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
