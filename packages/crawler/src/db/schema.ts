import type Database from 'better-sqlite3';
import { canonicalizeSourceUrl } from '../identity.js';

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
  removed_at TEXT,

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

CREATE TABLE IF NOT EXISTS source_retirements (
  id INTEGER PRIMARY KEY,
  source_url TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  evidence_json TEXT NOT NULL,
  retired_at TEXT NOT NULL,
  reactivated_at TEXT,
  recovered_hash TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS source_retirements_active
ON source_retirements(source_url) WHERE reactivated_at IS NULL;

CREATE TABLE IF NOT EXISTS source_classifications (
 source_url TEXT PRIMARY KEY, schema_version INTEGER NOT NULL,
 resource_role TEXT NOT NULL CHECK(resource_role IN ('document','index')),
 evidence_json TEXT NOT NULL, classified_at TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS rejected_urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url TEXT NOT NULL,
  source_type TEXT,
  reason TEXT NOT NULL,
  first_rejected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_rejected_at TEXT NOT NULL DEFAULT (datetime('now')),
  occurrences INTEGER NOT NULL DEFAULT 1,
  UNIQUE(source_url, source_type, reason)
);

CREATE INDEX IF NOT EXISTS idx_rejected_urls_last_rejected
  ON rejected_urls(last_rejected_at);

CREATE TABLE IF NOT EXISTS source_freshness (
  source_type TEXT PRIMARY KEY,
  last_successful_discovery_at TEXT,
  last_content_change_at TEXT
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

interface IdentityMigrationRow {
  id: number;
  source_url: string;
  status: string;
  local_path: string | null;
  file_hash: string | null;
  first_seen_at: string;
  last_downloaded_at: string | null;
  last_changed_at: string | null;
}

const ACTIVE_ARTIFACT_STATUSES = new Set([
  'unchanged',
  'updated',
  'downloaded',
]);

function latestArtifactTimestamp(row: IdentityMigrationRow): string {
  return [
    row.last_changed_at,
    row.last_downloaded_at,
  ]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? row.first_seen_at;
}

function artifactScore(row: IdentityMigrationRow): number {
  return Number(Boolean(row.local_path)) + Number(Boolean(row.file_hash));
}

function migrationLifecycleTier(row: IdentityMigrationRow): number {
  if (row.status === 'removed') return 0;
  if (row.local_path) {
    return ACTIVE_ARTIFACT_STATUSES.has(row.status) ? 5 : 4;
  }
  if (ACTIVE_ARTIFACT_STATUSES.has(row.status)) return 3;
  return row.status === 'discovered' ? 2 : 1;
}

function compareMigrationAuthority(
  a: IdentityMigrationRow,
  b: IdentityMigrationRow,
): number {
  const lifecycleDifference =
    migrationLifecycleTier(b) - migrationLifecycleTier(a);
  if (lifecycleDifference !== 0) return lifecycleDifference;

  const aFreshness = latestArtifactTimestamp(a);
  const bFreshness = latestArtifactTimestamp(b);
  if (aFreshness !== bFreshness) {
    return aFreshness < bFreshness ? 1 : -1;
  }

  return artifactScore(b) - artifactScore(a);
}

function artifactFingerprint(row: IdentityMigrationRow): string {
  if (row.file_hash) return `hash:${row.file_hash}`;
  if (row.local_path) return `path:${row.local_path}`;
  return 'no-artifact';
}

function canonicalizeExistingDocumentUrls(db: Database.Database): void {
  const rows = db
    .prepare(`
      SELECT
        id, source_url, status, local_path, file_hash, first_seen_at,
        last_downloaded_at, last_changed_at
      FROM documents
      ORDER BY id
    `)
    .all() as IdentityMigrationRow[];
  const groups = new Map<string, IdentityMigrationRow[]>();

  for (const row of rows) {
    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalizeSourceUrl(row.source_url);
    } catch {
      continue;
    }
    const group = groups.get(canonicalUrl) ?? [];
    group.push(row);
    groups.set(canonicalUrl, group);
  }

  const remove = db.prepare('DELETE FROM documents WHERE id = ?');
  const updateUrl = db.prepare(
    'UPDATE documents SET source_url = ? WHERE id = ?',
  );

  db.transaction(() => {
    for (const [canonicalUrl, group] of groups) {
      const ranked = [...group].sort(
        (a, b) => compareMigrationAuthority(a, b) || a.id - b.id,
      );
      const winner = ranked[0];
      if (!winner) continue;

      const equallyAuthoritative = ranked.filter(
        (row) => compareMigrationAuthority(row, winner) === 0,
      );
      if (
        new Set(equallyAuthoritative.map(artifactFingerprint)).size > 1
      ) {
        throw new Error(
          `ambiguous canonical registry artifacts for ${canonicalUrl}`,
        );
      }

      for (const row of group) {
        if (row.id !== winner.id) remove.run(row.id);
      }
      if (winner.source_url !== canonicalUrl) {
        updateUrl.run(canonicalUrl, winner.id);
      }
    }
  })();
}

// parseSpaNumber once stored "YY-NNNN" or "NC-YY-NNNN" when the link text
// lacked the "SPA" prefix. Rows no longer listed on the site are never
// rediscovered, so reshape them here; rediscovered rows heal through the upsert.
function canonicalizeSpaNumbers(db: Database.Database): void {
  db.exec(`
    UPDATE documents
    SET policy_number = 'SPA ' || substr(policy_number, -7)
    WHERE source_type = 'state_plan_amendment'
      AND (
        policy_number GLOB '[0-9][0-9]-[0-9][0-9][0-9][0-9]'
        OR policy_number GLOB 'NC[0-9][0-9]-[0-9][0-9][0-9][0-9]'
        OR policy_number GLOB 'NC-[0-9][0-9]-[0-9][0-9][0-9][0-9]'
      )
  `);
}

/**
 * Index membership is an observation kept beside the registry, never a
 * `documents` column: whole-row registry hashes must not change per run.
 * `source_listings` records the last run in which discovery returned a URL
 * and the tags its index row carried; `source_index_checks` records the last
 * run in which an index page was listed in full. A document is de-listed only
 * when its page has a complete check newer than its own last listing.
 */
function ensureSourceListings(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_listings (
      source_url TEXT PRIMARY KEY,
      index_url TEXT NOT NULL,
      last_listed_at TEXT NOT NULL,
      last_listed_run_id INTEGER NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS source_index_checks (
      index_url TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      last_complete_at TEXT NOT NULL,
      last_complete_run_id INTEGER NOT NULL
    );
  `);
}

export function initializeSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  // Registries created before the column existed get it added in place so the
  // crawled corpus doesn't have to be rebuilt.
  ensureColumn(db, 'documents', 'consecutive_not_found', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'documents', 'removed_at', 'TEXT');
  canonicalizeExistingDocumentUrls(db);
  canonicalizeSpaNumbers(db);
  ensureSourceListings(db);
}
