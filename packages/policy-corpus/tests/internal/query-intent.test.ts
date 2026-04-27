import { describe, it, expect } from 'vitest';
import {
  extractAliasedPolicyNumbers,
  isYesNoCoverageQuery,
} from '../../src/internal/query-intent.js';

describe('isYesNoCoverageQuery', () => {
  it('matches bare "cover" (legacy behavior preserved)', () => {
    expect(isYesNoCoverageQuery('does policy 10a cover routine massage therapy?')).toBe(true);
  });

  it('matches inflected forms: covered, covers, coverage, covering', () => {
    expect(isYesNoCoverageQuery('is chiropractic care covered under policy 5b?')).toBe(true);
    expect(isYesNoCoverageQuery('is acupuncture a covered service under policy 8c?')).toBe(true);
    expect(isYesNoCoverageQuery('are experimental drugs covered under the pharmacy benefit?')).toBe(true);
    expect(isYesNoCoverageQuery('does policy 10a cover covers coverage for x?')).toBe(true);
  });

  it('matches "authorize" variants', () => {
    expect(isYesNoCoverageQuery('does policy 1-h authorize routine wellness telehealth?')).toBe(true);
  });

  it('matches "eligible" variants', () => {
    expect(isYesNoCoverageQuery('is a beneficiary eligible for replacement equipment?')).toBe(true);
  });

  it('accepts additional verb starts (are, will, under)', () => {
    expect(isYesNoCoverageQuery('are over-the-counter medications covered?')).toBe(true);
    expect(isYesNoCoverageQuery('will bariatric surgery be covered?')).toBe(true);
  });

  it('rejects non-coverage questions that happen to start with does/is/can', () => {
    expect(isYesNoCoverageQuery('does the state reimburse providers monthly?')).toBe(false);
    expect(isYesNoCoverageQuery('can the beneficiary appeal directly to cms?')).toBe(false);
    expect(isYesNoCoverageQuery('is the policy effective in 2025?')).toBe(false);
  });

  it('rejects questions that do not start with a yes/no verb', () => {
    expect(isYesNoCoverageQuery('what services are covered under policy 8c?')).toBe(false);
    expect(isYesNoCoverageQuery('list covered services for dental')).toBe(false);
  });

  it('matches all eligible negative-answer golden questions', () => {
    // 13 of 15 negative-answer golden questions should route through the
    // yes/no coverage frame. q-033 (appeals to CMS) and q-035 (replacement
    // CPAP timing) intentionally do not — they are not yes/no coverage.
    const yesNoNegativeQuestions = [
      'is chiropractic care covered under policy 5b (orthotics and prosthetics)?',
      'does policy 1a-15 (surgery for clinically severe or morbid obesity) cover bariatric / body-contouring surgery',
      'is acupuncture a covered service under clinical coverage policy 8c (outpatient behavioral health)?',
      'does policy 10a cover routine massage therapy for beneficiaries over age 21?',
      'are experimental or investigational drugs covered under the nc medicaid outpatient pharmacy benefit?',
      'does policy 1a-2 (preventive medicine annual health assessment) cover gym memberships or wellness club fees',
      'does policy 9 (outpatient pharmacy) cover over-the-counter fertility or hormone supplements',
      'does the nc medicaid dental benefit cover cosmetic teeth whitening for adults?',
      'does policy 1-h authorize routine general-wellness telehealth visits without a specific clinical indication?',
      'does nemt (non-emergency medical transportation) cover transportation to non-medical errands',
      "does the cap/da waiver cover a beneficiary's room and board in their own home?",
      'is private-duty nursing covered under nc medicaid policy 3g-1 for adult beneficiaries',
      'does nc medicaid cover over-the-counter medications without a prescription?',
    ];
    for (const q of yesNoNegativeQuestions) {
      expect(isYesNoCoverageQuery(q), q).toBe(true);
    }
  });
});

describe('extractAliasedPolicyNumbers', () => {
  it('routes outpatient pharmacy coverage questions to Policy 9', () => {
    expect(
      extractAliasedPolicyNumbers(
        'are experimental or investigational drugs covered under the nc medicaid outpatient pharmacy benefit?',
      ),
    ).toContain('9');
    expect(
      extractAliasedPolicyNumbers('does nc medicaid cover over-the-counter medications without a prescription?'),
    ).toContain('9');
    expect(
      extractAliasedPolicyNumbers(
        'can a medicare dual eligible get otc medications through the nc medicaid outpatient pharmacy benefit?',
      ),
    ).toContain('9');
  });

  it('does not route Medicare Part D prescription-drug questions to Policy 9', () => {
    expect(
      extractAliasedPolicyNumbers('what does the medicare prescription drug benefit say about part d non-covered drugs?'),
    ).not.toContain('9');
  });
});
