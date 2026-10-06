import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { APICallError } from 'ai';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AppDatabase } from '../../src/storage/app-database.js';
import { ResearchRepository } from '../../src/deep-research/repository.js';
import { ResearchService } from '../../src/deep-research/service.js';
import { deepResearchWorkflow } from '../../src/deep-research/workflow.js';
import { deepResearchPlannerAgent, deepResearchWorkerAgent, deepResearchReportAgent } from '../../src/deep-research/agents.js';
import { verifyAnswer } from '../../src/processors/verifier/verify.js';

// The report writer is the real Agent over a mock model, so Mastra's own retry
// of the provider call runs. The planner and worker are replaced.
const writer = vi.hoisted(() => ({ doGenerate: vi.fn() }));
vi.mock('../../src/neo4j.js', () => ({ withSession: vi.fn() }));
vi.mock('../../src/model.js', async original => {
  const { MockLanguageModelV3 } = await import('ai/test');
  return {
    ...await original<typeof import('../../src/model.js')>(),
    createModel: () => new MockLanguageModelV3({ doGenerate: writer.doGenerate }),
  };
});
vi.mock('../../src/deep-research/agents.js', async original => ({
  ...await original<typeof import('../../src/deep-research/agents.js')>(),
  deepResearchPlannerAgent: { generate: vi.fn() }, deepResearchWorkerAgent: { generate: vi.fn() },
}));
vi.mock('../../src/processors/verifier/verify.js', async original => ({
  ...await original<typeof import('../../src/processors/verifier/verify.js')>(), verifyAnswer: vi.fn(),
}));

const question = (q: string) => ({ question: q, rationale: 'Read governing evidence', channels: ['vector' as const], useWeb: false });
const PLAN = { brief: 'Find coverage', subQuestions: [question('Scope?'), question('Eligibility?')] };
const CLEAN = { supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };
const ANSWER = 'The service is covered. [Policy](https://example.gov/policy)';
const MODEL_TEXT = { content: [{ type: 'text' as const, text: ANSWER }], finishReason: { unified: 'stop' as const, raw: 'stop' }, warnings: [],
  usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } } };
const providerError = (statusCode: number, message: string) => new APICallError({
  message, statusCode, url: 'https://provider.invalid/v1/responses', requestBodyValues: {}, isRetryable: statusCode === 429 || statusCode >= 500,
});

describe('transient model errors in a research run', () => {
  let directory: string;
  let database: AppDatabase;
  let repository: ResearchRepository;
  let storage: LibSQLStore;
  let service: ResearchService;
  let mastra: Mastra;
  beforeEach(async () => {
    vi.clearAllMocks();
    directory = await mkdtemp(join(tmpdir(), 'research-retries-'));
    const url = `file:${directory}/test.db`;
    database = new AppDatabase(url);
    repository = new ResearchRepository(database);
    storage = new LibSQLStore({ id: 'test', url });
    await storage.init();
    service = new ResearchService(repository, 2, undefined, async () => 'release-1');
    mastra = new Mastra({ workflows: { deepResearchWorkflow }, storage });
    vi.mocked(deepResearchPlannerAgent.generate).mockImplementation(async (prompt: unknown, options?: any) => {
      await options?.prepareStep?.({});
      return { object: String(prompt).startsWith('Plan ') ? PLAN : { sufficient: true, gaps: '', followUps: [] } } as any;
    });
    vi.mocked(deepResearchWorkerAgent.generate).mockImplementation(async (_prompt: unknown, options?: any) => {
      await options?.prepareStep?.({});
      return { text: ANSWER, toolResults: [{ toolName: 'getSection', result: { section: {
        id: 'section', title: 'Coverage', sectionNumber: '1', content: 'The service is covered.',
        citationLink: 'https://example.gov/policy', documentId: 'policy', policyNumber: 'P',
      } } }] } as any;
    });
    vi.mocked(verifyAnswer).mockResolvedValue(CLEAN);
    await repository.create('run', 'owner', 'Coverage?');
  });
  afterEach(async () => {
    service.dispose();
    database.close();
    await storage.close();
    await rm(directory, { recursive: true, force: true });
  });
  /** Plans, approves and waits until the run stops researching. */
  async function research() {
    await service.plan('run', mastra);
    await service.decide('run', 'owner', { approved: true }, mastra);
    await vi.waitFor(async () => expect(['completed', 'failed', 'recovering']).toContain((await repository.get('run', 'owner'))?.state),
      { timeout: 15_000, interval: 50 });
    return (await repository.get('run', 'owner'))!;
  }
  async function synthesisStepsUsed() {
    return (await database.client.execute("SELECT used FROM research_budgets WHERE run_id = 'run' AND key = 'synthesis'")).rows[0]?.used;
  }

  it('retries a rate-limited model call without a recovery claim or a second step charge', async () => {
    writer.doGenerate.mockRejectedValueOnce(providerError(429, 'Rate limit reached')).mockResolvedValue(MODEL_TEXT);
    const result = await research();
    expect(result.state).toBe('completed');
    expect(result.recoveryCount).toBe(0);
    expect(result.report?.reportMarkdown).toBe(ANSWER);
    expect(writer.doGenerate).toHaveBeenCalledTimes(2);
    expect(deepResearchReportAgent.maxRetries).toBe(2);
    expect(await synthesisStepsUsed()).toBe(1);
  }, 20_000);

  it('stops after two retries and hands a persistent rate limit to run recovery', async () => {
    writer.doGenerate.mockRejectedValue(providerError(429, 'Rate limit reached'));
    const result = await research();
    expect(writer.doGenerate).toHaveBeenCalledTimes(3);
    // Scheduled, not yet claimed: the two-claim allowance is untouched.
    expect(result.state).toBe('recovering');
    expect(result.recoveryCount).toBe(0);
    expect(result.report).toBeNull();
    expect(await synthesisStepsUsed()).toBe(1);
  }, 20_000);

  it('does not retry a non-retryable model error, which stays terminal', async () => {
    writer.doGenerate.mockRejectedValue(providerError(401, 'Invalid API key'));
    const result = await research();
    expect(writer.doGenerate).toHaveBeenCalledTimes(1);
    expect(result.state).toBe('failed');
    expect(result.recoveryCount).toBe(0);
    expect(result.report).toBeNull();
  }, 20_000);
});
