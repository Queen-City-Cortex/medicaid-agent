import type { AnswerQuestionType } from '../types.js';
import { includesPhrase, matchesAnyTerm, matchesTerm, matchesToken, normalizeSearchText } from './base.js';
import { dedupeTerms } from './search.js';

const YEAR_QUERY_RE = /\b(19|20)\d{2}\b/g;
const REQUIREMENT_QUERY_TERMS = ['requirement', 'requirements', 'documentation', 'document', 'provide'];
// 'minor' is deliberately absent: in this corpus it overwhelmingly means
// "small" ("minor home modifications" under CAP/DA), not "a child".
const PEDIATRIC_QUERY_TERMS = [
  'under 21',
  'child',
  'children',
  'pediatric',
  'pediatrics',
  'adolescent',
  'adolescents',
  'youth',
  'youths',
];

// The predicates that decide question type, document-type groups, aliased
// policy numbers and care setting match whole words (matchesTerm): a bare
// substring test typed "information" as a billing question ("form") and
// "childless adults" as pediatric. Plurals are listed, not inferred.

export function isPriorAuthorizationQuery(queryLower: string): boolean {
  return (
    matchesAnyTerm(queryLower, [
      'prior authorization',
      'prior authorizations',
      'prior approval',
      'prior approvals',
      'prior auth',
      'prior auths',
      'prior authorize',
      'prior authorized',
      'prior authorizing',
    ]) ||
    // Word-bounded: the old "pa " substring matched "spa " (State Plan
    // Amendment questions misrouted to prior_authorization).
    (matchesTerm(queryLower, 'pa') && matchesTerm(queryLower, 'criteria'))
  );
}

export function isReimbursementQuery(queryLower: string): boolean {
  return (
    /\breimbursement\b/.test(queryLower) ||
    /\brates?\b/.test(queryLower) ||
    /\bpayments?\b/.test(queryLower) ||
    /\b(?:hcpcs|cpt)\b/.test(queryLower) ||
    includesPhrase(queryLower, [
      'fee schedule',
      'fee schedules',
      'allowed amount',
      'allowed amounts',
      'payment amount',
      'payment amounts',
    ])
  );
}

export function extractRequestedYears(query: string): string[] {
  return Array.from(new Set(query.match(YEAR_QUERY_RE) ?? []));
}

export function isHistoricalReimbursementQuery(queryLower: string, requestedYears: string[]): boolean {
  return (
    requestedYears.length > 0 ||
    // 'prior' is bounded and must not be the 'prior authorization/approval'
    // term — those questions are about criteria, not history.
    /\bprior\b(?!\s+(?:authorization|approval|auth))/.test(queryLower) ||
    includesPhrase(queryLower, [
      'histor',
      'previous',
      'earlier',
      'older',
      'changed',
      'change',
      'before',
      'as of',
    ])
  );
}

export function variantDateMatchesRequestedYear(variantDate: string | null, requestedYears: string[]): boolean {
  if (!variantDate || requestedYears.length === 0) return false;
  return requestedYears.includes(variantDate.slice(0, 4));
}

export function isBillingWorkflowQuery(queryLower: string): boolean {
  return matchesAnyTerm(queryLower, [
    'billing',
    'claim',
    'claims',
    'nctracks',
    'submission',
    'submissions',
    'modifier',
    'modifiers',
    'remittance',
    'invoice',
    'invoices',
    'crosswalk',
    'crosswalks',
    'form',
    'forms',
  ]);
}

export function isManagedCareOperationsQuery(queryLower: string): boolean {
  return matchesAnyTerm(queryLower, [
    'managed care',
    'health plan',
    'health plans',
    'provider playbook',
    'tailored plan',
    'tailored plans',
    'standard plan',
    'standard plans',
    'contract',
    'contracts',
    'contracting',
    'ombudsman',
  ]);
}

export function isManagedCareContractQuery(queryLower: string): boolean {
  return (
    matchesAnyTerm(queryLower, ['contract', 'contracts', 'contracting', 'exhibit', 'exhibits']) ||
    (matchesAnyTerm(queryLower, ['obligation', 'obligations']) && isManagedCareOperationsQuery(queryLower))
  );
}

export function isOperationalRoutingQuery(queryLower: string): boolean {
  return (
    isReimbursementQuery(queryLower) ||
    isBillingWorkflowQuery(queryLower) ||
    isManagedCareOperationsQuery(queryLower)
  );
}

export function isCoverageQuestion(queryLower: string): boolean {
  if (isClinicalCriteriaLifecycleQuery(queryLower)) {
    return true;
  }

  return (
    // Word-bounded: the old bare 'cover' substring typed "estate recovery"
    // and any 'recovery' question as coverage.
    /\bcover(s|ed|ing|age)?\b/.test(queryLower) ||
    matchesAnyTerm(queryLower, ['telehealth', 'epsdt', 'medically necessary']) ||
    (matchesAnyTerm(queryLower, ['requirement', 'requirements', 'criteria', 'documentation']) &&
      !matchesAnyTerm(queryLower, [
        'termination',
        'terminations',
        'discharge',
        'discharges',
        'notification',
        'notifications',
      ]))
  );
}

export function isClinicalCriteriaLifecycleQuery(queryLower: string): boolean {
  return matchesAnyTerm(queryLower, [
    'entrance criteria',
    'continued service',
    'continued services',
    'continued stay',
    'discharge criteria',
  ]);
}

export function isTelehealthQuery(queryLower: string): boolean {
  return matchesTerm(queryLower, 'telehealth');
}

export function asksForTelehealthServiceList(queryLower: string): boolean {
  return (
    isTelehealthQuery(queryLower) &&
    includesPhrase(queryLower, [
      'which services',
      'what services',
      'which service',
      'what service',
      'which codes',
      'what codes',
      'eligible service',
      'telehealth-eligible',
      'telehealth eligible',
      'cpt',
      'hcpcs',
      'billing code',
      'code-by-code',
    ])
  );
}

export function isCongregatePcsQuery(queryLower: string): boolean {
  return (
    matchesAnyTerm(queryLower, ['personal care services', 'pcs']) &&
    matchesAnyTerm(queryLower, [
      'assisted living',
      'congregate',
      'adult care home',
      'adult care homes',
      'group home',
      'group homes',
    ])
  );
}

const AMBULANCE_QUERY_TERMS = ['ambulance', 'ambulances'];

export function isAmbulanceNotCoveredQuery(queryLower: string): boolean {
  return matchesAnyTerm(queryLower, AMBULANCE_QUERY_TERMS) && asksForNotCoveredDetails(queryLower);
}

export function isDeterministicPriorAuthQuery(queryLower: string): boolean {
  return includesPhrase(queryLower, [
    'quantity limit',
    'quantity limits',
    'quantity limitation',
    'quantity limitations',
    'episodic drug',
    'episodic drugs',
    'days supply',
  ]);
}

export function isPharmacyQuantityPriorAuthQuery(queryLower: string): boolean {
  return (
    isDeterministicPriorAuthQuery(queryLower) &&
    includesPhrase(queryLower, ['pharmacy', 'pharmacy claims', 'prescription drug', 'prescription drugs', 'drug', 'drugs'])
  );
}

export function asksForPriorAuthSubmissionProcess(queryLower: string): boolean {
  return includesPhrase(queryLower, [
    'how to submit',
    'how do i submit',
    'submission process',
    'request process',
    'prior authorization process',
    'web portal',
    'fax',
    'phone',
    'call center',
  ]);
}

function isHcwdQuery(queryLower: string): boolean {
  return matchesAnyTerm(queryLower, [
    'hcwd',
    'health coverage for workers with disabilities',
    'health care for workers with disabilities',
  ]);
}

function isMedicarePartDQuery(queryLower: string): boolean {
  return matchesAnyTerm(queryLower, [
    'part d',
    'medicare prescription drug',
    'medicare prescription-drug',
    'medicare drug benefit',
  ]);
}

/** Policy 9, Outpatient Pharmacy: the pharmacy benefit as a whole. */
function isOutpatientPharmacyPolicyQuery(queryLower: string): boolean {
  if (isMedicarePartDQuery(queryLower)) return false;

  return matchesAnyTerm(queryLower, [
    'outpatient pharmacy',
    'pharmacy benefit',
    'pharmacy claims',
    'prescription drug',
    'prescription drugs',
  ]);
}

/**
 * Policy 9A, Over-the-Counter Products. Policy 9 lists over-the-counter
 * products among its exclusions and defers to 9A for the ones Medicaid covers,
 * so this wording must not anchor on Policy 9.
 */
function isOverTheCounterPolicyQuery(queryLower: string): boolean {
  if (isMedicarePartDQuery(queryLower)) return false;

  return matchesAnyTerm(queryLower, [
    'over-the-counter medication',
    'over-the-counter medications',
    'over the counter medication',
    'over the counter medications',
    'otc drug',
    'otc drugs',
    'otc medication',
    'otc medications',
  ]);
}

export function isHcwdIncomePremiumQuery(queryLower: string): boolean {
  return (
    isHcwdQuery(queryLower) &&
    includesPhrase(queryLower, [
      'income',
      'earned income',
      'unearned income',
      'premium',
      'premiums',
      'enrollment fee',
      'cost sharing',
    ])
  );
}

export function asksForEarnedIncomeLimit(queryLower: string): boolean {
  return (
    queryLower.includes('earned income') &&
    includesPhrase(queryLower, ['maximum', 'limit', 'income limit', 'cap'])
  );
}

export function isRequirementDetailQuery(queryLower: string): boolean {
  return includesPhrase(queryLower, REQUIREMENT_QUERY_TERMS);
}

export function isEligibilityCriteriaQuery(queryLower: string): boolean {
  return queryLower.includes('eligibility criteria') || queryLower.includes('general eligibility');
}

export function asksForGeneralCriteria(queryLower: string): boolean {
  return queryLower.includes('general criteria');
}

export function isYesNoCoverageQuery(queryLower: string): boolean {
  if (!/^(does|is|can|are|will|under)\b/.test(queryLower)) return false;
  return (
    /\bcover(s|ed|ing|age)?\b/.test(queryLower) ||
    /\bauthoriz(e|es|ed|ing|ation)\b/.test(queryLower) ||
    /\beligible\b/.test(queryLower)
  );
}

export function asksForNotCoveredDetails(queryLower: string): boolean {
  return queryLower.includes('not covered') || queryLower.includes('not cover');
}

export function isPolicyVariantQuery(queryLower: string): boolean {
  const explicitPolicies = extractExplicitPolicyNumbers(queryLower);
  return explicitPolicies.length >= 2 || matchesAnyTerm(queryLower, ['difference between', 'differences between', 'vs']);
}

export function asksForHistory(queryLower: string): boolean {
  return queryLower.includes('history') || queryLower.includes('older') || queryLower.includes('previous');
}

export function asksForImplementation(queryLower: string): boolean {
  return (
    queryLower.includes('north carolina') ||
    /\bnc\b/.test(queryLower) ||
    queryLower.includes('implementation') ||
    queryLower.includes('managed care') ||
    queryLower.includes('php') ||
    queryLower.includes('contract')
  );
}

export function isWaiverApplicationQuery(queryLower: string): boolean {
  return (
    queryLower.includes('waiver') &&
    (
      queryLower.includes('application') ||
      queryLower.includes('demonstrate') ||
      queryLower.includes('must show') ||
      queryLower.includes('need to show') ||
      queryLower.includes('need to demonstrate')
    )
  );
}

/**
 * Queries like "what federal regulation authorizes NC Medicaid's 1915(c) HCBS
 * waivers?" — distinct from waiver application-process questions. They should
 * route to 42 CFR Part 441 Subpart G (§§ 441.300–441.310) rather than the
 * 42 CFR § 430.25 cross-reference the focus-score picks by vocabulary overlap.
 * Trailing `\b` doesn't match after `)`; use a negative lookahead.
 */
export function isWaiverAuthorityQuery(queryLower: string): boolean {
  if (!/\b1915\s*\(c\)(?!\w)/.test(queryLower)) return false;
  return (
    /\bauthoriz(e|es|ed|ing|ation)\b/.test(queryLower) ||
    /\bauthority\b/.test(queryLower) ||
    /\bfederal (authority|regulations?|rules?|laws?|statutes?)\b/.test(queryLower) ||
    /\bwhat (?:regulation|rule|law|section|provision)\b/.test(queryLower)
  );
}

/**
 * Authority-citation phrasing: the question asks WHICH statute/regulation
 * creates or governs something ("what federal authority establishes EPSDT",
 * "statutory basis for...", "which regulation governs..."). Broader than the
 * waiver-specific predicate above — consulted only inside the
 * federal-authority frame, where it turns on statute+regulation pairing.
 * Generic legal phrasing only; no program or section identifiers.
 */
/** A program overview needs governing authority, even without the word federal.
 * Keep service-specific coverage/PA questions on their existing policy paths. */
export function isEpsdtOverviewQuery(queryLower: string): boolean {
  return /^(?:what does epsdt require|what is epsdt|what are (?:the )?epsdt requirements|(?:explain|summarize|describe) epsdt(?: requirements)?)[?.!\s]*$/.test(queryLower.trim());
}

export function asksForAuthorityCitation(queryLower: string): boolean {
  return (
    isEpsdtOverviewQuery(queryLower) ||
    /\bauthoriz(e|es|ed|ing|ation)\b/.test(queryLower) ||
    /\bauthority\b/.test(queryLower) ||
    /\bstatutory basis\b/.test(queryLower) ||
    /\bestablish(es|ed|ing)?\b/.test(queryLower) ||
    /\bgoverns?\b/.test(queryLower)
  );
}

export function asksForPublicNoticeDetails(queryLower: string): boolean {
  // No bare "hearing": it is also "hearing aids" and a beneficiary's fair
  // hearing, neither of which is a public-notice question.
  return matchesAnyTerm(queryLower, [
    'public notice',
    'public notices',
    'comment period',
    'comment periods',
    'public hearing',
    'public hearings',
    'notice and comment',
  ]);
}

export function asksForCertificationDetails(queryLower: string): boolean {
  return (
    queryLower.includes('certification') ||
    queryLower.includes('recertification') ||
    queryLower.includes('certify') ||
    queryLower.includes('terminally ill') ||
    queryLower.includes('terminal illness')
  );
}

export function isMlrQuery(queryLower: string): boolean {
  return matchesAnyTerm(queryLower, ['medical loss ratio', 'medical loss ratios', 'mlr']);
}

export function isPediatricQuery(queryLower: string): boolean {
  return matchesAnyTerm(queryLower, PEDIATRIC_QUERY_TERMS);
}

export function isDeterministicCoverageQuery(queryLower: string): boolean {
  // The deterministic numeric-only lane (widening: none) is for questions
  // seeking a specific figure. Bare 'premium'/'cost sharing' mentions used to
  // force every such coverage question onto it, blocking evidence widening.
  const asksForFigure = includesPhrase(queryLower, [
    'how much',
    'amount',
    'maximum',
    'limit',
    'cap',
    'threshold',
    'fpl',
    'dollar',
  ]);
  return (
    isHcwdIncomePremiumQuery(queryLower) ||
    (includesPhrase(queryLower, ['premium', 'premiums', 'enrollment fee', 'cost sharing']) && asksForFigure) ||
    (
      queryLower.includes('income') &&
      includesPhrase(queryLower, ['maximum', 'limit', 'cap', 'threshold', 'fpl'])
    )
  );
}

export function detectAnswerQuestionType(
  queryLower: string,
  requestedType?: AnswerQuestionType,
): AnswerQuestionType {
  // A model-supplied generic hint must not hide the governing EPSDT sources.
  if ((!requestedType || requestedType === 'general') && isEpsdtOverviewQuery(queryLower)) return 'federal_authority';
  if (requestedType) return requestedType;
  if (isChangeNoticeQuery(queryLower)) return 'amendment';
  // Federal authority outranks prior-auth: "what federal regulation governs
  // prior authorization for X" is a federal-authority question.
  if (isFederalAuthorityQuery(queryLower)) return 'federal_authority';
  if (isPriorAuthorizationQuery(queryLower)) return 'prior_authorization';
  if (isPolicyVariantQuery(queryLower)) return 'policy_variant';
  if (isCoverageQuestion(queryLower)) return 'coverage';
  return 'general';
}

export function extractExplicitPolicyNumbers(query: string): string[] {
  const matches = [
    ...(query.match(/\b\d+[A-Za-z](?:-[A-Za-z0-9]+)?\b/g) ?? []),
    ...(query.match(/\b(?:MA|DMA|DHB|DSS)-\d+[A-Za-z0-9-]*\b/gi) ?? []),
  ];
  return dedupeTerms(matches.map((match) => match.toUpperCase()));
}

export function extractAliasedPolicyNumbers(queryLower: string): string[] {
  const policyNumbers: string[] = [];

  // CAP/Choice is the consumer-directed option of the disabled-adults waiver.
  if (matchesAnyTerm(queryLower, ['cap/da', 'cap/choice'])) {
    policyNumbers.push('3K-2');
  }

  // Bounded: a bare "cap/c" substring also matched CAP/Choice and CAP/CD,
  // which Policy 3K-2 defines, and pinned them to the children's waiver.
  if (matchesAnyTerm(queryLower, ['cap/c', 'cap/children'])) {
    policyNumbers.push('3K-1');
  }

  // Policy 10A's own name for its service. The corpus uses bare "outpatient
  // therapy" only in behavioral-health policies, so that wording is left to
  // search.
  if (matchesAnyTerm(queryLower, ['outpatient specialized therapy', 'outpatient specialized therapies'])) {
    policyNumbers.push('10A');
  }

  if (
    matchesTerm(queryLower, 'telehealth') &&
    matchesAnyTerm(queryLower, ['speech therapy', 'speech-language therapy', 'audiology therapy', 'aural rehabilitation'])
  ) {
    policyNumbers.push('10A');
  }

  if (matchesTerm(queryLower, 'outpatient behavioral health')) {
    policyNumbers.push('8C');
  }

  if (
    matchesAnyTerm(queryLower, AMBULANCE_QUERY_TERMS) &&
    !matchesAnyTerm(queryLower, ['nemt', 'non-emergency medical transportation'])
  ) {
    policyNumbers.push('15');
  }

  // Never both: the frame keeps one preferred document and the two would tie.
  if (isOverTheCounterPolicyQuery(queryLower)) {
    policyNumbers.push('9A');
  } else if (isOutpatientPharmacyPolicyQuery(queryLower)) {
    policyNumbers.push('9');
  }

  if (isHcwdQuery(queryLower)) {
    policyNumbers.push('MA-2180');
  }

  return dedupeTerms(policyNumbers);
}

export function queryMentionsPolicyNumber(queryLower: string, policyNumber: string | null): boolean {
  if (!policyNumber) return false;
  // Token-bounded: raw containment meant any query with the digit "9" in it
  // (e.g. "1915(c)") boosted Policy 9.
  return matchesToken(queryLower, normalizeSearchText(policyNumber));
}

const FEDERAL_POVERTY_RE = /\bfederal[\s-]+poverty\b/g;
const STATE_PLAN_AMENDMENT_RE = /\b(?:state[\s-]+)?plan[\s-]+amendments?\b/g;

export function isFederalAuthorityQuery(queryLower: string): boolean {
  // The federal poverty level is an income yardstick in state eligibility
  // rules, not a request for federal authority.
  const withoutPovertyLevel = queryLower.replace(FEDERAL_POVERTY_RE, ' ');
  return (
    isEpsdtOverviewQuery(queryLower) ||
    matchesAnyTerm(withoutPovertyLevel, ['federal', 'statutory', 'social security act', 'cfr']) ||
    (matchesAnyTerm(queryLower, ['waiver', 'waivers']) && matchesAnyTerm(queryLower, ['application', 'applications']))
  );
}

const RECENCY_QUERY_TERMS = ['most recent', 'latest'];

export function isChangeNoticeQuery(queryLower: string): boolean {
  // Bare "most recent" is a recency qualifier, not an amendment question —
  // "the most recent income limit for HCWD" used to misroute to the
  // amendment lane. Recency only counts alongside change vocabulary.
  //
  // A State Plan Amendment is a kind of document, not a change to a policy:
  // naming one is not asking what was amended.
  const withoutStatePlanAmendment = queryLower.replace(STATE_PLAN_AMENDMENT_RE, ' ');
  return (
    matchesAnyTerm(withoutStatePlanAmendment, [
      'change notice',
      'change notices',
      'amended',
      'amendment',
      'amendments',
    ]) ||
    (
      matchesAnyTerm(queryLower, RECENCY_QUERY_TERMS) &&
      matchesAnyTerm(queryLower, [
        'change',
        'changes',
        'changed',
        'revision',
        'revisions',
        'notice',
        'notices',
        'update',
        'updates',
        'updated',
        'version',
        'versions',
      ])
    )
  );
}

export function isLatestChangeNoticeQuery(queryLower: string): boolean {
  return (
    isChangeNoticeQuery(queryLower) &&
    matchesAnyTerm(queryLower, [...RECENCY_QUERY_TERMS, 'current'])
  );
}
