import { createClient, type Client } from '@libsql/client';
import { intEnv } from '../env.js';
import { log, errorFields } from '../logger.js';

export interface UsageEvent {
  userId: string;
  route: 'chat' | 'deep-research';
  runId?: string;
  threadId?: string;
  modelId: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Per-request token usage, backed by the same LibSQL file as the rest of the
 * agent's storage (RateLimitRepository pattern). This is the input to
 * cost-per-user/month math (scripts/usage-report.ts) — pricing itself lives
 * in pricing.ts so a rate change never touches recorded data.
 *
 * Row volume is bounded by the rate limiter (≤ RATE_LIMIT_MESSAGES_PER_DAY
 * rows per user per day) plus opportunistic pruning at a billing-history
 * horizon (default 400 days ≈ 13 months).
 *
 * Recording is strictly best-effort: a usage-accounting failure must never
 * break a chat that already succeeded.
 */
export class UsageRepository {
  private client: Client;
  private initialized = false;

  constructor(url: string) {
    this.client = createClient({ url });
  }

  private async ensureTable(): Promise<void> {
    if (this.initialized) return;
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        route TEXT NOT NULL,
        run_id TEXT,
        thread_id TEXT,
        model_id TEXT NOT NULL,
        provider TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        total_tokens INTEGER,
        reasoning_tokens INTEGER,
        cached_input_tokens INTEGER,
        created_at INTEGER NOT NULL
      )
    `);
    await this.client.execute(
      'CREATE INDEX IF NOT EXISTS idx_usage_time ON usage_events (created_at)',
    );
    await this.client.execute(
      'CREATE INDEX IF NOT EXISTS idx_usage_user_time ON usage_events (user_id, created_at)',
    );
    this.initialized = true;
  }

  /** Record one completed agent run's usage. Never throws. */
  async record(event: UsageEvent, now = Date.now()): Promise<void> {
    try {
      await this.ensureTable();
      await this.client.execute({
        sql: `INSERT INTO usage_events
                (user_id, route, run_id, thread_id, model_id, provider,
                 input_tokens, output_tokens, total_tokens, reasoning_tokens,
                 cached_input_tokens, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          event.userId,
          event.route,
          event.runId ?? null,
          event.threadId ?? null,
          event.modelId,
          event.provider ?? null,
          event.inputTokens ?? null,
          event.outputTokens ?? null,
          event.totalTokens ?? null,
          event.reasoningTokens ?? null,
          event.cachedInputTokens ?? null,
          now,
        ],
      });
      // Opportunistic prune past the billing-history horizon. A retention
      // of <= 0 disables pruning entirely — it must never mean "delete the
      // history this table exists to keep".
      const retentionDays = intEnv('USAGE_RETENTION_DAYS', 400);
      if (retentionDays > 0) {
        await this.client.execute({
          sql: 'DELETE FROM usage_events WHERE created_at < ?',
          args: [now - retentionDays * DAY_MS],
        });
      }
    } catch (err) {
      log.warn('usage.record_failed', errorFields(err));
    }
  }
}
