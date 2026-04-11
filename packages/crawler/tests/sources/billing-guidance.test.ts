import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBillingGuidancePage } from '../../src/sources/billing-guidance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  path.join(__dirname, '../fixtures/billing-guidance.html'),
  'utf8',
);

describe('parseBillingGuidancePage', () => {
  it('discovers direct billing guidance documents', () => {
    const docs = parseBillingGuidancePage(
      fixtureHtml,
      'https://medicaid.ncdhhs.gov/providers/health-plan-billing-guidance',
    );

    expect(docs).toHaveLength(2);
    expect(docs.map((doc) => doc.source_type)).toEqual([
      'billing_guidance',
      'billing_guidance',
    ]);
    expect(docs.map((doc) => doc.category)).toEqual([
      'Tailored Plans',
      'Standard Plans',
    ]);
  });
});
