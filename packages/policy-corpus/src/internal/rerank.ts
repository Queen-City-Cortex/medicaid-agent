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
    includesPhrase(queryLower, ['home modification', 'home modifications', 'equipment', 'technology', 'modification']) &&
    includesPhrase(queryLower, ['multidisciplinary team', 'mdt'])
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

/**
 * Per-hit values derived once from the hit + query context, then shared across
 * the individual scorers below (several need the same term-match counts and
 * normalized text, so computing them once avoids redundant work per scorer).
 */
interface RerankHitFeatures {
  titleMatches: number;
  documentMatches: number;
  contentMatches: number;
  hitChangeMarkerValue: number | null;
  sectionText: string;
  requestedYearMatch: boolean;
  procedureCodeMatches: number;
  retrievalText: string;
  sectionNumber: string;
}

function deriveHitFeatures(hit: CorpusRetrievalHit, context: RerankQueryContext): RerankHitFeatures {
  const { queryTerms, procedureCodes, requestedYears } = context;
  return {
    titleMatches: scoreTermMatches(queryTerms, hit.sectionTitle),
    documentMatches: scoreTermMatches(queryTerms, hit.documentTitle),
    contentMatches: Math.min(scoreTermMatches(queryTerms, hit.content), 6),
    hitChangeMarkerValue: changeMarkerValueForHit(hit),
    sectionText: combineText(hit.sectionTitle, hit.content),
    requestedYearMatch: variantDateMatchesRequestedYear(hit.variantDate, requestedYears),
    procedureCodeMatches: countProcedureCodeMatches(
      combineText(hit.sectionTitle, hit.documentTitle, hit.content),
      procedureCodes,
    ),
    retrievalText: combineText(hit.sectionNumber, hit.sectionTitle, hit.documentTitle, hit.policyNumber, hit.content),
    sectionNumber: normalizeSearchText(hit.sectionNumber),
  };
}

/**
 * A single scoring concern. Takes the running score and returns it adjusted by
 * this concern's boosts/penalties for the hit. Each scorer owns one cohesive
 * heuristic and is independently readable/testable. Scorers fold the score in
 * the original statement order so the accumulated floating-point result is
 * bit-identical to the pre-refactor monolith (see tests/retrieval-ranking).
 */
type HitScorer = (
  score: number,
  hit: CorpusRetrievalHit,
  context: RerankQueryContext,
  features: RerankHitFeatures,
) => number;

const scoreTermMatchBoosts: HitScorer = (score, _hit, _context, f) => {
  score += f.titleMatches * TITLE_TERM_MATCH_BOOST;
  score += f.documentMatches * DOCUMENT_TERM_MATCH_BOOST;
  score += f.contentMatches * CONTENT_TERM_MATCH_BOOST;
  return score;
};

const scorePolicyNumberMatches: HitScorer = (score, hit, context) => {
  if (queryMentionsPolicyNumber(context.queryLower, hit.policyNumber)) {
    score += POLICY_NUMBER_MATCH_BOOST;
  }
  if (hit.policyNumber && context.exactPolicyNumbers.includes(hit.policyNumber.toUpperCase())) {
    score += EXACT_POLICY_NUMBER_BOOST;
  }
  return score;
};

const scoreFederalAuthority: HitScorer = (score, hit, context) => {
  if (!context.flags.federalAuthorityQuery) {
    return score;
  }
  return hit.documentType && FEDERAL_DOCUMENT_TYPES.has(hit.documentType)
    ? score + FEDERAL_AUTHORITY_BOOST
    : score - NON_FEDERAL_AUTHORITY_PENALTY;
};

const scoreManagedCareContractContext: HitScorer = (score, hit, context) => {
  if (!context.flags.managedCareContractQuery || context.flags.federalAuthorityQuery) {
    return score;
  }
  if (hit.answerRole === 'managed_care_contract') {
    return score + CONTRACT_GOVERNING_SOURCE_BOOST;
  }
  if (hit.documentType && FEDERAL_DOCUMENT_TYPES.has(hit.documentType)) {
    return score - CONTRACT_FEDERAL_CONTEXT_PENALTY;
  }
  return score;
};

const scoreReadinessPenalties: HitScorer = (score, hit) => {
  if (hit.answerReady === false) {
    score -= ANSWER_READY_PENALTY;
  }
  if (hit.retrievalReady === false) {
    score -= RETRIEVAL_READY_PENALTY;
  }
  return score;
};

const scoreCoverageAuthorityTier: HitScorer = (score, hit, context) => {
  const { flags } = context;
  if (!flags.coverageQuestion || flags.operationalRoutingQuery || flags.federalAuthorityQuery || flags.changeNoticeQuery) {
    return score;
  }
  if (hit.authorityTier === 'authoritative') {
    return score + AUTHORITATIVE_POLICY_BOOST;
  }
  return hit.authorityTier ? score - NON_AUTHORITATIVE_POLICY_PENALTY : score;
};

const scoreOperationalAlignment: HitScorer = (score, hit, context) => {
  const { flags } = context;
  const operationalHit = isOperationalSourceHit(hit);
  if (!operationalHit) {
    return score;
  }
  if (!flags.operationalRoutingQuery) {
    return score - OFF_TOPIC_OPERATIONAL_PENALTY;
  }

  const reimbursementMatch = flags.reimbursementQuery && hit.answerRole === 'reimbursement';
  const billingMatch = flags.billingWorkflowQuery && hit.answerRole === 'billing';
  const managedCareMatch =
    flags.managedCareOperationsQuery &&
    (flags.managedCareContractQuery
      ? hit.answerRole === 'managed_care_contract'
      : hit.answerRole === 'managed_care' || hit.answerRole === 'managed_care_contract');

  if (reimbursementMatch || billingMatch || managedCareMatch) {
    score += OPERATIONAL_ROLE_BOOST;
  } else {
    score -= OPERATIONAL_ROLE_MISMATCH_PENALTY;
  }

  if (flags.managedCareContractQuery) {
    if (hit.answerRole === 'managed_care_contract') {
      score += CONTRACT_ROLE_BOOST;
    } else if (hit.answerRole === 'managed_care') {
      score -= CONTRACT_ROLE_MISMATCH_PENALTY;
    }
  }
  return score;
};

const scoreReimbursementCodes: HitScorer = (score, hit, context, f) => {
  if (!(context.flags.reimbursementQuery && context.procedureCodes.length > 0 && f.procedureCodeMatches > 0)) {
    return score;
  }
  score += f.procedureCodeMatches * EXACT_REIMBURSEMENT_CODE_BOOST;
  if (hit.answerRole === 'reimbursement') {
    score += REIMBURSEMENT_CODE_ROLE_BOOST;
  } else {
    score -= NON_REIMBURSEMENT_CODE_MATCH_PENALTY;
  }
  return score;
};

const scoreFeeScheduleBuckets: HitScorer = (score, hit, context, f) => {
  if (!(hit.documentType === 'fee_schedule' && context.flags.reimbursementQuery)) {
    return score;
  }
  if (hit.corpusBucket === 'primary') {
    score += PRIMARY_FEE_SCHEDULE_BOOST;
  } else if (hit.corpusBucket === 'history') {
    score += context.flags.historicalReimbursementQuery || f.requestedYearMatch
      ? HISTORY_FEE_SCHEDULE_BOOST
      : -HISTORY_FEE_SCHEDULE_PENALTY;
  } else if (hit.corpusBucket === 'archive') {
    score += f.requestedYearMatch ? HISTORY_FEE_SCHEDULE_BOOST : -ARCHIVE_FEE_SCHEDULE_PENALTY;
  } else if (hit.corpusBucket === 'companion' || hit.corpusBucket === 'reference') {
    score -= COMPANION_FEE_SCHEDULE_PENALTY;
  }

  if (hit.sourceFormat === 'xlsx') {
    score += SPREADSHEET_FEE_SCHEDULE_BOOST;
  }
  if (f.requestedYearMatch) {
    score += REQUESTED_YEAR_MATCH_BOOST;
  }
  return score;
};

const scoreChangeNoticeTitle: HitScorer = (score, hit, context) =>
  context.flags.changeNoticeQuery && normalizeSearchText(hit.documentTitle).includes('change notice')
    ? score + CHANGE_NOTICE_BOOST
    : score;

const scoreWaiverApplication: HitScorer = (score, hit, context, f) => {
  if (!context.flags.waiverApplicationQuery) {
    return score;
  }
  if (
    hit.policyNumber?.toUpperCase() === '42-CFR-441' ||
    normalizeSearchText(hit.documentTitle).includes('42 cfr part 441')
  ) {
    score += 0.34;
  } else if (normalizeSearchText(hit.documentTitle).includes('42 cfr part 440')) {
    score += 0.12;
  }

  if (f.sectionNumber === '1915') {
    score += 0.4;
  }
  if (WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS.has(f.sectionNumber)) {
    score += 0.45;
  }
  if (includesPhrase(f.retrievalText, WAIVER_APPLICATION_PRIMARY_TERMS)) {
    score += 0.18;
  }
  if (includesPhrase(f.retrievalText, ['1915(b)', '1915(b) waiver']) && !context.flags.queryMentions1915b) {
    score -= 0.45;
  }
  if (
    includesPhrase(f.retrievalText, WAIVER_APPLICATION_AVOID_TERMS) ||
    (!context.flags.publicNoticeQuery && f.sectionNumber === '431.408')
  ) {
    score -= 0.55;
  }
  return score;
};

const scoreCoverageExclusion: HitScorer = (score, hit, context) =>
  context.flags.queryIncludesCover && normalizeSearchText(hit.content).includes('not covered')
    ? score + COVERAGE_EXCLUSION_BOOST
    : score;

const scoreRequirementDetail: HitScorer = (score, hit, context, f) => {
  if (!context.flags.requirementDetailQuery) {
    return score;
  }
  const requirementEvidenceScore = Math.min(scorePhraseMatches(f.sectionText, REQUIREMENT_EVIDENCE_TERMS, 1), 4);
  score += requirementEvidenceScore * 0.05;
  if (!hit.sectionNumber && requirementEvidenceScore === 0) {
    score -= 0.08;
  }
  return score;
};

const scoreChangeNoticeSection: HitScorer = (score, hit, context) => {
  if (!context.flags.changeNoticeQuery) {
    return score;
  }
  if (normalizeSearchText(hit.sectionTitle).includes('implementation')) {
    score += IMPLEMENTATION_SECTION_BOOST;
  }
  if (isRevisionHeaderTitle(hit.sectionTitle)) {
    score += REVISION_HEADER_BOOST;
  }
  return score;
};

const scoreHcwdIncomePremium: HitScorer = (score, hit, context, f) => {
  if (!context.flags.hcwdIncomePremiumQuery) {
    return score;
  }
  if (includesPhrase(f.retrievalText, HCWD_INCOME_RULE_TERMS)) {
    score += 0.32;
  }
  if (normalizeSearchText(hit.documentTitle).includes('change notice')) {
    score += 0.12;
  }
  if (
    (isYearSpecificPremiumTitle(hit.sectionTitle) || isYearSpecificPremiumTitle(hit.documentTitle)) &&
    !context.flags.queryIncludesCalendarYear &&
    !context.flags.queryIncludesChart
  ) {
    score -= 0.45;
  }
  if (isAdministrativeFormTitle(hit.sectionTitle) || isAdministrativeFormTitle(hit.documentTitle)) {
    score -= 0.35;
  }
  if (
    (isHcwdProcessTitle(hit.sectionTitle) || isHcwdProcessTitle(hit.documentTitle)) &&
    !context.flags.queryIncludesProcedure &&
    !context.flags.queryIncludesPayment
  ) {
    score -= 0.2;
  }
  return score;
};

const scoreLatestChangeMarker: HitScorer = (score, hit, context, f) => {
  const { flags, latestChangeMarkerValue } = context;
  if (!flags.latestChangeNoticeQuery) {
    return score;
  }
  if (
    latestChangeMarkerValue !== null &&
    f.hitChangeMarkerValue !== null &&
    f.hitChangeMarkerValue === latestChangeMarkerValue
  ) {
    return score + LATEST_CHANGE_MARKER_BOOST;
  }
  if (
    f.hitChangeMarkerValue === null &&
    normalizeSearchText(hit.sectionTitle).includes('effective') &&
    !normalizeSearchText(hit.documentTitle).includes('change notice')
  ) {
    return score - LATEST_CHANGE_QUERY_EFFECTIVE_SECTION_PENALTY;
  }
  return score;
};

const scoreModificationReview: HitScorer = (score, hit, context) => {
  if (!context.flags.modificationReviewQuery) {
    return score;
  }
  const hitText = `${normalizeSearchText(hit.sectionTitle)} ${normalizeSearchText(hit.content)}`;
  const matchesModificationTopic = includesPhrase(hitText, ['equipment', 'modification', 'technology', 'home modification']);
  const matchesReviewSignal = includesPhrase(hitText, ['multidisciplinary', 'mdt']);
  if (matchesModificationTopic && matchesReviewSignal) {
    return score + MODIFICATION_REVIEW_CLUSTER_BOOST;
  }
  if (matchesModificationTopic && hit.policyNumber && context.exactPolicyNumbers.includes(hit.policyNumber.toUpperCase())) {
    return score + MODIFICATION_TOPIC_BOOST;
  }
  return score;
};

const scoreTitleQualityPenalties: HitScorer = (score, hit, context, f) => {
  if (isBoilerplateTitle(hit.sectionTitle) && f.titleMatches === 0 && f.documentMatches === 0) {
    score -= BOILERPLATE_TITLE_PENALTY;
  }
  if (isAttachmentTitle(hit.sectionTitle) && !context.flags.queryIncludesAttachment) {
    score -= ATTACHMENT_TITLE_PENALTY;
  }
  if (isGenericSectionTitle(hit.sectionTitle)) {
    score -= GENERIC_SECTION_TITLE_PENALTY;
  }
  if (context.flags.yesNoCoverageQuery && isCoverageProcessTitle(hit.sectionTitle)) {
    score -= COVERAGE_PROCESS_SECTION_PENALTY;
  }
  return score;
};

const scorePediatricAlignment: HitScorer = (score, hit, context) => {
  if (!isPediatricPolicyHit(hit)) {
    return score;
  }
  return score + (context.flags.pediatricQuery ? 0.12 : -0.12);
};

const scoreDocumentCoverageBoost: HitScorer = (score, hit, context) => {
  const documentKey = documentKeyForHit(hit);
  return documentKey ? score + (context.documentCoverageBoosts.get(documentKey) ?? 0) : score;
};

/**
 * Ordered list of scoring concerns applied on top of the backend score. Order
 * is preserved from the original monolithic implementation; deltas are summed,
 * so adding/removing a concern is a localized change. See the pinned scores in
 * tests/retrieval-ranking.test.ts.
 */
const HIT_SCORERS: readonly HitScorer[] = [
  scoreTermMatchBoosts,
  scorePolicyNumberMatches,
  scoreFederalAuthority,
  scoreManagedCareContractContext,
  scoreReadinessPenalties,
  scoreCoverageAuthorityTier,
  scoreOperationalAlignment,
  scoreReimbursementCodes,
  scoreFeeScheduleBuckets,
  scoreChangeNoticeTitle,
  scoreWaiverApplication,
  scoreCoverageExclusion,
  scoreRequirementDetail,
  scoreChangeNoticeSection,
  scoreHcwdIncomePremium,
  scoreLatestChangeMarker,
  scoreModificationReview,
  scoreTitleQualityPenalties,
  scorePediatricAlignment,
  scoreDocumentCoverageBoost,
];

export function rerankRetrievalHit(hit: CorpusRetrievalHit, context: RerankQueryContext): CorpusRetrievalHit {
  const features = deriveHitFeatures(hit, context);
  let adjustedScore = hit.score;
  for (const scorer of HIT_SCORERS) {
    adjustedScore = scorer(adjustedScore, hit, context, features);
  }
  return {
    ...hit,
    score: adjustedScore,
  };
}
