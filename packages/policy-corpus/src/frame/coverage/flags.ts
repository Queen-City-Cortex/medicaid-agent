import {
  COVERAGE_AVOID_TERMS,
  TELEHEALTH_AVOID_TERMS,
  asksForCertificationDetails,
  asksForEarnedIncomeLimit,
  asksForGeneralCriteria,
  asksForNotCoveredDetails,
  asksForTelehealthServiceList,
  isAmbulanceNotCoveredQuery,
  isCongregatePcsQuery,
  isEligibilityCriteriaQuery,
  isHcwdIncomePremiumQuery,
  isTelehealthQuery,
  isYesNoCoverageQuery,
} from '../../internal/shared.js';

export interface CoverageQueryFlags {
  generalCriteriaQuery: boolean;
  eligibilityFrameworkQuery: boolean;
  notCoveredQuery: boolean;
  certificationQuery: boolean;
  telehealthQuery: boolean;
  telehealthServiceListQuery: boolean;
  ambulanceNotCoveredQuery: boolean;
  congregatePcsQuery: boolean;
  yesNoCoverageQuery: boolean;
  hcwdIncomePremiumQuery: boolean;
  earnedIncomeLimitQuery: boolean;
  telehealthAvoidTerms: string[];
}

export function buildCoverageQueryFlags(queryLower: string): CoverageQueryFlags {
  return {
    generalCriteriaQuery: isEligibilityCriteriaQuery(queryLower) || asksForGeneralCriteria(queryLower),
    eligibilityFrameworkQuery: isEligibilityCriteriaQuery(queryLower),
    notCoveredQuery: asksForNotCoveredDetails(queryLower),
    certificationQuery: asksForCertificationDetails(queryLower),
    telehealthQuery: isTelehealthQuery(queryLower),
    telehealthServiceListQuery: asksForTelehealthServiceList(queryLower),
    ambulanceNotCoveredQuery: isAmbulanceNotCoveredQuery(queryLower),
    congregatePcsQuery: isCongregatePcsQuery(queryLower),
    yesNoCoverageQuery: isYesNoCoverageQuery(queryLower),
    hcwdIncomePremiumQuery: isHcwdIncomePremiumQuery(queryLower),
    earnedIncomeLimitQuery: asksForEarnedIncomeLimit(queryLower),
    telehealthAvoidTerms: [...TELEHEALTH_AVOID_TERMS, ...COVERAGE_AVOID_TERMS],
  };
}
