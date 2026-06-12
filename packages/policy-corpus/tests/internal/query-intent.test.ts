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

// ── Substring-landmine regressions ───────────────────────────────────────────
// Each of these previously misrouted via raw substring containment.

import {
  detectAnswerQuestionType,
  isChangeNoticeQuery,
  isCoverageQuestion,
  isDeterministicCoverageQuery,
  isHistoricalReimbursementQuery,
  isPediatricQuery,
  isPriorAuthorizationQuery,
  queryMentionsPolicyNumber,
} from '../../src/internal/query-intent.js';
import { extractSearchTerms } from '../../src/internal/search.js';

describe('queryMentionsPolicyNumber token boundaries', () => {
  it('matches a standalone policy number', () => {
    expect(queryMentionsPolicyNumber('what does policy 9 say about otc drugs?', '9')).toBe(true);
    expect(queryMentionsPolicyNumber('under policy 8c, is therapy covered?', '8C')).toBe(true);
  });

  it('does not match digits embedded in longer tokens', () => {
    // "1915(c)" contains the digit 9 — must not "mention" Policy 9.
    expect(queryMentionsPolicyNumber('what federal rule authorizes 1915(c) waivers?', '9')).toBe(false);
    expect(queryMentionsPolicyNumber('income limit is 195% fpl', '9')).toBe(false);
    // "8C" must not match inside "8C-1".
    expect(queryMentionsPolicyNumber('compare with policy 8c-1 criteria', '8C')).toBe(false);
  });
});

describe('isPriorAuthorizationQuery word boundaries', () => {
  it('does not treat SPA (State Plan Amendment) as PA', () => {
    expect(isPriorAuthorizationQuery('what criteria does spa 23-0012 change?')).toBe(false);
  });

  it('still matches bounded "pa" with criteria', () => {
    expect(isPriorAuthorizationQuery('where are the pa criteria for imaging?')).toBe(true);
  });
});

describe('isCoverageQuestion word boundaries', () => {
  it('does not type estate recovery as coverage', () => {
    expect(isCoverageQuestion('how does estate recovery work after death?')).toBe(false);
  });

  it('still matches inflected cover forms', () => {
    expect(isCoverageQuestion('is wheelchair repair covered?')).toBe(true);
    expect(isCoverageQuestion('what coverage applies to home health?')).toBe(true);
  });
});

describe('isHistoricalReimbursementQuery prior-auth exclusion', () => {
  it('does not treat prior authorization as historical', () => {
    expect(isHistoricalReimbursementQuery('what are the prior authorization criteria?', [])).toBe(false);
    expect(isHistoricalReimbursementQuery('is prior approval needed for mri?', [])).toBe(false);
  });

  it('still detects genuine history vocabulary', () => {
    expect(isHistoricalReimbursementQuery('what was the rate prior to the update?', [])).toBe(true);
    expect(isHistoricalReimbursementQuery('show previous rates', [])).toBe(true);
  });
});

describe('isPediatricQuery', () => {
  it('does not type "minor home modifications" as pediatric', () => {
    expect(isPediatricQuery('are minor home modifications covered under cap/da?')).toBe(false);
  });

  it('still detects real pediatric vocabulary', () => {
    expect(isPediatricQuery('what therapy services are covered for children under 21?')).toBe(true);
  });
});

describe('isChangeNoticeQuery recency handling', () => {
  it('does not route "most recent <value>" questions to the amendment lane', () => {
    expect(isChangeNoticeQuery('what is the most recent income limit for hcwd?')).toBe(false);
  });

  it('routes recency + change vocabulary to amendment', () => {
    expect(isChangeNoticeQuery('what is the most recent change to policy 8c?')).toBe(true);
    expect(isChangeNoticeQuery('latest revision of clinical coverage policy 3l?')).toBe(true);
    expect(isChangeNoticeQuery('was policy 5b amended this year?')).toBe(true);
  });
});

describe('detectAnswerQuestionType priority', () => {
  it('routes federal prior-authorization questions to federal_authority', () => {
    expect(
      detectAnswerQuestionType('what federal regulation governs prior authorization for hcbs?'),
    ).toBe('federal_authority');
  });

  it('keeps plain prior-auth questions on prior_authorization', () => {
    expect(detectAnswerQuestionType('is prior authorization required for mri?')).toBe('prior_authorization');
  });

  it('types "most recent income limit" as a value question, not amendment', () => {
    expect(detectAnswerQuestionType('what is the most recent income limit for hcwd?')).not.toBe('amendment');
  });
});

describe('isDeterministicCoverageQuery figure-seeking gate', () => {
  it('does not force bare premium mentions onto the numeric-only lane', () => {
    // (HCWD premium questions stay deterministic via their own branch.)
    expect(isDeterministicCoverageQuery('how do participants pay premiums, by mail or online?')).toBe(false);
  });

  it('keeps figure-seeking premium questions deterministic', () => {
    expect(isDeterministicCoverageQuery('how much is the monthly premium for hcwd?')).toBe(true);
    expect(isDeterministicCoverageQuery('what is the income limit for hcwd premiums?')).toBe(true);
  });
});

describe('extractSearchTerms duplication fix', () => {
  it('does not produce duplicate-word phrases', () => {
    const terms = extractSearchTerms('income limit for workers with disabilities');
    expect(terms.filter((t) => /^(\S+) \1$/.test(t))).toEqual([]);
    expect(terms).toContain('income limit');
  });

  it('still splits compound tokens into parts', () => {
    const terms = extractSearchTerms('speech-language therapy criteria');
    expect(terms).toContain('speech-language');
    expect(terms).toContain('speech');
    expect(terms).toContain('language');
  });
});
