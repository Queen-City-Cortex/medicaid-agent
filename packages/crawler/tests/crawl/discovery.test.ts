import { describe, expect, it } from 'vitest';
import { config } from '../../src/config.js';
import { MANIFEST_SOURCE_TYPES, isFrozenSourceType } from '../../src/corpus-manifest.js';
import { discoverDocuments } from '../../src/crawl/discovery.js';
import { pageCrawlSource } from '../../src/sources/crawl-helpers.js';
import type { DiscoveredDocument, Fetcher, SourceType } from '../../src/sources/types.js';

function stubFetcher(
  respond: (url: string) => { body: string; statusCode: number },
): Fetcher {
  return {
    fetchHtml: async (url: string) => respond(url),
    fetchFile: async () => {
      throw new Error('not used');
    },
  };
}

// Families that read at least one configured page. beneficiary_guidance and
// nc_statute are static seed lists and never fetch, so they cannot fail this way.
const SEED_LIST_FAMILIES = ['beneficiary_guidance', 'nc_statute'];
// The manifest marks the fee-schedule archive frozen: discovery skips it.
const FROZEN_FAMILIES = ['fee_schedule'];
const FETCHING_FAMILIES = MANIFEST_SOURCE_TYPES.filter(
  (sourceType) =>
    !SEED_LIST_FAMILIES.includes(sourceType) && !FROZEN_FAMILIES.includes(sourceType),
);

function providerManualPage(count: number): string {
  const items = Array.from(
    { length: count },
    (_value, i) =>
      `<li class="download"><a href="/content/dam/jcr:${i}/Manual${i}.pdf">Manual ${i}</a></li>`,
  ).join('');
  return `<html><body><div class="links"><h2>Manuals</h2><ul>${items}</ul></div></body></html>`;
}

describe('discoverDocuments', () => {
  it('records every fetching family as failed when the configured pages answer 403', async () => {
    const fetcher = stubFetcher(() => ({ body: 'Forbidden', statusCode: 403 }));

    const result = await discoverDocuments(
      fetcher,
      [...MANIFEST_SOURCE_TYPES],
      config.defaultSinceYear,
      { enforceMinimums: true },
    );

    expect([...result.failedSourceTypes].sort()).toEqual([...FETCHING_FAMILIES].sort());
    expect([...result.successfulSourceTypes].sort()).toEqual(SEED_LIST_FAMILIES);
    expect(
      result.documents.every((doc) => SEED_LIST_FAMILIES.includes(doc.source_type)),
    ).toBe(true);
  });

  it('skips a frozen family: no fetch, no floor, neither passed nor failed', async () => {
    expect(MANIFEST_SOURCE_TYPES.filter(isFrozenSourceType)).toEqual(FROZEN_FAMILIES);
    expect(config.minDiscoveredDocuments.fee_schedule).toBeGreaterThan(0);
    const fetched: string[] = [];
    const fetcher = stubFetcher((url) => {
      fetched.push(url);
      return { body: providerManualPage(config.minDiscoveredDocuments.provider_manual), statusCode: 200 };
    });

    const result = await discoverDocuments(
      fetcher,
      ['fee_schedule', 'provider_manual'],
      config.defaultSinceYear,
      { enforceMinimums: true },
    );

    expect(result.failedSourceTypes).toEqual([]);
    expect(result.successfulSourceTypes).toEqual(['provider_manual']);
    expect(result.documents.every((doc) => doc.source_type === 'provider_manual')).toBe(true);
    expect(fetched.length).toBeGreaterThan(0);
    expect(fetched.some((url) => url.includes('fee-schedules'))).toBe(false);
  });

  it('records a family as failed when its index answers 403', async () => {
    const fetcher = stubFetcher(() => ({ body: 'Forbidden', statusCode: 403 }));

    const result = await discoverDocuments(fetcher, ['clinical_policy'], 2018, {
      enforceMinimums: false,
    });

    expect(result.failedSourceTypes).toEqual(['clinical_policy']);
    expect(result.successfulSourceTypes).toEqual([]);
    expect(result.documents).toEqual([]);
  });

  it('records a family as failed when a 200 page has unrecognised markup', async () => {
    const fetcher = stubFetcher(() => ({
      body: '<html><body><main><p>We have redesigned this page.</p></main></body></html>',
      statusCode: 200,
    }));
    const families: SourceType[] = [...FETCHING_FAMILIES];

    const result = await discoverDocuments(fetcher, families, 2018, {
      enforceMinimums: false,
    });

    expect([...result.failedSourceTypes].sort()).toEqual([...families].sort());
    expect(result.successfulSourceTypes).toEqual([]);
    expect(result.documents).toEqual([]);
  });

  it('enforces the per-family minimum only when asked, and keeps what a short listing found', async () => {
    const minimum = config.minDiscoveredDocuments.provider_manual;
    expect(minimum).toBeGreaterThan(2);
    const fetcher = stubFetcher(() => ({ body: providerManualPage(2), statusCode: 200 }));

    const partial = await discoverDocuments(fetcher, ['provider_manual'], 2018, {
      enforceMinimums: false,
    });
    expect(partial.successfulSourceTypes).toEqual(['provider_manual']);
    expect(partial.documents).toHaveLength(2);

    const full = await discoverDocuments(fetcher, ['provider_manual'], 2018, {
      enforceMinimums: true,
    });
    expect(full.failedSourceTypes).toEqual(['provider_manual']);
    expect(full.successfulSourceTypes).toEqual([]);
    expect(full.documents).toHaveLength(2);

    const healthy = await discoverDocuments(
      stubFetcher(() => ({ body: providerManualPage(minimum), statusCode: 200 })),
      ['provider_manual'],
      2018,
      { enforceMinimums: true },
    );
    expect(healthy.successfulSourceTypes).toEqual(['provider_manual']);
  });
});

describe('pageCrawlSource', () => {
  const START_URL = 'https://medicaid.ncdhhs.gov/start';
  const SUBPAGE_URL = 'https://medicaid.ncdhhs.gov/start/more';
  const doc = (pageUrl: string): DiscoveredDocument => ({
    source_url: `${pageUrl}/download?attachment`,
    discovered_from: pageUrl,
    source_type: 'billing_guidance',
    title: 'Guide',
    policy_number: null,
    category: null,
  });
  const source = pageCrawlSource({
    logPrefix: 'test',
    startUrls: () => [START_URL],
    parsePage: (_html, pageUrl) => [doc(pageUrl)],
    extractSubpageUrls: (_html, pageUrl) => (pageUrl === START_URL ? [SUBPAGE_URL] : []),
  });

  it('throws when a configured start page is not 200', async () => {
    const fetcher = stubFetcher(() => ({ body: '', statusCode: 404 }));

    await expect(source.discover(fetcher, 0)).rejects.toThrow(/404.*\/start/);
  });

  it('skips a sub-page that is not 200 and keeps the rest', async () => {
    const fetcher = stubFetcher((url) => ({
      body: '<html></html>',
      statusCode: url === START_URL ? 200 : 404,
    }));

    const docs = await source.discover(fetcher, 0);

    expect(docs.map((d) => d.discovered_from)).toEqual([START_URL]);
  });
});
