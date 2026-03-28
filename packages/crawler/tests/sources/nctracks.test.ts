import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNcTracksPage } from '../../src/sources/nctracks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  path.join(__dirname, '../fixtures/nctracks-provider-manuals.html'),
  'utf8',
);

const INDEX_URL =
  'https://www.nctracks.nc.gov/content/public/providers/provider-manuals.html';

describe('parseNcTracksPage', () => {
  const docs = parseNcTracksPage(fixtureHtml, INDEX_URL);

  it('discovers at least 30 documents', () => {
    expect(docs.length).toBeGreaterThanOrEqual(30);
  });

  it('discovers exactly 34 documents from the fixture', () => {
    expect(docs.length).toBe(34);
  });

  it('all results have source_type of provider_manual', () => {
    for (const doc of docs) {
      expect(doc.source_type).toBe('provider_manual');
    }
  });

  it('all results have discovered_from set to the index URL', () => {
    for (const doc of docs) {
      expect(doc.discovered_from).toBe(INDEX_URL);
    }
  });

  it('all results have absolute source_urls starting with https', () => {
    for (const doc of docs) {
      expect(doc.source_url).toMatch(/^https:\/\//);
    }
  });

  it('all source_urls are on nctracks.nc.gov and under /content/dam/', () => {
    for (const doc of docs) {
      expect(doc.source_url).toContain('nctracks.nc.gov');
      expect(doc.source_url).toContain('/content/dam/');
    }
  });

  it('all results have a non-empty title', () => {
    for (const doc of docs) {
      expect(doc.title).toBeTruthy();
    }
  });

  it('titles do not contain raw <em> suffixes like "(PDF, 303 KB)"', () => {
    for (const doc of docs) {
      expect(doc.title).not.toMatch(/\(PDF,/i);
      expect(doc.title).not.toMatch(/\(XLSX,/i);
      expect(doc.title).not.toMatch(/\(VND\./i);
    }
  });

  it('all results have a category (section heading)', () => {
    for (const doc of docs) {
      expect(doc.category).toBeTruthy();
    }
  });

  it('finds documents in all four sections', () => {
    const categories = new Set(docs.map((d) => d.category));
    expect(categories).toContain('Provider Policies, Manuals and Guidelines');
    expect(categories).toContain('Provider Forms');
    expect(categories).toContain('Enrollment Forms');
    expect(categories).toContain('Sample Accounts Receivable Letters');
  });

  it('no duplicate source_urls', () => {
    const urls = docs.map((d) => d.source_url);
    const unique = new Set(urls);
    expect(unique.size).toBe(urls.length);
  });

  it('finds known document: Provider Claims and Billing Assistance Guide', () => {
    const doc = docs.find((d) =>
      d.title?.includes('Provider Claims and Billing Assistance Guide'),
    );
    expect(doc).toBeDefined();
    expect(doc?.category).toBe('Provider Policies, Manuals and Guidelines');
    expect(doc?.source_url).toContain('/content/dam/');
    expect(doc?.source_url).toMatch(/\.pdf$/i);
  });

  it('finds known XLSX document: EOB Code Crosswalk', () => {
    const doc = docs.find((d) =>
      d.title?.includes('EOB Code Crosswalk'),
    );
    expect(doc).toBeDefined();
    expect(doc?.source_url).toContain('/content/dam/');
    expect(doc?.source_url).toMatch(/\.xlsx$/i);
  });

  it('finds known DOCX document: 30 Days Past Due Letter', () => {
    const doc = docs.find((d) =>
      d.title?.includes('30 Days Past Due Letter'),
    );
    expect(doc).toBeDefined();
    expect(doc?.category).toBe('Sample Accounts Receivable Letters');
    expect(doc?.source_url).toMatch(/\.docx$/i);
  });

  it('all policy_number fields are null (NCTracks does not use policy numbers)', () => {
    for (const doc of docs) {
      expect(doc.policy_number).toBeNull();
    }
  });
});
