import type { Command } from 'commander';
import { config } from '../config.js';
import { createRobotsChecker } from '../crawl/robots.js';
import { discoverDocuments } from '../crawl/discovery.js';
import { mergeStats, runCheckPhase, runDownloadPhase } from '../crawl/sync.js';
import { logger } from '../utils/logger.js';
import { buildFetcher, initDb, parseSourceTypes } from './shared.js';

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

      // Discovery phase
      const discovered = await discoverDocuments(fetcher, sourceTypes, sinceYear);

      let newCount = 0;
      for (const doc of discovered) {
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
        registry.completeCrawlRun(runId, {
          documents_discovered: newCount,
          documents_downloaded: 0,
          documents_unchanged: 0,
          documents_updated: 0,
          documents_errored: 0,
        });
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
        isAllowed: (url: string) => robots.isAllowed(url),
      };
      const download = await runDownloadPhase(ctx);
      const check = await runCheckPhase(ctx, download.processedIds);
      const totals = mergeStats(download.stats, check);

      const stats = {
        documents_discovered: newCount,
        documents_downloaded: totals.downloaded,
        documents_unchanged: totals.unchanged,
        documents_updated: totals.updated,
        documents_errored: totals.errored,
      };

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      registry.completeCrawlRun(runId, stats);
      logger.info(`Crawl run #${runId} complete`);
      logger.info(`  Discovered: ${stats.documents_discovered} new documents`);
      logger.info(`  Downloaded: ${stats.documents_downloaded}`);
      logger.info(`  Unchanged: ${stats.documents_unchanged}`);
      logger.info(`  Updated: ${stats.documents_updated}`);
      logger.info(`  Errors: ${stats.documents_errored}`);
      logger.info(`  Duration: ${elapsed}s`);

      registry.close();
      logger.close();
    });
}
