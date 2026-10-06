-- The crawler registry's table definitions, declared once. The crawler's
-- schema.ts runs this file on every open, followed by its migrations; the
-- pipeline's tests build their registry fixtures from it, and retirement.py
-- takes its source_retirements statements from it. Every statement is
-- idempotent (IF NOT EXISTS) and the file is split on ';', so keep each
-- statement free of semicolons in literals and one table per statement.

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
  consecutive_not_found INTEGER NOT NULL DEFAULT 0,
  -- The most recent failed fetch: when, and 'transient', 'permanent' or
  -- 'not_found'. A transient failure leaves status alone, so these are the
  -- only record of it beside error_message and consecutive_errors.
  last_failure_at TEXT,
  last_failure_kind TEXT
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

-- Index membership is an observation kept beside the registry, never a
-- `documents` column: whole-row registry hashes must not change per run.
-- `source_listings` records the last run in which discovery returned a URL
-- and the tags its index row carried; `source_index_checks` records the last
-- run in which an index page was listed in full. A document is de-listed only
-- when its page has a complete check newer than its own last listing.
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
