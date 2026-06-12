// Heuristic reranking of hybrid retrieval hits. `buildRerankQueryContext`
// evaluates every query-level intent predicate exactly once per query (they
// were previously recomputed for every hit), and `rerankRetrievalHit` applies
// per-hit boosts/penalties — policy-number matches, federal-authority routing,
// operational role alignment, fee-schedule buckets, change-notice markers,
// HCWD/waiver special cases, and boilerplate penalties — on top of the
// backend score. Scoring is intentionally identical to the pre-refactor
// implementation (see tests/retrieval-ranking.test.ts pinned scores).

import type { CorpusRetrievalHit } from '../types.js';
import { combineText, includesPhrase, normalizeSearchText, scorePhraseMatches } from './base.js';
import {
  asksForPublicNoticeDetails,
  includesAnyTerm,
  isBillingWorkflowQuery,
  isChangeNoticeQuery,
  isCoverageQuestion,
  isFederalAuthorityQuery,
  isHcwdIncomePremiumQuery,
  isHistoricalReimbursementQuery,
  isLatestChangeNoticeQuery,
  isManagedCareContractQuery,
  isManagedCareOperationsQuery,
  isOperationalRoutingQuery,
  isPediatricQuery,
  isReimbursementQuery,
  isRequirementDetailQuery,
  isWaiverApplicationQuery,
  isYesNoCoverageQuery,
  queryMentionsPolicyNumber,
  variantDateMatchesRequestedYear,
} from './query-intent.js';
import { countProcedureCodeMatches, scoreTermMatches } from './search.js';
import {
  ANSWER_READY_PENALTY,
  ARCHIVE_FEE_SCHEDULE_PENALTY,
  ATTACHMENT_TITLE_PENALTY,
  AUTHORITATIVE_POLICY_BOOST,
  BOILERPLATE_TITLE_PENALTY,
  CHANGE_NOTICE_BOOST,
  COMPANION_FEE_SCHEDULE_PENALTY,
  CONTENT_TERM_MATCH_BOOST,
  CONTRACT_FEDERAL_CONTEXT_PENALTY,
  CONTRACT_GOVERNING_SOURCE_BOOST,
  CONTRACT_ROLE_BOOST,
  CONTRACT_ROLE_MISMATCH_PENALTY,
  COVERAGE_EXCLUSION_BOOST,
  COVERAGE_PROCESS_SECTION_PENALTY,
  DOCUMENT_TERM_MATCH_BOOST,
  EXACT_POLICY_NUMBER_BOOST,
  EXACT_REIMBURSEMENT_CODE_BOOST,
  FEDERAL_AUTHORITY_BOOST,
  FEDERAL_DOCUMENT_TYPES,
  GENERIC_SECTION_TITLE_PENALTY,
  HISTORY_FEE_SCHEDULE_BOOST,
  HISTORY_FEE_SCHEDULE_PENALTY,
  IMPLEMENTATION_SECTION_BOOST,
  LATEST_CHANGE_MARKER_BOOST,
  LATEST_CHANGE_QUERY_EFFECTIVE_SECTION_PENALTY,
  MODIFICATION_REVIEW_CLUSTER_BOOST,
  MODIFICATION_TOPIC_BOOST,
  NON_AUTHORITATIVE_POLICY_PENALTY,
  NON_FEDERAL_AUTHORITY_PENALTY,
  NON_REIMBURSEMENT_CODE_MATCH_PENALTY,
  OFF_TOPIC_OPERATIONAL_PENALTY,
  OPERATIONAL_ROLE_BOOST,
  OPERATIONAL_ROLE_MISMATCH_PENALTY,
  POLICY_NUMBER_MATCH_BOOST,
  PRIMARY_FEE_SCHEDULE_BOOST,
  REIMBURSEMENT_CODE_ROLE_BOOST,
  REQUESTED_YEAR_MATCH_BOOST,
  RETRIEVAL_READY_PENALTY,
  REVISION_HEADER_BOOST,
  SPREADSHEET_FEE_SCHEDULE_BOOST,
  TITLE_TERM_MATCH_BOOST,
} from './scoring-constants.js';
import {
  HCWD_INCOME_RULE_TERMS,
  REQUIREMENT_EVIDENCE_TERMS,
  WAIVER_APPLICATION_AVOID_TERMS,
  WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS,
  WAIVER_APPLICATION_PRIMARY_TERMS,
} from './term-lists.js';
import {
  includesCalendarYear,
  isAdministrativeFormTitle,
  isAttachmentTitle,
  isBoilerplateTitle,
  isCoverageProcessTitle,
  isGenericSectionTitle,
  isHcwdProcessTitle,
  isOperationalSourceHit,
  isPediatricPolicyHit,
  isYearSpecificPremiumTitle,
} from './section-predicates.js';
import { changeMarkerValueForHit, isRevisionHeaderTitle } from './change-markers.js';
import { documentKeyForHit } from './document-selection.js';

export function isModificationReviewQuery(queryLower: string): boolean {
  return (
    includesAnyTerm(queryLower, ['home modification', 'home modifications', 'equipment', 'technology', 'modification']) &&
    includesAnyTerm(queryLower, ['multidisciplinary team', 'mdt'])
  );
}

/** Query-level intent flags consumed by `rerankRetrievalHit`. */
export interface RerankQueryFlags {
  pediatricQuery: boolean;
  historicalReimbursementQuery: boolean;
  federalAuthorityQuery: boolean;
  managedCareContractQuery: boolean;
  waiverApplicationQuery: boolean;
  publicNoticeQuery: boolean;
  hcwdIncomePremiumQuery: boolean;
  coverageQuestion: boolean;
  operationalRoutingQuery: boolean;
  changeNoticeQuery: boolean;
  reimbursementQuery: boolean;
  billingWorkflowQuery: boolean;
  managedCareOperationsQuery: boolean;
  requirementDetailQuery: boolean;
  latestChangeNoticeQuery: boolean;
  modificationReviewQuery: boolean;
  yesNoCoverageQuery: boolean;
  queryIncludesCover: boolean;
  queryIncludesAttachment: boolean;
  queryIncludesCalendarYear: boolean;
  queryIncludesChart: boolean;
  queryIncludesProcedure: boolean;
  queryIncludesPayment: boolean;
  queryMentions1915b: boolean;
}

/**
 * Everything `rerankRetrievalHit` needs that depends only on the query, not
 * on the individual hit. Build it once per query, then rerank every hit
 * against it.
 */
export interface RerankQueryContext {
  queryLower: string;
  queryTerms: string[];
  procedureCodes: string[];
  requestedYears: string[];
  exactPolicyNumbers: string[];
  documentCoverageBoosts: Map<string, number>;
  latestChangeMarkerValue: number | null;
  flags: RerankQueryFlags;
}

export function buildRerankQueryContext({
  queryLower,
  queryTerms,
  procedureCodes,
  requestedYears,
  exactPolicyNumbers,
  documentCoverageBoosts,
  latestChangeMarkerValue,
}: Omit<RerankQueryContext, 'flags'>): RerankQueryContext {
  return {
    queryLower,
    queryTerms,
    procedureCodes,
    requestedYears,
    exactPolicyNumbers,
    documentCoverageBoosts,
    latestChangeMarkerValue,
    flags: {
      pediatricQuery: isPediatricQuery(queryLower),
      historicalReimbursementQuery: isHistoricalReimbursementQuery(queryLower, requestedYears),
      federalAuthorityQuery: isFederalAuthorityQuery(queryLower),
      managedCareContractQuery: isManagedCareContractQuery(queryLower),
      waiverApplicationQuery: isWaiverApplicationQuery(queryLower),
      publicNoticeQuery: asksForPublicNoticeDetails(queryLower),
      hcwdIncomePremiumQuery: isHcwdIncomePremiumQuery(queryLower),
      coverageQuestion: isCoverageQuestion(queryLower),
      operationalRoutingQuery: isOperationalRoutingQuery(queryLower),
      changeNoticeQuery: isChangeNoticeQuery(queryLower),
      reimbursementQuery: isReimbursementQuery(queryLower),
      billingWorkflowQuery: isBillingWorkflowQuery(queryLower),
      managedCareOperationsQuery: isManagedCareOperationsQuery(queryLower),
      requirementDetailQuery: isRequirementDetailQuery(queryLower),
      latestChangeNoticeQuery: isLatestChangeNoticeQuery(queryLower),
      modificationReviewQuery: isModificationReviewQuery(queryLower),
      yesNoCoverageQuery: isYesNoCoverageQuery(queryLower),
      queryIncludesCover: queryLower.includes('cover'),
      queryIncludesAttachment: queryLower.includes('attachment'),
      queryIncludesCalendarYear: includesCalendarYear(queryLower),
      queryIncludesChart: queryLower.includes('chart'),
      queryIncludesProcedure: queryLower.includes('procedure'),
      queryIncludesPayment: queryLower.includes('payment'),
      queryMentions1915b: queryLower.includes('1915(b)'),
    },
  };
}

export function rerankRetrievalHit(hit: CorpusRetrievalHit, context: RerankQueryContext): CorpusRetrievalHit {
  const {
    queryLower,
    queryTerms,
    procedureCodes,
    requestedYears,
    exactPolicyNumbers,
    documentCoverageBoosts,
    latestChangeMarkerValue,
    flags,
  } = context;

  const titleMatches = scoreTermMatches(queryTerms, hit.sectionTitle);
  const documentMatches = scoreTermMatches(queryTerms, hit.documentTitle);
  const contentMatches = Math.min(scoreTermMatches(queryTerms, hit.content), 6);
  const hitChangeMarkerValue = changeMarkerValueForHit(hit);
  const sectionText = combineText(hit.sectionTitle, hit.content);
  const requestedYearMatch = variantDateMatchesRequestedYear(hit.variantDate, requestedYears);
  const procedureCodeMatches = countProcedureCodeMatches(
    combineText(hit.sectionTitle, hit.documentTitle, hit.content),
    procedureCodes,
  );
  const retrievalText = combineText(hit.sectionNumber, hit.sectionTitle, hit.documentTitle, hit.policyNumber, hit.content);
  const sectionNumber = normalizeSearchText(hit.sectionNumber);

  let adjustedScore = hit.score;
  adjustedScore += titleMatches * TITLE_TERM_MATCH_BOOST;
  adjustedScore += documentMatches * DOCUMENT_TERM_MATCH_BOOST;
  adjustedScore += contentMatches * CONTENT_TERM_MATCH_BOOST;

  if (queryMentionsPolicyNumber(queryLower, hit.policyNumber)) {
    adjustedScore += POLICY_NUMBER_MATCH_BOOST;
  }

  if (hit.policyNumber && exactPolicyNumbers.includes(hit.policyNumber.toUpperCase())) {
    adjustedScore += EXACT_POLICY_NUMBER_BOOST;
  }

  if (hit.documentType && FEDERAL_DOCUMENT_TYPES.has(hit.documentType) && flags.federalAuthorityQuery) {
    adjustedScore += FEDERAL_AUTHORITY_BOOST;
  } else if (flags.federalAuthorityQuery) {
    adjustedScore -= NON_FEDERAL_AUTHORITY_PENALTY;
  }

  if (flags.managedCareContractQuery && !flags.federalAuthorityQuery) {
    if (hit.answerRole === 'managed_care_contract') {
      adjustedScore += CONTRACT_GOVERNING_SOURCE_BOOST;
    } else if (hit.documentType && FEDERAL_DOCUMENT_TYPES.has(hit.documentType)) {
      adjustedScore -= CONTRACT_FEDERAL_CONTEXT_PENALTY;
    }
  }

  if (hit.answerReady === false) {
    adjustedScore -= ANSWER_READY_PENALTY;
  }

  if (hit.retrievalReady === false) {
    adjustedScore -= RETRIEVAL_READY_PENALTY;
  }

  if (
    flags.coverageQuestion &&
    !flags.operationalRoutingQuery &&
    !flags.federalAuthorityQuery &&
    !flags.changeNoticeQuery
  ) {
    if (hit.authorityTier === 'authoritative') {
      adjustedScore += AUTHORITATIVE_POLICY_BOOST;
    } else if (hit.authorityTier) {
      adjustedScore -= NON_AUTHORITATIVE_POLICY_PENALTY;
    }
  }

  const operationalHit = isOperationalSourceHit(hit);
  if (!flags.operationalRoutingQuery && operationalHit) {
    adjustedScore -= OFF_TOPIC_OPERATIONAL_PENALTY;
  }

  if (flags.operationalRoutingQuery && operationalHit) {
    const reimbursementMatch = flags.reimbursementQuery && hit.answerRole === 'reimbursement';
    const billingMatch = flags.billingWorkflowQuery && hit.answerRole === 'billing';
    const managedCareMatch =
      flags.managedCareOperationsQuery &&
      (flags.managedCareContractQuery
        ? hit.answerRole === 'managed_care_contract'
        : hit.answerRole === 'managed_care' || hit.answerRole === 'managed_care_contract');

    if (reimbursementMatch || billingMatch || managedCareMatch) {
      adjustedScore += OPERATIONAL_ROLE_BOOST;
    } else {
      adjustedScore -= OPERATIONAL_ROLE_MISMATCH_PENALTY;
    }

    if (flags.managedCareContractQuery) {
      if (hit.answerRole === 'managed_care_contract') {
        adjustedScore += CONTRACT_ROLE_BOOST;
      } else if (hit.answerRole === 'managed_care') {
        adjustedScore -= CONTRACT_ROLE_MISMATCH_PENALTY;
      }
    }
  }

  if (flags.reimbursementQuery && procedureCodes.length > 0 && procedureCodeMatches > 0) {
    adjustedScore += procedureCodeMatches * EXACT_REIMBURSEMENT_CODE_BOOST;
    if (hit.answerRole === 'reimbursement') {
      adjustedScore += REIMBURSEMENT_CODE_ROLE_BOOST;
    } else {
      adjustedScore -= NON_REIMBURSEMENT_CODE_MATCH_PENALTY;
    }
  }

  if (hit.documentType === 'fee_schedule' && flags.reimbursementQuery) {
    if (hit.corpusBucket === 'primary') {
      adjustedScore += PRIMARY_FEE_SCHEDULE_BOOST;
    } else if (hit.corpusBucket === 'history') {
      adjustedScore += flags.historicalReimbursementQuery || requestedYearMatch
        ? HISTORY_FEE_SCHEDULE_BOOST
        : -HISTORY_FEE_SCHEDULE_PENALTY;
    } else if (hit.corpusBucket === 'archive') {
      adjustedScore += requestedYearMatch ? HISTORY_FEE_SCHEDULE_BOOST : -ARCHIVE_FEE_SCHEDULE_PENALTY;
    } else if (hit.corpusBucket === 'companion' || hit.corpusBucket === 'reference') {
      adjustedScore -= COMPANION_FEE_SCHEDULE_PENALTY;
    }

    if (hit.sourceFormat === 'xlsx') {
      adjustedScore += SPREADSHEET_FEE_SCHEDULE_BOOST;
    }

    if (requestedYearMatch) {
      adjustedScore += REQUESTED_YEAR_MATCH_BOOST;
    }
  }

  if (flags.changeNoticeQuery && normalizeSearchText(hit.documentTitle).includes('change notice')) {
    adjustedScore += CHANGE_NOTICE_BOOST;
  }

  if (flags.waiverApplicationQuery) {
    if (
      hit.policyNumber?.toUpperCase() === '42-CFR-441' ||
      normalizeSearchText(hit.documentTitle).includes('42 cfr part 441')
    ) {
      adjustedScore += 0.34;
    } else if (normalizeSearchText(hit.documentTitle).includes('42 cfr part 440')) {
      adjustedScore += 0.12;
    }

    if (sectionNumber === '1915') {
      adjustedScore += 0.4;
    }

    if (WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS.has(sectionNumber)) {
      adjustedScore += 0.45;
    }

    if (includesPhrase(retrievalText, WAIVER_APPLICATION_PRIMARY_TERMS)) {
      adjustedScore += 0.18;
    }

    if (includesPhrase(retrievalText, ['1915(b)', '1915(b) waiver']) && !flags.queryMentions1915b) {
      adjustedScore -= 0.45;
    }

    if (
      includesPhrase(retrievalText, WAIVER_APPLICATION_AVOID_TERMS) ||
      (!flags.publicNoticeQuery && sectionNumber === '431.408')
    ) {
      adjustedScore -= 0.55;
    }
  }

  if (flags.queryIncludesCover && normalizeSearchText(hit.content).includes('not covered')) {
    adjustedScore += COVERAGE_EXCLUSION_BOOST;
  }

  if (flags.requirementDetailQuery) {
    const requirementEvidenceScore = Math.min(scorePhraseMatches(sectionText, REQUIREMENT_EVIDENCE_TERMS, 1), 4);
    adjustedScore += requirementEvidenceScore * 0.05;
    if (!hit.sectionNumber && requirementEvidenceScore === 0) {
      adjustedScore -= 0.08;
    }
  }

  if (flags.changeNoticeQuery && normalizeSearchText(hit.sectionTitle).includes('implementation')) {
    adjustedScore += IMPLEMENTATION_SECTION_BOOST;
  }

  if (flags.changeNoticeQuery && isRevisionHeaderTitle(hit.sectionTitle)) {
    adjustedScore += REVISION_HEADER_BOOST;
  }

  if (flags.hcwdIncomePremiumQuery) {
    if (includesPhrase(retrievalText, HCWD_INCOME_RULE_TERMS)) {
      adjustedScore += 0.32;
    }

    if (normalizeSearchText(hit.documentTitle).includes('change notice')) {
      adjustedScore += 0.12;
    }

    if (
      (isYearSpecificPremiumTitle(hit.sectionTitle) || isYearSpecificPremiumTitle(hit.documentTitle)) &&
      !flags.queryIncludesCalendarYear &&
      !flags.queryIncludesChart
    ) {
      adjustedScore -= 0.45;
    }

    if (isAdministrativeFormTitle(hit.sectionTitle) || isAdministrativeFormTitle(hit.documentTitle)) {
      adjustedScore -= 0.35;
    }

    if (
      (isHcwdProcessTitle(hit.sectionTitle) || isHcwdProcessTitle(hit.documentTitle)) &&
      !flags.queryIncludesProcedure &&
      !flags.queryIncludesPayment
    ) {
      adjustedScore -= 0.2;
    }
  }

  if (
    flags.latestChangeNoticeQuery &&
    latestChangeMarkerValue !== null &&
    hitChangeMarkerValue !== null &&
    hitChangeMarkerValue === latestChangeMarkerValue
  ) {
    adjustedScore += LATEST_CHANGE_MARKER_BOOST;
  }

  if (
    flags.latestChangeNoticeQuery &&
    hitChangeMarkerValue === null &&
    normalizeSearchText(hit.sectionTitle).includes('effective') &&
    !normalizeSearchText(hit.documentTitle).includes('change notice')
  ) {
    adjustedScore -= LATEST_CHANGE_QUERY_EFFECTIVE_SECTION_PENALTY;
  }

  if (flags.modificationReviewQuery) {
    const hitText = `${normalizeSearchText(hit.sectionTitle)} ${normalizeSearchText(hit.content)}`;
    const matchesModificationTopic = includesAnyTerm(hitText, ['equipment', 'modification', 'technology', 'home modification']);
    const matchesReviewSignal = includesAnyTerm(hitText, ['multidisciplinary', 'mdt']);
    if (matchesModificationTopic && matchesReviewSignal) {
      adjustedScore += MODIFICATION_REVIEW_CLUSTER_BOOST;
    } else if (matchesModificationTopic && hit.policyNumber && exactPolicyNumbers.includes(hit.policyNumber.toUpperCase())) {
      adjustedScore += MODIFICATION_TOPIC_BOOST;
    }
  }

  if (isBoilerplateTitle(hit.sectionTitle) && titleMatches === 0 && documentMatches === 0) {
    adjustedScore -= BOILERPLATE_TITLE_PENALTY;
  }

  if (isAttachmentTitle(hit.sectionTitle) && !flags.queryIncludesAttachment) {
    adjustedScore -= ATTACHMENT_TITLE_PENALTY;
  }

  if (isGenericSectionTitle(hit.sectionTitle)) {
    adjustedScore -= GENERIC_SECTION_TITLE_PENALTY;
  }

  if (flags.yesNoCoverageQuery && isCoverageProcessTitle(hit.sectionTitle)) {
    adjustedScore -= COVERAGE_PROCESS_SECTION_PENALTY;
  }

  if (isPediatricPolicyHit(hit)) {
    adjustedScore += flags.pediatricQuery ? 0.12 : -0.12;
  }

  const documentKey = documentKeyForHit(hit);
  if (documentKey) {
    adjustedScore += documentCoverageBoosts.get(documentKey) ?? 0;
  }

  return {
    ...hit,
    score: adjustedScore,
  };
}
