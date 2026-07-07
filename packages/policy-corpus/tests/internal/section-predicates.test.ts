import { describe, expect, it } from 'vitest';

import {
  buildHitText,
  extractTitleClusterTerms,
  includesCalendarYear,
  isAdministrativeFormTitle,
  isAttachmentTitle,
  isBoilerplateTitle,
  isCoverageAdministrativeTitle,
  isCoverageBoilerplateTitle,
  isCoverageLimitationText,
  isCoverageProcessTitle,
  isGenericSectionTitle,
  isHcwdProcessTitle,
  isOperationalSourceHit,
  isPediatricPolicyHit,
  isPriorAuthCriteriaSection,
  isPriorAuthExceptionSection,
  isPriorAuthProcessSection,
  isPriorAuthQuantitySection,
  isTelehealthServiceTableSection,
  isTitleOnlySection,
  isYearSpecificPremiumTitle,
} from '../../src/internal/section-predicates.js';

import { makeHit, makeSection } from '../helpers/objects.js';

// ── Hit text + role predicates ───────────────────────────────────────────────

describe('buildHitText', () => {
  it('joins title, document, policy, and content as lowercased text', () => {
    const hit = makeHit({
      sectionTitle: 'Telehealth',
      documentTitle: 'Policy 1A',
      policyNumber: '1A',
      content: 'Eligible Services',
    });
    expect(buildHitText(hit)).toBe('telehealth policy 1a 1a eligible services');
  });

  it('skips null fields', () => {
    expect(buildHitText(makeHit({ sectionTitle: 'Coverage', content: null }))).toBe('coverage');
  });
});

describe('isPediatricPolicyHit', () => {
  it('is true when pediatric terms appear in any hit field', () => {
    expect(isPediatricPolicyHit(makeHit({ sectionTitle: 'Pediatric Dental' }))).toBe(true);
    expect(isPediatricPolicyHit(makeHit({ content: 'covers a child under 21' }))).toBe(true);
  });

  it('is false for unrelated text', () => {
    expect(isPediatricPolicyHit(makeHit({ sectionTitle: 'Ambulance Transport' }))).toBe(false);
  });
});

describe('isOperationalSourceHit', () => {
  it('is true for billing/reimbursement/managed-care roles', () => {
    for (const answerRole of ['billing', 'reimbursement', 'managed_care', 'managed_care_contract']) {
      expect(isOperationalSourceHit(makeHit({ answerRole }))).toBe(true);
    }
  });

  it('is false for governing or absent roles', () => {
    expect(isOperationalSourceHit(makeHit({ answerRole: 'governing' }))).toBe(false);
    expect(isOperationalSourceHit(makeHit({ answerRole: null }))).toBe(false);
  });
});

// ── Section shape predicates ─────────────────────────────────────────────────

describe('isTitleOnlySection', () => {
  it('is true when content is null, empty, or whitespace', () => {
    expect(isTitleOnlySection({ content: null })).toBe(true);
    expect(isTitleOnlySection({ content: '' })).toBe(true);
    expect(isTitleOnlySection({ content: '   \n\t ' })).toBe(true);
  });

  it('is false when content has text', () => {
    expect(isTitleOnlySection({ content: 'Covered.' })).toBe(false);
  });
});

describe('prior-authorization section predicates', () => {
  it('isPriorAuthQuantitySection matches quantity-limit terms across number/title/content', () => {
    expect(isPriorAuthQuantitySection(makeSection({ id: 'a', title: 'Quantity Limits' }))).toBe(true);
    expect(isPriorAuthQuantitySection(makeSection({ id: 'b', content: 'maximum supply per fill' }))).toBe(true);
    expect(isPriorAuthQuantitySection(makeSection({ id: 'c', title: 'General Criteria' }))).toBe(false);
  });

  it('isPriorAuthCriteriaSection matches criteria-section terms', () => {
    expect(isPriorAuthCriteriaSection(makeSection({ id: 'a', title: 'Attachment K' }))).toBe(true);
    expect(isPriorAuthCriteriaSection(makeSection({ id: 'b', title: 'Coverage' }))).toBe(false);
  });

  it('isPriorAuthProcessSection matches process terms', () => {
    expect(isPriorAuthProcessSection(makeSection({ id: 'a', title: 'Prior Authorization Process' }))).toBe(true);
    expect(isPriorAuthProcessSection(makeSection({ id: 'b', content: 'submit via web portal' }))).toBe(true);
    expect(isPriorAuthProcessSection(makeSection({ id: 'c', title: 'Eligibility' }))).toBe(false);
  });

  it('isPriorAuthExceptionSection short-circuits on the hardcoded 3.2.3 section number', () => {
    // Special-case: section 3.2.3 qualifies even with no matching term text.
    expect(isPriorAuthExceptionSection(makeSection({ id: 'a', sectionNumber: '3.2.3' }))).toBe(true);
    expect(isPriorAuthExceptionSection(makeSection({ id: 'b', content: 'requested drug' }))).toBe(true);
    expect(isPriorAuthExceptionSection(makeSection({ id: 'c', sectionNumber: '3.2.4', title: 'Coverage' }))).toBe(false);
  });
});

describe('isTelehealthServiceTableSection', () => {
  it('is true for a telehealth-eligible-service block with no section number', () => {
    expect(
      isTelehealthServiceTableSection(makeSection({ id: 'a', content: 'telehealth eligible service list' })),
    ).toBe(true);
  });

  it('is false when the section is numbered (a real TOC section, not a table)', () => {
    expect(
      isTelehealthServiceTableSection(
        makeSection({ id: 'b', sectionNumber: '4.1', content: 'telehealth eligible service list' }),
      ),
    ).toBe(false);
  });

  it('is false without the telehealth-table phrasing', () => {
    expect(isTelehealthServiceTableSection(makeSection({ id: 'c', content: 'general telehealth policy' }))).toBe(false);
  });
});

// ── Title classification predicates ──────────────────────────────────────────

describe('boilerplate / attachment / generic titles', () => {
  it('isBoilerplateTitle matches the known set after title-key normalization', () => {
    expect(isBoilerplateTitle('Table of Contents')).toBe(true);
    expect(isBoilerplateTitle('History:')).toBe(true); // trailing colon stripped by normalizeTitleKey
    expect(isBoilerplateTitle('Coverage Criteria')).toBe(false);
    expect(isBoilerplateTitle(null)).toBe(false);
  });

  it('isCoverageBoilerplateTitle also catches attestation / revision prefixes', () => {
    expect(isCoverageBoilerplateTitle('I understand the terms')).toBe(true);
    expect(isCoverageBoilerplateTitle('I agree to the conditions')).toBe(true);
    expect(isCoverageBoilerplateTitle('Revision Information and History')).toBe(true);
    expect(isCoverageBoilerplateTitle('Background')).toBe(true); // delegates to isBoilerplateTitle
    expect(isCoverageBoilerplateTitle('Physical Therapy')).toBe(false);
  });

  it('isAttachmentTitle requires the "attachment " prefix (with separator)', () => {
    expect(isAttachmentTitle('Attachment A')).toBe(true);
    expect(isAttachmentTitle('Attachments')).toBe(false); // no separator → not a prefix match
    expect(isAttachmentTitle(null)).toBe(false);
  });

  it('isGenericSectionTitle matches only the two exact generic titles', () => {
    expect(isGenericSectionTitle('Information')).toBe(true);
    expect(isGenericSectionTitle('Related Clinical Coverage Policies')).toBe(true);
    expect(isGenericSectionTitle('Information About Eligibility')).toBe(false); // not an exact match
  });
});

describe('process / administrative title predicates', () => {
  it('isCoverageProcessTitle matches process-oriented titles', () => {
    expect(isCoverageProcessTitle('Appeal and Reconsideration')).toBe(true);
    expect(isCoverageProcessTitle('Authorization Process')).toBe(true);
    expect(isCoverageProcessTitle('Coverage Criteria')).toBe(false);
  });

  it('isCoverageAdministrativeTitle matches administrative titles', () => {
    expect(isCoverageAdministrativeTitle('Provider Requirements')).toBe(true); // contains "provider requirement"
    expect(isCoverageAdministrativeTitle('Claim Reimbursement')).toBe(true);
    expect(isCoverageAdministrativeTitle('Physical Therapy')).toBe(false);
  });

  it('isAdministrativeFormTitle excludes "change notice" even though it contains "notice"', () => {
    expect(isAdministrativeFormTitle('Prior Authorization Form')).toBe(true);
    expect(isAdministrativeFormTitle('Application Checklist')).toBe(true);
    expect(isAdministrativeFormTitle('Change Notice')).toBe(false); // explicit exclusion wins
    expect(isAdministrativeFormTitle('Coverage Criteria')).toBe(false);
  });

  it('isHcwdProcessTitle matches premium-process titles', () => {
    expect(isHcwdProcessTitle('Payment Status')).toBe(true);
    expect(isHcwdProcessTitle('Premium Invoices')).toBe(true);
    expect(isHcwdProcessTitle('Coverage Criteria')).toBe(false);
  });
});

// ── Year / premium / text helpers ────────────────────────────────────────────

describe('includesCalendarYear', () => {
  it('matches a standalone 20xx year token', () => {
    expect(includesCalendarYear('Premium Amounts 2024')).toBe(true);
    expect(includesCalendarYear('effective 2026')).toBe(true);
  });

  it('does not match non-year digits', () => {
    expect(includesCalendarYear('Plan 19')).toBe(false);
    expect(includesCalendarYear('section 1999')).toBe(false); // 19xx is not 20xx
    expect(includesCalendarYear(null)).toBe(false);
  });
});

describe('isYearSpecificPremiumTitle', () => {
  it('requires both a premium reference and a calendar year', () => {
    expect(isYearSpecificPremiumTitle('Premium Amounts 2024')).toBe(true);
    expect(isYearSpecificPremiumTitle('Premium Amounts')).toBe(false); // no year
    expect(isYearSpecificPremiumTitle('2024 Coverage Updates')).toBe(false); // no premium
  });
});

describe('isCoverageLimitationText', () => {
  it('matches limitation / exclusion phrasing', () => {
    expect(isCoverageLimitationText('this service is not covered')).toBe(true);
    expect(isCoverageLimitationText('coverage limitations apply')).toBe(true);
    expect(isCoverageLimitationText('exclusion list')).toBe(true);
    expect(isCoverageLimitationText('covered without restriction')).toBe(false);
  });
});

describe('extractTitleClusterTerms', () => {
  it('keeps tokens >= 4 chars, drops stopwords, and dedupes', () => {
    // "services" and "coverage" are TITLE_CLUSTER_STOPWORDS; "for" is too short.
    expect(extractTitleClusterTerms('Physical Therapy Services Coverage')).toEqual(['physical', 'therapy']);
  });

  it('dedupes repeated tokens and lowercases', () => {
    expect(extractTitleClusterTerms('Therapy THERAPY therapy')).toEqual(['therapy']);
  });

  it('returns [] for null or all-short/stopword titles', () => {
    expect(extractTitleClusterTerms(null)).toEqual([]);
    expect(extractTitleClusterTerms('a in of service')).toEqual([]);
  });
});
