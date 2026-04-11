import { describe, expect, it } from 'vitest';
import {
  absoluteMedicaidUrl,
  collectInternalPageLinks,
} from '../../src/sources/medicaid-page-documents.js';

describe('absoluteMedicaidUrl', () => {
  it('resolves relative and query-only links against the current page', () => {
    expect(
      absoluteMedicaidUrl(
        '?page=2',
        'https://medicaid.ncdhhs.gov/document-collection/fee-schedules?page=1',
      ),
    ).toBe('https://medicaid.ncdhhs.gov/document-collection/fee-schedules?page=2');

    expect(
      absoluteMedicaidUrl(
        '/providers/provider-playbook-medicaid-managed-care/fact-sheets',
        'https://medicaid.ncdhhs.gov/providers',
      ),
    ).toBe(
        'https://medicaid.ncdhhs.gov/providers/provider-playbook-medicaid-managed-care/fact-sheets',
      );

    expect(
      absoluteMedicaidUrl(
        '/contract-30-190029-prepaid-health-plan-services-amendment-1819/download?attachment#30-190029',
        'https://medicaid.ncdhhs.gov/health-plan-contact-information',
      ),
    ).toBe(
      'https://medicaid.ncdhhs.gov/contract-30-190029-prepaid-health-plan-services-amendment-1819/download?attachment',
    );
  });

  it('returns null for malformed or non-http links', () => {
    expect(
      absoluteMedicaidUrl(
        'javascript:void(0)',
        'https://medicaid.ncdhhs.gov/providers/provider-playbook-nc-medicaid-managed-care',
      ),
    ).toBeNull();

    expect(
      absoluteMedicaidUrl(
        'https://[bad',
        'https://medicaid.ncdhhs.gov/providers/provider-playbook-nc-medicaid-managed-care',
      ),
    ).toBeNull();
  });
});

describe('collectInternalPageLinks', () => {
  it('skips malformed and non-http links while collecting eligible subpages', () => {
    const html = `
      <main>
        <a href="/providers/provider-playbook-medicaid-managed-care/fact-sheets">Fact Sheets</a>
        <a href="?page=2">Next</a>
        <a href="javascript:void(0)">Expand</a>
        <a href="mailto:test@example.com">Mail</a>
        <a href="/documents/files/provider-guide/download?attachment">Guide</a>
      </main>
    `;

    expect(
      collectInternalPageLinks(
        html,
        'https://medicaid.ncdhhs.gov/providers/provider-playbook-nc-medicaid-managed-care',
        ['/providers/provider-playbook-medicaid-managed-care'],
      ),
    ).toEqual([
      'https://medicaid.ncdhhs.gov/providers/provider-playbook-medicaid-managed-care/fact-sheets',
    ]);
  });
});
