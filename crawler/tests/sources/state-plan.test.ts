import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseSpaNumber,
  parseStatePlanIndexPage,
  parseSubPage,
} from '../../src/sources/state-plan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, '../fixtures');

const indexHtml = readFileSync(
  path.join(fixtureDir, 'state-plan-index.html'),
  'utf8',
);
const subPageHtml = readFileSync(
  path.join(fixtureDir, 'state-plan-subpage-2026.html'),
  'utf8',
);

const INDEX_URL =
  'https://medicaid.ncdhhs.gov/meetingsnotices/medicaid-state-plan-public-notices';
const SUBPAGE_URL =
  'https://medicaid.ncdhhs.gov/meetingsnotices/medicaid-state-plan-public-notices/2026-proposed-public-notices';

// ── parseSpaNumber ────────────────────────────────────────────────────────────

describe('parseSpaNumber', () => {
  it('extracts "SPA YY-NNNN" format', () => {
    expect(parseSpaNumber('SPA 26-0001 10-Day Public Notice')).toBe('SPA 26-0001');
  });

  it('extracts "SPA NC YY-NNNN" format', () => {
    expect(parseSpaNumber('SPA NC 24-0001 description')).toBe('SPA 24-0001');
  });

  it('extracts bare "YY-NNNN" at start of text', () => {
    expect(parseSpaNumber('24-0003 Some title')).toBe('24-0003');
  });

  it('extracts "NC-YY-NNNN" format', () => {
    expect(parseSpaNumber('NC-24-0003 Some title')).toBe('NC-24-0003');
  });

  it('returns null when no SPA number present', () => {
    expect(parseSpaNumber('ABP1 Populations')).toBeNull();
    expect(parseSpaNumber('Expansion Eligibility SPA')).toBeNull();
  });

  it('is case-insensitive for SPA prefix', () => {
    expect(parseSpaNumber('spa 25-0002 description')).toBe('SPA 25-0002');
  });
});

// ── parseStatePlanIndexPage ───────────────────────────────────────────────────

describe('parseStatePlanIndexPage', () => {
  const result = parseStatePlanIndexPage(indexHtml, INDEX_URL);

  it('returns a result object with documents and subPageUrls', () => {
    expect(result).toHaveProperty('documents');
    expect(result).toHaveProperty('subPageUrls');
  });

  it('finds direct download documents on the index page', () => {
    expect(result.documents.length).toBeGreaterThan(5);
  });

  it('all direct documents have source_type state_plan_amendment', () => {
    for (const doc of result.documents) {
      expect(doc.source_type).toBe('state_plan_amendment');
    }
  });

  it('all direct documents have absolute source_urls', () => {
    for (const doc of result.documents) {
      expect(doc.source_url).toMatch(/^https:\/\//);
    }
  });

  it('all direct documents have discovered_from set to the index URL', () => {
    for (const doc of result.documents) {
      expect(doc.discovered_from).toBe(INDEX_URL);
    }
  });

  it('all direct documents have a non-empty title', () => {
    for (const doc of result.documents) {
      expect(doc.title).toBeTruthy();
    }
  });

  it('finds sub-page URLs', () => {
    expect(result.subPageUrls.length).toBeGreaterThan(5);
  });

  it('all sub-page URLs are absolute https URLs on medicaid.ncdhhs.gov', () => {
    for (const url of result.subPageUrls) {
      expect(url).toMatch(/^https:\/\/medicaid\.ncdhhs\.gov\//);
    }
  });

  it('sub-page URLs match SPA-related patterns', () => {
    const SPA_RE = /proposed-public-notices|ten-day-postings?|proposed-amendments-sent|spa-updates/;
    for (const url of result.subPageUrls) {
      expect(url).toMatch(SPA_RE);
    }
  });

  it('no sub-page URLs point to old dma.ncdhhs.gov domain', () => {
    for (const url of result.subPageUrls) {
      expect(url).not.toContain('dma.ncdhhs.gov');
    }
  });

  it('no duplicate sub-page URLs', () => {
    const unique = new Set(result.subPageUrls);
    expect(unique.size).toBe(result.subPageUrls.length);
  });

  it('finds SPA 26-xxxx numbered documents with extracted SPA numbers', () => {
    const spaNumberedDocs = result.documents.filter(
      (d) => d.policy_number !== null,
    );
    expect(spaNumberedDocs.length).toBeGreaterThan(0);
  });

  it('no duplicate source_urls in direct documents', () => {
    const urls = result.documents.map((d) => d.source_url);
    const unique = new Set(urls);
    expect(unique.size).toBe(urls.length);
  });
});

// ── parseSubPage ──────────────────────────────────────────────────────────────

describe('parseSubPage', () => {
  const docs = parseSubPage(subPageHtml, SUBPAGE_URL);

  it('finds documents on the 2026 proposed public notices sub-page', () => {
    // The 2026 page has SPA 26-0001 (/open) and SPA 26-0002 (/download)
    expect(docs.length).toBeGreaterThanOrEqual(1);
  });

  it('all documents have source_type state_plan_amendment', () => {
    for (const doc of docs) {
      expect(doc.source_type).toBe('state_plan_amendment');
    }
  });

  it('all documents have absolute source_urls', () => {
    for (const doc of docs) {
      expect(doc.source_url).toMatch(/^https:\/\//);
    }
  });

  it('all documents have discovered_from set to the sub-page URL', () => {
    for (const doc of docs) {
      expect(doc.discovered_from).toBe(SUBPAGE_URL);
    }
  });

  it('all documents have a non-empty title', () => {
    for (const doc of docs) {
      expect(doc.title).toBeTruthy();
    }
  });

  it('SPA 26-0002 download is found', () => {
    const doc = docs.find(
      (d) =>
        d.source_url.includes('spa-26-0002') ||
        (d.policy_number !== null && d.policy_number.includes('26-0002')),
    );
    expect(doc).toBeDefined();
  });

  it('SPA 26-0001 /open link is found', () => {
    const doc = docs.find(
      (d) =>
        d.source_url.includes('spa-26-0001') ||
        (d.policy_number !== null && d.policy_number.includes('26-0001')),
    );
    expect(doc).toBeDefined();
  });

  it('returns empty array for page with no SPA documents', () => {
    const html =
      '<html><body><h1>Empty Page</h1><p>No documents here.</p></body></html>';
    const result = parseSubPage(html, SUBPAGE_URL);
    expect(result).toHaveLength(0);
  });
});
