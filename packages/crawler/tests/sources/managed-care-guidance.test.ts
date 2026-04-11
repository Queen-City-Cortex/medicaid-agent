import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractManagedCareGuidanceSubpageUrls,
  parseManagedCareGuidancePage,
} from '../../src/sources/managed-care-guidance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  path.join(__dirname, '../fixtures/managed-care-guidance.html'),
  'utf8',
);

describe('parseManagedCareGuidancePage', () => {
  it('discovers managed care guidance documents', () => {
    const docs = parseManagedCareGuidancePage(
      fixtureHtml,
      'https://medicaid.ncdhhs.gov/providers/provider-playbook-nc-medicaid-managed-care',
    );

    expect(docs).toHaveLength(1);
    expect(docs[0].source_type).toBe('managed_care_guidance');
    expect(docs[0].source_url).toContain('/download?attachment');
  });
});

describe('extractManagedCareGuidanceSubpageUrls', () => {
  it('finds provider playbook subpages to crawl recursively', () => {
    const urls = extractManagedCareGuidanceSubpageUrls(
      fixtureHtml,
      'https://medicaid.ncdhhs.gov/providers/provider-playbook-nc-medicaid-managed-care',
    );

    expect(urls).toEqual([
      'https://medicaid.ncdhhs.gov/providers/provider-playbook-medicaid-managed-care/fact-sheets',
      'https://medicaid.ncdhhs.gov/providers/provider-playbook-medicaid-managed-care/training-courses',
    ]);
  });
});
