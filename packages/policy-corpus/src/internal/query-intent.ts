import type { AnswerQuestionType } from '../types.js';
import { includesPhrase, normalizeSearchText } from './base.js';
import { dedupeTerms } from './search.js';

export const YEAR_QUERY_RE = /\b(19|20)\d{2}\b/g;
export const REQUIREMENT_QUERY_TERMS = ['requirement', 'requirements', 'documentation', 'document', 'provide'];
export const PEDIATRIC_QUERY_TERMS = ['under 21', 'child', 'children', 'pediatric', 'pediatrics', 'adolescent', 'youth', 'minor'];

export function includesAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

export function isPriorAuthorizationQuery(queryLower: string): boolean {
  return (
    queryLower.includes('prior authorization') ||
    queryLower.includes('prior approval') ||
    queryLower.includes('prior auth') ||
    (queryLower.includes('pa ') && queryLower.includes('criteria'))
  );
}

export function isReimbursementQuery(queryLower: string): boolean {
  return (
    /\breimbursement\b/.test(queryLower) ||
    /\brates?\b/.test(queryLower) ||
    /\bpayments?\b/.test(queryLower) ||
    /\b(?:hcpcs|cpt)\b/.test(queryLower) ||
    includesAnyTerm(queryLower, [
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
    includesAnyTerm(queryLower, [
      'histor',
      'previous',
      'prior',
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
  return includesAnyTerm(queryLower, [
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
  return includesAnyTerm(queryLower, [
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
    queryLower.includes('cover') ||
    queryLower.includes('coverage') ||
    queryLower.includes('covered') ||
    queryLower.includes('not covered') ||
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
    includesAnyTerm(queryLower, [
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

export function isHcwdQuery(queryLower: string): boolean {
  return (
    queryLower.includes('hcwd') ||
    queryLower.includes('health coverage for workers with disabilities') ||
    queryLower.includes('health care for workers with disabilities')
  );
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
    /\bfederal (authority|regulation|rule|law)\b/.test(queryLower) ||
    /\bwhat (?:regulation|rule|law|section|provision)\b/.test(queryLower)
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
  return (
    isHcwdIncomePremiumQuery(queryLower) ||
    includesPhrase(queryLower, ['premium', 'premiums', 'enrollment fee', 'cost sharing']) ||
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
  if (requestedType) return requestedType;
  if (isChangeNoticeQuery(queryLower)) return 'amendment';
  if (isPriorAuthorizationQuery(queryLower)) return 'prior_authorization';
  if (isFederalAuthorityQuery(queryLower)) return 'federal_authority';
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

  if (isHcwdQuery(queryLower)) {
    policyNumbers.push('MA-2180');
  }

  return dedupeTerms(policyNumbers);
}

export function queryMentionsPolicyNumber(queryLower: string, policyNumber: string | null): boolean {
  if (!policyNumber) return false;
  return queryLower.includes(normalizeSearchText(policyNumber));
}

export function isFederalAuthorityQuery(queryLower: string): boolean {
  return (
    queryLower.includes('federal') ||
    queryLower.includes('statutory') ||
    queryLower.includes('social security act') ||
    queryLower.includes('cfr') ||
    (queryLower.includes('waiver') && queryLower.includes('application'))
  );
}

export function isChangeNoticeQuery(queryLower: string): boolean {
  return (
    queryLower.includes('change notice') ||
    queryLower.includes('most recent') ||
    queryLower.includes('amended') ||
    queryLower.includes('amendment')
  );
}

export function isLatestChangeNoticeQuery(queryLower: string): boolean {
  return (
    isChangeNoticeQuery(queryLower) &&
    (queryLower.includes('most recent') || queryLower.includes('latest') || queryLower.includes('current'))
  );
}
