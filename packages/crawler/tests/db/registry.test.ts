import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/db/schema.js';
import { createRegistry, type DocumentRegistry } from '../../src/db/registry.js';
import type { DiscoveredDocument } from '../../src/sources/types.js';

describe('DocumentRegistry', () => {
  let db: Database.Database;
  let registry: DocumentRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    registry = createRegistry(db);
  });

  const sampleDoc: DiscoveredDocument = {
    source_url: 'https://example.com/doc.pdf',
    discovered_from: 'https://example.com/index',
    source_type: 'clinical_policy',
    title: '3K-2, CAP/DA Policy',
    policy_number: '3K-2',
    category: 'Community-Based Services',
  };

  describe('upsertDiscovered', () => {
    it('inserts a new document', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      expect(id).toBeGreaterThan(0);
    });

    it('returns existing id for duplicate source_url', () => {
      const id1 = registry.upsertDiscovered(sampleDoc);
      const id2 = registry.upsertDiscovered(sampleDoc);
      expect(id1).toBe(id2);
    });

    it('updates title if re-discovered with different title', () => {
      registry.upsertDiscovered(sampleDoc);
      registry.upsertDiscovered({ ...sampleDoc, title: 'Updated Title' });
      const doc = registry.getByUrl(sampleDoc.source_url);
      expect(doc?.title).toBe('Updated Title');
    });
  });

  describe('getByUrl', () => {
    it('returns null for unknown URL', () => {
      expect(registry.getByUrl('https://nonexistent.com')).toBeNull();
    });

    it('returns the document for a known URL', () => {
      registry.upsertDiscovered(sampleDoc);
      const doc = registry.getByUrl(sampleDoc.source_url);
      expect(doc).not.toBeNull();
      expect(doc!.source_type).toBe('clinical_policy');
      expect(doc!.status).toBe('discovered');
    });
  });

  describe('updateDownloaded', () => {
    it('updates download state', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.updateDownloaded(id, {
        local_path: 'clinical-policies/3k-2_capda.pdf',
        file_hash: 'abc123',
        file_size: 1024,
        mime_type: 'application/pdf',
        detected_content_type: 'application/pdf',
        content_disposition_filename: 'capda-policy.pdf',
        etag: '"etag-123"',
        last_modified: 'Wed, 01 Jan 2025 00:00:00 GMT',
      });
      const doc = registry.getByUrl(sampleDoc.source_url);
      expect(doc!.status).toBe('downloaded');
      expect(doc!.file_hash).toBe('abc123');
      expect(doc!.detected_content_type).toBe('application/pdf');
      expect(doc!.content_disposition_filename).toBe('capda-policy.pdf');
    });
  });

  describe('markUnchanged', () => {
    it('sets status to unchanged and updates last_checked_at', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.markUnchanged(id);
      const doc = registry.getByUrl(sampleDoc.source_url);
      expect(doc!.status).toBe('unchanged');
      expect(doc!.last_checked_at).not.toBeNull();
    });
  });

  describe('markError', () => {
    it('sets status to error with message', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.markError(id, '404 Not Found');
      const doc = registry.getByUrl(sampleDoc.source_url);
      expect(doc!.status).toBe('error');
      expect(doc!.error_message).toBe('404 Not Found');
      expect(doc!.consecutive_errors).toBe(1);
    });

    it('increments consecutive_errors on repeated errors', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.markError(id, 'timeout');
      registry.markError(id, 'timeout again');
      const doc = registry.getByUrl(sampleDoc.source_url);
      expect(doc!.consecutive_errors).toBe(2);
    });
  });

  describe('recordNotFound', () => {
    it('sets status to error and returns the consecutive-404 streak', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      const first = registry.recordNotFound(id, '404 Not Found');
      const second = registry.recordNotFound(id, '404 Not Found');
      expect(first).toBe(1);
      expect(second).toBe(2);
      const doc = registry.getByUrl(sampleDoc.source_url);
      expect(doc!.status).toBe('error');
      expect(doc!.error_message).toBe('404 Not Found');
      expect(doc!.consecutive_not_found).toBe(2);
    });

    it('streak resets on a successful download', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.recordNotFound(id, '404 Not Found');
      registry.updateDownloaded(id, {
        local_path: 'test.pdf',
        file_hash: 'abc',
        file_size: 100,
        mime_type: 'application/pdf',
        detected_content_type: 'application/pdf',
        content_disposition_filename: null,
        etag: null,
        last_modified: null,
      });
      expect(registry.getById(id)!.consecutive_not_found).toBe(0);
    });

    it('streak resets on an unchanged check', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.recordNotFound(id, '404 Not Found');
      registry.markUnchanged(id);
      expect(registry.getById(id)!.consecutive_not_found).toBe(0);
    });

    it('streak resets on a non-404 error so only consecutive 404s count', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.recordNotFound(id, '404 Not Found');
      registry.markError(id, 'timeout');
      expect(registry.getById(id)!.consecutive_not_found).toBe(0);
      expect(registry.getById(id)!.consecutive_errors).toBe(2);
    });
  });

  describe('markRemoved', () => {
    it('sets status to removed', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.markRemoved(id);
      const doc = registry.getByUrl(sampleDoc.source_url);
      expect(doc!.status).toBe('removed');
    });
  });

  describe('getDocumentsToCheck', () => {
    it('returns downloaded and updated documents', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.updateDownloaded(id, {
        local_path: 'test.pdf',
        file_hash: 'abc',
        file_size: 100,
        mime_type: 'application/pdf',
        detected_content_type: 'application/pdf',
        content_disposition_filename: null,
        etag: null,
        last_modified: null,
      });
      const docs = registry.getDocumentsToCheck();
      expect(docs.length).toBe(1);
    });

    it('includes errored documents so transient failures retry on the next run', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.markError(id, 'ECONNRESET');
      const docs = registry.getDocumentsToCheck();
      expect(docs.map((d) => d.id)).toContain(id);
    });

    it('excludes removed and discovered documents', () => {
      const removedId = registry.upsertDiscovered(sampleDoc);
      registry.markRemoved(removedId);
      registry.upsertDiscovered({
        ...sampleDoc,
        source_url: 'https://example.com/new.pdf',
      });
      expect(registry.getDocumentsToCheck()).toEqual([]);
    });
  });

  describe('getBySourceType', () => {
    it('filters by source type', () => {
      registry.upsertDiscovered(sampleDoc);
      registry.upsertDiscovered({
        ...sampleDoc,
        source_url: 'https://example.com/bulletin.pdf',
        source_type: 'bulletin',
      });
      const policies = registry.getBySourceType('clinical_policy');
      expect(policies.length).toBe(1);
    });
  });

  describe('getStats', () => {
    it('returns counts by source type and status', () => {
      registry.upsertDiscovered(sampleDoc);
      const stats = registry.getStats();
      expect(stats).toContainEqual({
        source_type: 'clinical_policy',
        status: 'discovered',
        count: 1,
      });
    });
  });

  describe('schema migration', () => {
    it('adds consecutive_not_found to registries created before the column existed', () => {
      const oldDb = new Database(':memory:');
      oldDb.exec(`
        CREATE TABLE documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_url TEXT NOT NULL UNIQUE,
          discovered_from TEXT NOT NULL,
          source_type TEXT NOT NULL,
          title TEXT,
          policy_number TEXT,
          category TEXT,
          local_path TEXT,
          file_hash TEXT,
          file_size INTEGER,
          mime_type TEXT,
          detected_content_type TEXT,
          content_disposition_filename TEXT,
          etag TEXT,
          last_modified TEXT,
          first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_checked_at TEXT,
          last_downloaded_at TEXT,
          last_changed_at TEXT,
          status TEXT NOT NULL DEFAULT 'discovered',
          error_message TEXT,
          download_attempts INTEGER DEFAULT 0,
          consecutive_errors INTEGER DEFAULT 0
        );
      `);
      initializeSchema(oldDb);
      const oldRegistry = createRegistry(oldDb);
      const id = oldRegistry.upsertDiscovered(sampleDoc);
      expect(oldRegistry.recordNotFound(id, '404 Not Found')).toBe(1);
      oldDb.close();
    });
  });

  describe('crawl runs', () => {
    it('creates and completes a crawl run', () => {
      const runId = registry.startCrawlRun(['clinical_policy']);
      registry.completeCrawlRun(runId, {
        documents_discovered: 10,
        documents_downloaded: 5,
        documents_unchanged: 3,
        documents_updated: 1,
        documents_errored: 1,
      });
      // No assertion needed beyond not throwing — the run is in the DB
    });
  });
});
