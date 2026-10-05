import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { LibSQLStore } from '@mastra/libsql';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../../src/storage/app-database.js';
import { UsageRepository } from '../../src/usage/repository.js';

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
    expect(result.rows.map((row) => Number(row.version))).toEqual([1, 2, 3, 4, 5, 6]);
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
    expect(versions.rows.map((row) => Number(row.version))).toEqual([1, 2, 3, 4, 5, 6]);
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

    await database.deleteUserData('u1');
    expect((await database.client.execute('SELECT id FROM feedback')).rows.map((row) => row.id)).toEqual(['f2']);
    expect((await database.client.execute('SELECT id FROM mastra_threads')).rows.map((row) => row.id)).toEqual(['t2']);
    expect((await database.client.execute('SELECT id FROM mastra_messages')).rows.map((row) => row.id)).toEqual(['m2']);
  });

  it('retains checkpoints with their run and removes expired private drafts and budgets', async () => {
    const database = createDatabase();
    await database.migrate();
    for (const [id, date] of [['old', '2020-01-01T00:00:00.000Z'], ['recent', new Date().toISOString()]]) {
      await database.client.execute({ sql: 'INSERT INTO research_runs (id, resource_id, state, question, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', args: [id, 'owner', 'completed', 'q', date, date] });
      await database.client.execute({ sql: 'INSERT INTO research_checkpoints VALUES (?, ?, ?, ?)', args: [id, 'synthesis', '"PRIVATE_DRAFT_SENTINEL"', 1] });
      await database.client.execute({ sql: 'INSERT INTO research_budgets VALUES (?, ?, ?, ?)', args: [id, 'synthesis', 1, 1] });
    }
    await database.runRetention({ conversationsDays: 90, feedbackDays: 90, usageDays: 90, rateLimitHours: 1 });
    for (const table of ['research_checkpoints', 'research_budgets']) {
      expect((await database.client.execute(`SELECT run_id FROM ${table}`)).rows.map(row => row.run_id)).toEqual(['recent']);
    }
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
    const old = '2020-01-01T00:00:00.000Z';
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
      { sql: 'UPDATE mastra_observational_memory SET "updatedAt" = ? WHERE "threadId" = ? OR "threadId" IS NULL', args: [old, 'orphan-old'] },
    ], 'write');

    await database.runRetention({ conversationsDays: 90, feedbackDays: 90, usageDays: 90, rateLimitHours: 1 });

    const column = async (sql: string) => (await database.client.execute(sql)).rows.map((row) => row.id);
    expect(await column('SELECT id FROM mastra_threads')).toEqual(['live']);
    expect(await column('SELECT thread_id AS id FROM mastra_messages')).toEqual(['live']);
    expect(await column('SELECT "threadId" AS id FROM mastra_thread_state')).toEqual(['live']);
    expect(await column('SELECT "threadId" AS id FROM mastra_observational_memory ORDER BY "threadId"'))
      .toEqual([null, 'live', 'orphan-new']);
  });
});
