import { Command } from 'commander';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { MANIFEST_SOURCE_TYPES } from './corpus-manifest.js';
import { initializeSchema } from './db/schema.js';
import { createRegistry } from './db/registry.js';
import { createFetcher } from './crawl/fetcher.js';
import { createRobotsChecker } from './crawl/robots.js';
import { discoverDocuments } from './crawl/discovery.js';
import { mergeStats, runCheckPhase, runDownloadPhase } from './crawl/sync.js';
import { logger } from './utils/logger.js';
import type { SourceType } from './sources/types.js';

const VALID_SOURCE_TYPES: SourceType[] = [...MANIFEST_SOURCE_TYPES];

function initDb(): ReturnType<typeof createRegistry> & { close: () => void } {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const db = new Database(config.dbPath);
  initializeSchema(db);
  const registry = createRegistry(db);
  return { ...registry, close: () => db.close() };
}

function parseSourceTypes(source?: string): SourceType[] {
  if (!source) return VALID_SOURCE_TYPES;
  const types = source.split(',').map((s) => s.trim()) as SourceType[];
  for (const t of types) {
    if (!VALID_SOURCE_TYPES.includes(t)) {
      console.error(`Invalid source type: ${t}`);
      console.error(`Valid types: ${VALID_SOURCE_TYPES.join(', ')}`);
      process.exit(1);
    }
  }
  return types;
}

const program = new Command()
  .name('nc-medicaid-crawler')
  .description('Polite incremental crawler for NC Medicaid policy documents')
  .version('1.0.0');

// --- crawl command ---
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

    const fetcher = createFetcher({
      userAgent: config.userAgent,
      defaultDelayMs: config.defaultDelayMs,
      requestTimeoutMs: config.requestTimeoutMs,
      maxRetries: config.maxRetries,
      backoffBaseMs: config.backoffBaseMs,
      backoffMaxMs: config.backoffMaxMs,
      maxRedirects: config.maxRedirects,
    });

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

// --- check command ---
program
  .command('check')
  .description('Check for updates to known documents (no new discovery)')
  .option('-s, --source <types>', 'Comma-separated source types')
  .action(async (opts) => {
    const sourceTypes = parseSourceTypes(opts.source);
    const registry = initDb();
    const fetcher = createFetcher({
      userAgent: config.userAgent,
      defaultDelayMs: config.defaultDelayMs,
      requestTimeoutMs: config.requestTimeoutMs,
      maxRetries: config.maxRetries,
      backoffBaseMs: config.backoffBaseMs,
      backoffMaxMs: config.backoffMaxMs,
      maxRedirects: config.maxRedirects,
    });

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

// --- stats command ---
program
  .command('stats')
  .description('Show registry statistics')
  .action(() => {
    const registry = initDb();
    const stats = registry.getStats();

    const bySource = new Map<string, Map<string, number>>();
    let totalDocs = 0;

    for (const row of stats) {
      if (!bySource.has(row.source_type)) {
        bySource.set(row.source_type, new Map());
      }
      bySource.get(row.source_type)!.set(row.status, row.count);
      totalDocs += row.count;
    }

    console.log('\nRegistry Statistics');
    console.log('='.repeat(50));

    for (const [source, statuses] of bySource) {
      const parts: string[] = [];
      for (const [status, count] of statuses) {
        parts.push(`${count} ${status}`);
      }
      console.log(`  ${source}: ${parts.join(', ')}`);
    }

    // Compute total disk usage
    let totalBytes = 0;
    const allDocs = registry.getAllDocuments();
    for (const doc of allDocs) {
      if (doc.file_size) totalBytes += doc.file_size;
    }

    console.log('-'.repeat(50));
    console.log(
      `  Total: ${totalDocs} documents, ${(totalBytes / 1024 / 1024).toFixed(1)} MB on disk`,
    );
    console.log('');

    registry.close();
  });

// --- list command ---
program
  .command('list')
  .description('List documents with filters')
  .option('-s, --source <type>', 'Filter by source type')
  .option('--status <status>', 'Filter by status')
  .action((opts) => {
    const registry = initDb();
    let docs = registry.getAllDocuments();

    if (opts.source) {
      docs = docs.filter((d) => d.source_type === opts.source);
    }
    if (opts.status) {
      docs = docs.filter((d) => d.status === opts.status);
    }

    for (const doc of docs) {
      const size = doc.file_size
        ? `${Math.round(doc.file_size / 1024)} KB`
        : 'not downloaded';
      console.log(
        `[${doc.status}] ${doc.policy_number ?? ''} ${doc.title ?? doc.source_url} (${size})`,
      );
    }
    console.log(`\n${docs.length} documents`);

    registry.close();
  });

// --- add-url command ---
program
  .command('add-url <url>')
  .description('Manually add a document URL to the registry')
  .requiredOption('-s, --source <type>', 'Source type')
  .option('-t, --title <title>', 'Document title')
  .option('-p, --policy-number <number>', 'Policy number')
  .option('-c, --category <category>', 'Category')
  .action((url, opts) => {
    if (!VALID_SOURCE_TYPES.includes(opts.source)) {
      console.error(`Invalid source type: ${opts.source}`);
      process.exit(1);
    }

    const registry = initDb();
    const id = registry.upsertDiscovered({
      source_url: url,
      discovered_from: 'manual',
      source_type: opts.source,
      title: opts.title ?? null,
      policy_number: opts.policyNumber ?? null,
      category: opts.category ?? null,
    });

    console.log(`Added document #${id}: ${url}`);
    registry.close();
  });

// --- export command ---
program
  .command('export')
  .description('Export registry to JSON')
  .option('-o, --output <path>', 'Output file path', 'registry.json')
  .action((opts) => {
    const registry = initDb();
    const docs = registry.getAllDocuments();
    fs.writeFileSync(opts.output, JSON.stringify(docs, null, 2));
    console.log(`Exported ${docs.length} documents to ${opts.output}`);
    registry.close();
  });

// --- update-fixtures command ---
program
  .command('update-fixtures')
  .description('Update HTML test fixtures from live index pages')
  .action(async () => {
    const fetcher = createFetcher({
      userAgent: config.userAgent,
      defaultDelayMs: config.defaultDelayMs,
      requestTimeoutMs: config.requestTimeoutMs,
      maxRetries: config.maxRetries,
      backoffBaseMs: config.backoffBaseMs,
      backoffMaxMs: config.backoffMaxMs,
      maxRedirects: config.maxRedirects,
    });

    const fixturesDir = path.join(
      path.dirname(config.dbPath),
      '..',
      'tests',
      'fixtures',
    );
    fs.mkdirSync(fixturesDir, { recursive: true });

    const fixtures: Array<[string, string]> = [
      [config.sources.clinical_policy.indexUrl, 'clinical-policies.html'],
      [config.sources.bulletin.indexUrl, 'bulletins-main.html'],
      [config.sources.bulletin.blogListingUrl, 'bulletins-blog-listing.html'],
      [config.sources.bulletin.digestsUrl, 'bulletins-digests.html'],
      [config.sources.state_plan_amendment.indexUrl, 'state-plan-index.html'],
      ...config.sources.waiver.seedUrls.map(
        (url, i): [string, string] => [url, `waivers-seed-${i}.html`],
      ),
    ];

    for (const [url, filename] of fixtures) {
      try {
        const { body } = await fetcher.fetchHtml(url);
        const filePath = path.join(fixturesDir, filename);
        fs.writeFileSync(filePath, body);
        console.log(`Updated ${filename} (${body.length} bytes)`);
      } catch (err) {
        console.error(`Failed to fetch ${url}: ${(err as Error).message}`);
      }
    }
  });

program.parse();
