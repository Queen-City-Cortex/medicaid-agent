import type { Command } from 'commander';
import { config } from '../config.js';
import { createRobotsChecker } from '../crawl/robots.js';
import { discoverDocuments } from '../crawl/discovery.js';
import { mergeStats, runCheckPhase, runDownloadPhase } from '../crawl/sync.js';
import { logger } from '../utils/logger.js';
import { buildFetcher, initDb, parseSourceTypes } from './shared.js';
import { getSourceFamily, isAllowedSourceUrl } from '../corpus-manifest.js';
import type { SourceType } from '../sources/types.js';

/**
 * Exit status when discovery failed for a family that is required for
 * answering. The run itself finished (downloads and checks are recorded), so
 * this is distinct from a crash: a caller may still parse and back up, but
 * must not promote a release.
 */
export const DISCOVERY_FAILED_EXIT_CODE = 3;

function reportDiscoveryFailures(failedSourceTypes: SourceType[]): void {
  if (failedSourceTypes.length === 0) return;
  logger.warn(`  Discovery failed: ${failedSourceTypes.join(', ')}`);
  const required = failedSourceTypes.filter(
    (sourceType) => getSourceFamily(sourceType).required_for_answering,
  );
  if (required.length > 0) {
    logger.error(
      `Discovery failed for required source families: ${required.join(', ')}`,
    );
    process.exitCode = DISCOVERY_FAILED_EXIT_CODE;
  }
}

export function registerCrawlCommand(program: Command): void {
  program
    .command('crawl')
    .description('Discover and download documents')
    .option(
      '-s, --source <types>',
      'Comma-separated source types to crawl',
    )
    .option('--since-year <year>', 'How far back to crawl', String(config.defaultSinceYear))
    .option('--dry-run', 'Discover documents without downloading')
    .action(async (opts) => {
      const sourceTypes = parseSourceTypes(opts.source);
      const sinceYear = parseInt(opts.sinceYear, 10);
      const dryRun = opts.dryRun ?? false;

      const registry = initDb();
      const runId = registry.startCrawlRun(sourceTypes);

      const fetcher = buildFetcher();

      // Check robots.txt
      const robots = createRobotsChecker(config.userAgent);
      const domains = new Set<string>();
      for (const st of sourceTypes) {
        const src = config.sources[st as keyof typeof config.sources];
        if ('indexUrl' in src) {
          domains.add(new URL(src.indexUrl).hostname);
        }
        if ('landingPages' in src) {
          for (const u of src.landingPages) {
            domains.add(new URL(u).hostname);
          }
        }
        if ('seedUrls' in src) {
          for (const u of src.seedUrls) {
            domains.add(new URL(u).hostname);
          }
        }
      }
      for (const domain of domains) {
        await robots.fetchAndCache(domain, fetcher);
        const crawlDelay = robots.getCrawlDelay(domain);
        if (crawlDelay) {
          fetcher.setCrawlDelay(domain, crawlDelay * 1000);
        }
      }

      const startTime = Date.now();
      logger.info(`Starting crawl run #${runId}`);

      // Discovery phase. Family minimums describe a default full crawl;
      // --source and --since-year runs list less by design.
      const discovery = await discoverDocuments(fetcher, sourceTypes, sinceYear, {
        enforceMinimums:
          !opts.source && sinceYear === config.defaultSinceYear,
      });
      const discovered = discovery.documents;

      let newCount = 0;
      for (const doc of discovered) {
        if (!isAllowedSourceUrl(doc.source_type, doc.source_url)) {
          registry.recordRejectedUrl(
            doc.source_url,
            doc.source_type,
            'domain not allowed by corpus manifest',
          );
          logger.warn(`Rejected out-of-scope URL: ${doc.source_url}`);
          continue;
        }
        if (!robots.isAllowed(doc.source_url)) {
          logger.debug(`Blocked by robots.txt: ${doc.source_url}`);
          continue;
        }
        const existing = registry.getByUrl(doc.source_url);
        if (!existing) newCount++;
        registry.upsertDiscovered(doc);
      }

      logger.info(
        `Discovered ${discovered.length} documents (${newCount} new)`,
      );

      if (dryRun) {
        logger.info('Dry run — skipping downloads');
        // A dry run never stamps source freshness.
        registry.completeCrawlRun(
          runId,
          {
            documents_discovered: newCount,
            documents_downloaded: 0,
            documents_unchanged: 0,
            documents_updated: 0,
            documents_errored: discovery.failedSourceTypes.length,
          },
          [],
        );
        reportDiscoveryFailures(discovery.failedSourceTypes);
        registry.close();
        return;
      }

      // Download phase — newly discovered documents (scoped to selected
      // sources), then check previously known documents for updates. The check
      // phase skips everything the download phase just handled so nothing is
      // fetched twice in the same run.
      const ctx = {
        registry,
        fetcher,
        sourceTypes,
        isAllowed: (url: string, sourceType: SourceType) =>
          isAllowedSourceUrl(sourceType, url) && robots.isAllowed(url),
      };
      const download = await runDownloadPhase(ctx);
      const check = await runCheckPhase(ctx, download.processedIds);
      const totals = mergeStats(download.stats, check);

      const stats = {
        documents_discovered: newCount,
        documents_downloaded: totals.downloaded,
        documents_unchanged: totals.unchanged,
        documents_updated: totals.updated,
        documents_errored:
          totals.errored + discovery.failedSourceTypes.length,
      };

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      registry.completeCrawlRun(
        runId,
        stats,
        discovery.successfulSourceTypes,
      );
      logger.info(`Crawl run #${runId} complete`);
      logger.info(`  Discovered: ${stats.documents_discovered} new documents`);
      logger.info(`  Downloaded: ${stats.documents_downloaded}`);
      logger.info(`  Unchanged: ${stats.documents_unchanged}`);
      logger.info(`  Updated: ${stats.documents_updated}`);
      logger.info(`  Errors: ${stats.documents_errored}`);
      reportDiscoveryFailures(discovery.failedSourceTypes);
      logger.info(`  Duration: ${elapsed}s`);

      registry.close();
      logger.close();
    });
}
