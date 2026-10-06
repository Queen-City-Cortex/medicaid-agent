import { describe, expect, it } from 'vitest';
import { CORPUS_MANIFEST } from '../src/corpus-manifest.js';

describe('corpus manifest', () => {
  it('declares every source type exactly once', () => {
    const sourceTypes = CORPUS_MANIFEST.source_families.map((family) => family.source_type);
    expect(new Set(sourceTypes).size).toBe(sourceTypes.length);
  });

  it('includes the expected current and expanded source families', () => {
    expect(CORPUS_MANIFEST.source_families.map((family) => family.source_type)).toEqual([
      'clinical_policy',
      'bulletin',
      'state_plan_amendment',
      'waiver',
      'provider_manual',
      'dhhs_policy',
      'fee_schedule',
      'billing_guidance',
      'managed_care_guidance',
      'managed_care_contract',
      'beneficiary_guidance',
      'nc_statute',
    ]);
  });

  it('defines inventory metadata needed for auditing', () => {
    for (const family of CORPUS_MANIFEST.source_families) {
      expect(family.directory_name).toBeTruthy();
      expect(family.authority_tier).toBeTruthy();
      expect(typeof family.required_for_answering).toBe('boolean');
      expect(family.allowed_domains.length).toBeGreaterThan(0);
      expect(family.allowed_file_formats.length).toBeGreaterThan(0);
      expect(Array.isArray(family.landing_pages)).toBe(true);
      expect(Array.isArray(family.seed_urls)).toBe(true);
    }
  });

  it('keeps beneficiary guidance optional for corpus promotion', () => {
    const family = CORPUS_MANIFEST.source_families.find(
      (candidate) => candidate.source_type === 'beneficiary_guidance',
    );

    expect(family?.authority_tier).toBe('supporting');
    expect(family?.required_for_answering).toBe(false);
  });
});
