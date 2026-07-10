import { describe, it, expect, vi, afterEach } from 'vitest';
import { UsageRepository } from '../../src/usage/repository.js';
import { estimateCostUsd, pricingFor } from '../../src/usage/pricing.js';
import { log } from '../../src/logger.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRepo() {
  return new UsageRepository(':memory:');
}

const EVENT = {
  userId: 'user_1',
  route: 'chat' as const,
  runId: 'run-1',
  threadId: 'thread-1',
  modelId: 'gpt-5.6-terra',
  provider: 'openai',
  inputTokens: 12_000,
  outputTokens: 900,
  totalTokens: 12_900,
  reasoningTokens: 100,
  cachedInputTokens: 8_000,
};

describe('UsageRepository', () => {
  it('records a usage event with all token fields', async () => {
    const repo = makeRepo();
    await repo.record(EVENT);

    const client = (repo as unknown as { client: { execute: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> } }).client;
    const result = await client.execute('SELECT * FROM usage_events');
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.user_id).toBe('user_1');
    expect(row.route).toBe('chat');
    expect(row.model_id).toBe('gpt-5.6-terra');
    expect(Number(row.input_tokens)).toBe(12_000);
    expect(Number(row.output_tokens)).toBe(900);
    expect(Number(row.cached_input_tokens)).toBe(8_000);
  });

  it('stores nulls for absent token fields rather than failing', async () => {
    const repo = makeRepo();
    await repo.record({ userId: 'u', route: 'chat', modelId: 'gpt-5.6-terra' });

    const client = (repo as unknown as { client: { execute: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> } }).client;
    const result = await client.execute('SELECT input_tokens, run_id FROM usage_events');
    expect(result.rows[0].input_tokens).toBeNull();
    expect(result.rows[0].run_id).toBeNull();
  });

  it('prunes events older than the retention horizon on insert', async () => {
    const repo = makeRepo();
    const now = Date.now();
    const old = now - 401 * 24 * 60 * 60 * 1000;
    await repo.record(EVENT, old);
    await repo.record(EVENT, now);

    const client = (repo as unknown as { client: { execute: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> } }).client;
    const result = await client.execute('SELECT created_at FROM usage_events');
    expect(result.rows).toHaveLength(1);
    expect(Number(result.rows[0].created_at)).toBe(now);
  });

  it('never throws when the write fails — usage loss must not break chat', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const repo = makeRepo();
    const client = (repo as unknown as { client: { execute: () => Promise<never> } });
    client.client = { execute: vi.fn().mockRejectedValue(new Error('disk full')) } as never;

    await expect(repo.record(EVENT)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('usage.record_failed', expect.objectContaining({ err: 'disk full' }));
  });
});

describe('pricing', () => {
  it('matches the longest model-id prefix', () => {
    // 'gpt-5.4-mini' must win over 'gpt-5.4' for gpt-5.4-mini-2026-01.
    const { pricing, known } = pricingFor('gpt-5.4-mini-2026-01');
    expect(known).toBe(true);
    expect(pricing.outputPerMTok).toBe(2);
  });

  it('estimates cost with cached input discounted', () => {
    const { costUsd, known } = estimateCostUsd({
      modelId: 'gpt-5.6-terra',
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedInputTokens: 1_000_000,
    });
    expect(known).toBe(true);
    // Fully cached input → cached rate only.
    expect(costUsd).toBeCloseTo(0.125, 5);
  });

  it('flags unknown models instead of crashing', () => {
    const { costUsd, known } = estimateCostUsd({
      modelId: 'some-future-model',
      inputTokens: 1000,
      outputTokens: 1000,
    });
    expect(known).toBe(false);
    expect(costUsd).toBe(0);
  });
});
