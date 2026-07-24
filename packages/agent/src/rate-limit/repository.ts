import { createClient, type Client } from '@libsql/client';
import { intEnv } from '../env.js';
import type { AppDatabase } from '../storage/app-database.js';

export type RateLimitRoute = 'chat' | 'deep-research';

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; window: 'hour' | 'day'; limit: number; retryAfterSeconds: number };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Per-user sliding-window rate limiting backed by the same LibSQL file as the
 * rest of the agent's storage (FeedbackRepository pattern). Durable across
 * deploys — an in-memory counter would silently refill every user's quota on
 * each Railway deploy — and the event rows double as a usage audit log.
 * Volume is bounded by the limits themselves (≤ RATE_LIMIT_MESSAGES_PER_DAY
 * rows per user per day) plus opportunistic pruning.
 */
export class RateLimitRepository {
  private client: Client;
  private initialized = false;

  constructor(database: string | Client | AppDatabase) {
    this.client = typeof database === 'string'
      ? createClient({ url: database })
      : 'client' in database
        ? database.client
        : database;
  }

  private async ensureTable(): Promise<void> {
    if (this.initialized) return;
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS rate_limit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        route TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    await this.client.execute(
      'CREATE INDEX IF NOT EXISTS idx_rate_limit_user_time ON rate_limit_events (user_id, created_at)',
    );
    this.initialized = true;
  }

  /**
   * Sliding-window check: allowed iff the user is under both the hourly and
   * daily limits. Records the event when allowed. A limit ≤ 0 disables that
   * window. `retryAfterSeconds` is when the oldest in-window event ages out.
   *
   * The decision is a single conditional `INSERT … SELECT … WHERE` — one SQL
   * statement, so SQLite applies it atomically. N parallel run-starts from
   * one user therefore can't all read the same under-limit count and then all
   * insert (which would let a burst exceed the window); each INSERT re-checks
   * the live counts. Denied attempts insert nothing, so a lockout can't
   * extend itself. (A prior interactive-transaction version failed under a
   * `:memory:` test DB, whose per-connection storage hides the table from the
   * transaction's separate connection — the single statement avoids that too.)
   */
  async checkAndRecord(userId: string, route: RateLimitRoute, now = Date.now()): Promise<RateLimitDecision> {
    await this.ensureTable();
    const windows = [
      { limit: intEnv('RATE_LIMIT_MESSAGES_PER_HOUR', 30), windowMs: HOUR_MS, window: 'hour' as const },
      { limit: intEnv('RATE_LIMIT_MESSAGES_PER_DAY', 150), windowMs: DAY_MS, window: 'day' as const },
    ].filter((w) => w.limit > 0);

    // Build one under-limit predicate per enabled window; the INSERT commits
    // only if the row would keep the user under every limit.
    const conditions = windows
      .map(() => '(SELECT COUNT(*) FROM rate_limit_events WHERE user_id = ? AND created_at > ?) < ?')
      .join(' AND ');
    const whereArgs = windows.flatMap((w) => [userId, now - w.windowMs, w.limit]);
    const sql = conditions
      ? `INSERT INTO rate_limit_events (user_id, route, created_at) SELECT ?, ?, ? WHERE ${conditions}`
      : 'INSERT INTO rate_limit_events (user_id, route, created_at) VALUES (?, ?, ?)';

    const result = await this.client.execute({ sql, args: [userId, route, now, ...whereArgs] });

    if ((result.rowsAffected ?? 0) > 0) {
      // Opportunistic prune: anything older than the largest window (plus
      // slack) can never affect a decision again.
      await this.client.execute({
        sql: 'DELETE FROM rate_limit_events WHERE created_at < ?',
        args: [now - DAY_MS - HOUR_MS],
      });
      return { allowed: true };
    }

    // Denied: report the first exceeded window (advisory read — the denial
    // itself already stands, so it needn't share the INSERT's atomicity).
    for (const { limit, windowMs, window } of windows) {
      const counted = await this.client.execute({
        sql: 'SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM rate_limit_events WHERE user_id = ? AND created_at > ?',
        args: [userId, now - windowMs],
      });
      if (Number(counted.rows[0]?.n ?? 0) >= limit) {
        const oldest = Number(counted.rows[0]?.oldest ?? now);
        return { allowed: false, window, limit, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
      }
    }
    // Should be unreachable (rowsAffected 0 means some window was full), but
    // never fail closed on an accounting edge — allow.
    return { allowed: true };
  }
}
