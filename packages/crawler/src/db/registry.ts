import type Database from 'better-sqlite3';
import type { DiscoveredDocument } from '../sources/types.js';
import { canonicalizeSourceUrl } from '../identity.js';
import { logger } from '../utils/logger.js';

export interface DocumentRecord {
  id: number;
  source_url: string;
  discovered_from: string;
  source_type: string;
  title: string | null;
  policy_number: string | null;
  category: string | null;
  local_path: string | null;
  file_hash: string | null;
  file_size: number | null;
  mime_type: string | null;
  detected_content_type: string | null;
  content_disposition_filename: string | null;
  etag: string | null;
  last_modified: string | null;
  first_seen_at: string;
  last_checked_at: string | null;
  last_downloaded_at: string | null;
  last_changed_at: string | null;
  removed_at: string | null;
  status: string;
  error_message: string | null;
  download_attempts: number;
  consecutive_errors: number;
  consecutive_not_found: number;
  last_failure_at: string | null;
  last_failure_kind: FailureKind | null;
}

/** 'transient' said nothing about the document (see `recordTransientFailure`);
 *  'not_found' is a 404, on the removal streak unless the row is a manifest
 *  seed (then `consecutive_not_found` stays 0); 'permanent' is any other failure. */
export type FailureKind = 'transient' | 'permanent' | 'not_found';

export interface DownloadedInfo {
  local_path: string;
  file_hash: string;
  file_size: number;
  mime_type: string | null;
  detected_content_type: string | null;
  content_disposition_filename: string | null;
  etag: string | null;
  last_modified: string | null;
}

export interface CrawlRunStats {
  documents_discovered: number;
  documents_downloaded: number;
  documents_unchanged: number;
  documents_updated: number;
  documents_errored: number;
}

export interface StatRow {
  source_type: string;
  status: string;
  count: number;
}

export interface RejectedUrlRecord {
  id: number;
  source_url: string;
  source_type: string | null;
  reason: string;
  first_rejected_at: string;
  last_rejected_at: string;
  occurrences: number;
}

export interface SourceFreshnessRecord {
  source_type: string;
  last_successful_discovery_at: string | null;
  last_content_change_at: string | null;
}

export interface SourceListingRecord {
  source_url: string;
  index_url: string;
  last_listed_at: string;
  last_listed_run_id: number;
  /** JSON array of the index row's tag slugs. */
  tags: string;
}

export interface DocumentRegistry {
  upsertDiscovered(doc: DiscoveredDocument): number;
  /**
   * Record that this run's discovery returned the document. Presence is
   * evidence whatever the family's outcome; tags are overwritten so one the
   * agency removes is cleared.
   */
  recordListing(runId: number, doc: DiscoveredDocument): void;
  getListing(url: string): SourceListingRecord | null;
  getByUrl(url: string): DocumentRecord | null;
  getById(id: number): DocumentRecord | null;
  updateDownloaded(id: number, info: DownloadedInfo): void;
  updateChanged(id: number, info: DownloadedInfo): void;
  markUnchanged(id: number): void;
  /** Set status='error'. `kind` is 'transient' when a streak of transient
   *  failures reached the threshold; the payload fields stay. */
  markError(id: number, message: string, kind?: FailureKind): void;
  /**
   * Record a failure that said nothing about the document: a network, DNS or
   * timeout error, a 5xx or a 429. The status, the stored payload fields and
   * `last_checked_at` stay as the last completed check left them, so a loaded
   * row's retrieved_at is still the time its payload was confirmed; the
   * failure is kept in `last_failure_at`, `error_message` and the
   * consecutive-error count. The caller decides when a streak becomes `error`.
   */
  recordTransientFailure(id: number, message: string): void;
  /**
   * Record a 404 for the document. Sets status='error' (so it retries) and
   * increments the consecutive-404 streak. Returns the new streak length so
   * the caller can decide when to mark the document removed.
   */
  recordNotFound(id: number, message: string): number;
  markRemoved(id: number): void;
  recordRejectedUrl(
    url: string,
    sourceType: string | null,
    reason: string,
  ): void;
  getRejectedUrls(): RejectedUrlRecord[];
  getSourceFreshness(): SourceFreshnessRecord[];
  getDocumentsToCheck(sourceType?: string): DocumentRecord[];
  getDocumentsToDownload(sourceType?: string): DocumentRecord[];
  getBySourceType(sourceType: string): DocumentRecord[];
  getByStatus(status: string): DocumentRecord[];
  getStats(): StatRow[];
  getAllDocuments(): DocumentRecord[];
  startCrawlRun(sourceTypes: string[]): number;
  /**
   * `completeListingSourceTypes` are the families whose index pages this run
   * listed in full (discovery passed with family minimums enforced). Only
   * those pages are stamped as checked, so only they can show a document as
   * absent; a failed, partial or dry run proves nothing about absence.
   */
  completeCrawlRun(
    runId: number,
    stats: CrawlRunStats,
    successfulSourceTypes: string[],
    completeListingSourceTypes: string[],
  ): void;
  failCrawlRun(runId: number): void;
}

export function createRegistry(db: Database.Database): DocumentRegistry {
  // Validation-only commands must also work against pre-classification snapshots.
  const hasClassifications = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE name='source_classifications'").get());
  const documentFilter = hasClassifications ? "AND NOT EXISTS (SELECT 1 FROM source_classifications c WHERE c.source_url=documents.source_url AND c.resource_role='index')" : '';
  // Prepare statements
  const insertStmt = db.prepare(`
    INSERT INTO documents (source_url, discovered_from, source_type, title, policy_number, category)
    VALUES (@source_url, @discovered_from, @source_type, @title, @policy_number, @category)
    ON CONFLICT(source_url) DO UPDATE SET
      title = COALESCE(@title, title),
      policy_number = COALESCE(@policy_number, policy_number),
      category = COALESCE(@category, category)
  `);

  const getByUrlStmt = db.prepare(
    'SELECT * FROM documents WHERE source_url = ?',
  );

  const getByIdStmt = db.prepare('SELECT * FROM documents WHERE id = ?');

  const updateDownloadedStmt = db.prepare(`
    UPDATE documents SET
      local_path = @local_path,
      file_hash = @file_hash,
      file_size = @file_size,
      mime_type = @mime_type,
      detected_content_type = @detected_content_type,
      content_disposition_filename = @content_disposition_filename,
      etag = @etag,
      last_modified = @last_modified,
      last_checked_at = datetime('now'),
      last_downloaded_at = datetime('now'),
      last_changed_at = datetime('now'),
      status = 'downloaded',
      download_attempts = download_attempts + 1,
      consecutive_errors = 0,
      consecutive_not_found = 0,
      error_message = NULL,
      last_failure_at = NULL,
      last_failure_kind = NULL
    WHERE id = @id
  `);

  const updateChangedStmt = db.prepare(`
    UPDATE documents SET
      local_path = @local_path,
      file_hash = @file_hash,
      file_size = @file_size,
      mime_type = @mime_type,
      detected_content_type = @detected_content_type,
      content_disposition_filename = @content_disposition_filename,
      etag = @etag,
      last_modified = @last_modified,
      last_checked_at = datetime('now'),
      last_downloaded_at = datetime('now'),
      last_changed_at = datetime('now'),
      status = 'updated',
      download_attempts = download_attempts + 1,
      consecutive_errors = 0,
      consecutive_not_found = 0,
      error_message = NULL,
      last_failure_at = NULL,
      last_failure_kind = NULL
    WHERE id = @id
  `);

  const markUnchangedStmt = db.prepare(`
    UPDATE documents SET
      last_checked_at = datetime('now'),
      status = 'unchanged',
      consecutive_errors = 0,
      consecutive_not_found = 0,
      error_message = NULL,
      last_failure_at = NULL,
      last_failure_kind = NULL
    WHERE id = ?
  `);

  const markErrorStmt = db.prepare(`
    UPDATE documents SET
      last_checked_at = datetime('now'),
      status = 'error',
      error_message = @message,
      download_attempts = download_attempts + 1,
      consecutive_errors = consecutive_errors + 1,
      consecutive_not_found = 0,
      last_failure_at = datetime('now'),
      last_failure_kind = @kind
    WHERE id = @id
  `);

  // Status, payload fields and last_checked_at are deliberately absent.
  const recordTransientFailureStmt = db.prepare(`
    UPDATE documents SET
      error_message = @message,
      download_attempts = download_attempts + 1,
      consecutive_errors = consecutive_errors + 1,
      consecutive_not_found = 0,
      last_failure_at = datetime('now'),
      last_failure_kind = 'transient'
    WHERE id = @id
  `);

  // A 404 is recorded separately so the consecutive-404 streak only grows on
  // genuine not-found responses; any other outcome resets it.
  const recordNotFoundStmt = db.prepare(`
    UPDATE documents SET
      last_checked_at = datetime('now'),
      status = 'error',
      error_message = @message,
      download_attempts = download_attempts + 1,
      consecutive_errors = consecutive_errors + 1,
      consecutive_not_found = consecutive_not_found + 1,
      last_failure_at = datetime('now'),
      last_failure_kind = 'not_found'
    WHERE id = @id
  `);

  const markRemovedStmt = db.prepare(`
    UPDATE documents SET
      last_checked_at = datetime('now'),
      status = 'removed',
      removed_at = datetime('now')
    WHERE id = ?
  `);

  const recordRejectedUrlStmt = db.prepare(`
    INSERT INTO rejected_urls (source_url, source_type, reason)
    VALUES (@source_url, @source_type, @reason)
    ON CONFLICT(source_url, source_type, reason) DO UPDATE SET
      last_rejected_at = datetime('now'),
      occurrences = occurrences + 1
  `);

  const getRejectedUrlsStmt = db.prepare(`
    SELECT *
    FROM rejected_urls
    ORDER BY last_rejected_at DESC, id DESC
  `);

  const getSourceFreshnessStmt = db.prepare(`
    SELECT *
    FROM source_freshness
    ORDER BY source_type
  `);

  // 'error' is included so transient failures self-heal on the next run
  // instead of stranding the document forever. Only 'removed' (confirmed gone
  // after repeated 404s) and 'discovered' (handled by the download phase) are
  // excluded.
  const getToCheckStmt = db.prepare(`
    SELECT * FROM documents
    WHERE status IN ('downloaded', 'updated', 'unchanged', 'error')
      ${documentFilter}
    ORDER BY last_checked_at ASC NULLS FIRST
  `);

  const getToCheckBySourceStmt = db.prepare(`
    SELECT * FROM documents
    WHERE status IN ('downloaded', 'updated', 'unchanged', 'error')
      ${documentFilter}
      AND source_type = ?
    ORDER BY last_checked_at ASC NULLS FIRST
  `);

  const getToDownloadStmt = db.prepare(`
    SELECT * FROM documents
    WHERE status = 'discovered' ${documentFilter}
    ORDER BY first_seen_at ASC
  `);

  const getToDownloadBySourceStmt = db.prepare(`
    SELECT * FROM documents
    WHERE status = 'discovered' ${documentFilter} AND source_type = ?
    ORDER BY first_seen_at ASC
  `);

  const getBySourceTypeStmt = db.prepare(
    'SELECT * FROM documents WHERE source_type = ?',
  );

  const getByStatusStmt = db.prepare(
    'SELECT * FROM documents WHERE status = ?',
  );

  const getStatsStmt = db.prepare(`
    SELECT source_type, status, COUNT(*) as count
    FROM documents
    GROUP BY source_type, status
    ORDER BY source_type, status
  `);

  const getAllStmt = db.prepare('SELECT * FROM documents ORDER BY id');

  const startRunStmt = db.prepare(`
    INSERT INTO crawl_runs (source_types) VALUES (?)
  `);

  const completeRunStmt = db.prepare(`
    UPDATE crawl_runs SET
      completed_at = datetime('now'),
      documents_discovered = @documents_discovered,
      documents_downloaded = @documents_downloaded,
      documents_unchanged = @documents_unchanged,
      documents_updated = @documents_updated,
      documents_errored = @documents_errored,
      status = 'completed'
    WHERE id = @id
  `);

  const failRunStmt = db.prepare(`
    UPDATE crawl_runs SET
      completed_at = datetime('now'),
      status = 'failed'
    WHERE id = ?
  `);

  const updateSourceFreshnessStmt = db.prepare(`
    INSERT INTO source_freshness (
      source_type,
      last_successful_discovery_at,
      last_content_change_at
    )
    VALUES (
      @source_type,
      datetime('now'),
      (
        SELECT max(last_changed_at)
        FROM documents
        WHERE source_type = @source_type
      )
    )
    ON CONFLICT(source_type) DO UPDATE SET
      last_successful_discovery_at = datetime('now'),
      last_content_change_at = COALESCE(
        (
          SELECT max(last_changed_at)
          FROM documents
          WHERE source_type = @source_type
        ),
        source_freshness.last_content_change_at
      )
  `);

  // Prepared on first use: `reactivate` opens registries without running the
  // schema migration, so the listing tables may not exist there.
  let listingStatements: {
    upsert: Database.Statement;
    get: Database.Statement;
    stampChecks: Database.Statement;
  } | null = null;
  function listings() {
    listingStatements ??= {
      upsert: db.prepare(`
        INSERT INTO source_listings (
          source_url, index_url, last_listed_at, last_listed_run_id, tags
        )
        VALUES (@source_url, @index_url, datetime('now'), @run_id, @tags)
        ON CONFLICT(source_url) DO UPDATE SET
          index_url = @index_url,
          last_listed_at = datetime('now'),
          last_listed_run_id = @run_id,
          tags = @tags
      `),
      get: db.prepare('SELECT * FROM source_listings WHERE source_url = ?'),
      // Every index page that listed at least one of the family's documents
      // in this run. A page that listed nothing is not stamped.
      stampChecks: db.prepare(`
        INSERT INTO source_index_checks (
          index_url, source_type, last_complete_at, last_complete_run_id
        )
        SELECT DISTINCT l.index_url, d.source_type, datetime('now'), @run_id
        FROM source_listings l
        JOIN documents d ON d.source_url = l.source_url
        WHERE l.last_listed_run_id = @run_id AND d.source_type = @source_type
        ON CONFLICT(index_url) DO UPDATE SET
          source_type = excluded.source_type,
          last_complete_at = excluded.last_complete_at,
          last_complete_run_id = excluded.last_complete_run_id
      `),
    };
    return listingStatements;
  }

  // Wrap a registry write so a SQLite failure (locked db, disk full, constraint
  // violation) is attributable to its operation and document instead of crashing
  // the sync phase with no signal about which write failed. Re-throws — behavior
  // is unchanged; the failure is now just visible.
  function runWrite<T>(op: string, id: number | null, fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      // Prefer the stack so a SQLite failure is debuggable; the data goes to the
      // crawler log file, not the console line.
      logger.error('registry write failed', {
        op,
        id,
        error: err instanceof Error ? (err.stack ?? err.message) : String(err),
      });
      throw err;
    }
  }

  return {
    upsertDiscovered(doc: DiscoveredDocument): number {
      const canonicalDoc = {
        ...doc,
        source_url: canonicalizeSourceUrl(doc.source_url),
      };
      runWrite('upsertDiscovered', null, () => insertStmt.run(canonicalDoc));
      const row = getByUrlStmt.get(canonicalDoc.source_url) as DocumentRecord;
      return row.id;
    },

    recordListing(runId: number, doc: DiscoveredDocument): void {
      runWrite('recordListing', null, () =>
        listings().upsert.run({
          source_url: canonicalizeSourceUrl(doc.source_url),
          index_url: doc.discovered_from,
          run_id: runId,
          tags: JSON.stringify([...new Set(doc.doc_tags ?? [])].sort()),
        }),
      );
    },

    getListing(url: string): SourceListingRecord | null {
      return (
        (listings().get.get(canonicalizeSourceUrl(url)) as SourceListingRecord) ??
        null
      );
    },

    getByUrl(url: string): DocumentRecord | null {
      return (
        (getByUrlStmt.get(canonicalizeSourceUrl(url)) as DocumentRecord) ?? null
      );
    },

    getById(id: number): DocumentRecord | null {
      return (getByIdStmt.get(id) as DocumentRecord) ?? null;
    },

    updateDownloaded(id: number, info: DownloadedInfo): void {
      runWrite('updateDownloaded', id, () => updateDownloadedStmt.run({ id, ...info }));
    },

    updateChanged(id: number, info: DownloadedInfo): void {
      runWrite('updateChanged', id, () => updateChangedStmt.run({ id, ...info }));
    },

    markUnchanged(id: number): void {
      runWrite('markUnchanged', id, () => markUnchangedStmt.run(id));
    },

    markError(id: number, message: string, kind: FailureKind = 'permanent'): void {
      runWrite('markError', id, () => markErrorStmt.run({ id, message, kind }));
    },

    recordTransientFailure(id: number, message: string): void {
      runWrite('recordTransientFailure', id, () => recordTransientFailureStmt.run({ id, message }));
    },

    recordNotFound(id: number, message: string): number {
      runWrite('recordNotFound', id, () => recordNotFoundStmt.run({ id, message }));
      const row = getByIdStmt.get(id) as DocumentRecord;
      return row.consecutive_not_found;
    },

    markRemoved(id: number): void {
      runWrite('markRemoved', id, () => markRemovedStmt.run(id));
    },

    recordRejectedUrl(
      url: string,
      sourceType: string | null,
      reason: string,
    ): void {
      runWrite('recordRejectedUrl', null, () =>
        recordRejectedUrlStmt.run({
          source_url: url,
          source_type: sourceType,
          reason,
        }),
      );
    },

    getRejectedUrls(): RejectedUrlRecord[] {
      return getRejectedUrlsStmt.all() as RejectedUrlRecord[];
    },

    getSourceFreshness(): SourceFreshnessRecord[] {
      return getSourceFreshnessStmt.all() as SourceFreshnessRecord[];
    },

    getDocumentsToCheck(sourceType?: string): DocumentRecord[] {
      if (sourceType) {
        return getToCheckBySourceStmt.all(sourceType) as DocumentRecord[];
      }
      return getToCheckStmt.all() as DocumentRecord[];
    },

    getDocumentsToDownload(sourceType?: string): DocumentRecord[] {
      if (sourceType) {
        return getToDownloadBySourceStmt.all(sourceType) as DocumentRecord[];
      }
      return getToDownloadStmt.all() as DocumentRecord[];
    },

    getBySourceType(sourceType: string): DocumentRecord[] {
      return getBySourceTypeStmt.all(sourceType) as DocumentRecord[];
    },

    getByStatus(status: string): DocumentRecord[] {
      return getByStatusStmt.all(status) as DocumentRecord[];
    },

    getStats(): StatRow[] {
      return getStatsStmt.all() as StatRow[];
    },

    getAllDocuments(): DocumentRecord[] {
      return getAllStmt.all() as DocumentRecord[];
    },

    startCrawlRun(sourceTypes: string[]): number {
      const result = startRunStmt.run(JSON.stringify(sourceTypes));
      return Number(result.lastInsertRowid);
    },

    completeCrawlRun(
      runId: number,
      stats: CrawlRunStats,
      successfulSourceTypes: string[],
      completeListingSourceTypes: string[],
    ): void {
      runWrite('completeCrawlRun', runId, () => {
        db.transaction(() => {
          completeRunStmt.run({ id: runId, ...stats });
          for (const sourceType of successfulSourceTypes) {
            updateSourceFreshnessStmt.run({ source_type: sourceType });
          }
          for (const sourceType of completeListingSourceTypes) {
            listings().stampChecks.run({
              run_id: runId,
              source_type: sourceType,
            });
          }
        })();
      });
    },

    failCrawlRun(runId: number): void {
      failRunStmt.run(runId);
    },
  };
}
