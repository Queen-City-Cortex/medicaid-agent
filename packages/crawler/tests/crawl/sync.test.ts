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

  describe('manifest seed URLs', () => {
    it('marks a seed page not found on a 404 and never retires it', async () => {
      // The manifest lists the page; a 404 there is an outage or a moved
      // file, not proof of repeal. Only removing the seed de-lists it.
      const url =
        'https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_108D/GS_108D-14.html';
      const id = registry.upsertDiscovered({
        source_url: url,
        discovered_from: url,
        source_type: 'nc_statute',
        title: 'N.C.G.S. 108D-14',
        policy_number: '108D-14',
        category: null,
      });
      registry.updateDownloaded(id, { ...sampleInfo, file_hash: 'existing-hash' });

      const seeded = registry.getById(id)!;

      // The row must be in the checked source types, or the stub never runs.
      let calls = 0;
      const notFound = makeContext(
        registry,
        () => {
          calls += 1;
          return { action: 'error', error: 'HTTP 404', statusCode: 404 };
        },
        { sourceTypes: ['nc_statute'] as SourceType[] },
      );

      // Not retired or removed, and not silently current either: from the
      // first 404 the row is 'error' with kind 'not_found', its failure time
      // is recorded, and the payload fields stay.
      const seen: Record<number, unknown> = {};
      for (let run = 1; run <= 10; run += 1) {
        await runCheckPhase(notFound);
        const doc = registry.getById(id)!;
        expect(doc.removed_at).toBeNull();
        expect(doc.last_failure_at).not.toBeNull();
        expect(doc.error_message).toBe('HTTP 404');
        expect(doc.local_path).toBe(seeded.local_path);
        expect(doc.file_hash).toBe(seeded.file_hash);
        expect(doc.last_downloaded_at).toBe(seeded.last_downloaded_at);
        seen[run] = {
          status: doc.status,
          kind: doc.last_failure_kind,
          consecutive_errors: doc.consecutive_errors,
          consecutive_not_found: doc.consecutive_not_found,
        };
      }
      expect(calls).toBe(10);
      for (const run of [1, 3, 10]) {
        expect(seen[run]).toEqual({
          status: 'error',
          kind: 'not_found',
          consecutive_errors: run,
          consecutive_not_found: 0,
        });
      }
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

    it('a permanent non-404 failure marks error, not removed', async () => {
      const id = addDownloaded('https://example.com/flaky.pdf');

      const ctx = makeContext(registry, () => ({
        action: 'error',
        error: 'Content-type text/html not allowed for source_type clinical_policy',
      }));

      await runCheckPhase(ctx);
      const doc = registry.getById(id)!;
      expect(doc.status).toBe('error');
      expect(doc.last_failure_kind).toBe('permanent');
      expect(doc.last_failure_at).not.toBeNull();
      await runCheckPhase(ctx);
      await runCheckPhase(ctx);
      expect(registry.getById(id)!.status).toBe('error');
    });
  });

  describe('transient failures', () => {
    const transient = (registry: DocumentRegistry) =>
      makeContext(registry, () => ({
        action: 'error',
        error: 'HTTP 503 from https://example.com/flaky.pdf',
        statusCode: 503,
        transient: true,
      }), { transientFailureThreshold: 3 });

    it('keeps the last good status, payload and hash, and records the failure', async () => {
      const id = addDownloaded('https://example.com/flaky.pdf', 'good-hash');
      await runCheckPhase(makeContext(registry, () => ({ action: 'unchanged' })));
      const before = registry.getById(id)!;
      expect(before.status).toBe('unchanged');

      const stats = await runCheckPhase(transient(registry));

      const doc = registry.getById(id)!;
      expect(stats.errored).toBe(1);
      expect(doc.status).toBe('unchanged');
      expect(doc.local_path).toBe(before.local_path);
      expect(doc.file_hash).toBe('good-hash');
      expect(doc.file_size).toBe(before.file_size);
      expect(doc.etag).toBe(before.etag);
      // The row still says when its status was last established, not when
      // the failed check happened: the loader stamps retrieved_at from it.
      expect(doc.last_checked_at).toBe(before.last_checked_at);
      expect(doc.last_failure_at).not.toBeNull();
      expect(doc.last_failure_kind).toBe('transient');
      expect(doc.error_message).toBe('HTTP 503 from https://example.com/flaky.pdf');
      expect(doc.consecutive_errors).toBe(1);
      expect(doc.download_attempts).toBe(before.download_attempts + 1);
    });

    it('moves to error only after the threshold of consecutive transient failures', async () => {
      const id = addDownloaded('https://example.com/flaky.pdf');

      await runCheckPhase(transient(registry));
      await runCheckPhase(transient(registry));
      const kept = registry.getById(id)!;
      expect(kept.status).toBe('downloaded');
      expect(kept.consecutive_errors).toBe(2);

      await runCheckPhase(transient(registry));
      const demoted = registry.getById(id)!;
      expect(demoted.status).toBe('error');
      expect(demoted.consecutive_errors).toBe(3);
      expect(demoted.last_failure_kind).toBe('transient');
      expect(demoted.file_hash).toBe('existing-hash');
    });

    it('a document never fetched stays discovered, so the download phase retries it', async () => {
      const id = addDiscovered('https://example.com/new.pdf');

      const { processedIds } = await runDownloadPhase(transient(registry));
      expect(processedIds).toEqual(new Set([id]));
      const doc = registry.getById(id)!;
      expect(doc.status).toBe('discovered');
      expect(doc.consecutive_errors).toBe(1);
      expect(doc.local_path).toBeNull();

      // Next run's download phase selects it again, and a success heals it.
      const ok = makeContext(registry, () => ({ action: 'downloaded', info: sampleInfo }));
      const stats = await runDownloadPhase(ok);
      expect(stats.stats.downloaded).toBe(1);
      expect(registry.getById(id)!.status).toBe('downloaded');
    });

    it('a later success clears the failure fields', async () => {
      const id = addDownloaded('https://example.com/flaky.pdf');
      await runCheckPhase(transient(registry));
      expect(registry.getById(id)!.last_failure_at).not.toBeNull();

      await runCheckPhase(makeContext(registry, () => ({ action: 'unchanged' })));

      const doc = registry.getById(id)!;
      expect(doc.status).toBe('unchanged');
      expect(doc.consecutive_errors).toBe(0);
      expect(doc.error_message).toBeNull();
      expect(doc.last_failure_at).toBeNull();
      expect(doc.last_failure_kind).toBeNull();
    });

    it('a transient failure on an error row keeps it error', async () => {
      const id = addDownloaded('https://example.com/flaky.pdf');
      registry.markError(id, 'Payload looks like HTML/text');

      await runCheckPhase(transient(registry));

      const doc = registry.getById(id)!;
      expect(doc.status).toBe('error');
      expect(doc.last_failure_kind).toBe('transient');
      expect(doc.consecutive_errors).toBe(2);
    });

    it('a 404 is never transient: it counts toward removal as before', async () => {
      const id = addDownloaded('https://example.com/gone.pdf');
      const notFound = makeContext(registry, () => ({
        action: 'error',
        error: 'HTTP 404',
        statusCode: 404,
      }));

      await runCheckPhase(notFound);
      const doc = registry.getById(id)!;
      expect(doc.status).toBe('error');
      expect(doc.consecutive_not_found).toBe(1);
      expect(doc.last_failure_kind).toBe('not_found');
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
