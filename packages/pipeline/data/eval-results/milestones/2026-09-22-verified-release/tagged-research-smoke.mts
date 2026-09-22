// Standalone live smoke: provide VALIDATION_WORKTREE, an empty VALIDATION_DIRECTORY,
// read-only corpus connection credentials, and provider keys. Use a temporary SQLite DB.
// Run with DEEP_RESEARCH_MAX_SUB_QUESTIONS=1 and DEEP_RESEARCH_MAX_REFLECTION_ROUNDS=0.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const wt = process.env.VALIDATION_WORKTREE!;
await import(`${wt}/packages/agent/src/load-env.ts`);
if (process.env.EVAL_OPENAI_API_KEY) process.env.OPENAI_API_KEY = process.env.EVAL_OPENAI_API_KEY;
const { Mastra } = await import(`${wt}/node_modules/@mastra/core/dist/index.js`);
const { LibSQLStore } = await import(`${wt}/node_modules/@mastra/libsql/dist/index.js`);
const { AppDatabase } = await import(`${wt}/packages/agent/src/storage/app-database.ts`);
const { ResearchRepository } = await import(`${wt}/packages/agent/src/deep-research/repository.ts`);
const { UsageRepository } = await import(`${wt}/packages/agent/src/usage/repository.ts`);
const { ResearchService } = await import(`${wt}/packages/agent/src/deep-research/service.ts`);
const { deepResearchWorkflow } = await import(`${wt}/packages/agent/src/deep-research/workflow.ts`);
const agents = await import(`${wt}/packages/agent/src/deep-research/agents.ts`);
const { closeDriver } = await import(`${wt}/packages/agent/src/neo4j.ts`);
const directory = process.env.VALIDATION_DIRECTORY!;
const url = `file:${directory}/mastra.db`;
const database = new AppDatabase(url);
const repository = new ResearchRepository(database);
const storage = new LibSQLStore({ id: 'tagged-live-validation', url });
await storage.init();
const service = new ResearchService(repository, 2, new UsageRepository(database));
const mastra = new Mastra({ workflows: { deepResearchWorkflow }, storage });
const calls: Record<string, number> = {};
for (const name of ['deepResearchPlannerAgent', 'deepResearchWorkerAgent', 'deepResearchReportAgent']) {
  const agent = agents[name];
  const generate = agent.generate.bind(agent);
  agent.generate = (...args: any[]) => { calls[name] = (calls[name] ?? 0) + 1; return generate(...args); };
}
const interruptions: string[] = [];
const saved: string[] = [];
const originalSave = repository.saveCheckpoint.bind(repository);
repository.saveCheckpoint = async (...args: any[]) => {
  await originalSave(...args);
  const key = args[2]; saved.push(key);
  if ((/^worker:[^:]+$/.test(key) && interruptions.length === 0)
      || (key === 'report:verification:1' && interruptions.length === 1)) {
    interruptions.push(key);
    console.log('INJECTED_INTERRUPTION', key);
    throw new Error('ECONNRESET: injected immediately after durable checkpoint');
  }
};
const runId = `tagged-validation-${crypto.randomUUID()}`;
const owner = 'local-validation-only';
const question = 'Does Policy 1-H authorize routine general-wellness telehealth visits without a specific clinical indication?';
const approved = [{ question, rationale: 'Determine the policy scope and clinical-indication requirement from the governing text.', channels: ['vector', 'keyword'], useWeb: false }];
const states: unknown[] = [];
const executions = new Set();
let approval: unknown;
let initialLimits: unknown;
try {
  await repository.create(runId, owner, question);
  await service.plan(runId, mastra);
  const waiting = await repository.getInternal(runId);
  assert.equal(waiting?.state, 'awaiting_approval');
  assert.equal(waiting?.approval, null);
  assert.equal(waiting?.report, null);
  initialLimits = waiting?.limits;
  assert.equal(await service.decide(runId, owner, { approved: true, editedSubQuestions: approved }, mastra), 'accepted');
  approval = (await repository.getInternal(runId))?.approval;
  const end = Date.now() + 12 * 60_000;
  let previous = '';
  while (Date.now() < end) {
    const current = (await repository.getInternal(runId))!;
    if (current.workflowRunId) executions.add(current.workflowRunId);
    if (current.state !== 'completed') assert.equal(current.report, null);
    assert.deepEqual(current.approval, approval);
    assert.deepEqual(current.limits, initialLimits);
    const state = `${current.state}:${current.recoveryCount}:${current.recoveryProgress.completedQuestions}`;
    if (state !== previous) {
      const event = { at: new Date().toISOString(), state: current.state, recoveryCount: current.recoveryCount, progress: current.recoveryProgress, nextRetryAt: current.nextRetryAt, verification: current.verification };
      states.push(event); console.log('LIVE_RESEARCH_STATE', JSON.stringify(event)); previous = state;
    }
    if (['completed', 'failed', 'cancelled'].includes(current.state)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const final = (await repository.getInternal(runId))!;
  const budgets = (await database.client.execute('SELECT key, used, limit_value FROM research_budgets')).rows;
  const usage = (await database.client.execute('SELECT phase, model_id, count(*) AS calls, sum(total_tokens) AS tokens FROM usage_events GROUP BY phase, model_id')).rows;
  const summary = { observedAt: new Date().toISOString(), candidateCommit: '5f7ab7b', corpusRelease: final.corpusRelease, runId, question, finalState: final.state, error: final.error, verification: final.verification, reportReleased: !!final.report, reportCharacters: final.report?.reportMarkdown.length ?? 0, approval, limits: final.limits, recoveryCount: final.recoveryCount, executionCount: executions.size, interruptions, agentGenerateCalls: calls, checkpointWrites: saved, budgets, usage, states };
  await writeFile(`${directory}/summary.json`, JSON.stringify(summary, null, 2) + '\n');
  assert.equal(final.state, 'completed');
  assert.equal(final.corpusRelease, process.env.CORPUS_RELEASE_ID);
  assert.equal(final.recoveryCount, 2);
  assert.equal(executions.size, 3);
  assert.equal(calls.deepResearchWorkerAgent, 1);
  assert.equal(calls.deepResearchReportAgent, 1);
  assert.equal(saved.filter(key => /^worker:[^:]+$/.test(key)).length, 1);
  assert.ok(final.report && final.verification?.status !== 'withheld');
  console.log('TAGGED_RESEARCH_RECOVERY_PASS');
} finally {
  service.dispose();
  database.close(); await storage.close(); await closeDriver();
}

// Mastra/provider clients may retain idle handles after the standalone assertions.
process.exit(0);
