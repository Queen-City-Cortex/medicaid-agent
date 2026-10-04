import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AppDatabase } from '../../src/storage/app-database.js';
import { ResearchRepository } from '../../src/deep-research/repository.js';
import { ResearchService } from '../../src/deep-research/service.js';
import { deepResearchWorkflow } from '../../src/deep-research/workflow.js';
import { deepResearchPlannerAgent, deepResearchWorkerAgent, deepResearchReportAgent } from '../../src/deep-research/agents.js';
import { verifyAnswer } from '../../src/processors/verifier/verify.js';
import { questionKey } from '../../src/deep-research/checkpoints.js';

const graph = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../../src/neo4j.js', () => ({
  withSession: async (work: (session: unknown) => Promise<unknown>) => work({ run: graph.run }),
}));

vi.mock('../../src/deep-research/agents.js', () => ({
  deepResearchPlannerAgent: { generate: vi.fn() }, deepResearchWorkerAgent: { generate: vi.fn() },
  deepResearchReportAgent: { generate: vi.fn() },
}));
vi.mock('../../src/processors/verifier/verify.js', async original => ({
  ...await original<typeof import('../../src/processors/verifier/verify.js')>(), verifyAnswer: vi.fn(),
}));
const question = (q: string) => ({ question: q, rationale: 'Read governing evidence', channels: ['vector' as const], useWeb: false });
const PLAN = { brief: 'Find coverage', subQuestions: [question('Scope?'), question('Eligibility?')] };
const CLEAN = { supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };
const ANSWER = 'The service is covered. [Policy](https://example.gov/policy)';

describe('checkpoint recovery through real Mastra workflow and SQLite', () => {
  let directory: string;
  let database: AppDatabase;
  let repository: ResearchRepository;
  let storage: LibSQLStore;
  let service: ResearchService;
  let mastra: Mastra;
  let release: string;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.clearAllMocks();
    directory = await mkdtemp(join(tmpdir(), 'research-recovery-'));
    const url = `file:${directory}/test.db`;
    database = new AppDatabase(url);
    repository = new ResearchRepository(database);
    storage = new LibSQLStore({ id: 'test', url });
    await storage.init();
    release = 'release-1';
    service = new ResearchService(repository, 2, undefined, async () => release);
    mastra = new Mastra({ workflows: { deepResearchWorkflow }, storage });
    vi.mocked(deepResearchPlannerAgent.generate).mockImplementation(async (_prompt: unknown, options?: any) => {
      await options?.prepareStep?.({});
      return { object: String(_prompt).startsWith('Plan ') ? PLAN : { sufficient: true, gaps: '', followUps: [] } } as any;
    });
    vi.mocked(deepResearchWorkerAgent.generate).mockImplementation(async (_prompt: unknown, options?: any) => {
      await options?.prepareStep?.({});
      return { text: ANSWER, toolResults: [{ toolName: 'getSection', result: { section: {
        id: 'section', title: 'Coverage', sectionNumber: '1', content: 'The service is covered.',
        citationLink: 'https://example.gov/policy', documentId: 'policy', policyNumber: 'P',
      } } }] } as any;
    });
    vi.mocked(deepResearchReportAgent.generate).mockImplementation(async (_prompt: unknown, options?: any) => {
      await options?.prepareStep?.({});
      return { text: ANSWER } as any;
    });
    vi.mocked(verifyAnswer).mockResolvedValue(CLEAN);
    await repository.create('run', 'owner', 'Coverage?');
  });
  afterEach(async () => {
    service.dispose();
    database.close();
    await storage.close();
    await rm(directory, { recursive: true, force: true });
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  async function finishPlanning() {
    await service.plan('run', mastra);
    expect((await repository.getInternal('run'))?.state).toBe('awaiting_approval');
  }
  async function recover() {
    const run = (await repository.getInternal('run'))!;
    vi.setSystemTime(Date.parse(run.nextRetryAt!));
    await service.plan('run', mastra);
  }
  it.each(['plan', `worker:${questionKey(PLAN.subQuestions[0])}`, 'reflection:0', 'synthesis', 'report:verification:1', 'report'])(
    'reuses committed work after interruption at %s', async key => {
      const save = repository.saveCheckpoint.bind(repository);
      let interrupted = false;
      vi.spyOn(repository, 'saveCheckpoint').mockImplementation(async (...args) => {
        await save(...args);
        if (args[2] === key && !interrupted) { interrupted = true; throw new Error('ECONNRESET while persisting research checkpoint'); }
      });
      await service.plan('run', mastra);
      if (key === 'plan') {
        expect((await repository.getInternal('run'))?.state).toBe('recovering');
        await recover();
      }
      expect((await repository.getInternal('run'))?.state).toBe('awaiting_approval');
      expect(await service.decide('run', 'owner', { approved: true }, mastra)).toBe('accepted');
      expect((await repository.getInternal('run'))?.approval?.editedSubQuestions).toEqual(PLAN.subQuestions);
      await vi.waitFor(async () => expect(['recovering', 'completed']).toContain((await repository.getInternal('run'))?.state));
      if (key !== 'plan') await recover();
      const result = (await repository.get('run', 'owner'))!;
      expect(result.state).toBe('completed');
      expect(result.recoveryCount).toBe(1);
      expect(result.report?.reportMarkdown).toBe(ANSWER);
      expect(deepResearchWorkerAgent.generate).toHaveBeenCalledTimes(2);
      expect(deepResearchReportAgent.generate).toHaveBeenCalledTimes(1);
      expect(deepResearchPlannerAgent.generate).toHaveBeenCalledTimes(2);
      expect(result.recoveryProgress.completedQuestions).toBe(2);
      await database.deleteUserData('owner');
      for (const table of ['research_checkpoints', 'research_budgets', 'mastra_workflow_snapshot']) {
        expect((await database.client.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n).toBe(0);
      }
    },
  );
  it('verifies checkpointed supplementary evidence and reports real URL provenance', async () => {
    const snippet = 'This recent guidance provides supplementary context for the program.';
    const text = `${snippet} [Guidance](https://example.gov/recent). [Portal](https://medicaid.ncdhhs.gov)`;
    vi.mocked(deepResearchWorkerAgent.generate).mockResolvedValue({ text, toolResults: [{
      toolName: 'webSearch', result: { results: [{ title: 'Recent guidance', url: 'https://example.gov/recent', snippet }] },
    }] } as any);
    vi.mocked(deepResearchReportAgent.generate).mockResolvedValue({ text } as any);
    await finishPlanning();
    await service.decide('run', 'owner', { approved: true }, mastra);
    await vi.waitFor(async () => expect((await repository.get('run', 'owner'))?.state).toBe('completed'));
    const result = (await repository.get('run', 'owner'))!;
    expect(result.report?.reportMarkdown).toBe(text);
    expect(result.report?.citationProvenance).toEqual({ checkedCitations: 2, retrievedCitations: 1, allowedCitations: 1, unknownCitations: 0 });
    expect(result.report?.webSources).toEqual([{ title: 'Recent guidance', url: 'https://example.gov/recent' }]);
    expect(verifyAnswer).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(verifyAnswer).mock.calls) {
      expect(call[2]).toContain(snippet);
      expect(call[2]).toContain('"evidenceRole":"supplementary"');
      expect(call[5]).toMatchObject({ hasSupplementaryEvidence: true });
    }
  });
  it('withholds web citations with no saved supporting excerpt', async () => {
    vi.mocked(deepResearchWorkerAgent.generate).mockResolvedValue({ text: 'A claim. [Web](https://example.gov/recent)', toolResults: [{
      toolName: 'webSearch', result: { results: [{ title: 'Recent guidance', url: 'https://example.gov/recent' }] },
    }] } as any);
    await finishPlanning();
    await service.decide('run', 'owner', { approved: true }, mastra);
    await vi.waitFor(async () => expect((await repository.get('run', 'owner'))?.state).toBe('failed'));
    expect((await repository.get('run', 'owner'))?.report).toBeNull();
    expect(deepResearchReportAgent.generate).not.toHaveBeenCalled();
  });
  it('recovers after durable edited approval before provider work begins', async () => {
    await finishPlanning();
    const original = mastra.getWorkflow('deepResearchWorkflow').createRun.bind(mastra.getWorkflow('deepResearchWorkflow'));
    const spy = vi.spyOn(mastra.getWorkflow('deepResearchWorkflow'), 'createRun').mockImplementationOnce(async (...args) => {
      const run = await original(...args);
      vi.spyOn(run, 'resume').mockRejectedValueOnce(new Error('ECONNRESET'));
      return run;
    });
    await service.decide('run', 'owner', { approved: true, editedSubQuestions: [question('Edited scope?')] }, mastra);
    await vi.waitFor(async () => expect((await repository.getInternal('run'))?.state).toBe('recovering'));
    spy.mockRestore();
    await recover();
    expect((await repository.get('run', 'owner'))?.report?.subQuestions[0].question).toBe('Edited scope?');
    expect((await repository.get('run', 'owner'))?.plan?.subQuestions[0].question).toBe('Edited scope?');
    expect(deepResearchWorkerAgent.generate).toHaveBeenCalledTimes(1);
  });
  it.each(['matching', 'missing', 'mismatched'])(
    'recovers checkpointed planning only with a matching live Jev marker: %s', async marker => {
      vi.stubEnv('JEV_SECTION_ROLES_ENABLED', 'true');
      vi.stubEnv('JEV_SECTION_ROLE_ALLOWLIST', '');
      const digest = 'a'.repeat(64);
      let liveDigest: string | null = digest;
      graph.run.mockImplementation(async () => ({ records: [{ get: (key: string) => ({
        releaseId: 'release-1', annotationDigest: digest, liveAnnotationDigest: liveDigest,
      })[key] }] }));
      service.dispose();
      service = new ResearchService(repository);
      const save = repository.saveCheckpoint.bind(repository);
      let interrupted = false;
      vi.spyOn(repository, 'saveCheckpoint').mockImplementation(async (...args) => {
        await save(...args);
        if (args[2] === 'plan' && !interrupted) {
          interrupted = true;
          throw new Error('ECONNRESET after saving plan');
        }
      });
      await service.plan('run', mastra);
      expect((await repository.getInternal('run'))?.state).toBe('recovering');
      expect(await repository.checkpoint('run', 'plan')).toMatchObject(PLAN);
      liveDigest = marker === 'missing' ? null : marker === 'mismatched' ? 'b'.repeat(64) : digest;
      await recover();
      const result = (await repository.get('run', 'owner'))!;
      expect(result.state).toBe(marker === 'matching' ? 'awaiting_approval' : 'failed');
      if (marker !== 'matching') expect(result.error).toContain('Corpus release changed');
      expect(deepResearchPlannerAgent.generate).toHaveBeenCalledTimes(1);
      expect(deepResearchWorkerAgent.generate).not.toHaveBeenCalled();
      expect(deepResearchReportAgent.generate).not.toHaveBeenCalled();
      expect(result.report).toBeNull();
      expect(graph.run).toHaveBeenCalledWith(expect.stringContaining('m.digest AS liveAnnotationDigest'));
    },
  );
  it('will not recover against a different corpus release', async () => {
    await finishPlanning();
    release = 'release-2';
    await service.decide('run', 'owner', { approved: true }, mastra);
    await vi.waitFor(async () => expect((await repository.getInternal('run'))?.state).toBe('failed'));
    expect(deepResearchWorkerAgent.generate).not.toHaveBeenCalled();
  });
  it.each([false, true])('retries verification from the saved draft; exhaustion=%s', async exhaust => {
    await finishPlanning();
    let reportChecks = 0;
    vi.mocked(verifyAnswer).mockImplementation(async question => {
      if (question === 'Coverage?' && (++reportChecks < 3 || exhaust)) return {
        ...CLEAN, supported: false, failureRetryable: true,
        unsupportedClaims: [{ claim: 'Full answer', reason: 'Verification service unavailable' }],
      };
      return CLEAN;
    });
    await service.decide('run', 'owner', { approved: true }, mastra);
    await vi.waitFor(async () => expect((await repository.get('run', 'owner'))?.state).toBe('recovering'));
    for (let attempt = 1; attempt <= 2; attempt++) {
      const prior = (await repository.get('run', 'owner'))!;
      expect(prior.report).toBeNull();
      expect(prior.verification?.status).toBe('withheld');
      expect(prior.sources.length).toBeGreaterThan(0);
      await recover();
    }
    const result = (await repository.get('run', 'owner'))!;
    expect(result.recoveryCount).toBe(2);
    expect(result.state).toBe(exhaust ? 'failed' : 'completed');
    expect(result.report?.reportMarkdown ?? null).toBe(exhaust ? null : ANSWER);
    expect(deepResearchWorkerAgent.generate).toHaveBeenCalledTimes(2);
    expect(deepResearchReportAgent.generate).toHaveBeenCalledTimes(1);
    expect(reportChecks).toBe(3);
  });
});
