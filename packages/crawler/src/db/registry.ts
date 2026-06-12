import type Database from 'better-sqlite3';
import type { DiscoveredDocument } from '../sources/types.js';

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
  status: string;
  error_message: string | null;
  download_attempts: number;
  consecutive_errors: number;
  consecutive_not_found: number;
}

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

export interface DocumentRegistry {
  upsertDiscovered(doc: DiscoveredDocument): number;
  getByUrl(url: string): DocumentRecord | null;
  getById(id: number): DocumentRecord | null;
  updateDownloaded(id: number, info: DownloadedInfo): void;
  updateChanged(id: number, info: DownloadedInfo): void;
  markUnchanged(id: number): void;
  markError(id: number, message: string): void;
  /**
   * Record a 404 for the document. Sets status='error' (so it retries) and
   * increments the consecutive-404 streak. Returns the new streak length so
   * the caller can decide when to mark the document removed.
   */
  recordNotFound(id: number, message: string): number;
  markRemoved(id: number): void;
  getDocumentsToCheck(sourceType?: string): DocumentRecord[];
  getDocumentsToDownload(sourceType?: string): DocumentRecord[];
  getBySourceType(sourceType: string): DocumentRecord[];
  getByStatus(status: string): DocumentRecord[];
  getStats(): StatRow[];
  getAllDocuments(): DocumentRecord[];
  startCrawlRun(sourceTypes: string[]): number;
  completeCrawlRun(runId: number, stats: CrawlRunStats): void;
  failCrawlRun(runId: number): void;
}

export function createRegistry(db: Database.Database): DocumentRegistry {
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
      error_message = NULL
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
      error_message = NULL
    WHERE id = @id
  `);

  const markUnchangedStmt = db.prepare(`
    UPDATE documents SET
      last_checked_at = datetime('now'),
      status = 'unchanged',
      consecutive_errors = 0,
      consecutive_not_found = 0,
      error_message = NULL
    WHERE id = ?
  `);

  const markErrorStmt = db.prepare(`
    UPDATE documents SET
      last_checked_at = datetime('now'),
      status = 'error',
      error_message = @message,
      download_attempts = download_attempts + 1,
      consecutive_errors = consecutive_errors + 1,
      consecutive_not_found = 0
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
      consecutive_not_found = consecutive_not_found + 1
    WHERE id = @id
  `);

  const markRemovedStmt = db.prepare(`
    UPDATE documents SET
      last_checked_at = datetime('now'),
      status = 'removed'
    WHERE id = ?
  `);

  // 'error' is included so transient failures self-heal on the next run
  // instead of stranding the document forever. Only 'removed' (confirmed gone
  // after repeated 404s) and 'discovered' (handled by the download phase) are
  // excluded.
  const getToCheckStmt = db.prepare(`
    SELECT * FROM documents
    WHERE status IN ('downloaded', 'updated', 'unchanged', 'error')
    ORDER BY last_checked_at ASC NULLS FIRST
  `);

  const getToCheckBySourceStmt = db.prepare(`
    SELECT * FROM documents
    WHERE status IN ('downloaded', 'updated', 'unchanged', 'error')
      AND source_type = ?
    ORDER BY last_checked_at ASC NULLS FIRST
  `);

  const getToDownloadStmt = db.prepare(`
    SELECT * FROM documents
    WHERE status = 'discovered'
    ORDER BY first_seen_at ASC
  `);

  const getToDownloadBySourceStmt = db.prepare(`
    SELECT * FROM documents
    WHERE status = 'discovered' AND source_type = ?
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

  return {
    upsertDiscovered(doc: DiscoveredDocument): number {
      insertStmt.run(doc);
      const row = getByUrlStmt.get(doc.source_url) as DocumentRecord;
      return row.id;
    },

    getByUrl(url: string): DocumentRecord | null {
      return (getByUrlStmt.get(url) as DocumentRecord) ?? null;
    },

    getById(id: number): DocumentRecord | null {
      return (getByIdStmt.get(id) as DocumentRecord) ?? null;
    },

    updateDownloaded(id: number, info: DownloadedInfo): void {
      updateDownloadedStmt.run({ id, ...info });
    },

    updateChanged(id: number, info: DownloadedInfo): void {
      updateChangedStmt.run({ id, ...info });
    },

    markUnchanged(id: number): void {
      markUnchangedStmt.run(id);
    },

    markError(id: number, message: string): void {
      markErrorStmt.run({ id, message });
    },

    recordNotFound(id: number, message: string): number {
      recordNotFoundStmt.run({ id, message });
      const row = getByIdStmt.get(id) as DocumentRecord;
      return row.consecutive_not_found;
    },

    markRemoved(id: number): void {
      markRemovedStmt.run(id);
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

    completeCrawlRun(runId: number, stats: CrawlRunStats): void {
      completeRunStmt.run({ id: runId, ...stats });
    },

    failCrawlRun(runId: number): void {
      failRunStmt.run(runId);
    },
  };
}
