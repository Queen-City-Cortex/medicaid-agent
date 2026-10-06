import fs from 'node:fs';
import path from 'node:path';
import { config, SOURCE_TYPE_DIRS } from '../config.js';
import { logger } from '../utils/logger.js';
import { downloadDocument } from './downloader.js';
import type { DownloadResult } from './downloader.js';
import type { DocumentRecord, DocumentRegistry } from '../db/registry.js';
import type { Fetcher, SourceType } from '../sources/types.js';

export interface SyncStats {
  downloaded: number;
  updated: number;
  unchanged: number;
  errored: number;
}

export interface SyncContext {
  registry: DocumentRegistry;
  fetcher: Fetcher;
  sourceTypes: SourceType[];
  isAllowed: (url: string, sourceType: SourceType) => boolean;
  /** Injectable for tests; defaults to the real downloader. */
  download?: typeof downloadDocument;
  /** Consecutive 404s before a document is marked removed. */
  notFoundRemovalThreshold?: number;
  /** Consecutive transient failures before a document is marked error. */
  transientFailureThreshold?: number;
  /** Maximum number of source-family download workers. */
  concurrency?: number;
}

function emptyStats(): SyncStats {
  return { downloaded: 0, updated: 0, unchanged: 0, errored: 0 };
}

export function mergeStats(a: SyncStats, b: SyncStats): SyncStats {
  return {
    downloaded: a.downloaded + b.downloaded,
    updated: a.updated + b.updated,
    unchanged: a.unchanged + b.unchanged,
    errored: a.errored + b.errored,
  };
}

function docLabel(doc: DocumentRecord): string {
  return doc.policy_number ?? doc.title ?? doc.source_url;
}

// Existing filenames per source type, loaded lazily so each phase sees files
// written earlier in the same run. downloadDocument mutates these sets as it
// saves files, keeping collision handling correct within a phase.
function getFilenames(
  cache: Map<string, Set<string>>,
  sourceType: string,
): Set<string> {
  let names = cache.get(sourceType);
  if (!names) {
    const dir = path.join(
      config.documentsDir,
      SOURCE_TYPE_DIRS[sourceType] ?? sourceType,
    );
    names = fs.existsSync(dir) ? new Set(fs.readdirSync(dir)) : new Set();
    cache.set(sourceType, names);
  }
  return names;
}

/**
 * Apply a download result to the registry and stats. 404s are tracked as a
 * consecutive streak — a document is only marked 'removed' once it has 404ed
 * `notFoundRemovalThreshold` times in a row; until then it stays 'error' so a
 * transient 404 self-heals on a later run. A transient failure (see
 * `DownloadResult.transient`) keeps the document's last good status — the
 * row's whole-row identity, and so the release trigger, is unchanged and the
 * stored payload still loads — until `transientFailureThreshold` in a row.
 */
function applyResult(
  ctx: SyncContext,
  doc: DocumentRecord,
  result: DownloadResult,
  stats: SyncStats,
): void {
  switch (result.action) {
    case 'downloaded':
      if (result.info) ctx.registry.updateDownloaded(doc.id, result.info);
      stats.downloaded++;
      logger.info(
        `${docLabel(doc)}... new document (${result.info?.file_size ? Math.round(result.info.file_size / 1024) + ' KB' : 'unknown size'})`,
      );
      break;
    case 'updated':
      if (result.info) ctx.registry.updateChanged(doc.id, result.info);
      stats.updated++;
      logger.info(`${docLabel(doc)}... updated (hash changed)`);
      break;
    case 'unchanged':
      ctx.registry.markUnchanged(doc.id);
      stats.unchanged++;
      logger.debug(`${docLabel(doc)}... unchanged`);
      break;
    case 'error': {
      if (result.rejectedUrl) {
        ctx.registry.recordRejectedUrl(
          result.rejectedUrl,
          doc.source_type,
          result.rejectionReason ?? result.error ?? 'URL rejected',
        );
      }
      if (result.statusCode === 404) {
        const threshold =
          ctx.notFoundRemovalThreshold ?? config.notFoundRemovalThreshold;
        const misses = ctx.registry.recordNotFound(
          doc.id,
          result.error ?? '404 Not Found',
        );
        if (misses >= threshold) {
          ctx.registry.markRemoved(doc.id);
          logger.warn(
            `${docLabel(doc)}... removed after ${misses} consecutive 404s`,
          );
        } else {
          logger.warn(
            `${docLabel(doc)}... 404 (${misses}/${threshold} consecutive before removal)`,
          );
        }
      } else if (result.transient) {
        const threshold =
          ctx.transientFailureThreshold ?? config.transientFailureThreshold;
        // `doc` is the row as the phase read it; the writes are applied
        // serially afterwards, so its count is current.
        const streak = doc.consecutive_errors + 1;
        const message = result.error ?? 'Unknown error';
        if (streak >= threshold) {
          ctx.registry.markError(doc.id, message, 'transient');
          logger.warn(
            `${docLabel(doc)}... error after ${streak} consecutive transient failures: ${message}`,
          );
        } else {
          ctx.registry.recordTransientFailure(doc.id, message);
          logger.warn(
            `${docLabel(doc)}... transient failure, kept ${doc.status} (${streak}/${threshold} before error): ${message}`,
          );
        }
      } else {
        ctx.registry.markError(doc.id, result.error ?? 'Unknown error');
        logger.warn(`${docLabel(doc)}... error: ${result.error}`);
      }
      stats.errored++;
      break;
    }
  }
}

async function processDocuments(
  ctx: SyncContext,
  docs: DocumentRecord[],
  stats: SyncStats,
  processedIds: Set<number>,
): Promise<void> {
  const download = ctx.download ?? downloadDocument;
  const eligible: DocumentRecord[] = [];
  for (const doc of docs) {
    if (!ctx.sourceTypes.includes(doc.source_type as SourceType)) continue;
    if (!ctx.isAllowed(doc.source_url, doc.source_type as SourceType)) {
      const reason = 'URL rejected before download queueing';
      ctx.registry.recordRejectedUrl(doc.source_url, doc.source_type, reason);
      ctx.registry.markError(doc.id, reason);
      stats.errored++;
      processedIds.add(doc.id);
      continue;
    }
    eligible.push(doc);
  }

  const bySourceType = new Map<string, DocumentRecord[]>();
  for (const doc of eligible) {
    const group = bySourceType.get(doc.source_type) ?? [];
    group.push(doc);
    bySourceType.set(doc.source_type, group);
  }

  const queue = [...bySourceType.entries()];
  const concurrency = Math.max(
    1,
    Math.min(8, ctx.concurrency ?? config.maxConcurrentDomains),
  );
  const completed: Array<{
    doc: DocumentRecord;
    result: DownloadResult;
  }> = [];

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, queue.length) },
      async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) break;
          const [sourceType, sourceDocs] = next;
          const names = getFilenames(new Map(), sourceType);
          for (const doc of sourceDocs) {
            try {
              completed.push({
                doc,
                result: await download(doc, ctx.fetcher, names),
              });
            } catch (error) {
              completed.push({
                doc,
                result: {
                  action: 'error',
                  error:
                    error instanceof Error
                      ? error.message
                      : String(error),
                },
              });
            }
          }
        }
      },
    ),
  );

  // better-sqlite3 writes are synchronous. Apply every mutation in one
  // serialized pass after the bounded network/file work completes.
  for (const { doc, result } of completed) {
    applyResult(ctx, doc, result, stats);
    processedIds.add(doc.id);
  }
}

/**
 * Download newly discovered documents. Returns the ids of every document
 * processed so the check phase in the same run can skip them — without this,
 * `getDocumentsToCheck` would immediately re-fetch everything just downloaded.
 */
export async function runDownloadPhase(
  ctx: SyncContext,
): Promise<{ stats: SyncStats; processedIds: Set<number> }> {
  const stats = emptyStats();
  const processedIds = new Set<number>();
  await processDocuments(
    ctx,
    ctx.registry.getDocumentsToDownload(),
    stats,
    processedIds,
  );
  return { stats, processedIds };
}

/**
 * Re-check known documents (including previously errored ones, so transient
 * failures self-heal). `skipIds` excludes documents already handled earlier in
 * the same run.
 */
export async function runCheckPhase(
  ctx: SyncContext,
  skipIds: Set<number> = new Set(),
): Promise<SyncStats> {
  const stats = emptyStats();
  const docs = ctx.registry
    .getDocumentsToCheck()
    .filter((doc) => !skipIds.has(doc.id));
  await processDocuments(ctx, docs, stats, new Set());
  return stats;
}
