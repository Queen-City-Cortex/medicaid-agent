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
import { ANSWER_SCOPE_POLICY } from '@nc-medicaid/policy-corpus';

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
    // The report-level entry says which web sources the finding cited and that they stay supplementary.
    const reportEvidence = vi.mocked(verifyAnswer).mock.calls[2][2];
    expect(reportEvidence).toContain('[researchFinding]');
    expect(reportEvidence).toContain('Supplementary sources cited by this finding: https://example.gov/recent\nThose are web excerpts with evidenceRole="supplementary". Statements this finding attributes to them remain supplementary evidence: they can support explicitly labeled background context only and cannot independently support any governing policy claim. The answer may not strengthen them into NC Medicaid policy.\nSub-question: Scope?');
    expect(reportEvidence).not.toContain('cites retrieved corpus documents only');
    for (const call of vi.mocked(verifyAnswer).mock.calls) {
      expect(call[2]).toContain(snippet);
      expect(call[2]).toContain('"evidenceRole":"supplementary"');
      expect(call[5]).toMatchObject({ hasSupplementaryEvidence: true });
    }
  });
  it.each([true, false])('checks the report against verified findings but coverage against raw sources; table retrieved=%s', async retrieved => {
    const table = ANSWER_SCOPE_POLICY.magi_tables[1].source_url;
    const url = retrieved ? table : 'https://example.gov/policy';
    const body = 'Effective: APRIL 1, 2026\nRAW-TABLE-BODY 133% MXP-N 1769';
    const finding = `The listed amount is $1,769. [Table](${url})`;
    vi.mocked(deepResearchWorkerAgent.generate).mockImplementation(async (_prompt: unknown, options?: any) => {
      await options?.prepareStep?.({});
      return { text: finding, toolResults: [{ toolName: 'getSection', result: { section: {
        id: 'table', title: 'MAGI table', sectionNumber: '1', content: body, url, documentId: 'ma-3321', policyNumber: 'MA-3321',
      } } }] } as any;
    });
    vi.mocked(deepResearchReportAgent.generate).mockImplementation(async (_prompt: unknown, options?: any) => {
      await options?.prepareStep?.({});
      return { text: `Report: ${finding}` } as any;
    });
    await repository.create('magi', 'other', 'What MAGI income limits apply in October 2026?');
    await service.plan('magi', mastra);
    await service.decide('magi', 'other', { approved: true }, mastra);
    await vi.waitFor(async () => expect(['completed', 'failed']).toContain((await repository.get('magi', 'other'))?.state));
    const result = (await repository.get('magi', 'other'))!;
    const calls = vi.mocked(verifyAnswer).mock.calls;
    // Each worker draft is checked against the section body it read.
    for (const call of calls.slice(0, 2)) expect(call[2]).toContain('RAW-TABLE-BODY');
    if (!retrieved) {
      // coverageEvidenceIssue reads the raw sources: no dated table, no report, no model call.
      expect(result.state).toBe('failed');
      expect(result.report).toBeNull();
      expect(result.verification).toMatchObject({ status: 'withheld', reason: 'unsupported', passCount: 0 });
      expect(calls).toHaveLength(2);
      return;
    }
    expect(result.state).toBe('completed');
    expect(calls).toHaveLength(3);
    expect(calls[2][1]).toBe(`Report: ${finding}`);
    expect(calls[2][2]).toContain(`Sub-question: Scope?\n\nVerified finding:\n${finding}`);
    expect(calls[2][2]).toContain('Sub-question: Eligibility?');
    expect(calls[2][2]).toContain("A research worker's summary of one sub-question, verified against the sources that worker retrieved. It is a summary, not a corpus document.\nSupplementary sources cited by this finding: none. It cites retrieved corpus documents only.\nSub-question: Scope?");
    expect(calls[2][2]).not.toContain('evidenceRole');
    expect(calls[2][2]).not.toContain('RAW-TABLE-BODY');
    // The dated-table requirement and URL provenance still come from the raw sources.
    expect(calls[2][5]).toMatchObject({ unknownUrls: [], coverageRequirements: [expect.stringContaining('2026-04-01')] });
    expect(result.report?.citationProvenance).toMatchObject({ checkedCitations: 1, retrievedCitations: 1, unknownCitations: 0 });
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
  it('recovers after a durable pruned approval before provider work begins', async () => {
    await finishPlanning();
    const original = mastra.getWorkflow('deepResearchWorkflow').createRun.bind(mastra.getWorkflow('deepResearchWorkflow'));
    const spy = vi.spyOn(mastra.getWorkflow('deepResearchWorkflow'), 'createRun').mockImplementationOnce(async (...args) => {
      const run = await original(...args);
      vi.spyOn(run, 'resume').mockRejectedValueOnce(new Error('ECONNRESET'));
      return run;
    });
    await service.decide('run', 'owner', { approved: true, keptSubQuestions: [1] }, mastra);
    await vi.waitFor(async () => expect((await repository.getInternal('run'))?.state).toBe('recovering'));
    spy.mockRestore();
    await recover();
    expect((await repository.get('run', 'owner'))?.report?.subQuestions.map(sq => sq.question)).toEqual(['Eligibility?']);
    expect((await repository.get('run', 'owner'))?.plan?.subQuestions.map(sq => sq.question)).toEqual(['Eligibility?']);
    expect(deepResearchWorkerAgent.generate).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(deepResearchWorkerAgent.generate).mock.calls[0][0])).toContain('Eligibility?');
  });
  it('does not reflect back to sub-questions the user removed at approval', async () => {
    const proposed = [question('Scope?'), question('Eligibility?'), question('Prior authorization?'), question('Appeals?')];
    const removed = proposed.slice(2);
    vi.mocked(deepResearchPlannerAgent.generate).mockImplementation(async (_prompt: unknown, options?: any) => {
      await options?.prepareStep?.({});
      return { object: String(_prompt).startsWith('Plan ')
        ? { brief: 'Find coverage', subQuestions: proposed }
        : { sufficient: false, gaps: 'Removed topics are uncovered', followUps: removed } } as any;
    });
    await finishPlanning();
    await service.decide('run', 'owner', { approved: true, keptSubQuestions: [0, 1] }, mastra);
    await vi.waitFor(async () => expect((await repository.get('run', 'owner'))?.state).toBe('completed'));
    const result = (await repository.get('run', 'owner'))!;
    const researched = vi.mocked(deepResearchWorkerAgent.generate).mock.calls.map(call => String(call[0]));
    expect(researched).toHaveLength(2);
    for (const sq of removed) expect(researched.join('\n')).not.toContain(sq.question);
    expect(deepResearchPlannerAgent.generate).toHaveBeenCalledTimes(1);
    expect(result.report?.subQuestions.map(sq => sq.question)).toEqual(['Scope?', 'Eligibility?']);
    expect(result.report?.stats).toMatchObject({ subQuestionCount: 2, reflectionRounds: 0 });
  });
  it('researches reflection follow-ups when the full plan was approved', async () => {
    const followUp = question('Appeals?');
    let reflections = 0;
    vi.mocked(deepResearchPlannerAgent.generate).mockImplementation(async (_prompt: unknown, options?: any) => {
      await options?.prepareStep?.({});
      if (String(_prompt).startsWith('Plan ')) return { object: PLAN } as any;
      return { object: ++reflections === 1 ? { sufficient: false, gaps: 'Appeals', followUps: [followUp] } : { sufficient: true, gaps: '', followUps: [] } } as any;
    });
    // Hold the follow-up worker open so the run can be read back mid-flight.
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const worker = vi.mocked(deepResearchWorkerAgent.generate).getMockImplementation() as any;
    vi.mocked(deepResearchWorkerAgent.generate).mockImplementation((async (prompt: unknown, options?: any) => {
      if (String(prompt).includes('Appeals?')) await held;
      return worker(prompt, options);
    }) as any);
    await finishPlanning();
    expect((await repository.get('run', 'owner'))?.plan?.subQuestions).toHaveLength(2);
    await service.decide('run', 'owner', { approved: true }, mastra);
    await vi.waitFor(() => expect(deepResearchWorkerAgent.generate).toHaveBeenCalledTimes(3));
    const inFlight = (await repository.get('run', 'owner'))!;
    expect(inFlight.state).toBe('researching');
    expect(inFlight.plan?.subQuestions.map(sq => sq.question)).toEqual(['Scope?', 'Eligibility?', 'Appeals?']);
    expect((await repository.getInternal('run'))?.approval?.editedSubQuestions).toEqual(PLAN.subQuestions);
    release();
    await vi.waitFor(async () => expect((await repository.get('run', 'owner'))?.state).toBe('completed'));
    const result = (await repository.get('run', 'owner'))!;
    expect(deepResearchWorkerAgent.generate).toHaveBeenCalledTimes(3);
    expect(result.report?.subQuestions.map(sq => sq.question)).toEqual(['Scope?', 'Eligibility?', 'Appeals?']);
    expect(result.report?.stats.subQuestionCount).toBe(3);
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
