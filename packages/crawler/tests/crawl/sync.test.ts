import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/db/schema.js';
import { createRegistry, type DocumentRegistry, type DownloadedInfo } from '../../src/db/registry.js';
import { runDownloadPhase, runCheckPhase, type SyncContext } from '../../src/crawl/sync.js';
import type { DownloadResult } from '../../src/crawl/downloader.js';
import type { DocumentRecord } from '../../src/db/registry.js';
import type { Fetcher, SourceType } from '../../src/sources/types.js';
import { logger } from '../../src/utils/logger.js';

const fakeFetcher = {} as Fetcher;

const sampleInfo: DownloadedInfo = {
  local_path: 'clinical-policies/test.pdf',
  file_hash: 'hash-1',
  file_size: 1024,
  mime_type: 'application/pdf',
  detected_content_type: 'application/pdf',
  content_disposition_filename: null,
  etag: null,
  last_modified: null,
};

function makeContext(
  registry: DocumentRegistry,
  download: (doc: DocumentRecord) => DownloadResult | Promise<DownloadResult>,
  overrides: Partial<SyncContext> = {},
): SyncContext {
  return {
    registry,
    fetcher: fakeFetcher,
    sourceTypes: ['clinical_policy'] as SourceType[],
    isAllowed: () => true,
    download: async (doc) => download(doc),
    notFoundRemovalThreshold: 3,
    ...overrides,
  };
}

describe('crawl sync phases', () => {
  let db: Database.Database;
  let registry: DocumentRegistry;

  beforeAll(() => {
    // Keep per-document progress logging out of test output and the log file
    logger.setConsoleLevel('error');
    logger.setFileLevel('error');
  });

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    registry = createRegistry(db);
  });

  function addDiscovered(url: string): number {
    return registry.upsertDiscovered({
      source_url: url,
      discovered_from: 'https://example.com/index',
      source_type: 'clinical_policy',
      title: 'Test Policy',
      policy_number: null,
      category: null,
    });
  }

  function addDownloaded(url: string, hash = 'existing-hash'): number {
    const id = addDiscovered(url);
    registry.updateDownloaded(id, { ...sampleInfo, file_hash: hash });
    return id;
  }

  describe('same-run re-fetch prevention', () => {
    it('does not re-fetch documents downloaded earlier in the same run', async () => {
      const newId = addDiscovered('https://example.com/new.pdf');
      const knownId = addDownloaded('https://example.com/known.pdf');

      const fetchCounts = new Map<number, number>();
      const ctx = makeContext(registry, (doc) => {
        fetchCounts.set(doc.id, (fetchCounts.get(doc.id) ?? 0) + 1);
        return doc.id === newId
          ? { action: 'downloaded', info: sampleInfo }
          : { action: 'unchanged' };
      });

      const download = await runDownloadPhase(ctx);
      await runCheckPhase(ctx, download.processedIds);

      // The new document is fetched once by the download phase and skipped by
      // the check phase; the known document is fetched once by the check phase.
      expect(fetchCounts.get(newId)).toBe(1);
      expect(fetchCounts.get(knownId)).toBe(1);
      expect(download.processedIds).toEqual(new Set([newId]));
    });

    it('would re-fetch without the skip set (pins why processedIds exists)', async () => {
      const newId = addDiscovered('https://example.com/new.pdf');

      const fetchCounts = new Map<number, number>();
      const ctx = makeContext(registry, (doc) => {
        fetchCounts.set(doc.id, (fetchCounts.get(doc.id) ?? 0) + 1);
        return { action: 'downloaded', info: sampleInfo };
      });

      await runDownloadPhase(ctx);
      await runCheckPhase(ctx); // no skip set
      expect(fetchCounts.get(newId)).toBe(2);
    });
  });

  describe('error retry', () => {
    it('retries errored documents on the next check and they self-heal', async () => {
      const id = addDiscovered('https://example.com/flaky.pdf');
      registry.markError(id, 'ECONNRESET');

      const ctx = makeContext(registry, () => ({
        action: 'downloaded',
        info: sampleInfo,
      }));

      const stats = await runCheckPhase(ctx);
      expect(stats.downloaded).toBe(1);
      expect(registry.getById(id)!.status).toBe('downloaded');
      expect(registry.getById(id)!.error_message).toBeNull();
    });
  });

  describe('consecutive-404 removal threshold', () => {
    it('keeps a document retryable until it 404s on N consecutive runs', async () => {
      const id = addDownloaded('https://example.com/gone.pdf');

      const notFound = makeContext(registry, () => ({
        action: 'error',
        error: 'HTTP 404',
        statusCode: 404,
      }));

      await runCheckPhase(notFound);
      expect(registry.getById(id)!.status).toBe('error');

      await runCheckPhase(notFound);
      expect(registry.getById(id)!.status).toBe('error');

      await runCheckPhase(notFound);
      expect(registry.getById(id)!.status).toBe('removed');

      // Removed documents are no longer selected for checking
      const calls: number[] = [];
      const counting = makeContext(registry, (doc) => {
        calls.push(doc.id);
        return { action: 'unchanged' };
      });
      await runCheckPhase(counting);
      expect(calls).toEqual([]);
    });

    it('a transient 404 followed by recovery resets the streak', async () => {
      const id = addDownloaded('https://example.com/transient.pdf');

      const notFound = makeContext(registry, () => ({
        action: 'error',
        error: 'HTTP 404',
        statusCode: 404,
      }));
      const ok = makeContext(registry, () => ({ action: 'unchanged' }));

      await runCheckPhase(notFound);
      await runCheckPhase(notFound);
      await runCheckPhase(ok);
      await runCheckPhase(notFound);

      const doc = registry.getById(id)!;
      expect(doc.status).toBe('error');
      expect(doc.consecutive_not_found).toBe(1);
    });

    it('only a structured 404 status counts — a "404" in the message does not remove', async () => {
      const id = addDownloaded('https://example.com/misleading.pdf');

      const ctx = makeContext(registry, () => ({
        action: 'error',
        error: 'ENOENT: no such file /tmp/404.pdf',
        // no statusCode — not an HTTP 404
      }));

      await runCheckPhase(ctx);
      await runCheckPhase(ctx);
      await runCheckPhase(ctx);

      const doc = registry.getById(id)!;
      expect(doc.status).toBe('error');
      expect(doc.consecutive_not_found).toBe(0);
    });

    it('non-404 HTTP errors mark error, not removed', async () => {
      const id = addDownloaded('https://example.com/flaky.pdf');

      const ctx = makeContext(registry, () => ({
        action: 'error',
        error: 'HTTP 503',
        statusCode: 503,
      }));

      await runCheckPhase(ctx);
      await runCheckPhase(ctx);
      await runCheckPhase(ctx);
      expect(registry.getById(id)!.status).toBe('error');
    });
  });

  describe('scoping', () => {
    it('skips documents outside the selected source types', async () => {
      const id = addDiscovered('https://example.com/policy.pdf');

      const calls: number[] = [];
      const ctx = makeContext(
        registry,
        (doc) => {
          calls.push(doc.id);
          return { action: 'downloaded', info: sampleInfo };
        },
        { sourceTypes: ['bulletin'] as SourceType[] },
      );

      await runDownloadPhase(ctx);
      expect(calls).toEqual([]);
      expect(registry.getById(id)!.status).toBe('discovered');
    });

    it('rejects and records documents disallowed before queueing', async () => {
      const id = addDiscovered('https://example.com/blocked.pdf');

      const calls: string[] = [];
      const ctx = makeContext(
        registry,
        (doc) => {
          calls.push(doc.source_url);
          return { action: 'downloaded', info: sampleInfo };
        },
        { isAllowed: (url) => !url.includes('blocked') },
      );

      await runDownloadPhase(ctx);
      expect(calls).toEqual([]);
      expect(registry.getById(id)?.status).toBe('error');
      expect(registry.getRejectedUrls()).toEqual([
        expect.objectContaining({
          source_url: 'https://example.com/blocked.pdf',
          reason: 'URL rejected before download queueing',
        }),
      ]);
    });
  });
});
