import { createClient, type Client, type InStatement } from '@libsql/client';
import {
  CONVERSATION_RETENTION_DAYS,
  FEEDBACK_RETENTION_DAYS,
  RATE_LIMIT_RETENTION_HOURS,
  USAGE_RETENTION_DAYS,
} from '@nc-medicaid/contracts';

const MIGRATIONS: ReadonlyArray<{ version: number; statements: string[] }> = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS _healthz_probe (
        id INTEGER PRIMARY KEY,
        checked_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
        comment TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (message_id, resource_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_feedback_resource_thread
       ON feedback (resource_id, thread_id)`,
      `CREATE TABLE IF NOT EXISTS rate_limit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        route TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_rate_limit_user_time
       ON rate_limit_events (user_id, created_at)`,
      `CREATE TABLE IF NOT EXISTS usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        route TEXT NOT NULL,
        run_id TEXT,
        thread_id TEXT,
        model_id TEXT NOT NULL,
        provider TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        total_tokens INTEGER,
        reasoning_tokens INTEGER,
        cached_input_tokens INTEGER,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_usage_time ON usage_events (created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_usage_user_time ON usage_events (user_id, created_at)`,
    ],
  },
  {
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS research_runs (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        state TEXT NOT NULL,
        question TEXT NOT NULL,
        plan_json TEXT,
        report_json TEXT,
        error TEXT,
        workflow_run_id TEXT,
        lease_owner TEXT,
        lease_expires_at INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_research_resource_state
       ON research_runs (resource_id, state)`,
      `CREATE INDEX IF NOT EXISTS idx_research_lease
       ON research_runs (state, lease_expires_at)`,
    ],
  },
  {
    version: 3,
    statements: [
      'ALTER TABLE usage_events ADD COLUMN phase TEXT',
      'ALTER TABLE usage_events ADD COLUMN estimated_cost_usd REAL',
    ],
  },
  {
    version: 4,
    statements: [
      `CREATE INDEX IF NOT EXISTS idx_research_resource_created
       ON research_runs (resource_id, created_at)`,
    ],
  },
  {
    version: 5,
    statements: [
      `CREATE TABLE IF NOT EXISTS answer_release_keys (id INTEGER PRIMARY KEY CHECK(id = 1), secret TEXT NOT NULL)`,
      `INSERT OR IGNORE INTO answer_release_keys (id, secret) VALUES (1, lower(hex(randomblob(32))))`,
    ],
  },
  {
    version: 6,
    statements: [
      'ALTER TABLE research_runs ADD COLUMN approval_json TEXT',
      'ALTER TABLE research_runs ADD COLUMN limits_json TEXT',
      'ALTER TABLE research_runs ADD COLUMN corpus_release TEXT',
      'ALTER TABLE research_runs ADD COLUMN checkpoint_version INTEGER NOT NULL DEFAULT 1',
      'ALTER TABLE research_runs ADD COLUMN recovery_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE research_runs ADD COLUMN next_retry_at INTEGER',
      'ALTER TABLE research_runs ADD COLUMN verification_json TEXT',
      'ALTER TABLE research_runs ADD COLUMN sources_json TEXT',
      `CREATE TABLE research_checkpoints (run_id TEXT NOT NULL, key TEXT NOT NULL, value_json TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(run_id, key))`,
      `CREATE TABLE research_budgets (run_id TEXT NOT NULL, key TEXT NOT NULL, used INTEGER NOT NULL, limit_value INTEGER NOT NULL, PRIMARY KEY(run_id, key))`,
    ],
  },
  {
    // The service-wide run ceiling and the retention delete filter on time alone.
    version: 7,
    statements: [
      `CREATE INDEX IF NOT EXISTS idx_rate_limit_time ON rate_limit_events (created_at)`,
    ],
  },
];

const USER_THREADS = 'SELECT id FROM mastra_threads WHERE resourceId = ?';
const USER_RESEARCH_RUNS = 'SELECT id FROM research_runs WHERE resource_id = ?';

/**
 * Every statement that removes one user's data, in execution order. Each `?` binds the user id.
 * Rows found through another table are deleted before the rows that identify them: snapshots,
 * checkpoints and budgets before research runs; thread state, messages and summaries before threads.
 * `mastraTables` are the Mastra-owned tables a statement reads, which a store may not have created.
 *
 * The operator command passes these statements inside a double-quoted shell word (see
 * renderUserDataDeletionSql), so they use bare identifiers and no double quotes.
 */
const USER_DATA_DELETIONS: ReadonlyArray<{ sql: string; mastraTables: string[] }> = [
  {
    sql: `DELETE FROM mastra_workflow_snapshot WHERE resourceId IN (${USER_RESEARCH_RUNS})
          OR run_id IN (SELECT workflow_run_id FROM research_runs WHERE resource_id = ?)`,
    mastraTables: ['mastra_workflow_snapshot'],
  },
  { sql: 'DELETE FROM feedback WHERE resource_id = ?', mastraTables: [] },
  { sql: 'DELETE FROM rate_limit_events WHERE user_id = ?', mastraTables: [] },
  { sql: 'DELETE FROM usage_events WHERE user_id = ?', mastraTables: [] },
  { sql: `DELETE FROM research_checkpoints WHERE run_id IN (${USER_RESEARCH_RUNS})`, mastraTables: [] },
  { sql: `DELETE FROM research_budgets WHERE run_id IN (${USER_RESEARCH_RUNS})`, mastraTables: [] },
  { sql: 'DELETE FROM research_runs WHERE resource_id = ?', mastraTables: [] },
  {
    sql: `DELETE FROM mastra_thread_state WHERE threadId IN (${USER_THREADS})`,
    mastraTables: ['mastra_thread_state', 'mastra_threads'],
  },
  // Messages and summaries are matched by owner and through the user's threads, so a row saved without an owner goes too.
  {
    sql: `DELETE FROM mastra_messages WHERE resourceId = ? OR thread_id IN (${USER_THREADS})`,
    mastraTables: ['mastra_messages', 'mastra_threads'],
  },
  {
    sql: `DELETE FROM mastra_observational_memory WHERE resourceId = ? OR threadId IN (${USER_THREADS})`,
    mastraTables: ['mastra_observational_memory', 'mastra_threads'],
  },
  { sql: 'DELETE FROM mastra_threads WHERE resourceId = ?', mastraTables: ['mastra_threads'] },
  { sql: 'DELETE FROM mastra_resources WHERE id = ?', mastraTables: ['mastra_resources'] },
];

function userDataDeletionStatements(
  resourceId: string,
  hasMastraTable: (table: string) => boolean,
): Array<{ sql: string; args: string[] }> {
  return USER_DATA_DELETIONS
    .filter((deletion) => deletion.mastraTables.every(hasMastraTable))
    .map(({ sql }) => ({ sql, args: Array<string>(sql.split('?').length - 1).fill(resourceId) }));
}

// WorkOS user ids are `user_` plus a 26-character ULID (Crockford base32, upper case).
const WORKOS_USER_ID = /^user_[0-9A-HJKMNP-TV-Z]{26}$/;
// Printed SQL may hold only these characters, none of which a double-quoted shell word interprets.
const SHELL_INERT_SQL = /^[A-Za-z0-9_ '(),;=]+$/;

/**
 * The statements deleteUserData runs, as one line of SQL for `sqlite3` on the production volume,
 * where every Mastra table exists. A failed statement leaves the transaction uncommitted (run
 * sqlite3 with -bail); the final SELECT prints USER_DATA_DELETED only after the commit.
 *
 * The id is inlined as a literal, so it must be a WorkOS user id and nothing else.
 */
export function renderUserDataDeletionSql(userId: string): string {
  if (!WORKOS_USER_ID.test(userId)) {
    throw new Error('Expected a WorkOS user id: user_ followed by 26 upper-case letters and digits.');
  }
  const deletions = userDataDeletionStatements(userId, () => true)
    .map(({ sql }) => sql.replaceAll('?', `'${userId}'`).replace(/\s+/g, ' '));
  const sql = ['BEGIN IMMEDIATE', ...deletions, 'COMMIT', `SELECT 'USER_DATA_DELETED';`].join('; ');
  if (!SHELL_INERT_SQL.test(sql)) {
    throw new Error('A user data deletion statement contains a character the operator command cannot quote.');
  }
  return `${sql}\n`;
}

export class AppDatabase {
  readonly client: Client;
  private migrated = false;
  private migrationPromise: Promise<void> | null = null;

  constructor(urlOrClient: string | Client) {
    this.client = typeof urlOrClient === 'string' ? createClient({ url: urlOrClient }) : urlOrClient;
  }

  async migrate(): Promise<void> {
    if (this.migrated) return;
    if (this.migrationPromise) return this.migrationPromise;
    this.migrationPromise = this.runMigrations();
    try {
      await this.migrationPromise;
      this.migrated = true;
    } finally {
      this.migrationPromise = null;
    }
  }

  private async runMigrations(): Promise<void> {
    await this.client.execute(`CREATE TABLE IF NOT EXISTS _app_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`);
    const applied = await this.client.execute('SELECT version FROM _app_migrations');
    const versions = new Set(applied.rows.map((row) => Number(row.version)));
    for (const migration of MIGRATIONS) {
      if (versions.has(migration.version)) continue;
      const pendingStatements: string[] = [];
      for (const statement of migration.statements) {
        const addColumn = statement.match(
          /^\s*ALTER\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s+ADD\s+COLUMN\s+([A-Za-z_][A-Za-z0-9_]*)\b/i,
        );
        if (addColumn && await this.hasColumn(addColumn[1], addColumn[2])) continue;
        pendingStatements.push(statement);
      }
      const statements: InStatement[] = [
        ...pendingStatements,
        {
          sql: 'INSERT INTO _app_migrations (version, applied_at) VALUES (?, ?)',
          args: [migration.version, new Date().toISOString()],
        },
      ];
      await this.client.batch(statements, 'write');
    }
  }

  private async hasColumn(table: string, column: string): Promise<boolean> {
    const result = await this.client.execute(`PRAGMA table_info(${table})`);
    return result.rows.some((row) => row.name === column);
  }

  async probeWritable(): Promise<boolean> {
    try {
      await this.migrate();
      await this.client.execute({
        sql: `INSERT INTO _healthz_probe (id, checked_at) VALUES (1, ?)
              ON CONFLICT(id) DO UPDATE SET checked_at = excluded.checked_at`,
        args: [new Date().toISOString()],
      });
      return true;
    } catch {
      this.migrated = false;
      return false;
    }
  }

  private async hasTable(name: string): Promise<boolean> {
    const result = await this.client.execute({
      sql: `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
      args: [name],
    });
    return result.rows.length > 0;
  }

  async runRetention(now = Date.now()): Promise<void> {
    await this.migrate();
    const conversationCutoff = new Date(now - CONVERSATION_RETENTION_DAYS * 86_400_000).toISOString();
    const feedbackCutoff = new Date(now - FEEDBACK_RETENTION_DAYS * 86_400_000).toISOString();
    const usageCutoff = now - USAGE_RETENTION_DAYS * 86_400_000;
    const rateLimitCutoff = now - RATE_LIMIT_RETENTION_HOURS * 3_600_000;

    const statements: InStatement[] = [
      { sql: 'DELETE FROM feedback WHERE created_at < ?', args: [feedbackCutoff] },
      { sql: 'DELETE FROM usage_events WHERE created_at < ?', args: [usageCutoff] },
      { sql: 'DELETE FROM rate_limit_events WHERE created_at < ?', args: [rateLimitCutoff] },
      ...['research_checkpoints', 'research_budgets'].map(table => ({ sql: `DELETE FROM ${table} WHERE run_id IN (SELECT id FROM research_runs WHERE updated_at < ?)`, args: [conversationCutoff] })),
      { sql: 'DELETE FROM research_runs WHERE updated_at < ?', args: [conversationCutoff] },
    ];
    if (await this.hasTable('mastra_workflow_snapshot')) {
      statements.unshift({
        sql: `DELETE FROM mastra_workflow_snapshot WHERE "resourceId" IN
          (SELECT id FROM research_runs WHERE updated_at < ?)
          OR run_id IN (SELECT workflow_run_id FROM research_runs WHERE updated_at < ?)`,
        args: [conversationCutoff, conversationCutoff],
      });
    }

    if (await this.hasTable('mastra_threads')) {
      statements.push(
        {
          sql: `DELETE FROM feedback WHERE thread_id IN
                (SELECT id FROM mastra_threads WHERE "updatedAt" < ?)`,
          args: [conversationCutoff],
        },
      );
      if (await this.hasTable('mastra_thread_state')) {
        statements.push({
          sql: `DELETE FROM mastra_thread_state WHERE "threadId" IN
                (SELECT id FROM mastra_threads WHERE "updatedAt" < ?)`,
          args: [conversationCutoff],
        });
      }
      if (await this.hasTable('mastra_messages')) {
        statements.push({
          sql: `DELETE FROM mastra_messages WHERE thread_id IN
                (SELECT id FROM mastra_threads WHERE "updatedAt" < ?)`,
          args: [conversationCutoff],
        });
      }
      // Thread-scoped summaries go with their thread. Resource-scoped rows have a null threadId and are left alone.
      const hasObservationalMemory = await this.hasTable('mastra_observational_memory');
      if (hasObservationalMemory) {
        statements.push({
          sql: `DELETE FROM mastra_observational_memory WHERE "threadId" IN
                (SELECT id FROM mastra_threads WHERE "updatedAt" < ?)`,
          args: [conversationCutoff],
        });
      }
      statements.push({
        sql: 'DELETE FROM mastra_threads WHERE "updatedAt" < ?',
        args: [conversationCutoff],
      });
      if (hasObservationalMemory) {
        // Rows orphaned earlier. The age guard spares a first turn whose thread row is not saved yet.
        statements.push({
          sql: `DELETE FROM mastra_observational_memory WHERE "threadId" IS NOT NULL AND "updatedAt" < ?
                AND "threadId" NOT IN (SELECT id FROM mastra_threads)`,
          args: [conversationCutoff],
        });
      }
    }

    await this.client.batch(statements, 'write');
  }

  async deleteUserData(resourceId: string): Promise<void> {
    await this.migrate();
    const present = new Set<string>();
    for (const table of new Set(USER_DATA_DELETIONS.flatMap((deletion) => deletion.mastraTables))) {
      if (await this.hasTable(table)) present.add(table);
    }
    await this.client.batch(userDataDeletionStatements(resourceId, (table) => present.has(table)), 'write');
  }

  close(): void {
    this.client.close();
  }
}
