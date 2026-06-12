import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveManagedCareContractDetailPageUrl,
  extractManagedCareContractSubpageUrls,
  managedCareContractsSource,
  parseManagedCareContractsPage,
} from '../../src/sources/managed-care-contracts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  path.join(__dirname, '../fixtures/managed-care-contracts.html'),
  'utf8',
);

describe('parseManagedCareContractsPage', () => {
  it('discovers downloadable contract materials with heading-based categories', () => {
    const docs = parseManagedCareContractsPage(
      fixtureHtml,
      'https://medicaid.ncdhhs.gov/providers/provider-contracting-health-plans',
    );

    expect(docs).toHaveLength(2);
    expect(docs[0].source_type).toBe('managed_care_contract');
    expect(docs[0].category).toBe('Standard Plans');
    expect(docs[1].category).toBe('Tailored Plans');
  });
});

describe('extractManagedCareContractSubpageUrls', () => {
  it('finds related contract subpages to crawl recursively', () => {
    const urls = extractManagedCareContractSubpageUrls(
      fixtureHtml,
      'https://medicaid.ncdhhs.gov/providers/provider-contracting-health-plans',
    );

    expect(urls).toEqual([
      'https://medicaid.ncdhhs.gov/health-plan-contact-information',
      'https://medicaid.ncdhhs.gov/blog/2022/06/01/provider-and-tailored-plan-contract-deadlines-inclusion-beneficiary-choice-period-and-auto',
    ]);
  });
});

describe('deriveManagedCareContractDetailPageUrl', () => {
  it('derives wrapper pages from Drupal download and open URLs', () => {
    expect(
      deriveManagedCareContractDetailPageUrl(
        'https://medicaid.ncdhhs.gov/provider-contract-templates-tailored-plans/download?attachment',
      ),
    ).toBe('https://medicaid.ncdhhs.gov/provider-contract-templates-tailored-plans');
    expect(
      deriveManagedCareContractDetailPageUrl(
        'https://medicaid.ncdhhs.gov/tailored-plan-provider-contracting-deadlines-questions-and-answers/open',
      ),
    ).toBe('https://medicaid.ncdhhs.gov/tailored-plan-provider-contracting-deadlines-questions-and-answers');
  });
});

describe('managedCareContractsSource.discover', () => {
  it('traverses contract subpages and document wrapper pages', async () => {
    const fetcher = {
      fetchHtml: async (url: string) => {
        if (url === 'https://medicaid.ncdhhs.gov/providers/provider-contracting-health-plans') {
          return { body: fixtureHtml, statusCode: 200 };
        }
        if (url === 'https://medicaid.ncdhhs.gov/health-plan-contact-information') {
          return {
            body: `
              <html>
                <body>
                  <h1>Health Plan Contact Information</h1>
                  <h2>Standard Plan Contracts</h2>
                  <a href="/contract-30-190029-dhb-prepaid-health-plan-services-rfp/download?attachment">Contract 30-190029</a>
                </body>
              </html>
            `,
            statusCode: 200,
          };
        }
        if (
          url ===
          'https://medicaid.ncdhhs.gov/blog/2022/06/01/provider-and-tailored-plan-contract-deadlines-inclusion-beneficiary-choice-period-and-auto'
        ) {
          return {
            body: `
              <html>
                <body>
                  <h1>Tailored Plan Contract Deadlines</h1>
                  <a href="/media/11452/download?attachment">Tailored Plan Deadline Fact Sheet</a>
                </body>
              </html>
            `,
            statusCode: 200,
          };
        }
        if (url === 'https://medicaid.ncdhhs.gov/documents/files/standard-plan-contract-exhibit') {
          return {
            body: `
              <html>
                <body>
                  <h1>Standard Plan Contract Exhibit</h1>
                  <a href="/documents/files/standard-plan-contract-exhibit/download?attachment">Download</a>
                </body>
              </html>
            `,
            statusCode: 200,
          };
        }
        if (url === 'https://medicaid.ncdhhs.gov/documents/files/tailored-plan-contract') {
          return {
            body: `
              <html>
                <body>
                  <h1>Tailored Plan Contract</h1>
                  <a href="/documents/files/tailored-plan-contract/open">Open</a>
                </body>
              </html>
            `,
            statusCode: 200,
          };
        }
        return { body: '<html></html>', statusCode: 404 };
      },
      fetchFile: async () => {
        throw new Error('not used');
      },
    };

    const docs = await managedCareContractsSource.discover(fetcher, 0);
    const urls = docs.map((doc) => doc.source_url);

    expect(urls).toContain(
      'https://medicaid.ncdhhs.gov/contract-30-190029-dhb-prepaid-health-plan-services-rfp/download?attachment',
    );
    expect(urls).toContain('https://medicaid.ncdhhs.gov/media/11452/download?attachment');
    expect(urls).toContain(
      'https://medicaid.ncdhhs.gov/documents/files/standard-plan-contract-exhibit/download?attachment',
    );
    expect(urls).toContain(
      'https://medicaid.ncdhhs.gov/documents/files/tailored-plan-contract/open',
    );
  });
});
