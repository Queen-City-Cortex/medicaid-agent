import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { LibSQLStore } from '@mastra/libsql';
import { Hono, type Handler } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UNVERIFIED_HISTORY } from '@nc-medicaid/contracts';
import { configureAnswerRelease, installMemoryReleaseGate, releaseMessage } from '../../src/answer-release.js';
import { FeedbackRepository } from '../../src/feedback/repository.js';
import { renderNegativeFeedbackReview } from '../../src/feedback/review.js';
import { createFeedbackRoutes } from '../../src/feedback/routes.js';
import { log } from '../../src/logger.js';
import { AppDatabase } from '../../src/storage/app-database.js';

const SCRIPT = fileURLToPath(new URL('../../scripts/feedback-review.ts', import.meta.url));
const QUESTION = 'Does Medicaid cover dental care for a child?';
const ANSWER = 'Dental care is covered for adults. [Policy](https://example.gov/policy)';
const COMMENT = 'This cites the adult policy; my question was about a child.';

describe('feedback on real storage', () => {
  const closers: Array<() => unknown> = [];
  const directories: string[] = [];
  afterEach(async () => {
    for (const close of closers.splice(0).reverse()) await close();
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
    vi.restoreAllMocks();
  });

  /** The real Mastra schema and app tables, with one conversation per user,
   * and the feedback routes as each user. */
  async function seed() {
    const directory = await mkdtemp(join(tmpdir(), 'feedback-review-'));
    directories.push(directory);
    const url = `file:${directory}/test.db`;
    const storage = new LibSQLStore({ id: 'test', url });
    closers.push(() => storage.close());
    await storage.init();
    const database = new AppDatabase(url);
    closers.push(() => database.close());
    await database.migrate();
    configureAnswerRelease(String((await database.client.execute('SELECT secret FROM answer_release_keys WHERE id = 1')).rows[0].secret));
    const memory = (await storage.getStore('memory'))!;
    installMemoryReleaseGate(memory);
    for (const user of ['user-a', 'user-b']) {
      const threadId = `thread-${user}`;
      await memory.saveThread({ thread: { id: threadId, resourceId: user, title: 't', createdAt: new Date(), updatedAt: new Date() } });
      const message = (suffix: string, role: 'user' | 'assistant', text: string, at: number) => ({
        id: `${suffix}-${user}`, threadId, resourceId: user, role, createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0, at)),
        content: { format: 2 as const, parts: [{ type: 'text' as const, text }] },
      });
      await memory.saveMessages({ messages: [
        message('question-1', 'user', 'An earlier question.', 0),
        message('answer-1', 'assistant', 'UNSIGNED_DRAFT_SENTINEL', 1),
        message('question-2', 'user', `${QUESTION} (${user})`, 2),
        releaseMessage(message('answer-2', 'assistant', ANSWER, 3), ANSWER, { status: 'passed', passCount: 1 }),
      ] });
    }
    const repo = new FeedbackRepository(database);
    const handlers = createFeedbackRoutes(repo);
    const as = (user: string) => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        (c as never as { set: (key: string, value: unknown) => void }).set('requestContext', new Map([['user', { userId: user }]]));
        await next();
      });
      app.post('/feedback', handlers.post as unknown as Handler);
      app.get('/feedback', handlers.get as unknown as Handler);
      return {
        rate: (body: unknown) => app.request('/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        read: (threadId: string) => app.request(`/feedback?threadId=${threadId}`),
      };
    };
    return { url, database, memory, as };
  }

  it('lets only the owner leave or read feedback on a conversation, and stores no identifier', async () => {
    vi.spyOn(log, 'info').mockImplementation(() => {});
    const { database, as } = await seed();
    const rated = { messageId: 'answer-2-user-a', threadId: 'thread-user-a', rating: 'down' };
    expect((await as('user-b').rate({ ...rated, comment: 'Not my conversation' })).status).toBe(404);
    expect((await as('user-a').rate({ ...rated, threadId: 'thread-gone' })).status).toBe(404);
    expect((await as('user-a').rate({ ...rated, comment: 'Her SSN is 123-45-6789' })).status).toBe(422);
    expect((await database.client.execute('SELECT * FROM feedback')).rows).toEqual([]);

    expect((await as('user-a').rate({ ...rated, comment: COMMENT })).status).toBe(201);
    expect((await (await as('user-a').read('thread-user-a')).json()).feedback).toEqual([
      expect.objectContaining({ messageId: 'answer-2-user-a', resourceId: 'user-a', rating: 'down', comment: COMMENT }),
    ]);
    expect((await (await as('user-b').read('thread-user-a')).json()).feedback).toEqual([]);
    expect(JSON.stringify((await database.client.execute('SELECT * FROM feedback')).rows)).not.toContain('123-45-6789');
  });

  it('prints thumbs-down ratings with the question, released answer and comment, and nothing else', async () => {
    vi.spyOn(log, 'info').mockImplementation(() => {});
    const { url, database, memory, as } = await seed();
    const a = as('user-a');
    expect((await a.rate({ messageId: 'answer-2-user-a', threadId: 'thread-user-a', rating: 'down', comment: COMMENT })).status).toBe(201);
    // An answer with no release signature, a rating with no comment, and an id the store never saw.
    expect((await a.rate({ messageId: 'answer-1-user-a', threadId: 'thread-user-a', rating: 'down' })).status).toBe(201);
    expect((await a.rate({ messageId: 'client-only-id', threadId: 'thread-user-a', rating: 'down', comment: 'UNMATCHED_COMMENT' })).status).toBe(201);
    expect((await a.rate({ messageId: 'question-2-user-a', threadId: 'thread-user-a', rating: 'up' })).status).toBe(201);
    const b = as('user-b');
    expect((await b.rate({ messageId: 'answer-2-user-b', threadId: 'thread-user-b', rating: 'down', comment: 'DELETED_THREAD_COMMENT' })).status).toBe(201);
    // Rows that predate the owner check: another user's thread, and an old rating.
    const insert = 'INSERT INTO feedback (id, thread_id, message_id, resource_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
    await database.client.execute({ sql: insert, args: ['fb-foreign', 'thread-user-a', 'answer-2-user-a', 'user-b', 'down', 'FOREIGN_COMMENT', new Date().toISOString()] });
    await database.client.execute({ sql: insert, args: ['fb-old', 'thread-user-a', 'question-1-user-a', 'user-a', 'down', 'OLD_COMMENT', new Date(Date.now() - 40 * 86_400_000).toISOString()] });
    await memory.deleteThread({ threadId: 'thread-user-b' });
    const before = JSON.stringify((await database.client.execute('SELECT * FROM feedback ORDER BY id')).rows);

    const run = spawnSync(process.execPath, ['--import', 'tsx', SCRIPT, '--days', '30'], {
      encoding: 'utf8', env: { ...process.env, DATABASE_URL: url }, cwd: fileURLToPath(new URL('../..', import.meta.url)),
    });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    const output = run.stdout;
    expect(output).toContain('Negative feedback in the last 30 days, newest first: 3 (limit 50).');
    expect(output).toContain('CONTAINS USER TEXT');
    const entries = output.split('\n--- ').slice(1);
    expect(entries).toHaveLength(3);
    const entry = (messageId: string) => entries.find((text) => text.includes(`message ${messageId}\n`))!;
    expect(entry('answer-2-user-a')).toContain(`thread thread-user-a  message answer-2-user-a\n\nQuestion:\n${QUESTION} (user-a)\n\nReleased answer:\n${ANSWER}\n\nComment:\n${COMMENT}\n`);
    // A stored answer that was never released prints as the notice, not as its text.
    expect(entry('answer-1-user-a')).toContain(`Question:\nAn earlier question.\n\nReleased answer:\n${UNVERIFIED_HISTORY}\n\nComment:\n(none)\n`);
    expect(entry('client-only-id')).toContain('Question:\n(not found)\n\nReleased answer:\n(the rated message is not in the store)\n\nComment:\nUNMATCHED_COMMENT\n');
    for (const absent of ['UNSIGNED_DRAFT_SENTINEL', 'DELETED_THREAD_COMMENT', 'FOREIGN_COMMENT', 'OLD_COMMENT', 'user-b', 'question-2-user-a\n']) {
      expect(output).not.toContain(absent);
    }
    // The same text from the function the script calls, and the database is unchanged.
    const client = createClient({ url });
    closers.push(() => client.close());
    expect(await renderNegativeFeedbackReview(client, { days: 30, limit: 50 })).toBe(output);
    expect(await renderNegativeFeedbackReview(client, { days: 30, limit: 1 })).toContain('newest first: 1 (limit 1).');
    expect(JSON.stringify((await database.client.execute('SELECT * FROM feedback ORDER BY id')).rows)).toBe(before);

    const bad = spawnSync(process.execPath, ['--import', 'tsx', SCRIPT, '--days', 'all'], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: url } });
    expect(bad.status).toBe(2);
    expect(bad.stdout).toBe('');
  }, 30_000);

  it('reports an empty queue on a database with no feedback table', async () => {
    const client = createClient({ url: ':memory:' });
    closers.push(() => client.close());
    expect(await renderNegativeFeedbackReview(client, { days: 30, limit: 50 })).toContain('none');
  });
});
