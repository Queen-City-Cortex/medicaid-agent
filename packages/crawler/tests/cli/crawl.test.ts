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
