import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bulletinsSource,
  parseBulletinListingPage,
  parseDigestsPage,
  parseBulletinPostPage,
} from '../../src/sources/bulletins.js';
import type { Fetcher } from '../../src/sources/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, '../fixtures');

const blogListingHtml = readFileSync(
  path.join(fixtureDir, 'bulletins-blog-listing.html'),
  'utf8',
);
// Trimmed capture of the live listing after titles moved from h3 to h2.
const liveBlogListingHtml = readFileSync(
  path.join(fixtureDir, 'bulletins-blog-listing-2026-10-05.html'),
  'utf8',
);
const digestsHtml = readFileSync(
  path.join(fixtureDir, 'bulletins-digests.html'),
  'utf8',
);
const postHtml = readFileSync(
  path.join(fixtureDir, 'bulletins-post-quarterly.html'),
  'utf8',
);

const BLOG_LISTING_URL =
  'https://medicaid.ncdhhs.gov/blog-category/bulletins';
const DIGESTS_URL =
  'https://medicaid.ncdhhs.gov/providers/medicaid-bulletin/medicaid-bulletin-digests';
const POST_URL =
  'https://medicaid.ncdhhs.gov/blog/2026/01/27/quarterly-provider-update-winter-2026';

// ── parseBulletinListingPage ──────────────────────────────────────────────────

describe.each([
  ['March 2026 capture (h3 titles)', blogListingHtml],
  ['October 2026 capture (h2 titles)', liveBlogListingHtml],
])('parseBulletinListingPage on the %s', (_name, html) => {
  const result = parseBulletinListingPage(html, BLOG_LISTING_URL);

  it('returns exactly 10 distinct post URLs from the first page', () => {
    expect(result.postUrls.length).toBe(10);
    expect(new Set(result.postUrls).size).toBe(10);
  });

  it('every post URL is an absolute /blog/YYYY/MM/DD/slug URL', () => {
    for (const url of result.postUrls) {
      expect(url).toMatch(
        /^https:\/\/medicaid\.ncdhhs\.gov\/blog\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]+$/,
      );
    }
  });

  it('detects the next-page URL', () => {
    expect(result.nextPageUrl).toBeTruthy();
    expect(result.nextPageUrl).toContain('page=1');
  });

  it('next-page URL is absolute', () => {
    expect(result.nextPageUrl).toMatch(/^https:\/\//);
  });

});

describe('parseBulletinListingPage', () => {
  it('returns null nextPageUrl on a page with no next-page link', () => {
    // Synthesise minimal HTML with no pager
    const html = '<html><body><div class="views-row"><h3><a href="/blog/2025/01/01/foo">Foo</a></h3></div></body></html>';
    const r = parseBulletinListingPage(html, BLOG_LISTING_URL);
    expect(r.nextPageUrl).toBeNull();
  });

  it('parses a row whose title is an h2.field-content', () => {
    const html = '<div class="views-row"><div class="views-field views-field-title"><h2 class="field-content"><a href="/blog/2026/10/02/foo">Foo</a></h2></div></div>';
    const r = parseBulletinListingPage(html, BLOG_LISTING_URL);
    expect(r.postUrls).toEqual(['https://medicaid.ncdhhs.gov/blog/2026/10/02/foo']);
  });

  it('keeps one URL per post and ignores row links that are not posts', () => {
    const html = `
      <div class="views-row">
        <h2><a href="/blog/2026/10/02/foo">Foo</a></h2>
        <a href="/blog/2026/10/02/foo">Read more</a>
        <a href="/blog-category/bulletins">Bulletins</a>
        <a href="/media/123/download?attachment">Attachment</a>
      </div>`;
    const r = parseBulletinListingPage(html, BLOG_LISTING_URL);
    expect(r.postUrls).toEqual(['https://medicaid.ncdhhs.gov/blog/2026/10/02/foo']);
  });
});

// ── bulletinsSource.discover ─────────────────────────────────────────────────

describe('bulletinsSource.discover', () => {
  const PAGE_2_URL = `${BLOG_LISTING_URL}?page=1`;
  const row = (href: string) =>
    `<div class="views-row"><h2 class="field-content"><a href="${href}">Post</a></h2></div>`;
  const nextLink = '<a rel="next" href="/blog-category/bulletins?page=1">Next</a>';

  function fetcherFor(
    listings: Record<string, { body: string; statusCode: number }>,
  ): Fetcher {
    return {
      fetchHtml: async (url: string) => {
        if (url === DIGESTS_URL) return { body: digestsHtml, statusCode: 200 };
        return listings[url] ?? { body: postHtml, statusCode: 200 };
      },
      fetchFile: async () => {
        throw new Error('not used');
      },
    };
  }

  it('rejects a 200 first listing page with rows but no parsable posts', async () => {
    const fetcher = fetcherFor({
      [BLOG_LISTING_URL]: {
        body: '<div class="views-row"><h2 class="field-content"><a href="/news/redesigned">Post</a></h2></div>',
        statusCode: 200,
      },
    });

    await expect(bulletinsSource.discover(fetcher, 2018)).rejects.toThrow(
      /no posts parsed/,
    );
  });

  it('rejects a listing page that is not 200', async () => {
    const fetcher = fetcherFor({
      [BLOG_LISTING_URL]: { body: 'Forbidden', statusCode: 403 },
    });

    await expect(bulletinsSource.discover(fetcher, 2018)).rejects.toThrow(/403/);
  });

  it('rejects a later listing page that is not 200', async () => {
    const fetcher = fetcherFor({
      [BLOG_LISTING_URL]: { body: row('/blog/2026/10/02/foo') + nextLink, statusCode: 200 },
      [PAGE_2_URL]: { body: 'Not found', statusCode: 404 },
    });

    await expect(bulletinsSource.discover(fetcher, 2018)).rejects.toThrow(/404/);
  });

  it('rejects a later listing page with no posts while a next link exists', async () => {
    const fetcher = fetcherFor({
      [BLOG_LISTING_URL]: { body: row('/blog/2026/10/02/foo') + nextLink, statusCode: 200 },
      [PAGE_2_URL]: { body: nextLink, statusCode: 200 },
    });

    await expect(bulletinsSource.discover(fetcher, 2018)).rejects.toThrow(
      /no posts parsed/,
    );
  });

  it('stops quietly at an empty last page and returns post attachments', async () => {
    const fetcher = fetcherFor({
      [BLOG_LISTING_URL]: { body: row('/blog/2026/10/02/foo') + nextLink, statusCode: 200 },
      [PAGE_2_URL]: { body: '<html><body></body></html>', statusCode: 200 },
    });

    const docs = await bulletinsSource.discover(fetcher, 2018);

    expect(
      docs.some(
        (doc) => doc.discovered_from === 'https://medicaid.ncdhhs.gov/blog/2026/10/02/foo',
      ),
    ).toBe(true);
  });
});

// ── parseDigestsPage ─────────────────────────────────────────────────────────

describe('parseDigestsPage', () => {
  // sinceYear=0 disables year filtering so the full fixture is visible.
  const docs = parseDigestsPage(digestsHtml, DIGESTS_URL, 0);

  it('discovers at least 90 digest documents', () => {
    // The real page has ~96 /download?attachment links across 9 year tabs
    expect(docs.length).toBeGreaterThanOrEqual(90);
  });

  it('all results have source_type of bulletin', () => {
    for (const doc of docs) {
      expect(doc.source_type).toBe('bulletin');
    }
  });

  it('all results have absolute source_urls with /download?attachment', () => {
    for (const doc of docs) {
      expect(doc.source_url).toMatch(/^https:\/\//);
      expect(doc.source_url).toContain('/download?attachment');
    }
  });

  it('all results have discovered_from set to the digests URL', () => {
    for (const doc of docs) {
      expect(doc.discovered_from).toBe(DIGESTS_URL);
    }
  });

  it('all results have a category containing the year', () => {
    for (const doc of docs) {
      expect(doc.category).toMatch(/\d{4}/);
    }
  });

  it('titles include the month name', () => {
    const jan = docs.find((d) => d.title?.includes('January'));
    expect(jan).toBeDefined();
  });

  it('applies sinceYear filter — only returns docs from 2024 onward', () => {
    const filtered = parseDigestsPage(digestsHtml, DIGESTS_URL, 2024);
    // Should have 2024, 2025, 2026 only (max ~25)
    expect(filtered.length).toBeGreaterThan(0);
    for (const doc of filtered) {
      const yearMatch = (doc.category ?? '').match(/(\d{4})/);
      expect(yearMatch).toBeTruthy();
      expect(parseInt(yearMatch![1], 10)).toBeGreaterThanOrEqual(2024);
    }
  });

  it('sinceYear=2026 returns only 2026 digests', () => {
    const filtered = parseDigestsPage(digestsHtml, DIGESTS_URL, 2026);
    expect(filtered.length).toBeGreaterThan(0);
    for (const doc of filtered) {
      expect(doc.category).toContain('2026');
    }
  });

  it('no duplicate source_urls', () => {
    const urls = docs.map((d) => d.source_url);
    const unique = new Set(urls);
    expect(unique.size).toBe(urls.length);
  });
});

// ── parseBulletinPostPage ─────────────────────────────────────────────────────

describe('parseBulletinPostPage', () => {
  const docs = parseBulletinPostPage(postHtml, POST_URL);

  it('finds PDF download links in the quarterly post', () => {
    expect(docs.length).toBeGreaterThanOrEqual(1);
  });

  it('all results have source_type of bulletin', () => {
    for (const doc of docs) {
      expect(doc.source_type).toBe('bulletin');
    }
  });

  it('all results have absolute source_urls with /download?attachment', () => {
    for (const doc of docs) {
      expect(doc.source_url).toMatch(/^https:\/\//);
      expect(doc.source_url).toContain('/download?attachment');
    }
  });

  it('all results have discovered_from set to the post URL', () => {
    for (const doc of docs) {
      expect(doc.discovered_from).toBe(POST_URL);
    }
  });

  it('returns empty array for a post with no PDF attachments', () => {
    const html = '<html><body><h1>HTML Only Post</h1><p>No PDFs here.</p></body></html>';
    const result = parseBulletinPostPage(html, POST_URL);
    expect(result).toHaveLength(0);
  });

  it('uses the link text as the document title', () => {
    // Each download link in the post has descriptive text
    for (const doc of docs) {
      expect(doc.title).toBeTruthy();
    }
  });
});
