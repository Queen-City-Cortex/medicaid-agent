import type { Command } from 'commander';
import { config } from '../config.js';
import { createRobotsChecker } from '../crawl/robots.js';
import { runCheckPhase } from '../crawl/sync.js';
import { logger } from '../utils/logger.js';
import type { SourceType } from '../sources/types.js';
import { buildFetcher, initDb, parseSourceTypes } from './shared.js';

export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Check for updates to known documents (no new discovery)')
    .option('-s, --source <types>', 'Comma-separated source types')
    .action(async (opts) => {
      const sourceTypes = parseSourceTypes(opts.source);
      const registry = initDb();
      const fetcher = buildFetcher();

      const robots = createRobotsChecker(config.userAgent);
      // Fetch robots for relevant domains
      const domains = new Set<string>();
      const docs = registry.getDocumentsToCheck();
      for (const doc of docs) {
        if (sourceTypes.includes(doc.source_type as SourceType)) {
          domains.add(new URL(doc.source_url).hostname);
        }
      }
      for (const domain of domains) {
        await robots.fetchAndCache(domain, fetcher);
      }

      logger.info('Checking for updates...');

      const stats = await runCheckPhase({
        registry,
        fetcher,
        sourceTypes,
        isAllowed: (url: string) => robots.isAllowed(url),
      });

      logger.info(
        `Check complete: ${stats.unchanged} unchanged, ${stats.updated} updated, ${stats.errored} errors`,
      );
      registry.close();
      logger.close();
    });
}
