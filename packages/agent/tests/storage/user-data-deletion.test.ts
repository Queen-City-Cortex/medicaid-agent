import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LibSQLStore } from '@mastra/libsql';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase, renderUserDataDeletionSql } from '../../src/storage/app-database.js';

const TARGET = 'user_01E4ZCR3C56J083X43JQXF3JK5';
const OTHER = 'user_01E4ZCR3C56J083X43JQXF3JK6';
const HOSTILE_IDS = [
  `${TARGET}'; DROP TABLE mastra_threads; --`,
  `' OR 1=1 --`,
  `${TARGET}\n`,
  `${TARGET}"; rm -rf /data; "`,
  '$(touch /tmp/owned)',
  'user_01e4zcr3c56j083x43jqxf3jk5',
  '%',
  '',
];
const SCRIPT = fileURLToPath(new URL('../../scripts/delete-user-data.ts', import.meta.url));

describe('user data deletion', () => {
  const databases: AppDatabase[] = [];
  const stores: LibSQLStore[] = [];
  const directories: string[] = [];
  afterEach(async () => {
    databases.splice(0).forEach((database) => database.close());
    await Promise.all(stores.splice(0).map((store) => store.close()));
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  /** The real Mastra schema plus the app tables, with the same rows for two users. */
  async function seed() {
    const directory = await mkdtemp(join(tmpdir(), 'user-data-deletion-'));
    directories.push(directory);
    const url = `file:${directory}/test.db`;
    const storage = new LibSQLStore({ id: 'test', url });
    stores.push(storage);
    await storage.init();
    const database = new AppDatabase(url);
    databases.push(database);
    await database.migrate();

    const memory = (await storage.getStore('memory'))!;
    const threadState = (await storage.getStore('threadState'))!;
    const now = new Date();
    const iso = now.toISOString();
    for (const user of [TARGET, OTHER]) {
      const threadId = `thread-${user}`;
      const runId = `run-${user}`;
      await memory.saveThread({ thread: { id: threadId, resourceId: user, title: 't', createdAt: now, updatedAt: now } });
      await memory.saveMessages({ messages: ['a', 'b'].map((suffix) => ({
        id: `message-${suffix}-${user}`, threadId, resourceId: user, role: 'user' as const, createdAt: now,
        content: { format: 2 as const, parts: [{ type: 'text' as const, text: 'client details' }] },
      })) });
      await threadState.setState({ threadId, type: 'task', value: { open: true } });
      await memory.initializeObservationalMemory({ threadId, resourceId: user, scope: 'thread', config: {} });
      await memory.initializeObservationalMemory({ threadId: null, resourceId: user, scope: 'resource', config: {} });
      await memory.saveResource({ resource: { id: user, workingMemory: 'profile', createdAt: now, updatedAt: now } });
      await database.client.batch([
        // Rows reachable only through the thread: the owner column is empty.
        { sql: 'UPDATE mastra_messages SET "resourceId" = NULL WHERE id = ?', args: [`message-b-${user}`] },
        { sql: 'INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?, ?)', args: [`feedback-${user}`, threadId, `message-a-${user}`, user, 'down', 'note', iso] },
        {
          sql: 'INSERT INTO answer_audit VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [`message-a-${user}`, threadId, user, '{}', '{}', '[{"unsupportedClaims":[{"claim":"client details"}]}]', '[]', null, 'model', iso],
        },
        { sql: 'INSERT INTO rate_limit_events (user_id, route, created_at) VALUES (?, ?, ?)', args: [user, 'chat', now.getTime()] },
        { sql: 'INSERT INTO usage_events (user_id, route, model_id, created_at) VALUES (?, ?, ?, ?)', args: [user, 'chat', 'model', now.getTime()] },
        {
          sql: 'INSERT INTO research_runs (id, resource_id, state, question, workflow_run_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          args: [runId, user, 'completed', 'question', `workflow-${user}`, iso, iso],
        },
        { sql: 'INSERT INTO research_checkpoints VALUES (?, ?, ?, ?)', args: [runId, 'synthesis', '"draft"', 1] },
        { sql: 'INSERT INTO research_budgets VALUES (?, ?, ?, ?)', args: [runId, 'synthesis', 1, 1] },
        // Mastra keys a research snapshot by the public run id or by its own workflow run id.
        { sql: 'INSERT INTO mastra_workflow_snapshot VALUES (?, ?, ?, ?, ?, ?)', args: ['research', `first-${user}`, runId, '{}', iso, iso] },
        { sql: 'INSERT INTO mastra_workflow_snapshot VALUES (?, ?, ?, ?, ?, ?)', args: ['research', `workflow-${user}`, null, '{}', iso, iso] },
      ], 'write');
    }
    return database;
  }

  /** Who still owns rows in each table that can hold user data, as `table: owners`. */
  async function owners(database: AppDatabase): Promise<Record<string, string[]>> {
    const queries: Record<string, string> = {
      mastra_threads: 'SELECT "resourceId" AS owner FROM mastra_threads',
      mastra_messages: `SELECT replace(thread_id, 'thread-', '') AS owner FROM mastra_messages`,
      mastra_thread_state: `SELECT replace("threadId", 'thread-', '') AS owner FROM mastra_thread_state`,
      mastra_observational_memory: 'SELECT "resourceId" AS owner FROM mastra_observational_memory',
      mastra_resources: 'SELECT id AS owner FROM mastra_resources',
      mastra_workflow_snapshot: `SELECT replace(replace(run_id, 'first-', ''), 'workflow-', '') AS owner FROM mastra_workflow_snapshot`,
      feedback: 'SELECT resource_id AS owner FROM feedback',
      answer_audit: 'SELECT resource_id AS owner FROM answer_audit',
      rate_limit_events: 'SELECT user_id AS owner FROM rate_limit_events',
      usage_events: 'SELECT user_id AS owner FROM usage_events',
      research_runs: 'SELECT resource_id AS owner FROM research_runs',
      research_checkpoints: `SELECT replace(run_id, 'run-', '') AS owner FROM research_checkpoints`,
      research_budgets: `SELECT replace(run_id, 'run-', '') AS owner FROM research_budgets`,
    };
    const result: Record<string, string[]> = {};
    for (const [table, sql] of Object.entries(queries)) {
      const rows = (await database.client.execute(sql)).rows.map((row) => String(row.owner));
      result[table] = [...new Set(rows)].sort();
    }
    return result;
  }

  const onlyOwner = (owner: string[]) => Object.fromEntries([
    'mastra_threads', 'mastra_messages', 'mastra_thread_state', 'mastra_observational_memory', 'mastra_resources',
    'mastra_workflow_snapshot', 'feedback', 'answer_audit', 'rate_limit_events', 'usage_events', 'research_runs',
    'research_checkpoints', 'research_budgets',
  ].map((table) => [table, owner]));

  it.each([
    ['the printed operator SQL', (database: AppDatabase) => database.client.executeMultiple(renderUserDataDeletionSql(TARGET))],
    ['deleteUserData', (database: AppDatabase) => database.deleteUserData(TARGET)],
  ])('%s removes one user from every table on the real Mastra schema and leaves the other user', async (_name, run) => {
    const database = await seed();
    expect(await owners(database)).toEqual(onlyOwner([TARGET, OTHER].sort()));

    await run(database);

    expect(await owners(database)).toEqual(onlyOwner([OTHER]));
    // Both of the other user's messages, both snapshots and both summaries survive, not just one of each.
    for (const table of ['mastra_messages', 'mastra_workflow_snapshot', 'mastra_observational_memory']) {
      expect((await database.client.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n).toBe(2);
    }
  });

  it('deletes from every application table that has an owner column, so a new one cannot be left out', async () => {
    const database = await seed();
    const tables = (await database.client.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`)).rows.map((row) => String(row.name));
    const owned: string[] = [];
    for (const table of tables.filter((name) => !name.startsWith('mastra_'))) {
      const columns = (await database.client.execute(`PRAGMA table_info(${table})`)).rows.map((row) => String(row.name));
      if (columns.some((column) => ['resource_id', 'user_id'].includes(column))) owned.push(table);
    }
    expect(owned).toContain('answer_audit');
    const sql = renderUserDataDeletionSql(TARGET);
    for (const table of owned) expect(sql).toContain(`DELETE FROM ${table} WHERE`);
  });

  it('prints one transaction that ends with the success marker and deletes threads last among thread-keyed rows', () => {
    const sql = renderUserDataDeletionSql(TARGET);
    const statements = sql.trim().split('; ');
    expect(statements[0]).toBe('BEGIN IMMEDIATE');
    expect(statements.slice(-2)).toEqual(['COMMIT', `SELECT 'USER_DATA_DELETED';`]);
    const position = (table: string) => statements.findIndex((statement) => statement.startsWith(`DELETE FROM ${table} `));
    for (const table of ['mastra_thread_state', 'mastra_messages', 'mastra_observational_memory']) {
      expect(position(table)).toBeGreaterThan(0);
      expect(position(table)).toBeLessThan(position('mastra_threads'));
    }
    expect(sql).not.toContain('?');
  });

  it('prints SQL that survives the double-quoted remote shell word the runbook wraps it in', () => {
    const sql = renderUserDataDeletionSql(TARGET).trim();
    expect(sql).toMatch(/^[A-Za-z0-9_ '(),;=]+$/);
    expect(execFileSync('sh', ['-c', `printf %s "${sql}"`], { encoding: 'utf8' })).toBe(sql);
  });

  it.each(HOSTILE_IDS)('refuses the id %j without printing SQL', async (id) => {
    expect(() => renderUserDataDeletionSql(id)).toThrow('WorkOS user id');

    const database = await seed();
    await expect((async () => database.client.executeMultiple(renderUserDataDeletionSql(id)))()).rejects.toThrow();
    expect(await owners(database)).toEqual(onlyOwner([TARGET, OTHER].sort()));
  });

  it('exits non-zero with empty output for a hostile id, and prints the same SQL for a valid one', () => {
    const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', SCRIPT, ...args], { encoding: 'utf8' });

    const hostile = run(HOSTILE_IDS[0]);
    expect(hostile.status).toBe(2);
    expect(hostile.stdout).toBe('');
    expect(hostile.stderr).not.toContain('DROP TABLE');

    expect(run().status).toBe(2);
    expect(run(TARGET, OTHER).status).toBe(2);

    const valid = run(TARGET);
    expect(valid.status).toBe(0);
    expect(valid.stdout).toBe(renderUserDataDeletionSql(TARGET));
  });
});
