import { AsyncLocalStorage } from 'node:async_hooks';
import type { UsageRepository, UsageEvent } from '../usage/repository.js';
import type { ResearchRepository } from './repository.js';

interface UsageContext {
  repository: UsageRepository;
  userId: string;
  runId: string;
  stateRepository?: ResearchRepository;
  leaseOwner?: string;
}

export async function markResearchVerifying(): Promise<void> {
  const context = storage.getStore();
  if (!context?.stateRepository || !context.leaseOwner) return;
  await context.stateRepository.markVerifying(context.runId, context.leaseOwner);
}

const storage = new AsyncLocalStorage<UsageContext>();

export function withResearchUsageContext<T>(
  context: UsageContext,
  work: () => Promise<T>,
): Promise<T> {
  return storage.run(context, work);
}

export function recordResearchUsage(
  phase: NonNullable<UsageEvent['phase']>,
  modelId: string,
  result?: { usage?: unknown; totalUsage?: unknown },
): void {
  const context = storage.getStore();
  if (!context) return;
  const usage = (result?.totalUsage ?? result?.usage ?? {}) as {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
  };
  void context.repository.record({
    userId: context.userId,
    route: 'deep-research',
    phase,
    runId: context.runId,
    modelId,
    provider: modelId.startsWith('claude-') ? 'anthropic' : 'openai',
    ...usage,
  });
}
