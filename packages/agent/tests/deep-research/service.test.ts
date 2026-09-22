import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDatabase } from '../../src/storage/app-database.js';
import { ResearchRepository } from '../../src/deep-research/repository.js';
import {
  ResearchService,
  type ResearchMastra,
} from '../../src/deep-research/service.js';

const PLAN = {
  brief: 'Research the governing coverage rule.',
  subQuestions: [{
    question: 'What is covered?',
    rationale: 'Establish scope',
    channels: ['vector' as const],
    useWeb: false,
  }],
};

const REPORT = {
  status: 'completed' as const,
  question: 'What is covered?',
  brief: PLAN.brief,
  reportMarkdown: 'Supported report.',
  subQuestions: PLAN.subQuestions,
  corpusSources: [],
  webSources: [],
  workerFailures: [],
  citationProvenance: null,
  stats: {
    reflectionRounds: 0,
    subQuestionCount: 1,
    corpusSourceCount: 0,
    webSourceCount: 0,
  },
};

describe('ResearchService', () => {
  let database: AppDatabase;
  let repository: ResearchRepository;

  beforeEach(() => {
    database = new AppDatabase(':memory:');
    repository = new ResearchRepository(database);
  });
  afterEach(() => database.close());

  it('plans a queued run once and durably suspends for approval', async () => {
    await repository.create('run-1', 'user-1', 'What is covered?');
    const start = vi.fn().mockResolvedValue({
      status: 'suspended',
      suspendPayload: { 'plan-approval': PLAN },
    });
    const createRun = vi.fn().mockResolvedValue({
      runId: 'workflow-1',
      start,
      resume: vi.fn(),
      cancel: vi.fn(),
    });
    const mastra = {
      getWorkflow: vi.fn(() => ({ createRun })),
    } as unknown as ResearchMastra;
    const service = new ResearchService(repository, 2, undefined, async () => 'release-1');

    await service.plan('run-1', mastra);
    await service.plan('run-1', mastra);

    expect(start).toHaveBeenCalledTimes(1);
    expect(await repository.get('run-1', 'user-1')).toMatchObject({
      state: 'awaiting_approval',
      plan: PLAN,
    });
  });

  it('completes approved work and does not let cancellation be overwritten', async () => {
    await repository.create('run-1', 'user-1', 'What is covered?');
    const start = vi.fn().mockResolvedValue({
      status: 'suspended',
      suspendPayload: { 'plan-approval': PLAN },
    });
    let finishResume!: (value: unknown) => void;
    const resume = vi.fn(() => new Promise((resolve) => { finishResume = resolve; }));
    const cancel = vi.fn().mockResolvedValue(undefined);
    const createRun = vi.fn()
      .mockResolvedValueOnce({ runId: 'workflow-1', start, resume, cancel })
      .mockResolvedValue({ runId: 'workflow-1', start, resume, cancel });
    const mastra = { getWorkflow: vi.fn(() => ({ createRun })) } as unknown as ResearchMastra;
    const service = new ResearchService(repository, 2, undefined, async () => 'release-1');
    await service.plan('run-1', mastra);

    expect(await service.decide('run-1', 'user-1', { approved: true }, mastra))
      .toBe('accepted');
    await service.cancel('run-1', 'user-1', mastra);
    finishResume({ status: 'success', result: REPORT });

    await vi.waitFor(async () => {
      expect(await repository.get('run-1', 'user-1')).toMatchObject({ state: 'cancelled' });
    });
  });

  it('renews the lease while provider work is still running', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-24T12:00:00.000Z');
    try {
      await repository.create('run-1', 'user-1', 'First');
      await repository.create('run-2', 'user-2', 'Second');
      let finishStart!: (value: unknown) => void;
      const start = vi.fn(() => new Promise((resolve) => { finishStart = resolve; }));
      const workflowRun = { runId: 'workflow-1', start, resume: vi.fn(), cancel: vi.fn() };
      const mastra = {
        getWorkflow: vi.fn(() => ({ createRun: vi.fn().mockResolvedValue(workflowRun) })),
      } as unknown as ResearchMastra;
      const service = new ResearchService(repository, 2, undefined, async () => 'release-1');

      const planning = service.plan('run-1', mastra);
      await vi.advanceTimersByTimeAsync(16 * 60_000);
      expect(await repository.acquire('run-2', 'queued', 'planning', 'other', 1)).toBe(false);

      finishStart({ status: 'suspended', suspendPayload: { 'plan-approval': PLAN } });
      await planning;
      expect(await repository.get('run-1', 'user-1')).toMatchObject({
        state: 'awaiting_approval',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('revisits a valid lease after restart and recovers it once it expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-24T12:00:00.000Z');
    try {
      await repository.create('run-1', 'user-1', 'First');
      await repository.acquire('run-1', 'queued', 'planning', 'dead-instance:plan:run-1', 2);
      const service = new ResearchService(repository, 2, undefined, async () => 'release-1');
      const mastra = {
        getWorkflow: vi.fn(() => ({ createRun: vi.fn().mockResolvedValue({ runId: 'retry-workflow', start: vi.fn().mockResolvedValue({ status: 'suspended', suspendPayload: { 'plan-approval': PLAN } }), cancel: vi.fn() }) })),
      } as unknown as ResearchMastra;

      await service.recover(mastra);
      expect(await repository.get('run-1', 'user-1')).toMatchObject({ state: 'planning' });
      await vi.advanceTimersByTimeAsync(16 * 60_000);
      expect(await repository.get('run-1', 'user-1')).toMatchObject({
        state: 'awaiting_approval',
        recoveryCount: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels provider work and fails closed when lease renewal is lost', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-24T12:00:00.000Z');
    try {
      await repository.create('run-1', 'user-1', 'First');
      vi.spyOn(repository, 'renewLease').mockResolvedValue(false);
      const start = vi.fn(() => new Promise(() => {}));
      const cancel = vi.fn().mockResolvedValue(undefined);
      const workflowRun = { runId: 'workflow-1', start, resume: vi.fn(), cancel };
      const mastra = {
        getWorkflow: vi.fn(() => ({
          createRun: vi.fn().mockResolvedValue(workflowRun),
        })),
      } as unknown as ResearchMastra;
      const service = new ResearchService(repository, 2, undefined, async () => 'release-1');

      const planning = service.plan('run-1', mastra);
      await vi.advanceTimersByTimeAsync(60_000);
      await planning;

      expect(cancel).toHaveBeenCalledTimes(1);
      expect(await repository.get('run-1', 'user-1')).toMatchObject({
        state: 'failed',
        error: 'Research execution lease was lost',
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
