import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { Command } from 'commander';
import { initializeSchema } from '../../src/db/schema.js';
import { createRegistry } from '../../src/db/registry.js';
import type { SourceType } from '../../src/sources/types.js';

const { state, discoverDocuments } = vi.hoisted(() => ({
  state: { db: null as unknown },
  discoverDocuments: vi.fn(),
}));

vi.mock('../../src/cli/shared.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cli/shared.js')>()),
  // The test keeps the in-memory database open to read what the run stamped.
  initDb: () => ({
    ...createRegistry(state.db as Database.Database),
    close: () => {},
  }),
  buildFetcher: () => ({ setCrawlDelay: vi.fn() }),
}));
vi.mock('../../src/crawl/robots.js', () => ({
  createRobotsChecker: () => ({
    fetchAndCache: vi.fn(),
    getCrawlDelay: () => null,
    isAllowed: () => true,
  }),
}));
vi.mock('../../src/crawl/discovery.js', () => ({ discoverDocuments }));
vi.mock('../../src/crawl/sync.js', () => {
  const stats = { downloaded: 0, updated: 0, unchanged: 0, errored: 0 };
  return {
    runDownloadPhase: async () => ({ stats, processedIds: new Set<number>() }),
    runCheckPhase: async () => stats,
    mergeStats: () => stats,
  };
});

const { DISCOVERY_FAILED_EXIT_CODE, registerCrawlCommand } = await import(
  '../../src/cli/crawl.js'
);

function discoveryResult(
  successfulSourceTypes: SourceType[],
  failedSourceTypes: SourceType[],
) {
  return { documents: [], successfulSourceTypes, failedSourceTypes };
}

async function runCrawl(...args: string[]): Promise<void> {
  const program = new Command().exitOverride();
  registerCrawlCommand(program);
  await program.parseAsync(['crawl', ...args], { from: 'user' });
}

function dhhsDocument(name: string) {
  return {
    source_url: `https://policies.ncdhhs.gov/wp-content/uploads/${name}`,
    discovered_from:
      'https://policies.ncdhhs.gov/divisional-a-m/health-benefits-nc-medicaid/',
    source_type: 'dhhs_policy' as const,
    title: name,
    policy_number: null,
    category: null,
  };
}

function listedRuns(): Array<{ source_url: string; last_listed_run_id: number }> {
  return (state.db as Database.Database)
    .prepare(
      'SELECT source_url, last_listed_run_id FROM source_listings ORDER BY source_url',
    )
    .all() as Array<{ source_url: string; last_listed_run_id: number }>;
}

function checkedIndexRuns(): number[] {
  return (state.db as Database.Database)
    .prepare('SELECT last_complete_run_id FROM source_index_checks')
    .all()
    .map((row) => (row as { last_complete_run_id: number }).last_complete_run_id);
}

function stampedFamilies(): string[] {
  return (state.db as Database.Database)
    .prepare('SELECT source_type FROM source_freshness ORDER BY source_type')
    .all()
    .map((row) => (row as { source_type: string }).source_type);
}

describe('crawl command', () => {
  beforeEach(() => {
    const db = new Database(':memory:');
    initializeSchema(db);
    state.db = db;
  });

  afterEach(() => {
    (state.db as Database.Database).close();
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  it('stamps nothing on a dry run, even for families that passed', async () => {
    discoverDocuments.mockResolvedValue(
      discoveryResult(['clinical_policy', 'bulletin'], []),
    );

    await runCrawl('--dry-run');

    expect(stampedFamilies()).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });

  it('stamps only the families whose discovery passed', async () => {
    discoverDocuments.mockResolvedValue(
      discoveryResult(['clinical_policy'], ['fee_schedule']),
    );

    await runCrawl();

    expect(stampedFamilies()).toEqual(['clinical_policy']);
  });

  it('exits non-zero when a required family failed discovery', async () => {
    discoverDocuments.mockResolvedValue(
      discoveryResult(['clinical_policy'], ['bulletin']),
    );

    await runCrawl();

    expect(stampedFamilies()).toEqual(['clinical_policy']);
    expect(process.exitCode).toBe(DISCOVERY_FAILED_EXIT_CODE);
    expect(DISCOVERY_FAILED_EXIT_CODE).toBeGreaterThan(0);
  });

  it('exits non-zero on a dry run when a required family failed discovery', async () => {
    discoverDocuments.mockResolvedValue(discoveryResult([], ['bulletin']));

    await runCrawl('--dry-run');

    expect(process.exitCode).toBe(DISCOVERY_FAILED_EXIT_CODE);
  });

  it('exits zero when only a family not required for answering failed', async () => {
    discoverDocuments.mockResolvedValue(
      discoveryResult(['clinical_policy'], ['fee_schedule']),
    );

    await runCrawl();

    expect(process.exitCode).toBeUndefined();
  });

  it('records a listing for every URL a run returns and leaves an absent document at its earlier run', async () => {
    discoverDocuments.mockResolvedValue({
      ...discoveryResult(['dhhs_policy'], []),
      documents: [dhhsDocument('MA-2240-2.pdf'), dhhsDocument('MA-2240-3.pdf')],
    });
    await runCrawl();
    discoverDocuments.mockResolvedValue({
      ...discoveryResult(['dhhs_policy'], []),
      documents: [dhhsDocument('MA-2240-3.pdf')],
    });
    await runCrawl();

    expect(listedRuns()).toEqual([
      { source_url: dhhsDocument('MA-2240-2.pdf').source_url, last_listed_run_id: 1 },
      { source_url: dhhsDocument('MA-2240-3.pdf').source_url, last_listed_run_id: 2 },
    ]);
    expect(checkedIndexRuns()).toEqual([2]);
  });

  it('stores the index tags of each listed document and clears one the agency removes', async () => {
    const tags = () =>
      (state.db as Database.Database)
        .prepare('SELECT tags FROM source_listings')
        .get() as { tags: string };
    discoverDocuments.mockResolvedValue({
      ...discoveryResult(['dhhs_policy'], []),
      documents: [
        { ...dhhsDocument('2025-NON-MAGI.pdf'), doc_tags: ['archived', 'manual'] },
      ],
    });
    await runCrawl();
    expect(tags()).toEqual({ tags: '["archived","manual"]' });

    discoverDocuments.mockResolvedValue({
      ...discoveryResult(['dhhs_policy'], []),
      documents: [{ ...dhhsDocument('2025-NON-MAGI.pdf'), doc_tags: ['manual'] }],
    });
    await runCrawl();
    expect(tags()).toEqual({ tags: '["manual"]' });
  });

  it('records what a failed family listed but never treats its index as checked', async () => {
    discoverDocuments.mockResolvedValue({
      ...discoveryResult([], ['dhhs_policy']),
      documents: [dhhsDocument('MA-2240-3.pdf')],
    });

    await runCrawl();

    expect(listedRuns()).toHaveLength(1);
    expect(checkedIndexRuns()).toEqual([]);
  });

  it('never treats an index as checked on a dry, --source or --since-year run', async () => {
    discoverDocuments.mockResolvedValue({
      ...discoveryResult(['dhhs_policy'], []),
      documents: [dhhsDocument('MA-2240-3.pdf')],
    });

    await runCrawl('--dry-run');
    await runCrawl('--source', 'dhhs_policy');
    await runCrawl('--since-year', '2025');

    expect(listedRuns()).toEqual([
      { source_url: dhhsDocument('MA-2240-3.pdf').source_url, last_listed_run_id: 3 },
    ]);
    expect(checkedIndexRuns()).toEqual([]);
  });

  it('enforces family minimums only on a default full run', async () => {
    discoverDocuments.mockResolvedValue(discoveryResult([], []));

    await runCrawl('--dry-run');
    await runCrawl('--dry-run', '--source', 'bulletin');
    await runCrawl('--dry-run', '--since-year', '2025');

    expect(discoverDocuments.mock.calls.map((call) => call[3])).toEqual([
      { enforceMinimums: true },
      { enforceMinimums: false },
      { enforceMinimums: false },
    ]);
  });
});
