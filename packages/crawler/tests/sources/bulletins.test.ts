import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseBulletinListingPage,
  parseDigestsPage,
  parseBulletinPostPage,
} from '../../src/sources/bulletins.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, '../fixtures');

const blogListingHtml = readFileSync(
  path.join(fixtureDir, 'bulletins-blog-listing.html'),
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

describe('parseBulletinListingPage', () => {
  const result = parseBulletinListingPage(blogListingHtml, BLOG_LISTING_URL);

  it('returns exactly 10 post URLs from the first page', () => {
    expect(result.postUrls.length).toBe(10);
  });

  it('all post URLs are absolute https URLs', () => {
    for (const url of result.postUrls) {
      expect(url).toMatch(/^https:\/\//);
    }
  });

  it('all post URLs follow the /blog/YYYY/MM/DD/slug pattern', () => {
    for (const url of result.postUrls) {
      expect(url).toMatch(/\/blog\/\d{4}\/\d{2}\/\d{2}\//);
    }
  });

  it('detects the next-page URL', () => {
    expect(result.nextPageUrl).toBeTruthy();
    expect(result.nextPageUrl).toContain('page=1');
  });

  it('next-page URL is absolute', () => {
    expect(result.nextPageUrl).toMatch(/^https:\/\//);
  });

  it('first post URL matches the most-recent bulletin', () => {
    // The fixture was fetched on 2026-03-26, top post is from that date
    expect(result.postUrls[0]).toContain(
      'reminders-about-required-provider-disclosures',
    );
  });

  it('returns null nextPageUrl on a page with no next-page link', () => {
    // Synthesise minimal HTML with no pager
    const html = '<html><body><div class="views-row"><h3><a href="/blog/2025/01/01/foo">Foo</a></h3></div></body></html>';
    const r = parseBulletinListingPage(html, BLOG_LISTING_URL);
    expect(r.nextPageUrl).toBeNull();
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
