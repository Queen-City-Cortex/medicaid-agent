import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import type { ResearchDecisionInput, VerificationOutcome } from '@nc-medicaid/contracts';
import type { ResearchRepository } from './repository.js';
import { MAX_SUB_QUESTIONS, MAX_REFLECTION_ROUNDS, WORKER_MAX_STEPS, PLANNER_MAX_STEPS, RESEARCH_CONCURRENCY, NOVELTY_MIN_NEW_IDS } from './config.js';
import { log } from '../logger.js';

export const DEFAULT_RESEARCH_LIMITS = {
  maxSubQuestions: MAX_SUB_QUESTIONS, maxReflectionRounds: MAX_REFLECTION_ROUNDS,
  workerMaxSteps: WORKER_MAX_STEPS, plannerMaxSteps: PLANNER_MAX_STEPS,
  researchConcurrency: RESEARCH_CONCURRENCY, noveltyMinNewIds: NOVELTY_MIN_NEW_IDS,
};
interface CheckpointContext {
  repository: ResearchRepository;
  runId: string;
  owner: string;
  approval: ResearchDecisionInput | null;
  limits: typeof DEFAULT_RESEARCH_LIMITS;
  assertCorpus: () => Promise<void>;
}
const storage = new AsyncLocalStorage<CheckpointContext>();
export function withResearchCheckpoints<T>(context: CheckpointContext, work: () => Promise<T>): Promise<T> {
  return storage.run(context, work);
}
export function researchLimits(): typeof DEFAULT_RESEARCH_LIMITS {
  return storage.getStore()?.limits ?? DEFAULT_RESEARCH_LIMITS;
}
export function researchApproval(): ResearchDecisionInput | null {
  return storage.getStore()?.approval ?? null;
}
export function questionKey(question: unknown): string {
  return createHash('sha256').update(JSON.stringify(question)).digest('hex').slice(0, 24);
}
export async function checkpointed<T>(key: string, work: () => Promise<T>, cache: (value: T) => boolean = () => true): Promise<T> {
  const context = storage.getStore();
  if (!context) return work();
  const { repository, runId, owner } = context;
  const prior = await repository.checkpoint<T>(runId, key);
  if (prior !== undefined) {
    log.info('deep_research.checkpoint_reused', { runId, key });
    return prior;
  }
  await context.assertCorpus();
  const value = await work();
  await context.assertCorpus();
  if (cache(value)) await repository.saveCheckpoint(runId, owner, key, value);
  return value;
}
/** Charge before dispatch: an ambiguous crash never restores consumed budget. */
export async function reserveResearchStep(key: string, limit: number): Promise<void> {
  const context = storage.getStore();
  if (context) await context.repository.reserveStep(context.runId, context.owner, key, limit);
}
/** Public progress only: the repository's run query reads this key so the polled run counts follow-ups in flight. */
export async function publishResearchFollowUps(followUps: unknown[]): Promise<void> {
  const context = storage.getStore();
  if (context) await context.repository.saveCheckpoint(context.runId, context.owner, 'follow-ups', followUps);
}
export async function publishResearchVerification(outcome: VerificationOutcome, sources: unknown): Promise<void> {
  const context = storage.getStore();
  if (context) {
    await context.assertCorpus();
    await context.repository.saveVerification(context.runId, context.owner, outcome, sources);
  }
}
