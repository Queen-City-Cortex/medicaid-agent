import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { LibSQLStore } from '@mastra/libsql';
import {
  CONVERSATION_RETENTION_DAYS,
  FEEDBACK_RETENTION_DAYS,
  RATE_LIMIT_RETENTION_HOURS,
  USAGE_RETENTION_DAYS,
} from '@nc-medicaid/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../../src/storage/app-database.js';
import { RateLimitRepository } from '../../src/rate-limit/repository.js';
import { UsageRepository } from '../../src/usage/repository.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

describe('AppDatabase', () => {
  const databases: AppDatabase[] = [];
  const stores: LibSQLStore[] = [];
  const directories: string[] = [];
  afterEach(async () => {
    databases.splice(0).forEach((database) => database.close());
    await Promise.all(stores.splice(0).map((store) => store.close()));
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  function createDatabase() {
    const database = new AppDatabase(createClient({ url: ':memory:' }));
    databases.push(database);
    return database;
  }

  it('applies numbered migrations idempotently', async () => {
    const database = createDatabase();
    await database.migrate();
    await database.migrate();
    const result = await database.client.execute('SELECT version FROM _app_migrations ORDER BY version');
    expect(result.rows.map((row) => Number(row.version))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('indexes rate-limit events by time, on a new database and on one the repository already bootstrapped', async () => {
    const indexes = async (database: AppDatabase) => (await database.client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'rate_limit_events' ORDER BY name")).rows.map((row) => String(row.name));
    const fresh = createDatabase();
    await fresh.migrate();
    expect(await indexes(fresh)).toEqual(['idx_rate_limit_time', 'idx_rate_limit_user_time']);

    // The existing database: migrated before the index existed, holding rows.
    const existing = createDatabase();
    await existing.migrate();
    await existing.client.execute('DROP INDEX idx_rate_limit_time');
    await existing.client.execute('DELETE FROM _app_migrations WHERE version = 7');
    await existing.client.execute({ sql: 'INSERT INTO rate_limit_events (user_id, route, created_at) VALUES (?, ?, ?)', args: ['user-1', 'chat', 1] });
    const reopened = new AppDatabase(existing.client);
    await reopened.migrate();
    expect(await indexes(reopened)).toEqual(['idx_rate_limit_time', 'idx_rate_limit_user_time']);

    // The repository creates the same index lazily; the migration then adopts it.
    const lazy = createDatabase();
    await new RateLimitRepository(lazy.client).checkAndRecord('user-1', 'chat');
    expect(await indexes(lazy)).toEqual(['idx_rate_limit_time', 'idx_rate_limit_user_time']);
    await expect(lazy.migrate()).resolves.toBeUndefined();
    await expect(lazy.migrate()).resolves.toBeUndefined();
    const plan = await lazy.client.execute({ sql: 'EXPLAIN QUERY PLAN SELECT COUNT(*) FROM rate_limit_events WHERE created_at > ?', args: [0] });
    expect(JSON.stringify(plan.rows)).toContain('idx_rate_limit_time');
  });

  it('adopts a lazily bootstrapped latest usage schema', async () => {
    const database = createDatabase();
    const usage = new UsageRepository(database.client);
    await usage.record({
      userId: 'user-1',
      route: 'chat',
      modelId: 'test-model',
      phase: 'verifier',
    });

    await expect(database.migrate()).resolves.toBeUndefined();
    const versions = await database.client.execute('SELECT version FROM _app_migrations ORDER BY version');
    expect(versions.rows.map((row) => Number(row.version))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('deletes all app-owned data for one resource only', async () => {
    const database = createDatabase();
    await database.migrate();
    await database.client.execute(`CREATE TABLE mastra_threads (
      id TEXT PRIMARY KEY, "resourceId" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
    )`);
    await database.client.execute(`CREATE TABLE mastra_messages (
      id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, "resourceId" TEXT
    )`);
    await database.client.batch([
      { sql: 'INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?, ?)', args: ['f1', 't1', 'm1', 'u1', 'down', 'note', new Date().toISOString()] },
      { sql: 'INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?, ?)', args: ['f2', 't2', 'm2', 'u2', 'up', null, new Date().toISOString()] },
      { sql: 'INSERT INTO mastra_threads VALUES (?, ?, ?)', args: ['t1', 'u1', new Date().toISOString()] },
      { sql: 'INSERT INTO mastra_threads VALUES (?, ?, ?)', args: ['t2', 'u2', new Date().toISOString()] },
      { sql: 'INSERT INTO mastra_messages VALUES (?, ?, ?)', args: ['m1', 't1', 'u1'] },
      { sql: 'INSERT INTO mastra_messages VALUES (?, ?, ?)', args: ['m2', 't2', 'u2'] },
    ], 'write');

    const audit = (messageId: string, threadId: string, user: string) => ({
      sql: 'INSERT INTO answer_audit VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [messageId, threadId, user, '{}', '{}', '[]', '[]', null, 'model', new Date().toISOString()],
    });
    await database.client.batch([audit('m1', 't1', 'u1'), audit('m2', 't2', 'u2')], 'write');

    await database.deleteUserData('u1');
    expect((await database.client.execute('SELECT message_id FROM answer_audit')).rows.map((row) => row.message_id)).toEqual(['m2']);
    expect((await database.client.execute('SELECT id FROM feedback')).rows.map((row) => row.id)).toEqual(['f2']);

    // Deleting one thread removes its verification records and feedback at once.
    await database.client.batch([audit('m3', 't3', 'u2'), {
      sql: 'INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?, ?)', args: ['f3', 't3', 'm3', 'u2', 'down', 'note', new Date().toISOString()],
    }], 'write');
    await database.deleteThreadRecords('t3');
    expect((await database.client.execute('SELECT message_id FROM answer_audit')).rows.map((row) => row.message_id)).toEqual(['m2']);
    expect((await database.client.execute('SELECT id FROM feedback')).rows.map((row) => row.id)).toEqual(['f2']);
    expect((await database.client.execute('SELECT id FROM mastra_threads')).rows.map((row) => row.id)).toEqual(['t2']);
    expect((await database.client.execute('SELECT id FROM mastra_messages')).rows.map((row) => row.id)).toEqual(['m2']);
  });

  it('retains checkpoints with their run and removes expired private drafts and budgets', async () => {
    const database = createDatabase();
    await database.migrate();
    const now = Date.now();
    const daysAgo = (days: number) => new Date(now - days * DAY_MS).toISOString();
    for (const [id, date] of [['old', daysAgo(CONVERSATION_RETENTION_DAYS + 1)], ['recent', daysAgo(CONVERSATION_RETENTION_DAYS - 1)]]) {
      await database.client.execute({ sql: 'INSERT INTO research_runs (id, resource_id, state, question, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', args: [id, 'owner', 'completed', 'q', date, date] });
      await database.client.execute({ sql: 'INSERT INTO research_checkpoints VALUES (?, ?, ?, ?)', args: [id, 'synthesis', '"PRIVATE_DRAFT_SENTINEL"', 1] });
      await database.client.execute({ sql: 'INSERT INTO research_budgets VALUES (?, ?, ?, ?)', args: [id, 'synthesis', 1, 1] });
    }
    await database.runRetention(now);
    for (const table of ['research_checkpoints', 'research_budgets']) {
      expect((await database.client.execute(`SELECT run_id FROM ${table}`)).rows.map(row => row.run_id)).toEqual(['recent']);
    }
    expect((await database.client.execute('SELECT id FROM research_runs')).rows.map(row => row.id)).toEqual(['recent']);
  });

  it('deletes verification records, feedback, usage and rate-limit rows one step past their periods and keeps rows one step inside', async () => {
    const database = createDatabase();
    await database.migrate();
    const now = Date.now();
    const feedback = (id: string, days: number) => ({
      sql: 'INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, `thread-${id}`, `message-${id}`, 'owner', 'up', null, new Date(now - days * DAY_MS).toISOString()],
    });
    const usage = (model: string, days: number) => ({
      sql: 'INSERT INTO usage_events (user_id, route, model_id, created_at) VALUES (?, ?, ?, ?)',
      args: ['owner', 'chat', model, now - days * DAY_MS],
    });
    const rateLimit = (route: string, hours: number) => ({
      sql: 'INSERT INTO rate_limit_events (user_id, route, created_at) VALUES (?, ?, ?)',
      args: ['owner', route, now - hours * HOUR_MS],
    });
    const audit = (id: string, days: number) => ({
      sql: 'INSERT INTO answer_audit VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [id, `thread-${id}`, 'owner', '{}', '{}', '[]', '[]', null, 'model', new Date(now - days * DAY_MS).toISOString()],
    });
    await database.client.batch([
      audit('old', CONVERSATION_RETENTION_DAYS + 1), audit('recent', CONVERSATION_RETENTION_DAYS - 1),
      feedback('old', FEEDBACK_RETENTION_DAYS + 1), feedback('recent', FEEDBACK_RETENTION_DAYS - 1),
      usage('old', USAGE_RETENTION_DAYS + 1), usage('recent', USAGE_RETENTION_DAYS - 1),
      rateLimit('old', RATE_LIMIT_RETENTION_HOURS + 1), rateLimit('recent', RATE_LIMIT_RETENTION_HOURS - 1),
    ], 'write');

    await database.runRetention(now);

    const column = async (sql: string) => (await database.client.execute(sql)).rows.map((row) => row.id);
    expect(await column('SELECT message_id AS id FROM answer_audit')).toEqual(['recent']);
    expect(await column('SELECT id FROM feedback')).toEqual(['recent']);
    expect(await column('SELECT model_id AS id FROM usage_events')).toEqual(['recent']);
    expect(await column('SELECT route AS id FROM rate_limit_events')).toEqual(['recent']);
  });

  it('expires a conversation with its messages, thread state and observational memory on the real Mastra schema', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'app-database-'));
    directories.push(directory);
    const url = `file:${directory}/test.db`;
    const storage = new LibSQLStore({ id: 'test', url });
    stores.push(storage);
    await storage.init();
    const database = new AppDatabase(url);
    databases.push(database);
    await database.migrate();

    // An upstream rename must fail here instead of being skipped by the hasTable guards.
    const tables = (await database.client.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`)).rows.map((row) => row.name);
    expect(tables).toEqual(expect.arrayContaining([
      'mastra_threads', 'mastra_messages', 'mastra_thread_state', 'mastra_observational_memory',
    ]));

    const memory = (await storage.getStore('memory'))!;
    const threadState = (await storage.getStore('threadState'))!;
    // One day past the period and one day inside it, so the test pins the exported constant.
    const retentionNow = Date.now();
    const old = new Date(retentionNow - (CONVERSATION_RETENTION_DAYS + 1) * DAY_MS).toISOString();
    const recent = new Date(retentionNow - (CONVERSATION_RETENTION_DAYS - 1) * DAY_MS).toISOString();
    const observe = (threadId: string | null, resourceId: string) =>
      memory.initializeObservationalMemory({ threadId, resourceId, scope: threadId ? 'thread' : 'resource', config: {} });
    for (const threadId of ['expired', 'live']) {
      const now = new Date();
      await memory.saveThread({ thread: { id: threadId, resourceId: 'owner', title: threadId, createdAt: now, updatedAt: now } });
      await memory.saveMessages({ messages: [{
        id: `message-${threadId}`, threadId, resourceId: 'owner', role: 'user', createdAt: now,
        content: { format: 2, parts: [{ type: 'text', text: 'question' }] },
      }] });
      await threadState.setState({ threadId, type: 'task', value: { open: true } });
      await observe(threadId, 'owner');
    }
    // Orphans: one left by an earlier retention run, one whose thread is not saved yet, and a resource-scoped record.
    await observe('orphan-old', 'owner');
    await observe('orphan-new', 'owner');
    await observe(null, 'owner');
    await database.client.batch([
      { sql: 'UPDATE mastra_threads SET "updatedAt" = ? WHERE id = ?', args: [old, 'expired'] },
      { sql: 'UPDATE mastra_threads SET "updatedAt" = ? WHERE id = ?', args: [recent, 'live'] },
      { sql: 'UPDATE mastra_observational_memory SET "updatedAt" = ? WHERE "threadId" = ? OR "threadId" IS NULL', args: [old, 'orphan-old'] },
      { sql: 'UPDATE mastra_observational_memory SET "updatedAt" = ? WHERE "threadId" = ?', args: [recent, 'orphan-new'] },
    ], 'write');

    // Verification records: one per thread, one written a period ago in the live thread, and two whose
    // thread is gone (deleted from the sidebar an hour ago, and a first turn not saved yet).
    const audit = (messageId: string, threadId: string, createdAt: string) => ({
      sql: 'INSERT INTO answer_audit VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [messageId, threadId, 'owner', '{}', '{}', '[]', '[]', null, 'model', createdAt],
    });
    const minutesAgo = (minutes: number) => new Date(retentionNow - minutes * 60_000).toISOString();
    await database.client.batch([
      audit('audit-expired', 'expired', recent), audit('audit-live', 'live', recent), audit('audit-live-old', 'live', old),
      audit('audit-deleted-thread', 'deleted', minutesAgo(61)), audit('audit-unsaved-thread', 'unsaved', minutesAgo(59)),
    ], 'write');

    await database.runRetention(retentionNow);

    const column = async (sql: string) => (await database.client.execute(sql)).rows.map((row) => row.id);
    expect(await column('SELECT message_id AS id FROM answer_audit ORDER BY message_id')).toEqual(['audit-live', 'audit-unsaved-thread']);
    expect(await column('SELECT id FROM mastra_threads')).toEqual(['live']);
    expect(await column('SELECT thread_id AS id FROM mastra_messages')).toEqual(['live']);
    expect(await column('SELECT "threadId" AS id FROM mastra_thread_state')).toEqual(['live']);
    expect(await column('SELECT "threadId" AS id FROM mastra_observational_memory ORDER BY "threadId"'))
      .toEqual([null, 'live', 'orphan-new']);
  });
});
