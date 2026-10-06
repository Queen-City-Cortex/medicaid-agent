import type { Client } from '@libsql/client';
import type { MastraDBMessage } from '@mastra/core/memory';
import { configureAnswerRelease, guardMessage } from '../answer-release.js';

export interface FeedbackReviewOptions {
  /** How far back to look, in days. */
  days: number;
  /** Most entries to print. */
  limit: number;
  now?: number;
}

function messageText(role: 'user' | 'assistant', content: unknown): string | null {
  if (typeof content !== 'string') return null;
  try {
    // The same reader the memory routes use, so an answer whose release
    // signature does not verify prints as the unverified-history notice.
    const message = guardMessage({ role, content: JSON.parse(content) } as MastraDBMessage);
    const parts = typeof message.content === 'string' ? [] : message.content.parts;
    return parts.flatMap((part) => part.type === 'text' ? [part.text] : []).join('\n').trim() || null;
  } catch {
    return null;
  }
}

/**
 * Recent thumbs-down ratings as a review queue, newest first: the question,
 * the released answer and the user's comment. It only reads. A rating appears
 * while its conversation exists and belongs to the user who left it; feedback
 * for a deleted conversation is gone by design.
 *
 * The result holds user text. Callers print it for an operator and nothing else.
 */
export async function renderNegativeFeedbackReview(client: Client, options: FeedbackReviewOptions): Promise<string> {
  const since = new Date((options.now ?? Date.now()) - options.days * 86_400_000).toISOString();
  const heading = `Negative feedback in the last ${options.days} days, newest first`;
  let rows;
  try {
    const key = await client.execute('SELECT secret FROM answer_release_keys WHERE id = 1');
    if (key.rows[0]) configureAnswerRelease(String(key.rows[0].secret));
    ({ rows } = await client.execute({
      sql: `SELECT f.id, f.thread_id, f.message_id, f.comment, f.created_at, m.content AS answer,
                   (SELECT q.content FROM mastra_messages q
                     WHERE q.thread_id = f.thread_id AND q.role = 'user' AND q.createdAt <= m.createdAt
                     ORDER BY q.createdAt DESC LIMIT 1) AS question
            FROM feedback f
            JOIN mastra_threads t ON t.id = f.thread_id AND t.resourceId = f.resource_id
            LEFT JOIN mastra_messages m
              ON m.id = f.message_id AND m.thread_id = f.thread_id AND m.role = 'assistant'
            WHERE f.rating = 'down' AND f.created_at >= ?
            ORDER BY f.created_at DESC
            LIMIT ?`,
      args: [since, options.limit],
    }));
  } catch (err) {
    if (err instanceof Error && /no such table/i.test(err.message)) return `${heading}: none (no feedback or conversations in this database).\n`;
    throw err;
  }
  if (rows.length === 0) return `${heading}: none.\n`;
  const entries = rows.map((row) => [
    `--- ${String(row.created_at)}  feedback ${String(row.id)}  thread ${String(row.thread_id)}  message ${String(row.message_id)}`,
    `Question:\n${messageText('user', row.question) ?? '(not found)'}`,
    `Released answer:\n${messageText('assistant', row.answer) ?? '(the rated message is not in the store)'}`,
    `Comment:\n${row.comment ? String(row.comment) : '(none)'}`,
  ].join('\n\n'));
  return [
    `${heading}: ${rows.length} (limit ${options.limit}).`,
    'CONTAINS USER TEXT. Read it here; do not paste it into tickets, chat, commits or documents.',
    ...entries,
  ].join('\n\n') + '\n';
}
