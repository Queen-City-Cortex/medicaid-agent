import { readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { canonicalizeSourceUrl } from '../identity.js';

// The table definitions live in schema.sql beside this file so the pipeline's
// Python tests and retirement writer read the same declarations. The crawler
// build copies the file into dist/db (see package.json).
const SCHEMA_SQL = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

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

export function initializeSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  // Registries created before the column existed get it added in place so the
  // crawled corpus doesn't have to be rebuilt.
  ensureColumn(db, 'documents', 'consecutive_not_found', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'documents', 'removed_at', 'TEXT');
  ensureColumn(db, 'documents', 'last_failure_at', 'TEXT');
  ensureColumn(db, 'documents', 'last_failure_kind', 'TEXT');
  canonicalizeExistingDocumentUrls(db);
  canonicalizeSpaNumbers(db);
}
