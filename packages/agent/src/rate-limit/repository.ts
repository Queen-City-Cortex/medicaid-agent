import { createClient, type Client } from '@libsql/client';
import { intEnv } from '../env.js';
import type { AppDatabase } from '../storage/app-database.js';

export type RateLimitRoute = 'chat' | 'deep-research';

/** `scope` says whose limit refused the run: the user's own window, or the
 *  service-wide daily ceiling that every user shares. */
export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; scope: 'user'; window: 'hour' | 'day'; limit: number; retryAfterSeconds: number }
  | { allowed: false; scope: 'service'; window: 'day'; limit: number; retryAfterSeconds: number };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Per-user sliding-window rate limiting backed by the same LibSQL file as the
 * rest of the agent's storage (FeedbackRepository pattern). Durable across
 * deploys — an in-memory counter would silently refill every user's quota on
 * each Railway deploy — and the event rows double as a usage audit log.
 * Volume is bounded by the limits themselves (≤ RATE_LIMIT_MESSAGES_PER_DAY
 * rows per user per day) plus opportunistic pruning.
 *
 * RATE_LIMIT_GLOBAL_PER_DAY adds one service-wide ceiling on the same rows:
 * every allowed chat turn and research start in the last 24 hours, whoever
 * made it. It is off (0) by default and must stay off while anyone can
 * register an account, because a shared ceiling lets a few throwaway accounts
 * lock every user out (RUNBOOK, Abuse Protections).
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
    // For the service-wide count and the prune, which have no user to seek on.
    await this.client.execute(
      'CREATE INDEX IF NOT EXISTS idx_rate_limit_time ON rate_limit_events (created_at)',
    );
    this.initialized = true;
  }

  /**
   * Sliding-window check: allowed iff the user is under both the hourly and
   * daily limits and the service is under its daily ceiling. Records the event
   * when allowed. A limit ≤ 0 disables that window or the ceiling. `retryAfterSeconds` is when the oldest in-window event ages out.
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
      .map(() => '(SELECT COUNT(*) FROM rate_limit_events WHERE user_id = ? AND created_at > ?) < ?');
    const whereArgs: Array<string | number> = windows.flatMap((w) => [userId, now - w.windowMs, w.limit]);
    // The service-wide ceiling is one more predicate on the same statement, so
    // a burst from many accounts cannot pass it any more than one user's can.
    const globalLimit = intEnv('RATE_LIMIT_GLOBAL_PER_DAY', 0);
    if (globalLimit > 0) {
      conditions.push('(SELECT COUNT(*) FROM rate_limit_events WHERE created_at > ?) < ?');
      whereArgs.push(now - DAY_MS, globalLimit);
    }
    const sql = conditions.length
      ? `INSERT INTO rate_limit_events (user_id, route, created_at) SELECT ?, ?, ? WHERE ${conditions.join(' AND ')}`
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
        return { allowed: false, scope: 'user', window, limit, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
      }
    }
    // No window of the user's own is full, so the ceiling refused the insert.
    // The user's own limit is reported first when both apply: it is the one
    // that still holds for them after the ceiling lifts.
    if (globalLimit > 0) {
      const counted = await this.client.execute({
        sql: 'SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM rate_limit_events WHERE created_at > ?',
        args: [now - DAY_MS],
      });
      if (Number(counted.rows[0]?.n ?? 0) >= globalLimit) {
        const oldest = Number(counted.rows[0]?.oldest ?? now);
        return { allowed: false, scope: 'service', window: 'day', limit: globalLimit, retryAfterSeconds: Math.max(1, Math.ceil((oldest + DAY_MS - now) / 1000)) };
      }
    }
    // Reached only when the rows that refused the insert aged out before the
    // advisory reads above. Never fail closed on that accounting edge: allow.
    // The run is not recorded, so it is one start the windows do not count.
    return { allowed: true };
  }
}
