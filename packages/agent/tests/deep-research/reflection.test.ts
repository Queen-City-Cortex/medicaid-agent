import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deepResearchWorkflow } from '../../src/deep-research/workflow.js';
import { deepResearchPlannerAgent, deepResearchWorkerAgent, deepResearchReportAgent } from '../../src/deep-research/agents.js';
import { verifyAnswer } from '../../src/processors/verifier/verify.js';
import { log } from '../../src/logger.js';

// The planner is the real Agent, guards included, over a mock model. Only the
// worker and report agents are replaced.
const planner = vi.hoisted(() => ({ doGenerate: vi.fn() }));
vi.mock('../../src/neo4j.js', () => ({ withSession: vi.fn() }));
vi.mock('../../src/model.js', async original => {
  const { MockLanguageModelV3 } = await import('ai/test');
  return {
    ...await original<typeof import('../../src/model.js')>(),
    createModel: () => new MockLanguageModelV3({ doGenerate: planner.doGenerate }),
  };
});
vi.mock('../../src/deep-research/agents.js', async original => ({
  ...await original<typeof import('../../src/deep-research/agents.js')>(),
  deepResearchWorkerAgent: { generate: vi.fn() }, deepResearchReportAgent: { generate: vi.fn() },
}));
vi.mock('../../src/processors/verifier/verify.js', async original => ({
  ...await original<typeof import('../../src/processors/verifier/verify.js')>(), verifyAnswer: vi.fn(),
}));

const question = (q: string) => ({ question: q, rationale: 'Read governing evidence', channels: ['vector' as const], useWeb: false });
const PLAN = { brief: 'Find coverage', subQuestions: [question('Scope?'), question('Eligibility?')] };
const CLEAN = { supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };
const ANSWER = 'The service is covered. [Policy](https://example.gov/policy)';
// Two findings of this size put the reflection prompt well over the chat cap.
const LONG_FINDING = `${ANSWER} ${'The policy describes the covered service in detail. '.repeat(120)}`;

function modelText(text: string) {
  return { content: [{ type: 'text' as const, text }], finishReason: { unified: 'stop' as const, raw: 'stop' }, warnings: [],
    usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } } };
}

describe('reflection through the real planner agent', () => {
  let directory: string;
  let storage: LibSQLStore;
  let mastra: Mastra;
  beforeEach(async () => {
    vi.clearAllMocks();
    directory = await mkdtemp(join(tmpdir(), 'research-reflection-'));
    storage = new LibSQLStore({ id: 'test', url: `file:${directory}/test.db` });
    await storage.init();
    mastra = new Mastra({ workflows: { deepResearchWorkflow }, storage });
    // Planning is not under test: answer the plan call directly so the scope
    // gate and injection detector never run. Reflection reaches the real agent.
    const generate = deepResearchPlannerAgent.generate.bind(deepResearchPlannerAgent);
    vi.spyOn(deepResearchPlannerAgent, 'generate').mockImplementation(((prompt: unknown, options?: any) =>
      String(prompt).startsWith('Plan ') ? Promise.resolve({ object: PLAN }) : generate(prompt as string, options)) as any);
    vi.mocked(deepResearchWorkerAgent.generate).mockResolvedValue({ text: LONG_FINDING, toolResults: [{ toolName: 'getSection', result: { section: {
      id: 'section', title: 'Coverage', sectionNumber: '1', content: 'The service is covered.',
      citationLink: 'https://example.gov/policy', documentId: 'policy', policyNumber: 'P',
    } } }] } as any);
    vi.mocked(deepResearchReportAgent.generate).mockResolvedValue({ text: ANSWER } as any);
    vi.mocked(verifyAnswer).mockResolvedValue(CLEAN);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await storage.close();
    await rm(directory, { recursive: true, force: true });
  });
  async function research() {
    const run = await mastra.getWorkflow('deepResearchWorkflow').createRun();
    expect((await run.start({ inputData: { question: 'Coverage?' } })).status).toBe('suspended');
    const result = await run.resume({ step: 'plan-approval', resumeData: { approved: true } });
    if (result.status !== 'success') throw new Error(`Research ended with status ${result.status}`);
    return result.result;
  }
  function reflectionPrompts(): string[] {
    return vi.mocked(deepResearchPlannerAgent.generate).mock.calls.map(call => String(call[0])).filter(prompt => !prompt.startsWith('Plan '));
  }

  it('sends a findings prompt over 10,000 characters to the model and completes', async () => {
    planner.doGenerate.mockImplementation(async () => modelText(JSON.stringify({ sufficient: true, gaps: '', followUps: [] })));
    const warn = vi.spyOn(log, 'warn');
    const report = await research();
    expect(reflectionPrompts()).toHaveLength(1);
    expect(reflectionPrompts()[0].length).toBeGreaterThan(10_000);
    expect(planner.doGenerate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(planner.doGenerate.mock.calls[0][0].prompt)).toContain('Findings so far');
    expect(warn).not.toHaveBeenCalledWith('deep_research.reflection_skipped', expect.anything());
    expect(report.status).toBe('completed');
    expect(report.reportMarkdown).toBe(ANSWER);
  });
  it('skips reflection and still completes when the model returns no reflection object', async () => {
    planner.doGenerate.mockImplementation(async () => modelText('I could not produce a structured reflection.'));
    const warn = vi.spyOn(log, 'warn');
    const report = await research();
    expect(planner.doGenerate).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('deep_research.reflection_skipped', expect.objectContaining({ reason: 'invalid_reflection', round: 0 }));
    expect(report.status).toBe('completed');
    expect(report.stats.reflectionRounds).toBe(0);
    expect(report.stats.subQuestionCount).toBe(2);
    expect(deepResearchWorkerAgent.generate).toHaveBeenCalledTimes(2);
  });
  it('skips reflection and still completes when an input processor trips', async () => {
    vi.mocked(deepResearchPlannerAgent.generate).mockImplementation((async (prompt: unknown) => String(prompt).startsWith('Plan ')
      ? { object: PLAN }
      : { object: undefined, tripwire: { reason: 'blocked', processorId: 'scope-gate' } }) as any);
    const warn = vi.spyOn(log, 'warn');
    const report = await research();
    expect(warn).toHaveBeenCalledWith('deep_research.reflection_skipped', expect.objectContaining({ reason: 'tripwire', processorId: 'scope-gate' }));
    expect(report.status).toBe('completed');
    expect(report.stats.reflectionRounds).toBe(0);
  });
});
