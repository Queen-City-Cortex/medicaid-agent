import { createClient, type Client, type InStatement } from '@libsql/client';

interface RetentionPolicy {
  conversationsDays: number;
  feedbackDays: number;
  usageDays: number;
  rateLimitHours: number;
}

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
];

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

  async runRetention(policy: RetentionPolicy, now = Date.now()): Promise<void> {
    await this.migrate();
    const conversationCutoff = new Date(now - policy.conversationsDays * 86_400_000).toISOString();
    const feedbackCutoff = new Date(now - policy.feedbackDays * 86_400_000).toISOString();
    const usageCutoff = now - policy.usageDays * 86_400_000;
    const rateLimitCutoff = now - policy.rateLimitHours * 3_600_000;

    const statements: InStatement[] = [
      { sql: 'DELETE FROM feedback WHERE created_at < ?', args: [feedbackCutoff] },
      { sql: 'DELETE FROM usage_events WHERE created_at < ?', args: [usageCutoff] },
      { sql: 'DELETE FROM rate_limit_events WHERE created_at < ?', args: [rateLimitCutoff] },
      { sql: 'DELETE FROM research_runs WHERE updated_at < ?', args: [conversationCutoff] },
    ];

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
      statements.push({
        sql: 'DELETE FROM mastra_threads WHERE "updatedAt" < ?',
        args: [conversationCutoff],
      });
    }

    await this.client.batch(statements, 'write');
  }

  async deleteUserData(resourceId: string): Promise<void> {
    await this.migrate();
    const statements: InStatement[] = [
      { sql: 'DELETE FROM feedback WHERE resource_id = ?', args: [resourceId] },
      { sql: 'DELETE FROM rate_limit_events WHERE user_id = ?', args: [resourceId] },
      { sql: 'DELETE FROM usage_events WHERE user_id = ?', args: [resourceId] },
      { sql: 'DELETE FROM research_runs WHERE resource_id = ?', args: [resourceId] },
    ];

    if (await this.hasTable('mastra_threads')) {
      if (await this.hasTable('mastra_thread_state')) {
        statements.push({
          sql: `DELETE FROM mastra_thread_state WHERE "threadId" IN
                (SELECT id FROM mastra_threads WHERE "resourceId" = ?)`,
          args: [resourceId],
        });
      }
      if (await this.hasTable('mastra_messages')) {
        statements.push({ sql: 'DELETE FROM mastra_messages WHERE "resourceId" = ?', args: [resourceId] });
      }
      statements.push({ sql: 'DELETE FROM mastra_threads WHERE "resourceId" = ?', args: [resourceId] });
    }
    if (await this.hasTable('mastra_observational_memory')) {
      statements.push({
        sql: 'DELETE FROM mastra_observational_memory WHERE "resourceId" = ?',
        args: [resourceId],
      });
    }
    if (await this.hasTable('mastra_resources')) {
      statements.push({ sql: 'DELETE FROM mastra_resources WHERE id = ?', args: [resourceId] });
    }

    await this.client.batch(statements, 'write');
  }

  close(): void {
    this.client.close();
  }
}
