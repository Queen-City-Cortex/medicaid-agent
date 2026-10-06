import { createClient, type Client } from '@libsql/client';
import type { AppDatabase } from '../storage/app-database.js';
import type { Feedback as FeedbackContract } from '@nc-medicaid/contracts';

export type Feedback = FeedbackContract;

export type FeedbackInput = Omit<Feedback, 'createdAt'> & { comment?: string | null };

export class FeedbackRepository {
  private client: Client;
  private initialized = false;
  private probeInitialized = false;

  constructor(database: string | Client | AppDatabase) {
    this.client = typeof database === 'string'
      ? createClient({ url: database })
      : 'client' in database
        ? database.client
        : database;
  }

  /**
   * Verify the underlying LibSQL store accepts writes. The agent's memory
   * (mastra.db) and this feedback table share the same file, which on Railway
   * lives on a persistent volume; if that volume is read-only (e.g. an
   * ownership mismatch between the runtime user and the volume), connectivity
   * still succeeds but every chat-thread write fails with SQLITE_READONLY.
   *
   * `/healthz` calls this so a read-only store fails the deploy healthcheck —
   * Railway then keeps the previous healthy deployment instead of promoting a
   * write-broken one. Returns false instead of throwing.
   */
  async probeWritable(): Promise<boolean> {
    try {
      if (!this.probeInitialized) {
        await this.client.execute(
          'CREATE TABLE IF NOT EXISTS _healthz_probe (id INTEGER PRIMARY KEY, checked_at TEXT NOT NULL)',
        );
        this.probeInitialized = true;
      }
      await this.client.execute({
        sql: 'INSERT INTO _healthz_probe (id, checked_at) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET checked_at = excluded.checked_at',
        args: [new Date().toISOString()],
      });
      return true;
    } catch (err) {
      // Re-create the probe table on the next call in case a transient failure
      // left it absent.
      this.probeInitialized = false;
      console.error('[healthz] storage write probe failed:', err);
      return false;
    }
  }

  private async ensureTable(): Promise<void> {
    if (this.initialized) return;
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
        comment TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (message_id, resource_id)
      )
    `);
    this.initialized = true;
  }

  /** Whether the thread exists and belongs to this user. False when the
   * memory tables are absent, as on a database with no conversations yet. */
  async ownsThread(threadId: string, resourceId: string): Promise<boolean> {
    try {
      const result = await this.client.execute({
        sql: 'SELECT 1 FROM mastra_threads WHERE id = ? AND resourceId = ?',
        args: [threadId, resourceId],
      });
      return result.rows.length > 0;
    } catch {
      return false;
    }
  }

  async upsert(input: FeedbackInput): Promise<{ id: string; isNew: boolean }> {
    await this.ensureTable();

    const comment = input.rating === 'up' ? null : (input.comment ?? null);
    const result = await this.client.execute({
      sql: `INSERT INTO feedback (id, thread_id, message_id, resource_id, rating, comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (message_id, resource_id)
            DO UPDATE SET rating = excluded.rating, comment = excluded.comment
            RETURNING id`,
      args: [input.id, input.threadId, input.messageId, input.resourceId, input.rating, comment, new Date().toISOString()],
    });
    const id = result.rows[0]?.id as string;
    const isNew = id === input.id;

    // Opportunistic orphan prune: deleting a thread (Mastra's memory API)
    // removes its mastra_threads row and messages but knows nothing about
    // this table, so feedback for deleted conversations — including user
    // comments — would otherwise accumulate forever. Best-effort by design.
    void this.pruneOrphans();

    return { id, isNew };
  }

  /**
   * Delete feedback whose thread no longer exists. Never throws; returns 0
   * when the mastra_threads table isn't there yet (a fresh DB where Mastra
   * hasn't initialised its schema has no threads and no orphans).
   */
  async pruneOrphans(): Promise<number> {
    try {
      await this.ensureTable();
      const result = await this.client.execute(
        `DELETE FROM feedback
         WHERE thread_id NOT IN (SELECT id FROM mastra_threads)`,
      );
      return result.rowsAffected ?? 0;
    } catch {
      return 0;
    }
  }

  async delete(id: string, resourceId: string): Promise<boolean> {
    await this.ensureTable();
    const result = await this.client.execute({
      sql: 'DELETE FROM feedback WHERE id = ? AND resource_id = ?',
      args: [id, resourceId],
    });
    return (result.rowsAffected ?? 0) > 0;
  }

  async getByThread(threadId: string, resourceId: string): Promise<Feedback[]> {
    await this.ensureTable();
    const result = await this.client.execute({
      sql: 'SELECT id, thread_id, message_id, resource_id, rating, comment, created_at FROM feedback WHERE thread_id = ? AND resource_id = ?',
      args: [threadId, resourceId],
    });
    return result.rows.map(row => ({
      id: row.id as string,
      threadId: row.thread_id as string,
      messageId: row.message_id as string,
      resourceId: row.resource_id as string,
      rating: row.rating as 'up' | 'down',
      comment: row.comment as string | null,
      createdAt: row.created_at as string,
    }));
  }
}
