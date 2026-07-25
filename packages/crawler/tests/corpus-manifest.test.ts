import { describe, expect, it } from 'vitest';
import {
  isAllowedCorpusUrl,
  isAllowedSourceUrl,
} from '../src/corpus-manifest.js';

describe('corpus URL allowlists', () => {
  it('accepts exact hosts and their subdomains', () => {
    expect(
      isAllowedSourceUrl(
        'clinical_policy',
        'https://medicaid.ncdhhs.gov/policy.pdf',
      ),
    ).toBe(true);
    expect(
      isAllowedSourceUrl(
        'clinical_policy',
        'https://files.medicaid.ncdhhs.gov/policy.pdf',
      ),
    ).toBe(true);
  });

  it('rejects suffix-confusion hosts and invalid URLs', () => {
    expect(
      isAllowedSourceUrl(
        'clinical_policy',
        'https://medicaid.ncdhhs.gov.attacker.example/policy.pdf',
      ),
    ).toBe(false);
    expect(isAllowedSourceUrl('clinical_policy', 'not a URL')).toBe(false);
    expect(
      isAllowedSourceUrl(
        'clinical_policy',
        'http://medicaid.ncdhhs.gov/policy.pdf',
      ),
    ).toBe(false);
  });

  it('recognizes the union allowlist used by discovery requests', () => {
    expect(
      isAllowedCorpusUrl('https://policies.ncdhhs.gov/manual.pdf'),
    ).toBe(true);
    expect(isAllowedCorpusUrl('https://outside.example/manual.pdf')).toBe(
      false,
    );
  });
});
