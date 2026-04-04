import { createClient, type Client } from '@libsql/client';

export interface Feedback {
  id: string;
  threadId: string;
  messageId: string;
  resourceId: string;
  rating: 'up' | 'down';
  comment: string | null;
  createdAt: string;
}

export type FeedbackInput = Omit<Feedback, 'createdAt'> & { comment?: string | null };

export class FeedbackRepository {
  private client: Client;
  private initialized = false;

  constructor(url: string) {
    this.client = createClient({ url });
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

  async upsert(input: FeedbackInput): Promise<{ id: string; isNew: boolean }> {
    await this.ensureTable();

    const existing = await this.client.execute({
      sql: 'SELECT id FROM feedback WHERE message_id = ? AND resource_id = ?',
      args: [input.messageId, input.resourceId],
    });
    const isNew = existing.rows.length === 0;

    const comment = input.rating === 'up' ? null : (input.comment ?? null);

    await this.client.execute({
      sql: `INSERT INTO feedback (id, thread_id, message_id, resource_id, rating, comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (message_id, resource_id)
            DO UPDATE SET id = excluded.id, rating = excluded.rating, comment = excluded.comment, created_at = excluded.created_at`,
      args: [input.id, input.threadId, input.messageId, input.resourceId, input.rating, comment, new Date().toISOString()],
    });

    return { id: input.id, isNew };
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
