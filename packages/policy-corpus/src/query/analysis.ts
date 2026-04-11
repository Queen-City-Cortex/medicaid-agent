import type { AnswerQuestionType } from '../types.js';
import type { QueryAnalysis } from '../contracts.js';
import {
  buildFocusedFederalQuery,
  buildQueryFocusTerms,
  dedupeTerms,
  extractProcedureCodeTerms,
  extractQuotedPhrases,
  extractSearchTerms,
  extractServiceFocusTerms,
} from '../internal/search.js';
import { normalizeSearchText } from '../internal/base.js';
import { selectAnswerRoute } from '../internal/answer-routing.js';
import {
  asksForCertificationDetails,
  asksForGeneralCriteria,
  asksForHistory,
  asksForImplementation,
  asksForNotCoveredDetails,
  asksForPriorAuthSubmissionProcess,
  asksForPublicNoticeDetails,
  asksForTelehealthServiceList,
  detectAnswerQuestionType,
  extractAliasedPolicyNumbers,
  extractExplicitPolicyNumbers,
  extractRequestedYears,
  isBillingWorkflowQuery,
  isChangeNoticeQuery,
  isClinicalCriteriaLifecycleQuery,
  isCongregatePcsQuery,
  isCoverageQuestion,
  isEligibilityCriteriaQuery,
  isFederalAuthorityQuery,
  isHcwdIncomePremiumQuery,
  isHistoricalReimbursementQuery,
  isLatestChangeNoticeQuery,
  isManagedCareContractQuery,
  isManagedCareOperationsQuery,
  isMlrQuery,
  isOperationalRoutingQuery,
  isPediatricQuery,
  isPolicyVariantQuery,
  isPriorAuthorizationQuery,
  isReimbursementQuery,
  isTelehealthQuery,
  isWaiverApplicationQuery,
  isYesNoCoverageQuery,
} from '../internal/query-intent.js';

export function analyzeQuery(query: string, requestedType?: AnswerQuestionType): QueryAnalysis {
  const normalizedQuery = normalizeSearchText(query);
  const requestedYears = extractRequestedYears(query);
  const federalAuthorityQuery = isFederalAuthorityQuery(normalizedQuery);
  const aliasedPolicyNumbers = federalAuthorityQuery ? [] : extractAliasedPolicyNumbers(normalizedQuery);
  const explicitPolicyNumbers = dedupeTerms([
    ...extractExplicitPolicyNumbers(query),
    ...aliasedPolicyNumbers,
  ]);
  const questionType = detectAnswerQuestionType(normalizedQuery, requestedType);

  return {
    query,
    normalizedQuery,
    questionType,
    route: selectAnswerRoute(normalizedQuery, questionType),
    searchTerms: extractSearchTerms(query),
    focusTerms: buildQueryFocusTerms(query),
    serviceFocusTerms: extractServiceFocusTerms(query),
    procedureCodes: extractProcedureCodeTerms(query),
    explicitPolicyNumbers,
    aliasedPolicyNumbers,
    quotedPhrases: extractQuotedPhrases(query),
    requestedYears,
    focusedFederalQuery: buildFocusedFederalQuery(query),
    flags: {
      asksForCertificationDetails: asksForCertificationDetails(normalizedQuery),
      asksForGeneralCriteria: asksForGeneralCriteria(normalizedQuery),
      asksForHistory: asksForHistory(normalizedQuery),
      asksForImplementation: asksForImplementation(normalizedQuery),
      asksForNotCoveredDetails: asksForNotCoveredDetails(normalizedQuery),
      asksForPriorAuthSubmissionProcess: asksForPriorAuthSubmissionProcess(normalizedQuery),
      asksForPublicNoticeDetails: asksForPublicNoticeDetails(normalizedQuery),
      asksForTelehealthServiceList: asksForTelehealthServiceList(normalizedQuery),
      isBillingWorkflowQuery: isBillingWorkflowQuery(normalizedQuery),
      isChangeNoticeQuery: isChangeNoticeQuery(normalizedQuery),
      isClinicalCriteriaLifecycleQuery: isClinicalCriteriaLifecycleQuery(normalizedQuery),
      isCongregatePcsQuery: isCongregatePcsQuery(normalizedQuery),
      isCoverageQuestion: isCoverageQuestion(normalizedQuery),
      isEligibilityCriteriaQuery: isEligibilityCriteriaQuery(normalizedQuery),
      isFederalAuthorityQuery: federalAuthorityQuery,
      isHcwdIncomePremiumQuery: isHcwdIncomePremiumQuery(normalizedQuery),
      isHistoricalReimbursementQuery: isHistoricalReimbursementQuery(normalizedQuery, requestedYears),
      isLatestChangeNoticeQuery: isLatestChangeNoticeQuery(normalizedQuery),
      isManagedCareContractQuery: isManagedCareContractQuery(normalizedQuery),
      isManagedCareOperationsQuery: isManagedCareOperationsQuery(normalizedQuery),
      isMlrQuery: isMlrQuery(normalizedQuery),
      isOperationalRoutingQuery: isOperationalRoutingQuery(normalizedQuery),
      isPediatricQuery: isPediatricQuery(normalizedQuery),
      isPolicyVariantQuery: isPolicyVariantQuery(normalizedQuery),
      isPriorAuthorizationQuery: isPriorAuthorizationQuery(normalizedQuery),
      isReimbursementQuery: isReimbursementQuery(normalizedQuery),
      isTelehealthQuery: isTelehealthQuery(normalizedQuery),
      isWaiverApplicationQuery: isWaiverApplicationQuery(normalizedQuery),
      isYesNoCoverageQuery: isYesNoCoverageQuery(normalizedQuery),
    },
  };
}
