import type { AnswerQuestionType } from '../types.js';
import { includesPhrase, matchesToken, normalizeSearchText } from './base.js';
import { dedupeTerms } from './search.js';

const YEAR_QUERY_RE = /\b(19|20)\d{2}\b/g;
const REQUIREMENT_QUERY_TERMS = ['requirement', 'requirements', 'documentation', 'document', 'provide'];
// 'minor' is deliberately absent: in this corpus it overwhelmingly means
// "small" ("minor home modifications" under CAP/DA), not "a child".
const PEDIATRIC_QUERY_TERMS = ['under 21', 'child', 'children', 'pediatric', 'pediatrics', 'adolescent', 'youth'];

export function isPriorAuthorizationQuery(queryLower: string): boolean {
  return (
    queryLower.includes('prior authorization') ||
    queryLower.includes('prior approval') ||
    queryLower.includes('prior auth') ||
    // Word-bounded: the old "pa " substring matched "spa " (State Plan
    // Amendment questions misrouted to prior_authorization).
    (/\bpa\b/.test(queryLower) && queryLower.includes('criteria'))
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
  return includesPhrase(queryLower, [
    'billing',
    'claims',
    'claim ',
    'nctracks',
    'submission',
    'modifier',
    'remittance',
    'invoice',
    'crosswalk',
    'form',
    'forms',
  ]);
}

export function isManagedCareOperationsQuery(queryLower: string): boolean {
  return includesPhrase(queryLower, [
    'managed care',
    'health plan',
    'provider playbook',
    'tailored plan',
    'standard plan',
    'contract',
    'contracting',
    'ombudsman',
  ]);
}

export function isManagedCareContractQuery(queryLower: string): boolean {
  return (
    queryLower.includes('contract') ||
    queryLower.includes('contracts') ||
    queryLower.includes('contracting') ||
    queryLower.includes('exhibit') ||
    (queryLower.includes('obligation') && isManagedCareOperationsQuery(queryLower))
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
    queryLower.includes('telehealth') ||
    queryLower.includes('epsdt') ||
    queryLower.includes('medically necessary') ||
    ((queryLower.includes('requirement') ||
      queryLower.includes('requirements') ||
      queryLower.includes('criteria') ||
      queryLower.includes('documentation')) &&
      !queryLower.includes('termination') &&
      !queryLower.includes('discharge') &&
      !queryLower.includes('notification'))
  );
}

export function isClinicalCriteriaLifecycleQuery(queryLower: string): boolean {
  return (
    queryLower.includes('entrance criteria') ||
    queryLower.includes('continued service') ||
    queryLower.includes('continued services') ||
    queryLower.includes('continued stay') ||
    queryLower.includes('discharge criteria')
  );
}

export function isTelehealthQuery(queryLower: string): boolean {
  return queryLower.includes('telehealth');
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
    includesPhrase(queryLower, ['personal care services', 'pcs']) &&
    includesPhrase(queryLower, ['assisted living', 'congregate', 'adult care home', 'group home'])
  );
}

export function isAmbulanceNotCoveredQuery(queryLower: string): boolean {
  return queryLower.includes('ambulance') && asksForNotCoveredDetails(queryLower);
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
  return (
    queryLower.includes('hcwd') ||
    queryLower.includes('health coverage for workers with disabilities') ||
    queryLower.includes('health care for workers with disabilities')
  );
}

function isOutpatientPharmacyPolicyQuery(queryLower: string): boolean {
  if (
    includesPhrase(queryLower, [
      'part d',
      'medicare prescription drug',
      'medicare prescription-drug',
      'medicare drug benefit',
    ])
  ) {
    return false;
  }

  return includesPhrase(queryLower, [
    'outpatient pharmacy',
    'pharmacy benefit',
    'pharmacy claims',
    'prescription drug',
    'prescription drugs',
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
  return explicitPolicies.length >= 2 || queryLower.includes('difference between') || queryLower.includes('vs ');
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
  return (
    queryLower.includes('public notice') ||
    queryLower.includes('comment period') ||
    queryLower.includes('public hearing') ||
    queryLower.includes('hearing') ||
    queryLower.includes('notice and comment')
  );
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
  return queryLower.includes('medical loss ratio') || /\bmlr\b/.test(queryLower);
}

export function isPediatricQuery(queryLower: string): boolean {
  return includesPhrase(queryLower, PEDIATRIC_QUERY_TERMS);
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

  if (queryLower.includes('cap/da')) {
    policyNumbers.push('3K-2');
  }

  if (queryLower.includes('cap/c')) {
    policyNumbers.push('3K-1');
  }

  if (queryLower.includes('outpatient therapy') || queryLower.includes('outpatient therapies')) {
    policyNumbers.push('10A');
  }

  if (
    queryLower.includes('telehealth') &&
    (
      queryLower.includes('speech therapy') ||
      queryLower.includes('speech-language therapy') ||
      queryLower.includes('speech language therapy') ||
      queryLower.includes('audiology therapy') ||
      queryLower.includes('aural rehabilitation')
    )
  ) {
    policyNumbers.push('10A');
  }

  if (queryLower.includes('outpatient behavioral health')) {
    policyNumbers.push('8C');
  }

  if (queryLower.includes('ambulance') && !queryLower.includes('nemt') && !queryLower.includes('non-emergency medical transportation')) {
    policyNumbers.push('15');
  }

  if (isOutpatientPharmacyPolicyQuery(queryLower)) {
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

export function isFederalAuthorityQuery(queryLower: string): boolean {
  return (
    isEpsdtOverviewQuery(queryLower) ||
    queryLower.includes('federal') ||
    queryLower.includes('statutory') ||
    queryLower.includes('social security act') ||
    queryLower.includes('cfr') ||
    (queryLower.includes('waiver') && queryLower.includes('application'))
  );
}

export function isChangeNoticeQuery(queryLower: string): boolean {
  // Bare "most recent" is a recency qualifier, not an amendment question —
  // "the most recent income limit for HCWD" used to misroute to the
  // amendment lane. Recency only counts alongside change vocabulary.
  return (
    queryLower.includes('change notice') ||
    queryLower.includes('amended') ||
    queryLower.includes('amendment') ||
    (
      includesPhrase(queryLower, ['most recent', 'latest']) &&
      includesPhrase(queryLower, ['change', 'revision', 'notice', 'update', 'version'])
    )
  );
}

export function isLatestChangeNoticeQuery(queryLower: string): boolean {
  return (
    isChangeNoticeQuery(queryLower) &&
    (queryLower.includes('most recent') || queryLower.includes('latest') || queryLower.includes('current'))
  );
}
