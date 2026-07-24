import { createClient } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../../src/storage/app-database.js';
import { UsageRepository } from '../../src/usage/repository.js';

describe('AppDatabase', () => {
  const databases: AppDatabase[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.close()));

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
    expect(result.rows.map((row) => Number(row.version))).toEqual([1, 2, 3, 4]);
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
    expect(versions.rows.map((row) => Number(row.version))).toEqual([1, 2, 3, 4]);
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
});
