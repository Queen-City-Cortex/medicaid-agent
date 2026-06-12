import type Database from 'better-sqlite3';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Identity
  source_url TEXT NOT NULL UNIQUE,
  discovered_from TEXT NOT NULL,
  source_type TEXT NOT NULL,

  -- Metadata from index page
  title TEXT,
  policy_number TEXT,
  category TEXT,

  -- Download state
  local_path TEXT,
  file_hash TEXT,
  file_size INTEGER,
  mime_type TEXT,
  detected_content_type TEXT,
  content_disposition_filename TEXT,

  -- HTTP caching headers
  etag TEXT,
  last_modified TEXT,

  -- Timestamps
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_checked_at TEXT,
  last_downloaded_at TEXT,
  last_changed_at TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'discovered',
  error_message TEXT,
  download_attempts INTEGER DEFAULT 0,
  consecutive_errors INTEGER DEFAULT 0,
  consecutive_not_found INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents(source_type);
CREATE INDEX IF NOT EXISTS idx_documents_last_checked ON documents(last_checked_at);
CREATE INDEX IF NOT EXISTS idx_documents_policy_number ON documents(policy_number);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  source_types TEXT,
  documents_discovered INTEGER DEFAULT 0,
  documents_downloaded INTEGER DEFAULT 0,
  documents_unchanged INTEGER DEFAULT 0,
  documents_updated INTEGER DEFAULT 0,
  documents_errored INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running'
);
`;

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db
    .pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function initializeSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  // Registries created before the column existed get it added in place so the
  // crawled corpus doesn't have to be rebuilt.
  ensureColumn(db, 'documents', 'consecutive_not_found', 'INTEGER NOT NULL DEFAULT 0');
}
