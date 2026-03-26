import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inferWaiverCategory,
  parseWaiverPage,
} from '../../src/sources/waivers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, '../fixtures');

const innovationsHtml = readFileSync(
  path.join(fixtureDir, 'waivers-innovations.html'),
  'utf8',
);
const waiver1915iHtml = readFileSync(
  path.join(fixtureDir, 'waivers-1915i.html'),
  'utf8',
);

const INNOVATIONS_URL =
  'https://medicaid.ncdhhs.gov/beneficiaries/nc-innovations-waiver/information-providers-nc-innovations-waiver';
const WAIVER_1915I_URL = 'https://medicaid.ncdhhs.gov/beneficiaries/1915i';

// ── inferWaiverCategory ───────────────────────────────────────────────────────

describe('inferWaiverCategory', () => {
  it('maps NC Innovations Waiver pages correctly', () => {
    expect(inferWaiverCategory(INNOVATIONS_URL)).toBe('NC Innovations Waiver');
  });

  it('maps 1915(i) pages correctly', () => {
    expect(inferWaiverCategory(WAIVER_1915I_URL)).toBe('1915(i) HCBS');
  });

  it('maps CAP/DA pages correctly', () => {
    expect(
      inferWaiverCategory(
        'https://medicaid.ncdhhs.gov/beneficiaries/cap-da',
      ),
    ).toBe('CAP/DA');
  });

  it('maps CAP/C pages correctly', () => {
    expect(
      inferWaiverCategory(
        'https://medicaid.ncdhhs.gov/beneficiaries/cap-c',
      ),
    ).toBe('CAP/C');
  });

  it('returns generic "Waiver" for unrecognised URLs', () => {
    expect(
      inferWaiverCategory('https://medicaid.ncdhhs.gov/some-other-page'),
    ).toBe('Waiver');
  });
});

// ── parseWaiverPage — NC Innovations ─────────────────────────────────────────

describe('parseWaiverPage (NC Innovations)', () => {
  const docs = parseWaiverPage(innovationsHtml, INNOVATIONS_URL);

  it('finds documents on the NC Innovations page', () => {
    expect(docs.length).toBeGreaterThanOrEqual(5);
  });

  it('all documents have source_type waiver', () => {
    for (const doc of docs) {
      expect(doc.source_type).toBe('waiver');
    }
  });

  it('all documents have absolute source_urls with /download', () => {
    for (const doc of docs) {
      expect(doc.source_url).toMatch(/^https:\/\//);
      expect(doc.source_url).toContain('/download');
    }
  });

  it('all documents have discovered_from set to the innovations URL', () => {
    for (const doc of docs) {
      expect(doc.discovered_from).toBe(INNOVATIONS_URL);
    }
  });

  it('all documents have category "NC Innovations Waiver"', () => {
    for (const doc of docs) {
      expect(doc.category).toBe('NC Innovations Waiver');
    }
  });

  it('all documents have a non-empty title', () => {
    for (const doc of docs) {
      expect(doc.title).toBeTruthy();
    }
  });

  it('no duplicate source_urls', () => {
    const urls = docs.map((d) => d.source_url);
    const unique = new Set(urls);
    expect(unique.size).toBe(urls.length);
  });

  it('finds the NC Innovations Waiver Application document', () => {
    const appDoc = docs.find(
      (d) =>
        d.title?.includes('Application') &&
        (d.title?.includes('1915') || d.source_url.includes('1915')),
    );
    expect(appDoc).toBeDefined();
  });
});

// ── parseWaiverPage — 1915(i) ─────────────────────────────────────────────────

describe('parseWaiverPage (1915i)', () => {
  const docs = parseWaiverPage(waiver1915iHtml, WAIVER_1915I_URL);

  it('finds documents on the 1915(i) page', () => {
    expect(docs.length).toBeGreaterThanOrEqual(2);
  });

  it('all documents have source_type waiver', () => {
    for (const doc of docs) {
      expect(doc.source_type).toBe('waiver');
    }
  });

  it('all documents have absolute source_urls with /download', () => {
    for (const doc of docs) {
      expect(doc.source_url).toMatch(/^https:\/\//);
      expect(doc.source_url).toContain('/download');
    }
  });

  it('all documents have category "1915(i) HCBS"', () => {
    for (const doc of docs) {
      expect(doc.category).toBe('1915(i) HCBS');
    }
  });

  it('finds the 1915(i) Services flyer', () => {
    const flyer = docs.find(
      (d) => d.title?.includes('1915(i)') || d.source_url.includes('1915i'),
    );
    expect(flyer).toBeDefined();
  });

  it('returns empty array for page with no download links', () => {
    const html =
      '<html><body><h1>Waiver Info</h1><p>No downloads here.</p></body></html>';
    const result = parseWaiverPage(html, WAIVER_1915I_URL);
    expect(result).toHaveLength(0);
  });
});
