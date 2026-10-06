import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDhhsPoliciesPage } from '../../src/sources/dhhs-policies.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  path.join(__dirname, '../fixtures/dhhs-policies-index.html'),
  'utf8',
);

const INDEX_URL =
  'https://policies.ncdhhs.gov/divisional-a-m/health-benefits-nc-medicaid/';

describe('parseDhhsPoliciesPage', () => {
  const docs = parseDhhsPoliciesPage(fixtureHtml, INDEX_URL);

  it('discovers more than 1200 documents', () => {
    expect(docs.length).toBeGreaterThan(1200);
  });

  it('all results have source_type of dhhs_policy', () => {
    for (const doc of docs) {
      expect(doc.source_type).toBe('dhhs_policy');
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

  it('most source_urls point to policies.ncdhhs.gov/wp-content/uploads/', () => {
    // A small number of entries (≤10) link to /document/ pages instead of direct files
    const uploadsUrls = docs.filter((d) =>
      d.source_url.includes('policies.ncdhhs.gov/wp-content/uploads/'),
    );
    expect(uploadsUrls.length).toBeGreaterThan(docs.length - 10);
  });

  it('all source_urls are on policies.ncdhhs.gov', () => {
    for (const doc of docs) {
      expect(doc.source_url).toContain('policies.ncdhhs.gov');
    }
  });

  it('most source_urls are PDF, DOCX, or XLSX files', () => {
    const fileUrls = docs.filter((d) =>
      /\.(pdf|docx?|xlsx?)$/i.test(d.source_url),
    );
    // A small number may link to /document/ pages; the vast majority are files
    expect(fileUrls.length).toBeGreaterThan(docs.length - 10);
  });

  it('no duplicate source_urls', () => {
    const urls = docs.map((d) => d.source_url);
    const unique = new Set(urls);
    expect(unique.size).toBe(urls.length);
  });

  it('all results have a non-empty title', () => {
    for (const doc of docs) {
      expect(doc.title).toBeTruthy();
    }
  });

  it('many results have a sub-category assigned', () => {
    // Rows filed only under the top-level section have none.
    const withCategory = docs.filter((d) => d.category !== null);
    expect(withCategory.length).toBeGreaterThan(800);
  });

  it('all policy_number fields are null', () => {
    for (const doc of docs) {
      expect(doc.policy_number).toBeNull();
    }
  });

  it('finds known document: 2024 Basic Medicaid Eligibility Requirements', () => {
    const doc = docs.find(
      (d) => d.source_url.includes('MEDICAID-ELIGIBILITY_9-9-2024.pdf'),
    );
    expect(doc).toBeDefined();
    expect(doc?.title).toBe('2024 Basic Medicaid Eligibility Requirements');
    expect(doc?.category).toBe('Basic Medicaid Eligibility Requirements');
  });

  it('finds documents under Adult Medicaid sub-category', () => {
    const adultMedicaid = docs.filter((d) => d.category === 'Adult Medicaid');
    expect(adultMedicaid.length).toBeGreaterThan(20);
  });

  it('finds documents under Family and Children sub-category', () => {
    // HTML-decoded: "Family and Children's Medicaid"
    const fcm = docs.filter(
      (d) => d.category && d.category.includes("Children"),
    );
    expect(fcm.length).toBeGreaterThan(20);
  });

  it('reads the category only from the categories column', () => {
    // The tag and file-type columns carry data-slug spans too.
    const categories = new Set(docs.map((d) => d.category));
    expect([...categories].sort()).toEqual(
      [
        null,
        'Adult Medicaid',
        'Basic Medicaid Eligibility Requirements',
        "Family and Children's Medicaid",
        'Forms in Other Languages',
        'Medicaid Eligibility Information System (EIS)',
      ].sort(),
    );
  });

  it('returns the tag column as slugs, separately from the category', () => {
    const doc = docs.find(
      (d) => d.source_url.includes('MEDICAID-ELIGIBILITY_9-9-2024.pdf'),
    );
    expect(doc?.doc_tags).toEqual(['manual']);
    const tags = new Set(docs.flatMap((d) => d.doc_tags ?? []));
    expect([...tags].sort()).toEqual([
      'administrative-letter',
      'change-notice',
      'form',
      'manual',
      'policy',
      'procedure',
    ]);
  });

  it('categories do not include the top-level "health-benefits-nc-medicaid" slug as a value', () => {
    for (const doc of docs) {
      expect(doc.category).not.toBe('health-benefits-nc-medicaid');
      expect(doc.category).not.toBe('Health Benefits/NC Medicaid');
    }
  });
});

describe('parseDhhsPoliciesPage with tagged rows', () => {
  const tagged = parseDhhsPoliciesPage(
    readFileSync(
      path.join(__dirname, '../fixtures/dhhs-policies-index-tagged.html'),
      'utf8',
    ),
    INDEX_URL,
  );
  const byFile = (name: string) =>
    tagged.find((d) => d.source_url.endsWith(name));

  it("captures the agency's Archived tag without changing the category", () => {
    const archived = byFile('2025-NON-MAGI-MEDICAID-INCOME-RESERVE-LIMITS.pdf');
    expect(archived?.doc_tags).toEqual(['archived', 'manual']);
    expect(archived?.category).toBe('Adult Medicaid');
  });

  it('never reads a tag as the category of a row with no sub-category', () => {
    const letter = byFile('DHB-ADMINISTRATIVE-LETTER-03-21.pdf');
    expect(letter?.category).toBeNull();
    expect(letter?.doc_tags).toEqual(['archived', 'administrative-letter']);
  });

  it('leaves current and untagged rows without the archived tag', () => {
    expect(
      byFile('2026-NON-MAGI-MEDICAID-INCOME-RESERVE-LIMITS.pdf')?.doc_tags,
    ).toEqual(['manual']);
    const untagged = byFile('MA-2240-Transfer-of-Assets-3.pdf');
    expect(untagged?.doc_tags).toEqual([]);
    expect(untagged?.category).toBe('Adult Medicaid');
  });
});
