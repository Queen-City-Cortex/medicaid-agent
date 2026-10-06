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
    ).toEqual(['9']);
    expect(extractAliasedPolicyNumbers('how are pharmacy claims for prescription drugs submitted?')).toEqual(['9']);
  });

  it('routes over-the-counter wording to Policy 9A only, never to Policy 9', () => {
    // Policy 9 excludes over-the-counter products and defers to 9A for the
    // covered ones; pinning 9 served the exclusion without the exception.
    const overTheCounterQuestions = [
      'does nc medicaid cover over-the-counter medications without a prescription?',
      'is an over-the-counter medication covered when a doctor prescribes it?',
      'are over the counter medications covered?',
      'will medicaid pay for an over the counter medication like claritin?',
      'which otc drugs does medicaid cover?',
      'is an otc drug covered with a prescription?',
      'are otc medications covered for adults?',
      'can i get an otc medication through medicaid?',
    ];
    for (const question of overTheCounterQuestions) {
      expect(extractAliasedPolicyNumbers(question), question).toEqual(['9A']);
    }
  });

  it('emits one of the two pharmacy policies, never both', () => {
    // An over-the-counter question stays on 9A even when it names the benefit.
    expect(
      extractAliasedPolicyNumbers(
        'can a medicare dual eligible get otc medications through the nc medicaid outpatient pharmacy benefit?',
      ),
    ).toEqual(['9A']);
    // "Policy 9" has no letter, so the explicit extractor does not read it:
    // the pharmacy wording is what anchors this question on Policy 9.
    expect(
      extractAliasedPolicyNumbers('does policy 9 (outpatient pharmacy) cover over-the-counter fertility supplements?'),
    ).toEqual(['9']);
  });

  it('does not route Medicare Part D questions to Policy 9 or 9A', () => {
    expect(
      extractAliasedPolicyNumbers('what does the medicare prescription drug benefit say about part d non-covered drugs?'),
    ).toEqual([]);
    expect(extractAliasedPolicyNumbers('does medicare part d pay for otc medications?')).toEqual([]);
  });

  it('routes only Policy 10A\'s own service name to 10A', () => {
    expect(extractAliasedPolicyNumbers('does nc medicaid cover outpatient specialized therapy for adults?')).toEqual(['10A']);
    expect(extractAliasedPolicyNumbers('what are the visit limits for outpatient specialized therapies?')).toEqual(['10A']);
    // Bare "outpatient therapy" is behavioral-health wording in the corpus.
    expect(extractAliasedPolicyNumbers('does nc medicaid cover outpatient therapy for depression?')).toEqual([]);
    expect(extractAliasedPolicyNumbers('are outpatient therapies for anxiety covered?')).toEqual([]);
  });

  it('routes CAP/C and CAP/Children to 3K-1, and CAP/DA and CAP/Choice to 3K-2', () => {
    expect(extractAliasedPolicyNumbers('who is eligible for cap/c?')).toEqual(['3K-1']);
    expect(extractAliasedPolicyNumbers('what does the cap/c waiver cover?')).toEqual(['3K-1']);
    expect(extractAliasedPolicyNumbers('what does cap/children cover?')).toEqual(['3K-1']);
    expect(extractAliasedPolicyNumbers('what does the cap/da waiver cover?')).toEqual(['3K-2']);
    expect(
      extractAliasedPolicyNumbers('does nc medicaid cover personal assistance services under cap/choice?'),
    ).toEqual(['3K-2']);
  });

  it('does not pin other CAP abbreviations to the children\'s waiver', () => {
    for (const question of [
      'does nc medicaid cover personal assistance services under cap/choice?',
      'who can be a paid caregiver under cap/cd?',
      'what does the cap/ch code on the crosswalk mean?',
    ]) {
      expect(extractAliasedPolicyNumbers(question), question).not.toContain('3K-1');
    }
    // CAP/CD and CAP/CH are left to search: no alias.
    expect(extractAliasedPolicyNumbers('who can be a paid caregiver under cap/cd?')).toEqual([]);
    expect(extractAliasedPolicyNumbers('what does the cap/ch code on the crosswalk mean?')).toEqual([]);
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


describe('EPSDT overview authority routing', () => {
  it('keeps statutory and regulatory grounding available for a generic model hint', () => {
    expect(detectAnswerQuestionType('what does epsdt require?', 'general')).toBe('federal_authority');
    expect(detectAnswerQuestionType('what is epsdt?')).toBe('federal_authority');
  });
  it('preserves service-specific coverage and explicit PA routing', () => {
    expect(detectAnswerQuestionType('does epsdt cover private duty nursing?')).toBe('coverage');
    expect(detectAnswerQuestionType('what does epsdt require?', 'prior_authorization')).toBe('prior_authorization');
  });
});

// ── Whole-word matching of router terms ──────────────────────────────────────
// For each predicate converted from substring to whole-word matching: wordings
// that misrouted through a longer word and must no longer match, and the
// intended wordings, with plurals and paraphrases, that must still match.

import {
  asksForPublicNoticeDetails,
  isBillingWorkflowQuery,
  isCongregatePcsQuery,
  isFederalAuthorityQuery,
  isManagedCareContractQuery,
  isManagedCareOperationsQuery,
  isMlrQuery,
  isPolicyVariantQuery,
  isTelehealthQuery,
} from '../../src/internal/query-intent.js';

const WHOLE_WORD_PREDICATE_CASES: Array<{
  name: string;
  predicate: (queryLower: string) => boolean;
  matches: string[];
  rejects: string[];
}> = [
  {
    name: 'isBillingWorkflowQuery',
    predicate: isBillingWorkflowQuery,
    matches: [
      'which form do i use to request a wheelchair?',
      'what forms are required for personal care services?',
      'how do i correct a denied claim?',
      'where do i submit claims for home health?',
      'which modifiers apply to telehealth visits?',
      "what is nctracks' billing guidance for hospice?",
    ],
    rejects: [
      'what information must be documented for personal care services?',
      'is surgery performed for cosmetic reasons covered?',
      'are school uniforms covered for children?',
      'can the state reclaim equipment after a beneficiary dies?',
    ],
  },
  {
    name: 'isManagedCareOperationsQuery',
    predicate: isManagedCareOperationsQuery,
    matches: [
      'which health plans cover dental services?',
      'what does the tailored plan contract require for care management?',
      'what do the standard plans have to report?',
      'what do the managed-care contracts say about appeals?',
      'how do i reach the ombudsman?',
    ],
    rejects: [
      'are orthotics covered for joint contractures?',
      'is treatment for muscle contraction headaches covered?',
    ],
  },
  {
    name: 'isManagedCareContractQuery',
    predicate: isManagedCareContractQuery,
    matches: [
      'which contract exhibit lists the reporting duties?',
      'what do the php contracts require?',
      'what obligations does a managed care plan have for network adequacy?',
    ],
    rejects: ['are splints covered for contractures?', 'what obligations does a provider have to keep records?'],
  },
  {
    name: 'isPriorAuthorizationQuery',
    predicate: isPriorAuthorizationQuery,
    matches: [
      'does an mri need prior authorization?',
      'which drugs need prior approvals?',
      'is prior auth needed for a power wheelchair?',
      'does an mri need to be prior authorized?',
      'where are the pa criteria for imaging?',
    ],
    rejects: ['what criteria does spa 23-0012 change?', 'what are the criteria for a spa treatment exclusion?'],
  },
  {
    name: 'isCoverageQuestion',
    predicate: isCoverageQuestion,
    matches: [
      'what documentation is needed for a power wheelchair?',
      'what are the criteria for home health?',
      'is telehealth allowed for speech therapy?',
      'which services are telehealth-eligible?',
      'what does epsdt mean for dental care?',
      'when is a hospital bed medically necessary?',
    ],
    rejects: [
      'what are the notification requirements for a rate change?',
      'what are the requirements for notifications to members?',
      'what are the discharge planning requirements?',
      'what are the requirements after terminations of enrollment?',
    ],
  },
  {
    name: 'isTelehealthQuery',
    predicate: isTelehealthQuery,
    matches: ['can physical therapy be delivered by telehealth?', 'which services are telehealth-eligible?'],
    rejects: ['can physical therapy be delivered by video visit?'],
  },
  {
    name: 'isCongregatePcsQuery',
    predicate: isCongregatePcsQuery,
    matches: [
      'can pcs be provided in adult care homes?',
      'are personal care services covered in a group home?',
      'does assisted living include pcs?',
    ],
    rejects: [
      'which hcpcs codes apply in assisted living?',
      'how many hours of pcs can someone get each month at home?',
    ],
  },
  {
    name: 'isPolicyVariantQuery',
    predicate: isPolicyVariantQuery,
    matches: [
      'what is the difference between cap/c and cap/da?',
      'what are the differences between home health and personal care?',
      'in-home pcs vs congregate pcs',
      'home health vs. private duty nursing',
    ],
    rejects: ['can i fill prescriptions at cvs or walgreens?', 'are tvs in a nursing facility room covered?'],
  },
  {
    name: 'isFederalAuthorityQuery',
    predicate: isFederalAuthorityQuery,
    matches: [
      'what federal regulation governs provider screening?',
      'what is the statutory basis for epsdt?',
      'what does 42 cfr 438.8 require?',
      'what does the social security act say about home health?',
      'what must a waiver application include?',
      'what must states show in waiver applications?',
      // Names the poverty level and also asks for federal authority.
      'which federal law sets the federal poverty level used for medicaid?',
    ],
    rejects: [
      'what is the income limit as a percentage of the federal poverty level for pregnant women?',
      'is the income limit 138% of the federal-poverty guidelines?',
      'does medicaid cover visits at a federally qualified health center?',
    ],
  },
  {
    name: 'isChangeNoticeQuery',
    predicate: isChangeNoticeQuery,
    matches: [
      'what was amended in policy 8c?',
      'what does the latest change notice say?',
      'what are the most recent updates to policy 3l?',
      'what amendments were made to the dental policy this year?',
      'what changed in the latest version of policy 5a-2?',
      // Names a State Plan Amendment and also asks what was amended.
      'which policy was amended to match the state plan amendment?',
    ],
    rejects: [
      'what does the state plan amendment say about telehealth coverage?',
      'what does the state plan amendment require for pcs rates?',
      'how long does cms have to act on state plan amendments?',
      'what is the most recent income limit for hcwd?',
    ],
  },
  {
    name: 'isPediatricQuery',
    predicate: isPediatricQuery,
    matches: [
      "is my child's wheelchair covered?",
      'what do adolescents get under epsdt?',
      'is orthodontia covered for a beneficiary under 21?',
      'what pediatric therapies are covered?',
    ],
    rejects: [
      'are childless adults eligible for medicaid?',
      'are childbirth classes covered?',
      'are minor home modifications covered under cap/da?',
    ],
  },
  {
    name: 'asksForPublicNoticeDetails',
    predicate: asksForPublicNoticeDetails,
    matches: [
      'what public notice is required before a waiver renewal?',
      'how long is the comment period for a waiver amendment?',
      'are public hearings required for a rate change?',
    ],
    rejects: ['does medicaid cover hearing aids?', 'how do i ask for a fair hearing after a denial?'],
  },
  {
    name: 'isMlrQuery',
    predicate: isMlrQuery,
    matches: ['what mlr must a health plan meet?', 'how are medical loss ratios reported?'],
    rejects: ['what is the loss ratio for dental plans?'],
  },
];

describe('router predicates match whole words', () => {
  for (const { name, predicate, matches, rejects } of WHOLE_WORD_PREDICATE_CASES) {
    it(`${name} matches the intended wordings`, () => {
      for (const question of matches) expect(predicate(question), question).toBe(true);
    });
    it(`${name} rejects wordings that only contain a term inside a longer word`, () => {
      for (const question of rejects) expect(predicate(question), question).toBe(false);
    });
  }
});

describe('detectAnswerQuestionType after whole-word matching', () => {
  it('does not send a poverty-level income question to federal authority', () => {
    expect(
      detectAnswerQuestionType(
        'what is the income limit as a percentage of the federal poverty level for pregnant women?',
      ),
    ).not.toBe('federal_authority');
  });

  it('does not send a State Plan Amendment content question to the amendment lane', () => {
    expect(detectAnswerQuestionType('what does the state plan amendment say about telehealth coverage?')).toBe(
      'coverage',
    );
  });

  it('sends a federal question about State Plan Amendments to federal authority', () => {
    expect(
      detectAnswerQuestionType('which federal regulation governs the timeline for approving state plan amendments?'),
    ).toBe('federal_authority');
  });

  it('keeps a recency question about a regulation on the amendment lane', () => {
    expect(detectAnswerQuestionType('what is the most recent revision to 42 cfr part 441?')).toBe('amendment');
  });

  it('does not type a pharmacy-chain question as a policy comparison', () => {
    expect(detectAnswerQuestionType('can i fill prescriptions at cvs or walgreens?')).not.toBe('policy_variant');
  });
});

describe('extractAliasedPolicyNumbers after whole-word matching', () => {
  it('aliases ambulance wording, singular and plural, to Policy 15', () => {
    expect(extractAliasedPolicyNumbers('does medicaid cover an ambulance ride to the hospital?')).toEqual(['15']);
    expect(extractAliasedPolicyNumbers('are air ambulances covered?')).toEqual(['15']);
  });

  it('keeps transportation-benefit questions off the ambulance policy, hyphenated or not', () => {
    expect(extractAliasedPolicyNumbers('does nemt include an ambulance?')).toEqual([]);
    expect(
      extractAliasedPolicyNumbers('is an ambulance covered as non-emergency medical transportation?'),
    ).toEqual([]);
    expect(
      extractAliasedPolicyNumbers('is an ambulance covered as non emergency medical transportation?'),
    ).toEqual([]);
  });

  it('reads "part d" as Medicare Part D only when it stands alone', () => {
    expect(extractAliasedPolicyNumbers('does medicare part d change the pharmacy benefit?')).toEqual([]);
    expect(extractAliasedPolicyNumbers('what part does the outpatient pharmacy benefit pay?')).toEqual(['9']);
  });

  it('matches the telehealth speech-therapy rule with or without the hyphen', () => {
    expect(extractAliasedPolicyNumbers('can speech-language therapy be delivered by telehealth?')).toEqual(['10A']);
    expect(extractAliasedPolicyNumbers('can speech language therapy be delivered by telehealth?')).toEqual(['10A']);
    expect(extractAliasedPolicyNumbers('can speech therapy be delivered in person?')).toEqual([]);
  });

  it('aliases the workers-with-disabilities program by abbreviation or name', () => {
    expect(extractAliasedPolicyNumbers('what is the hcwd premium?')).toEqual(['MA-2180']);
    expect(
      extractAliasedPolicyNumbers('who qualifies for health coverage for workers with disabilities?'),
    ).toEqual(['MA-2180']);
  });

  it('keeps the CAP bounds when the abbreviation is followed by a hyphen or possessive', () => {
    expect(extractAliasedPolicyNumbers("what are cap/c's service limits?")).toEqual(['3K-1']);
    expect(extractAliasedPolicyNumbers('is a cap/c-enrolled child eligible for respite?')).toEqual(['3K-1']);
    expect(extractAliasedPolicyNumbers("what are cap/choice's service limits?")).toEqual(['3K-2']);
  });
});
