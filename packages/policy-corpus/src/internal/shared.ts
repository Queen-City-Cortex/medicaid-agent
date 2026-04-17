import {
  type AnswerFrame,
  type AnswerFrameDocument,
  type AnswerFrameRoute,
  type AnswerFrameSection,
  type AnswerQuestionType,
  ALLOWED_CONCEPT_RELATIONSHIPS,
  type AmendmentsView,
  type ConceptSectionView,
  type CorpusRetrievalHit,
  type DocumentSectionView,
  type DocumentView,
  type DocumentWithSectionsView,
  type FindConceptSectionsInput,
  type PolicyCorpus,
  type PolicyCorpusDependencies,
  type ReferenceView,
  type ResolveAnswerFrameInput,
  type SearchHit,
  type SearchSectionsInput,
  type SectionContextEntry,
  type SectionContextView,
  type SectionView,
  type SessionRecordLike,
} from '../types.js';
import { documentMetadataReturn, mapDocumentMetadataRecord } from '../document-metadata.js';
import {
  combineText,
  includesPhrase,
  normalizeSearchText,
  normalizeTitleKey,
  scorePhraseMatches,
  uniqueBy,
} from './base.js';
import { buildAnswerRoute } from './answer-routing.js';
import {
  extractAliasedPolicyNumbers,
  extractExplicitPolicyNumbers,
  extractRequestedYears,
  includesAnyTerm,
  isBillingWorkflowQuery,
  isCoverageQuestion,
  isChangeNoticeQuery,
  isFederalAuthorityQuery,
  isHistoricalReimbursementQuery,
  isHcwdQuery,
  isHcwdIncomePremiumQuery,
  isLatestChangeNoticeQuery,
  isManagedCareContractQuery,
  isManagedCareOperationsQuery,
  isMlrQuery,
  isOperationalRoutingQuery,
  isPediatricQuery,
  isReimbursementQuery,
  isRequirementDetailQuery,
  isWaiverApplicationQuery,
  isYesNoCoverageQuery,
  asksForPublicNoticeDetails,
  queryMentionsPolicyNumber,
  variantDateMatchesRequestedYear,
} from './query-intent.js';
import {
  buildFocusedFederalQuery,
  buildQueryFocusTerms,
  countPhraseMatches,
  countProcedureCodeMatches,
  dedupeTerms,
  extractProcedureCodeTerms,
  extractQuotedPhrases,
  extractSearchTerms,
  extractServiceFocusTerms,
  isUsefulSearchTerm,
  scoreTermMatches,
} from './search.js';

export * from './base.js';
export * from './answer-routing.js';
export * from './query-intent.js';
export * from './search.js';

export const SEARCH_SNIPPET_CHARS = 300;
export const CONCEPT_MATCH_SCORE = 0.7;
export const FULLTEXT_BOOST = 0.05;
export const BASE_TYPE_GROUPS = [
  ['clinical_policy'],
  ['dhhs_policy'],
  ['federal_regulation'],
  ['federal_statute'],
  ['bulletin', 'state_plan_amendment', 'waiver', 'provider_manual'],
];
export const OPERATIONAL_TYPE_GROUPS = [
  ['fee_schedule'],
  ['billing_guidance'],
  ['managed_care_guidance', 'managed_care_contract'],
];
export const MAX_CONTENT_CHARS = 6000;
export const MAX_COMBINED_CHARS = 6000;
export const MAX_PER_GROUP_K = 100;
export const MIN_DEFAULT_PER_GROUP_K = 25;
export const MIN_EXPLICIT_PER_GROUP_K = 15;
export const DEFAULT_PER_GROUP_MULTIPLIER = 4;
export const EXPLICIT_PER_GROUP_MULTIPLIER = 3;
export const TITLE_TERM_MATCH_BOOST = 0.03;
export const DOCUMENT_TERM_MATCH_BOOST = 0.02;
export const CONTENT_TERM_MATCH_BOOST = 0.005;
export const POLICY_NUMBER_MATCH_BOOST = 0.12;
export const FEDERAL_AUTHORITY_BOOST = 0.08;
export const NON_FEDERAL_AUTHORITY_PENALTY = 0.08;
export const CHANGE_NOTICE_BOOST = 0.08;
export const BOILERPLATE_TITLE_PENALTY = 0.18;
export const DOCUMENT_KEYWORD_BASE_SCORE = 0.45;
export const DOCUMENT_KEYWORD_DOC_WEIGHT = 0.03;
export const DOCUMENT_KEYWORD_SECTION_WEIGHT = 0.015;
export const DOCUMENT_KEYWORD_DOC_LIMIT = 6;
export const SECTION_KEYWORD_BASE_SCORE = 0.35;
export const SECTION_KEYWORD_WEIGHT = 0.015;
export const AMENDMENT_CONTEXT_BASE_SCORE = 0.82;
export const AMENDMENT_CONTEXT_DOC_WEIGHT = 0.03;
export const AMENDMENT_CONTEXT_SECTION_WEIGHT = 0.04;
export const AMENDMENT_CONTEXT_DOC_LIMIT = 5;
export const POLICY_SCOPED_BASE_SCORE = 0.55;
export const POLICY_SCOPED_SECTION_WEIGHT = 0.02;
export const EXACT_POLICY_NUMBER_BOOST = 0.2;
export const DOCUMENT_COVERAGE_TERM_BOOST = 0.01;
export const DOCUMENT_COVERAGE_HIT_BOOST = 0.02;
export const MAX_DOCUMENT_COVERAGE_BOOST = 0.16;
export const DOCUMENT_EXPANSION_BASE_SCORE = 0.58;
export const DOCUMENT_EXPANSION_SECTION_WEIGHT = 0.02;
export const DOCUMENT_EXPANSION_DOC_LIMIT = 8;
export const CHANGE_NOTICE_HEADER_BASE_SCORE = 1.04;
export const CHANGE_NOTICE_HEADER_SECTION_WEIGHT = 0.06;
export const ATTACHMENT_TITLE_PENALTY = 0.12;
export const GENERIC_SECTION_TITLE_PENALTY = 0.14;
export const COVERAGE_EXCLUSION_BOOST = 0.08;
export const IMPLEMENTATION_SECTION_BOOST = 0.1;
export const REVISION_HEADER_BOOST = 0.12;
export const LATEST_CHANGE_MARKER_BOOST = 0.22;
export const LATEST_CHANGE_QUERY_EFFECTIVE_SECTION_PENALTY = 0.18;
export const MODIFICATION_REVIEW_CLUSTER_BOOST = 0.18;
export const MODIFICATION_TOPIC_BOOST = 0.06;
export const ANSWER_READY_PENALTY = 0.18;
export const NON_AUTHORITATIVE_POLICY_PENALTY = 0.1;
export const AUTHORITATIVE_POLICY_BOOST = 0.04;
export const OFF_TOPIC_OPERATIONAL_PENALTY = 0.12;
export const OPERATIONAL_ROLE_BOOST = 0.12;
export const OPERATIONAL_ROLE_MISMATCH_PENALTY = 0.08;
export const CONTRACT_ROLE_BOOST = 0.14;
export const CONTRACT_ROLE_MISMATCH_PENALTY = 0.14;
export const CONTRACT_GOVERNING_SOURCE_BOOST = 0.08;
export const CONTRACT_FEDERAL_CONTEXT_PENALTY = 0.18;
export const EXACT_REIMBURSEMENT_CODE_BOOST = 0.45;
export const REIMBURSEMENT_CODE_ROLE_BOOST = 0.08;
export const NON_REIMBURSEMENT_CODE_MATCH_PENALTY = 0.16;
export const RETRIEVAL_READY_PENALTY = 0.18;
export const PRIMARY_FEE_SCHEDULE_BOOST = 0.12;
export const HISTORY_FEE_SCHEDULE_BOOST = 0.08;
export const HISTORY_FEE_SCHEDULE_PENALTY = 0.08;
export const ARCHIVE_FEE_SCHEDULE_PENALTY = 0.18;
export const COMPANION_FEE_SCHEDULE_PENALTY = 0.16;
export const SPREADSHEET_FEE_SCHEDULE_BOOST = 0.04;
export const REQUESTED_YEAR_MATCH_BOOST = 0.18;
export const COVERAGE_PROCESS_SECTION_PENALTY = 0.18;
export const FEDERAL_DOCUMENT_TYPES = new Set(['federal_regulation', 'federal_statute']);
export const POLICY_ROUTING_DOCUMENT_TYPES = new Set(['clinical_policy', 'dhhs_policy', 'provider_manual', 'waiver']);
export const FRAME_PRIMARY_LIMIT = 4;
export const FRAME_SUPPORT_LIMIT = 4;
export const FRAME_AVOID_LIMIT = 3;
export const FRAME_DOCUMENT_LIMIT = 3;
export const DOCUMENT_SECTION_PICK_LIMIT = 2;
export const BOILERPLATE_SECTION_TITLES = new Set([
  'history',
  'revision information',
  'table of contents',
  'background',
  'introduction',
]);
export const SCOPE_SECTION_TERMS = ['scope', 'general', 'introduction', 'purpose', 'policy', 'service criteria'];
export const COVERAGE_PRIMARY_TERMS = [
  'cover',
  'covered',
  'coverage',
  'scope',
  'general',
  'eligibility',
  'criteria',
  'medical necessity',
  'telehealth',
  'epsdt',
];
export const COVERAGE_SUPPORT_TERMS = [
  'not covered',
  'limitation',
  'limitations',
  'exclusion',
  'documentation',
  'order',
  'ordering practitioner',
  'practitioner',
  'provider',
  'plan of care',
  'mdt',
  'prior approval',
];
export const COVERAGE_AVOID_TERMS = ['history', 'revision information', 'table of contents', 'background'];
export const REQUIREMENT_EVIDENCE_TERMS = [
  'must',
  'shall',
  'required',
  'recommendation',
  'documented',
  'training',
  'signed',
  'statement of need',
  'physician order',
  'cost of',
];
export const GENERAL_CRITERIA_SECTION_TERMS = [
  'general',
  'eligibility',
  'general criteria',
  'specific criteria covered',
  'criteria covered by medicaid',
  'services covered by medicaid',
];
export const COVERAGE_SCOPE_SECTION_TERMS = [
  'scope',
  'description',
  '2.1.1',
  '1.0',
  'general provisions',
  'description of the procedure, product, or service',
];
export const ELIGIBILITY_BASELINE_SECTION_TERMS = ['2.1.1', 'general provisions'];
export const ELIGIBILITY_SCOPE_SECTION_TERMS = ['1.0', 'description of the procedure, product, or service'];
export const COVERAGE_DETAIL_SECTION_TERMS = [
  'services covered by medicaid',
  'specific criteria covered',
  'personal care services',
  'home health services',
  'coverage criteria',
];
export const PEDIATRIC_COVERAGE_SECTION_TERMS = [
  'epsdt',
  'under 21 years of age',
  'speech-language therapy',
  'speech -language therapy',
  'audiology therapy',
  'aural rehabilitation',
];
export const MODIFICATION_SECTION_TERMS = [
  'equipment, modification and technology',
  'equipment modification and technology',
  'equipment, modification, technology and supplies',
  'home modification',
  'modification and technology',
];
export const CONGREGATE_PCS_SUPPORT_SECTION_TERMS = [
  'personal care services',
  'room and board',
  'services not covered',
  'non-covered services',
];
export const CONGREGATE_PCS_CRITERIA_SECTION_TERMS = [
  '3.2.1',
  'specific criteria covered by medicaid',
];
export const CONGREGATE_PCS_COVERED_SERVICE_SECTION_TERMS = [
  '3.3',
  'personal care services',
];
export const CONGREGATE_PCS_NOT_COVERED_SECTION_TERMS = [
  '4.2.1.2',
  'room and board',
];
export const COVERAGE_WORKFLOW_AVOID_TERMS = [
  'assessment',
  'admission',
  'expedited',
  'reconsideration',
  'request',
  'appeal',
  'submission',
  'authorization process',
];
export const TELEHEALTH_PRIMARY_SECTION_TERMS = [
  'telehealth',
  'virtual communications',
  'remote patient monitoring',
];
export const TELEHEALTH_SUPPORT_SECTION_TERMS = [
  'speech/language evaluation',
  'speech/language treatment',
  'telehealth eligible service',
  'speech-language therapy',
  'speech -language therapy',
  'audiology therapy',
];
export const TELEHEALTH_DOCUMENTATION_TERMS = [
  'documented',
  'documented findings',
  'documentation',
  'beneficiary need',
  'plan of care',
  'appropriate',
];
export const TELEHEALTH_AVOID_TERMS = ['related clinical coverage policies'];
export const CERTIFICATION_SECTION_TERMS = [
  'sources of certification',
  'source of certification',
  'timing of certification',
  'certification and recertification of terminal illness',
  'certification',
  'recertification',
  'terminal illness',
];
export const HCWD_PRIMARY_SECTION_TERMS = [
  'income',
  'premium',
  'premiums',
  'enrollment fee',
  'income ranges and premium amounts',
];
export const HCWD_LIMIT_HISTORY_TERMS = [
  'remove the 150% fpl income limit',
  'only income limit for the hcwd program is the 150% fpl limit on unearned income',
  'regardless of total countable income',
  'remove limits on countable income except for the 150% of federal poverty level',
  'sliding scale premiums',
];
export const NOT_COVERED_SECTION_TERMS = [
  'not covered',
  'criteria not covered',
  'specific criteria not covered',
  'services not covered',
  'non-covered',
];
export const YES_NO_COVERAGE_SECTION_TERMS = [
  ...GENERAL_CRITERIA_SECTION_TERMS,
  ...NOT_COVERED_SECTION_TERMS,
  'scope',
  'description',
  'general provisions',
];
export const PRIOR_AUTH_PRIMARY_TERMS = [
  'prior approval',
  'prior authorization',
  'criteria',
  'prior approval drugs and criteria',
  'drug criteria',
  'medical necessity',
  'coverage criteria',
];
export const PRIOR_AUTH_QUANTITY_TERMS = [
  'quantity and episodic drugs',
  'quantity limit',
  'quantity limits',
  'quantity limitation',
  'quantity limitations',
  'episodic drug',
  'episodic drugs',
  'maximum supply',
];
export const PRIOR_AUTH_CRITERIA_SECTION_TERMS = [
  'pharmacy prior approval drugs and criteria',
  'prior approval drugs and criteria',
  'pharmacy prior approval criteria',
  'attachment k',
];
export const PRIOR_AUTH_SUPPORT_TERMS = ['coverage', 'eligible', 'medical necessity', 'documentation', 'order'];
export const PRIOR_AUTH_DOCUMENT_SECTION_TERMS = [
  ...PRIOR_AUTH_PRIMARY_TERMS,
  'pharmacy prior approval drugs and criteria',
  'quantity and episodic drugs',
  'attachment k',
];
export const PRIOR_AUTH_PROCESS_SECTION_TERMS = [
  'requesting prior authorization',
  'prior authorization process',
  'retroactive prior authorization',
  'web portal',
  'fax',
  'phone',
  'call center',
];
export const PRIOR_AUTH_EXCEPTION_SECTION_TERMS = [
  'exceptions to fda and nc medicaid drug criteria approval',
  'requested drug',
  'peer-reviewed medical literature',
];
export const PRIOR_AUTH_AVOID_TERMS = [
  'request',
  'submit',
  'submission',
  'fax',
  'phone',
  'contact',
  'denial',
  'message',
  'billing',
  'point of sale',
  'point-of-sale',
];
export const AMENDMENT_PRIMARY_TERMS = ['change no', 'revised', 'effective date', 'implementation', 'content of change'];
export const AMENDMENT_SUPPORT_TERMS = ['change notice', 'revision', 'policy update', 'summary'];
export const FEDERAL_PRIMARY_TERMS = [
  '42 cfr',
  'social security act',
  'section 1902',
  'section 1905',
  'must',
  'defined',
  'definition',
  'includes',
];
export const FEDERAL_SUPPORT_TERMS = ['state plan', 'php', 'contract', 'reporting', 'oversight', 'implementation'];
export const FEDERAL_DOCUMENT_SUPPORT_TERMS = [
  ...FEDERAL_SUPPORT_TERMS,
  'annual report',
  'enforcement',
  'minimum mlr',
  'medical loss ratio',
  'numerator',
  'denominator',
  'remittance',
  'report',
  'summary',
];
export const WAIVER_APPLICATION_PRIMARY_TERMS = [
  '1915(c)',
  'request for a waiver',
  'contents of request for a waiver',
  'supporting documentation',
  'supporting documentation required',
  'level of care',
  'target group',
  'service to be furnished',
  'service definitions',
  'person-centered service plan',
  'geographic area',
  'number of individuals',
  'would otherwise require',
];
export const WAIVER_APPLICATION_DOCUMENT_SECTION_TERMS = [
  'basis and scope',
  'contents of request for a waiver',
  'supporting documentation required',
  'request for a waiver',
  '1915(c)',
];
export const WAIVER_APPLICATION_AVOID_TERMS = [
  'public notice',
  'comment period',
  'public hearings',
  'disallowance',
  'erroneous state payments',
  'perm review',
];
export const WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS = new Set([
  '440.180',
  '441.300',
  '441.301',
  '441.302',
  '441.303',
  '441.350',
  '441.351',
  '441.352',
  '441.353',
  '441.354',
  '441.355',
]);
export const MLR_FEDERAL_PRIMARY_SECTION_TERMS = [
  'medical loss ratio',
  'mlr',
  'minimum mlr',
  'calculate and report',
  'numerator',
  'denominator',
];
export const MLR_FEDERAL_SUPPORT_SECTION_TERMS = [
  ...MLR_FEDERAL_PRIMARY_SECTION_TERMS,
  'reports',
  'report',
  'remittance',
  'numerator',
  'denominator',
  'credibility adjustment',
  'credibility adjusted',
  'aggregation',
  'quality improvement',
  'activities that improve health care quality',
  'incurred claims',
];
export const MLR_IMPLEMENTATION_SUPPORT_TERMS = [
  'medical loss ratio',
  'mlr',
  'minimum mlr',
  'contractual minimum mlr',
  'minimum mlr threshold',
  'minimum threshold',
  'calculate and report',
  'attest',
  'rebate',
  'remittance',
  'rate development',
  'reporting',
];
export const PEDIATRIC_POLICY_TERMS = ['under 21', 'child', 'children', 'pediatric', 'pediatrics'];
export const TITLE_CLUSTER_STOPWORDS = new Set([
  'adult',
  'adults',
  'cap',
  'beneficiary',
  'beneficiaries',
  'community',
  'coverage',
  'disabled',
  'person',
  'plan',
  'program',
  'provider',
  'requirement',
  'requirements',
  'service',
  'services',
  'supplies',
  'waiver',
]);
export const VARIANT_SETTING_TERMS: Array<{ terms: string[]; titleTerms: string[]; reason: string }> = [
  {
    terms: ['congregate', 'adult care home', 'group home', 'ach', 'assisted living', 'assisted living facility'],
    titleTerms: ['congregate', 'adult care home', 'group home'],
    reason: 'Preferred because the query asks about a congregate or facility-based setting.',
  },
  {
    terms: ['in-home', 'in home', 'home-based', 'home setting', 'at home'],
    titleTerms: ['state plan pcs', 'in-home', 'in home'],
    reason: 'Preferred because the query asks about in-home services.',
  },
];

export interface SectionCandidate {
  sectionId: string;
  score: number;
  reason: string;
}

export interface HydratedSectionCandidate {
  section: AnswerFrameSection;
  score: number;
}

export interface DocumentCandidate {
  document: DocumentView;
  reason: string;
  score: number;
}

export function toAnswerFrameDocument(document: DocumentView, reason: string | null): AnswerFrameDocument {
  return {
    ...document,
    reason,
  };
}

export function toAnswerFrameSection(section: SectionView, reason: string | null): AnswerFrameSection {
  return {
    ...section,
    reason,
  };
}
export function isPediatricPolicyHit(hit: CorpusRetrievalHit): boolean {
  return includesPhrase(buildHitText(hit), PEDIATRIC_POLICY_TERMS);
}

export function isTitleOnlySection(section: Pick<AnswerFrameSection, 'content'>): boolean {
  return (section.content?.trim().length ?? 0) === 0;
}

export function isPriorAuthQuantitySection(section: AnswerFrameSection): boolean {
  const text = combineText(section.sectionNumber, section.title, section.content);
  return normalizeSearchText(section.sectionNumber) === '5.4.3' || includesPhrase(text, PRIOR_AUTH_QUANTITY_TERMS);
}

export function isPriorAuthCriteriaSection(section: AnswerFrameSection): boolean {
  return includesPhrase(combineText(section.sectionNumber, section.title, section.content), PRIOR_AUTH_CRITERIA_SECTION_TERMS);
}

export function isPriorAuthProcessSection(section: AnswerFrameSection): boolean {
  return includesPhrase(combineText(section.sectionNumber, section.title, section.content), PRIOR_AUTH_PROCESS_SECTION_TERMS);
}

export function isPriorAuthExceptionSection(section: AnswerFrameSection): boolean {
  return normalizeSearchText(section.sectionNumber) === '3.2.3'
    || includesPhrase(combineText(section.sectionNumber, section.title, section.content), PRIOR_AUTH_EXCEPTION_SECTION_TERMS);
}

export function extractTitleClusterTerms(title: string | null | undefined): string[] {
  const tokens = normalizeSearchText(title).match(/[a-z0-9]+/g) ?? [];
  return dedupeTerms(
    tokens.filter((token) => token.length >= 4 && !TITLE_CLUSTER_STOPWORDS.has(token)),
  );
}

export function isCoverageLimitationText(text: string): boolean {
  return includesPhrase(text, ['not covered', 'limitation', 'limitations', 'exclusion']);
}

export function isCoverageBoilerplateTitle(title: string | null | undefined): boolean {
  const normalized = normalizeSearchText(title);
  return (
    isBoilerplateTitle(title ?? null) ||
    normalized.startsWith('i understand') ||
    normalized.startsWith('i agree') ||
    normalized.startsWith('revision information')
  );
}

export function isBoilerplateTitle(title: string | null): boolean {
  return BOILERPLATE_SECTION_TITLES.has(normalizeTitleKey(title));
}

export function isAttachmentTitle(title: string | null): boolean {
  return normalizeTitleKey(title).startsWith('attachment ');
}

export function isGenericSectionTitle(title: string | null): boolean {
  const normalized = normalizeTitleKey(title);
  return normalized === 'related clinical coverage policies' || normalized === 'information';
}

export function isCoverageProcessTitle(title: string | null | undefined): boolean {
  const normalized = normalizeSearchText(title);
  return (
    normalized.includes('assessment') ||
    normalized.includes('admission') ||
    normalized.includes('expedited') ||
    normalized.includes('reconsideration') ||
    normalized.includes('request') ||
    normalized.includes('appeal') ||
    normalized.includes('submission') ||
    normalized.includes('authorization process')
  );
}

export function isCoverageAdministrativeTitle(title: string | null | undefined): boolean {
  const normalized = normalizeSearchText(title);
  return (
    normalized.includes('claim reimbursement') ||
    normalized.includes('provider requirement') ||
    normalized.includes('qualified providers') ||
    normalized.includes('appointed case management entity') ||
    normalized.includes('mandated requirements') ||
    normalized.includes('service authorization')
  );
}

export function isTelehealthServiceTableSection(section: AnswerFrameSection): boolean {
  const text = combineText(section.title, section.content);
  return (
    includesPhrase(text, ['telehealth eligible service', 'speech/language evaluation', 'speech/language treatment']) &&
    !section.sectionNumber
  );
}

export function isRevisionHeaderTitle(title: string | null): boolean {
  const normalized = normalizeSearchText(title);
  return normalized.includes('change no.') || normalized.includes('change no') || normalized.includes('revised');
}

export function includesCalendarYear(text: string | null | undefined): boolean {
  return /\b20\d{2}\b/.test(normalizeSearchText(text));
}

export function isAdministrativeFormTitle(title: string | null | undefined): boolean {
  const normalized = normalizeSearchText(title);
  if (normalized.includes('change notice')) {
    return false;
  }
  return (
    normalized.includes('notice') ||
    normalized.includes('authorization') ||
    normalized.includes('application checklist') ||
    normalized.includes('release authorization')
  );
}

export function isHcwdProcessTitle(title: string | null | undefined): boolean {
  const normalized = normalizeSearchText(title);
  return (
    normalized.includes('determine if a premium is due') ||
    normalized.includes('notification of premium due') ||
    normalized.includes('payment/collection') ||
    normalized.includes('payment received') ||
    normalized.includes('payment status') ||
    normalized.includes('premium invoices') ||
    normalized.includes('updated procedures')
  );
}

export function isYearSpecificPremiumTitle(title: string | null | undefined): boolean {
  const normalized = normalizeSearchText(title);
  return normalized.includes('premium') && includesCalendarYear(normalized);
}

export function extractChangeMarkerValue(text: string | null | undefined): number | null {
  const normalized = normalizeSearchText(text);
  if (!normalized) return null;

  const match =
    normalized.match(/\bchange(?:\s+notice)?(?:\s+no\.?)?\s*(\d{1,2})-(\d{2,4})\b/) ??
    normalized.match(/\b(\d{1,2})-(\d{2,4})\b/);
  if (!match) return null;

  const noticeNumber = Number.parseInt(match[1] ?? '', 10);
  const yearPart = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(noticeNumber) || !Number.isFinite(yearPart)) return null;

  const normalizedYear = yearPart < 100 ? 2000 + yearPart : yearPart;
  return normalizedYear * 100 + noticeNumber;
}

export function changeMarkerValueForHit(hit: CorpusRetrievalHit): number | null {
  return extractChangeMarkerValue(hit.sectionTitle) ?? extractChangeMarkerValue(hit.documentTitle);
}

export function isOperationalSourceHit(hit: CorpusRetrievalHit): boolean {
  return (
    hit.answerRole === 'billing' ||
    hit.answerRole === 'reimbursement' ||
    hit.answerRole === 'managed_care' ||
    hit.answerRole === 'managed_care_contract'
  );
}

export function defaultTypeGroupsForQuery(queryLower: string): string[][] {
  if (isFederalAuthorityQuery(queryLower)) {
    return [
      ['federal_regulation'],
      ['federal_statute'],
      federalImplementationDocumentTypes(queryLower),
    ];
  }

  return isOperationalRoutingQuery(queryLower)
    ? [...BASE_TYPE_GROUPS, ...OPERATIONAL_TYPE_GROUPS]
    : BASE_TYPE_GROUPS;
}

export function federalImplementationDocumentTypes(queryLower: string): string[] {
  const documentTypes = ['state_plan_amendment', 'dhhs_policy', 'clinical_policy', 'waiver', 'provider_manual'];
  if (isMlrQuery(queryLower) || isManagedCareOperationsQuery(queryLower)) {
    documentTypes.push('managed_care_contract');
  }
  return documentTypes;
}

export function buildFederalImplementationSectionTerms(queryLower: string, focusTerms: string[]): string[] {
  const terms = [
    ...SCOPE_SECTION_TERMS,
    ...GENERAL_CRITERIA_SECTION_TERMS,
    ...FEDERAL_SUPPORT_TERMS,
    ...focusTerms,
    'waiver',
  ];
  if (isManagedCareOperationsQuery(queryLower)) {
    terms.push('managed care', 'contract', 'contractor');
  }
  if (isMlrQuery(queryLower)) {
    terms.push(...MLR_IMPLEMENTATION_SUPPORT_TERMS);
  }
  return dedupeTerms(terms);
}

export function retrievalDocumentMetadataReturn(alias: string): string {
  return `${alias}.authority_tier AS authorityTier,
               ${alias}.answer_role AS answerRole,
               ${alias}.source_format AS sourceFormat,
               ${alias}.answer_ready AS answerReady,
               ${alias}.corpus_bucket AS corpusBucket,
               ${alias}.variant_group AS variantGroup,
               ${alias}.variant_date AS variantDate,
               ${alias}.retrieval_ready AS retrievalReady,`;
}

export function isModificationReviewQuery(queryLower: string): boolean {
  return (
    includesAnyTerm(queryLower, ['home modification', 'home modifications', 'equipment', 'technology', 'modification']) &&
    includesAnyTerm(queryLower, ['multidisciplinary team', 'mdt'])
  );
}

export function computePerGroupK(topK: number, hasExplicitDocumentTypes: boolean): number {
  const multiplier = hasExplicitDocumentTypes ? EXPLICIT_PER_GROUP_MULTIPLIER : DEFAULT_PER_GROUP_MULTIPLIER;
  const minimum = hasExplicitDocumentTypes ? MIN_EXPLICIT_PER_GROUP_K : MIN_DEFAULT_PER_GROUP_K;
  return Math.min(Math.max(topK * multiplier, minimum), MAX_PER_GROUP_K);
}

export function documentKeyForHit(hit: CorpusRetrievalHit): string | null {
  const key = [hit.documentType ?? '', hit.policyNumber ?? '', hit.documentTitle ?? '']
    .map((part) => part.trim())
    .join('::');
  return key.replace(/:+/g, '').trim().length > 0 ? key : null;
}

export function computeDocumentCoverageBoosts(hits: CorpusRetrievalHit[], queryTerms: string[]): Map<string, number> {
  const byDocument = new Map<string, { terms: Set<string>; hitCount: number }>();

  for (const hit of hits) {
    const key = documentKeyForHit(hit);
    if (!key) continue;

    let entry = byDocument.get(key);
    if (!entry) {
      entry = { terms: new Set<string>(), hitCount: 0 };
      byDocument.set(key, entry);
    }

    entry.hitCount += 1;
    for (const term of queryTerms) {
      if (
        normalizeSearchText(hit.sectionTitle).includes(term) ||
        normalizeSearchText(hit.documentTitle).includes(term) ||
        normalizeSearchText(hit.content).includes(term)
      ) {
        entry.terms.add(term);
      }
    }
  }

  const boosts = new Map<string, number>();
  for (const [key, entry] of byDocument) {
    const boost = Math.min(
      MAX_DOCUMENT_COVERAGE_BOOST,
      entry.terms.size * DOCUMENT_COVERAGE_TERM_BOOST + Math.max(0, entry.hitCount - 1) * DOCUMENT_COVERAGE_HIT_BOOST,
    );
    boosts.set(key, boost);
  }
  return boosts;
}

export function selectDocumentTitlesForExpansion(
  hits: CorpusRetrievalHit[],
  documentCoverageBoosts: Map<string, number>,
): string[] {
  const scoresByTitle = new Map<string, number>();

  for (const hit of hits) {
    const title = hit.documentTitle;
    if (!title) continue;

    const key = documentKeyForHit(hit);
    const coverageBoost = key ? (documentCoverageBoosts.get(key) ?? 0) : 0;
    const score = hit.score + coverageBoost;
    const existing = scoresByTitle.get(title) ?? 0;
    scoresByTitle.set(title, existing + score);
  }

  return Array.from(scoresByTitle.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, DOCUMENT_EXPANSION_DOC_LIMIT)
    .map(([title]) => title);
}

export function rerankRetrievalHit(
  hit: CorpusRetrievalHit,
  queryLower: string,
  queryTerms: string[],
  procedureCodes: string[],
  requestedYears: string[],
  exactPolicyNumbers: string[],
  documentCoverageBoosts: Map<string, number>,
  latestChangeMarkerValue: number | null,
): CorpusRetrievalHit {
  const titleMatches = scoreTermMatches(queryTerms, hit.sectionTitle);
  const documentMatches = scoreTermMatches(queryTerms, hit.documentTitle);
  const contentMatches = Math.min(scoreTermMatches(queryTerms, hit.content), 6);
  const hitChangeMarkerValue = changeMarkerValueForHit(hit);
  const pediatricQuery = isPediatricQuery(queryLower);
  const sectionText = combineText(hit.sectionTitle, hit.content);
  const historicalReimbursementQuery = isHistoricalReimbursementQuery(queryLower, requestedYears);
  const requestedYearMatch = variantDateMatchesRequestedYear(hit.variantDate, requestedYears);
  const procedureCodeMatches = countProcedureCodeMatches(
    combineText(hit.sectionTitle, hit.documentTitle, hit.content),
    procedureCodes,
  );
  const federalAuthorityQuery = isFederalAuthorityQuery(queryLower);
  const managedCareContractQuery = isManagedCareContractQuery(queryLower);
  const waiverApplicationQuery = isWaiverApplicationQuery(queryLower);
  const publicNoticeQuery = asksForPublicNoticeDetails(queryLower);
  const hcwdIncomePremiumQuery = isHcwdIncomePremiumQuery(queryLower);
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

  if (hit.documentType && FEDERAL_DOCUMENT_TYPES.has(hit.documentType) && federalAuthorityQuery) {
    adjustedScore += FEDERAL_AUTHORITY_BOOST;
  } else if (federalAuthorityQuery) {
    adjustedScore -= NON_FEDERAL_AUTHORITY_PENALTY;
  }

  if (managedCareContractQuery && !federalAuthorityQuery) {
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
    isCoverageQuestion(queryLower) &&
    !isOperationalRoutingQuery(queryLower) &&
    !isFederalAuthorityQuery(queryLower) &&
    !isChangeNoticeQuery(queryLower)
  ) {
    if (hit.authorityTier === 'authoritative') {
      adjustedScore += AUTHORITATIVE_POLICY_BOOST;
    } else if (hit.authorityTier) {
      adjustedScore -= NON_AUTHORITATIVE_POLICY_PENALTY;
    }
  }

  const operationalQuery = isOperationalRoutingQuery(queryLower);
  const operationalHit = isOperationalSourceHit(hit);
  if (!operationalQuery && operationalHit) {
    adjustedScore -= OFF_TOPIC_OPERATIONAL_PENALTY;
  }

  if (operationalQuery && operationalHit) {
    const reimbursementMatch = isReimbursementQuery(queryLower) && hit.answerRole === 'reimbursement';
    const billingMatch = isBillingWorkflowQuery(queryLower) && hit.answerRole === 'billing';
    const managedCareMatch =
      isManagedCareOperationsQuery(queryLower) &&
      (managedCareContractQuery
        ? hit.answerRole === 'managed_care_contract'
        : hit.answerRole === 'managed_care' || hit.answerRole === 'managed_care_contract');

    if (reimbursementMatch || billingMatch || managedCareMatch) {
      adjustedScore += OPERATIONAL_ROLE_BOOST;
    } else {
      adjustedScore -= OPERATIONAL_ROLE_MISMATCH_PENALTY;
    }

    if (managedCareContractQuery) {
      if (hit.answerRole === 'managed_care_contract') {
        adjustedScore += CONTRACT_ROLE_BOOST;
      } else if (hit.answerRole === 'managed_care') {
        adjustedScore -= CONTRACT_ROLE_MISMATCH_PENALTY;
      }
    }
  }

  if (isReimbursementQuery(queryLower) && procedureCodes.length > 0 && procedureCodeMatches > 0) {
    adjustedScore += procedureCodeMatches * EXACT_REIMBURSEMENT_CODE_BOOST;
    if (hit.answerRole === 'reimbursement') {
      adjustedScore += REIMBURSEMENT_CODE_ROLE_BOOST;
    } else {
      adjustedScore -= NON_REIMBURSEMENT_CODE_MATCH_PENALTY;
    }
  }

  if (hit.documentType === 'fee_schedule' && isReimbursementQuery(queryLower)) {
    if (hit.corpusBucket === 'primary') {
      adjustedScore += PRIMARY_FEE_SCHEDULE_BOOST;
    } else if (hit.corpusBucket === 'history') {
      adjustedScore += historicalReimbursementQuery || requestedYearMatch
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

  if (isChangeNoticeQuery(queryLower) && normalizeSearchText(hit.documentTitle).includes('change notice')) {
    adjustedScore += CHANGE_NOTICE_BOOST;
  }

  if (waiverApplicationQuery) {
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

    if (includesPhrase(retrievalText, ['1915(b)', '1915(b) waiver']) && !queryLower.includes('1915(b)')) {
      adjustedScore -= 0.45;
    }

    if (
      includesPhrase(retrievalText, WAIVER_APPLICATION_AVOID_TERMS) ||
      (!publicNoticeQuery && sectionNumber === '431.408')
    ) {
      adjustedScore -= 0.55;
    }
  }

  if (queryLower.includes('cover') && normalizeSearchText(hit.content).includes('not covered')) {
    adjustedScore += COVERAGE_EXCLUSION_BOOST;
  }

  if (isRequirementDetailQuery(queryLower)) {
    const requirementEvidenceScore = Math.min(scorePhraseMatches(sectionText, REQUIREMENT_EVIDENCE_TERMS, 1), 4);
    adjustedScore += requirementEvidenceScore * 0.05;
    if (!hit.sectionNumber && requirementEvidenceScore === 0) {
      adjustedScore -= 0.08;
    }
  }

  if (isChangeNoticeQuery(queryLower) && normalizeSearchText(hit.sectionTitle).includes('implementation')) {
    adjustedScore += IMPLEMENTATION_SECTION_BOOST;
  }

  if (isChangeNoticeQuery(queryLower) && isRevisionHeaderTitle(hit.sectionTitle)) {
    adjustedScore += REVISION_HEADER_BOOST;
  }

  if (hcwdIncomePremiumQuery) {
    if (includesPhrase(retrievalText, HCWD_LIMIT_HISTORY_TERMS)) {
      adjustedScore += 0.32;
    }

    if (normalizeSearchText(hit.documentTitle).includes('change notice')) {
      adjustedScore += 0.12;
    }

    if (
      (isYearSpecificPremiumTitle(hit.sectionTitle) || isYearSpecificPremiumTitle(hit.documentTitle)) &&
      !includesCalendarYear(queryLower) &&
      !queryLower.includes('chart')
    ) {
      adjustedScore -= 0.45;
    }

    if (isAdministrativeFormTitle(hit.sectionTitle) || isAdministrativeFormTitle(hit.documentTitle)) {
      adjustedScore -= 0.35;
    }

    if (
      (isHcwdProcessTitle(hit.sectionTitle) || isHcwdProcessTitle(hit.documentTitle)) &&
      !queryLower.includes('procedure') &&
      !queryLower.includes('payment')
    ) {
      adjustedScore -= 0.2;
    }
  }

  if (
    isLatestChangeNoticeQuery(queryLower) &&
    latestChangeMarkerValue !== null &&
    hitChangeMarkerValue !== null &&
    hitChangeMarkerValue === latestChangeMarkerValue
  ) {
    adjustedScore += LATEST_CHANGE_MARKER_BOOST;
  }

  if (
    isLatestChangeNoticeQuery(queryLower) &&
    hitChangeMarkerValue === null &&
    normalizeSearchText(hit.sectionTitle).includes('effective') &&
    !normalizeSearchText(hit.documentTitle).includes('change notice')
  ) {
    adjustedScore -= LATEST_CHANGE_QUERY_EFFECTIVE_SECTION_PENALTY;
  }

  if (isModificationReviewQuery(queryLower)) {
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

  if (isAttachmentTitle(hit.sectionTitle) && !queryLower.includes('attachment')) {
    adjustedScore -= ATTACHMENT_TITLE_PENALTY;
  }

  if (isGenericSectionTitle(hit.sectionTitle)) {
    adjustedScore -= GENERIC_SECTION_TITLE_PENALTY;
  }

  if (isYesNoCoverageQuery(queryLower) && isCoverageProcessTitle(hit.sectionTitle)) {
    adjustedScore -= COVERAGE_PROCESS_SECTION_PENALTY;
  }

  if (isPediatricPolicyHit(hit)) {
    adjustedScore += pediatricQuery ? 0.12 : -0.12;
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

export function recordToRetrievalHit(record: SessionRecordLike): CorpusRetrievalHit {
  const content = (record.get('content') as string | null | undefined) ?? null;
  return {
    sectionId: record.get('sectionId') as string,
    sectionNumber: (record.get('sectionNumber') as string | null | undefined) ?? null,
    sectionTitle: (record.get('sectionTitle') as string | null | undefined) ?? null,
    documentTitle: (record.get('documentTitle') as string | null | undefined) ?? null,
    documentType: (record.get('documentType') as string | null | undefined) ?? null,
    policyNumber: (record.get('policyNumber') as string | null | undefined) ?? null,
    content,
    score: record.get('score') as number,
    authorityTier: (record.get('authorityTier') as string | null | undefined) ?? null,
    answerRole: (record.get('answerRole') as string | null | undefined) ?? null,
    sourceFormat: (record.get('sourceFormat') as string | null | undefined) ?? null,
    answerReady: (record.get('answerReady') as boolean | null | undefined) ?? null,
    corpusBucket: (record.get('corpusBucket') as string | null | undefined) ?? null,
    variantGroup: (record.get('variantGroup') as string | null | undefined) ?? null,
    variantDate: (record.get('variantDate') as string | null | undefined) ?? null,
    retrievalReady: (record.get('retrievalReady') as boolean | null | undefined) ?? null,
  };
}

export function retrievalHitToSearchHit(hit: CorpusRetrievalHit): SearchHit {
  return {
    sectionId: hit.sectionId,
    title: hit.sectionTitle,
    policyNumber: hit.policyNumber,
    documentType: hit.documentType,
    contentSnippet: hit.content ? hit.content.slice(0, SEARCH_SNIPPET_CHARS) : null,
    score: hit.score,
  };
}

export function mapSectionContextEntry(record: SessionRecordLike): SectionContextEntry {
  return {
    id: record.get('id') as string,
    title: (record.get('title') as string | null | undefined) ?? null,
    sectionNumber: (record.get('sectionNumber') as string | null | undefined) ?? null,
  };
}

export function mapDocumentSections(rawSections: Array<{
  id: string | null;
  number: string | null;
  title: string | null;
  chars?: number | { toNumber(): number } | null;
}>): DocumentSectionView[] {
  return rawSections
    .filter((section) => section.id != null)
    .map((section) => {
      const chars =
        section.chars != null && typeof section.chars === 'object' && 'toNumber' in section.chars
          ? section.chars.toNumber()
          : (section.chars ?? undefined);

      return chars === undefined
        ? {
            id: section.id as string,
            number: section.number,
            title: section.title,
          }
        : {
            id: section.id as string,
            number: section.number,
            title: section.title,
            chars,
          };
    });
}

export function buildSectionView(record: SessionRecordLike, content: string | null): SectionView {
  const documentTitle = (record.get('documentTitle') as string | null | undefined) ?? null;
  const url = (record.get('url') as string | null | undefined) ?? null;
  return {
    id: record.get('id') as string,
    title: (record.get('title') as string | null | undefined) ?? null,
    sectionNumber: (record.get('sectionNumber') as string | null | undefined) ?? null,
    content,
    effectiveDate: (record.get('effectiveDate') as string | null | undefined) ?? null,
    lastRevised: (record.get('lastRevised') as string | null | undefined) ?? null,
    federalRegisterCite: (record.get('federalRegisterCite') as string | null | undefined) ?? null,
    documentId: (record.get('documentId') as string | null | undefined) ?? null,
    documentTitle,
    documentType: (record.get('documentType') as string | null | undefined) ?? null,
    policyNumber: (record.get('policyNumber') as string | null | undefined) ?? null,
    url,
    citationLink: documentTitle && url ? `[${documentTitle}](${url})` : null,
    status: (record.get('status') as string | null | undefined) ?? null,
    authorityTier: (record.get('authorityTier') as string | null | undefined) ?? null,
    answerRole: (record.get('answerRole') as string | null | undefined) ?? null,
    sourceFormat: (record.get('sourceFormat') as string | null | undefined) ?? null,
    answerReady: (record.get('answerReady') as boolean | null | undefined) ?? null,
    corpusBucket: (record.get('corpusBucket') as string | null | undefined) ?? null,
    variantGroup: (record.get('variantGroup') as string | null | undefined) ?? null,
    variantDate: (record.get('variantDate') as string | null | undefined) ?? null,
    retrievalReady: (record.get('retrievalReady') as boolean | null | undefined) ?? null,
  };
}

export function truncateContent(content: string | null): string | null {
  if (!content || content.length <= MAX_CONTENT_CHARS) return content;
  return `${content.slice(0, MAX_CONTENT_CHARS)}\n\n[Content truncated at 6,000 chars. Use getSectionContext to explore sub-sections.]`;
}

export function buildHitText(hit: CorpusRetrievalHit): string {
  return combineText(hit.sectionTitle, hit.documentTitle, hit.policyNumber, hit.content);
}

export function collectPolicyNumbersForQuery(query: string): string[] {
  const queryLower = normalizeSearchText(query);
  const aliasedPolicyNumbers = isFederalAuthorityQuery(queryLower) ? [] : extractAliasedPolicyNumbers(queryLower);
  return dedupeTerms([...extractExplicitPolicyNumbers(query), ...aliasedPolicyNumbers]);
}

export function buildSectionCandidates(
  hits: CorpusRetrievalHit[],
  includeTerms: readonly string[],
  avoidTerms: readonly string[],
  limit: number,
  fallbackReason: string,
): SectionCandidate[] {
  return uniqueBy(
    hits
      .map((hit) => {
        const sectionText = combineText(hit.sectionTitle, hit.content);
        const includeScore = scorePhraseMatches(sectionText, includeTerms, 1);
        const avoidScore = scorePhraseMatches(sectionText, avoidTerms, 1);
        const titleBonus = hit.sectionTitle ? scorePhraseMatches(normalizeSearchText(hit.sectionTitle), includeTerms, 0.75) : 0;
        const score = hit.score + includeScore * 0.12 + titleBonus * 0.08 - avoidScore * 0.1;
        return {
          sectionId: hit.sectionId,
          score,
          reason:
            includeScore > 0
              ? `Matched ${includeTerms.find((term) => sectionText.includes(term)) ?? fallbackReason}.`
              : fallbackReason,
        } satisfies SectionCandidate;
      })
      .filter((candidate) => Number.isFinite(candidate.score))
      .sort((left, right) => right.score - left.score),
    (candidate) => candidate.sectionId,
  ).slice(0, limit);
}

export function extractDocumentView(document: DocumentWithSectionsView): DocumentView {
  return {
    id: document.id,
    title: document.title,
    documentType: document.documentType,
    policyNumber: document.policyNumber,
    effectiveDate: document.effectiveDate,
    url: document.url,
    citationLink: document.citationLink,
    status: document.status,
    authorityTier: document.authorityTier,
    answerRole: document.answerRole,
    sourceFormat: document.sourceFormat,
    answerReady: document.answerReady,
    corpusBucket: document.corpusBucket,
    variantGroup: document.variantGroup,
    variantDate: document.variantDate,
    retrievalReady: document.retrievalReady,
  };
}

export function pickDocumentSectionsByTitle(
  document: DocumentWithSectionsView,
  includeTerms: readonly string[],
  avoidTerms: readonly string[],
  limit = DOCUMENT_SECTION_PICK_LIMIT,
): string[] {
  return document.sections
    .map((section) => {
      const titleText = combineText(section.number, section.title);
      const includeScore = scorePhraseMatches(titleText, includeTerms, 1);
      const avoidScore = scorePhraseMatches(titleText, avoidTerms, 1);
      return {
        id: section.id,
        score: includeScore * 2 - avoidScore,
      };
    })
    .filter((section) => section.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((section) => section.id);
}

export function sectionNumberDepth(sectionNumber: string | null | undefined): number {
  const normalized = normalizeSearchText(sectionNumber);
  if (normalized.length === 0) return 0;
  return normalized.split('.').filter((segment) => segment.length > 0).length;
}

export function isLikelyCoverageLimitationSectionNumber(sectionNumber: string | null | undefined): boolean {
  return /^4(\.|$)/.test(normalizeSearchText(sectionNumber));
}

export function pickLikelyCoverageLimitationSections(
  document: DocumentWithSectionsView,
  limit = DOCUMENT_SECTION_PICK_LIMIT,
): string[] {
  return document.sections
    .filter((section) => isLikelyCoverageLimitationSectionNumber(section.number))
    .sort((left, right) => {
      const depthDelta = sectionNumberDepth(right.number) - sectionNumberDepth(left.number);
      if (depthDelta !== 0) return depthDelta;
      return normalizeSearchText(left.number).localeCompare(normalizeSearchText(right.number));
    })
    .slice(0, limit)
    .map((section) => section.id);
}

export function describeLatestRevision(section: SectionView | null, document: DocumentView | null): string | null {
  return section?.title ?? document?.title ?? null;
}

export function buildEmptyAnswerFrame(questionType: AnswerQuestionType, route?: AnswerFrameRoute): AnswerFrame {
  return {
    questionType,
    route:
      route ??
      buildAnswerRoute({
        lane: 'baseline_hybrid',
        rationale: 'empty_frame',
        wideningPolicy: 'none',
      }),
    authoritativeDocuments: [],
    primarySections: [],
    supportingSections: [],
    avoidSections: [],
    latestRevision: null,
    variantReasoning: null,
  };
}

export function pickTopDocumentCandidates(candidates: DocumentCandidate[], limit = FRAME_DOCUMENT_LIMIT): AnswerFrameDocument[] {
  return uniqueBy(
    candidates.sort((left, right) => right.score - left.score),
    (candidate) => candidate.document.id,
  )
    .slice(0, limit)
    .map((candidate) => toAnswerFrameDocument(candidate.document, candidate.reason));
}

export function scoreVariantDocument(document: DocumentWithSectionsView, queryLower: string, policyNumbers: string[]): DocumentCandidate {
  let score = 0;
  let reason = 'Relevant policy variant returned by policy lookup.';
  const titleText = combineText(document.title, document.policyNumber);

  if (document.policyNumber && policyNumbers.includes(document.policyNumber.toUpperCase())) {
    score += 2.5;
    reason = 'Exact policy-number match from the query.';
  }
  if (document.status === 'current') {
    score += 0.6;
  }
  if (titleText.includes('change notice') || document.status === 'amendment') {
    score -= 1.5;
  }
  for (const variant of VARIANT_SETTING_TERMS) {
    if (includesPhrase(queryLower, variant.terms) && includesPhrase(titleText, variant.titleTerms)) {
      score += 1.2;
      reason = variant.reason;
    }
  }
  score += scoreTermMatches(extractSearchTerms(queryLower), titleText) * 0.03;

  return {
    document: extractDocumentView(document),
    reason,
    score,
  };
}

export function scoreHcwdCoverageDocument(document: DocumentWithSectionsView, queryLower: string): number {
  const titleText = combineText(document.title, document.policyNumber);
  let score = 0;

  if (document.policyNumber?.toUpperCase() === 'MA-2180') {
    score += 2.5;
  }
  if (document.status === 'current') {
    score += 0.5;
  }
  if (titleText.includes('health coverage for workers with disabilities')) {
    score += 1.2;
  }
  if (titleText.includes('income') || titleText.includes('premium')) {
    score += 0.4;
  }
  if (isAdministrativeFormTitle(document.title)) {
    score -= 2.5;
  }
  if (isYearSpecificPremiumTitle(document.title) && !includesCalendarYear(queryLower) && !queryLower.includes('chart')) {
    score -= 1.8;
  }
  if (isHcwdProcessTitle(document.title) && !queryLower.includes('procedure') && !queryLower.includes('payment')) {
    score -= 1.0;
  }

  return score;
}

export function narrowHcwdCoverageDocuments(query: string, documents: DocumentWithSectionsView[]): DocumentWithSectionsView[] {
  if (documents.length <= 1) return documents;

  const queryLower = normalizeSearchText(query);
  const ranked = [...documents]
    .map((document) => ({
      document,
      score: scoreHcwdCoverageDocument(document, queryLower),
    }))
    .sort((left, right) => right.score - left.score);
  if (!includesCalendarYear(queryLower) && !queryLower.includes('chart')) {
    return ranked.slice(0, 1).map(({ document }) => document);
  }

  const topScore = ranked[0]?.score ?? 0;
  return ranked
    .filter(({ score }, index) => index === 0 || score >= topScore - 0.75)
    .slice(0, 2)
    .map(({ document }) => document);
}

export function policyFamilyKey(policyNumber: string | null | undefined): string | null {
  if (!policyNumber) return null;
  return policyNumber.toUpperCase().replace(/-[A-Z0-9]+$/g, '');
}

export function looksLikeSiblingPolicySet(documents: DocumentWithSectionsView[]): boolean {
  const families = dedupeTerms(
    documents.map((document) => policyFamilyKey(document.policyNumber)).filter((family): family is string => Boolean(family)),
  );
  if (families.length === 0) return false;

  return families.some((family) => documents.filter((document) => policyFamilyKey(document.policyNumber) === family).length > 1);
}

export function narrowInferredCoverageDocuments(documents: DocumentWithSectionsView[]): DocumentWithSectionsView[] {
  if (documents.length <= 1) return documents;

  const countsByFamily = new Map<string, number>();
  for (const document of documents) {
    const family = policyFamilyKey(document.policyNumber);
    if (!family) continue;
    countsByFamily.set(family, (countsByFamily.get(family) ?? 0) + 1);
  }

  const preferredFamily = Array.from(countsByFamily.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  if (preferredFamily && (countsByFamily.get(preferredFamily) ?? 0) > 1) {
    return documents.filter((document) => policyFamilyKey(document.policyNumber) === preferredFamily);
  }

  return documents.slice(0, 1);
}

export function scoreHitForQueryFocus(
  hit: CorpusRetrievalHit,
  focusTerms: string[],
  quotedPhrases: string[],
): number {
  const titlePhraseMatches = countPhraseMatches(hit.sectionTitle, quotedPhrases);
  const textPhraseMatches = countPhraseMatches(combineText(hit.sectionTitle, hit.content), quotedPhrases);
  const titleMatches = scoreTermMatches(focusTerms, hit.sectionTitle);
  const contentMatches = Math.min(scoreTermMatches(focusTerms, hit.content), 6);
  const numberedBonus = hit.sectionNumber ? 0.02 : 0;

  return (
    hit.score +
    titlePhraseMatches * 0.32 +
    textPhraseMatches * 0.1 +
    titleMatches * 0.05 +
    contentMatches * 0.015 +
    numberedBonus
  );
}

export function rankHitsByQueryFocus(
  hits: CorpusRetrievalHit[],
  focusTerms: string[],
  quotedPhrases: string[],
): CorpusRetrievalHit[] {
  return [...hits].sort(
    (left, right) =>
      scoreHitForQueryFocus(right, focusTerms, quotedPhrases) - scoreHitForQueryFocus(left, focusTerms, quotedPhrases),
  );
}

// CFR-part routing constants. The hybrid retriever + focus-score path has no
// built-in way to prefer base-Medicaid CFR parts over CHIP when titles share
// vocabulary ("state plan amendment", "managed care", "requirement"); the
// tiebreaker below enforces domain preference so Medicaid questions don't drift
// into 42 CFR 457.
const CFR_POLICY_NUMBER_RE = /^(\d+)-CFR-(\d+)$/;
const BASE_MEDICAID_CFR_PARTS = new Set([430, 431, 432, 433, 435, 436, 438, 440, 441, 442, 447, 455, 456, 460]);
const CHIP_CFR_PARTS = new Set([457]);
const CHIP_QUESTION_TOKENS = [
  'chip',
  "children's health insurance",
  "childrens health insurance",
  'title xxi',
  'title 21',
];

// Independent window for the CFR-part tiebreaker. The general scoreWindow used
// to pick multiple preferred documents is tight (~0.08) to keep the candidate
// set tight; the CFR tiebreaker operates on a wider window because the focus-
// adjusted score between a CHIP and a base-Medicaid candidate can differ by
// the weight of a single title-phrase match (~0.1) even when the two are
// domain-distinct.
const CFR_TIEBREAKER_WINDOW = 0.2;

interface CfrPartInfo {
  title: number;
  part: number;
}

function cfrPartFromPolicyNumber(policyNumber: string | null): CfrPartInfo | null {
  if (!policyNumber) return null;
  const match = CFR_POLICY_NUMBER_RE.exec(policyNumber);
  if (!match) return null;
  return { title: Number.parseInt(match[1], 10), part: Number.parseInt(match[2], 10) };
}

function isChipCfrPart(partInfo: CfrPartInfo | null): boolean {
  return partInfo !== null && partInfo.title === 42 && CHIP_CFR_PARTS.has(partInfo.part);
}

function isBaseMedicaidCfrPart(partInfo: CfrPartInfo | null): boolean {
  return partInfo !== null && partInfo.title === 42 && BASE_MEDICAID_CFR_PARTS.has(partInfo.part);
}

function questionMentionsChip(questionText: string | undefined): boolean {
  if (!questionText) return false;
  const lower = questionText.toLowerCase();
  return CHIP_QUESTION_TOKENS.some((token) => lower.includes(token));
}

interface RankedDocumentEntry {
  title: string;
  score: number;
  policyNumber: string | null;
}

/**
 * Promote the best base-Medicaid CFR document above any CHIP document that
 * outranks it within `CFR_TIEBREAKER_WINDOW`, as long as the question does not
 * explicitly mention CHIP. Mutates `ranked` in place.
 */
function applyCfrPartPreferenceTiebreaker(ranked: RankedDocumentEntry[]): void {
  if (ranked.length < 2) return;
  const topScore = ranked[0]?.score ?? 0;

  let firstChipIndex = -1;
  let bestBaseMedicaidIndex = -1;
  for (let i = 0; i < ranked.length; i++) {
    if (ranked[i].score < topScore - CFR_TIEBREAKER_WINDOW) break;
    const partInfo = cfrPartFromPolicyNumber(ranked[i].policyNumber);
    if (firstChipIndex === -1 && isChipCfrPart(partInfo)) {
      firstChipIndex = i;
    }
    if (bestBaseMedicaidIndex === -1 && isBaseMedicaidCfrPart(partInfo)) {
      bestBaseMedicaidIndex = i;
    }
  }

  if (
    firstChipIndex !== -1
    && bestBaseMedicaidIndex !== -1
    && firstChipIndex < bestBaseMedicaidIndex
  ) {
    const [baseMedicaid] = ranked.splice(bestBaseMedicaidIndex, 1);
    ranked.splice(firstChipIndex, 0, baseMedicaid);
  }
}

export function selectPreferredDocumentTitlesByFocus(
  hits: CorpusRetrievalHit[],
  focusTerms: string[],
  quotedPhrases: string[],
  maxDocuments = 2,
  scoreWindow = 0.1,
  questionText?: string,
): string[] {
  const bestByDocumentTitle = new Map<string, { score: number; policyNumber: string | null }>();
  for (const hit of hits) {
    if (!hit.documentTitle) continue;
    const score = scoreHitForQueryFocus(hit, focusTerms, quotedPhrases);
    const existing = bestByDocumentTitle.get(hit.documentTitle);
    if (existing == null || score > existing.score) {
      bestByDocumentTitle.set(hit.documentTitle, { score, policyNumber: hit.policyNumber });
    }
  }

  const ranked: RankedDocumentEntry[] = Array.from(bestByDocumentTitle.entries())
    .map(([title, value]) => ({ title, score: value.score, policyNumber: value.policyNumber }))
    .sort((left, right) => right.score - left.score);
  if (ranked.length === 0) return [];

  // Only run the CFR-part tiebreaker when the caller explicitly passed question
  // text — without it we can't tell whether this is a CHIP-targeted query, and
  // we don't want to silently reorder results for callers that haven't opted in.
  if (questionText !== undefined && !questionMentionsChip(questionText)) {
    applyCfrPartPreferenceTiebreaker(ranked);
  }

  const topScore = ranked[0]?.score ?? 0;
  return ranked
    .filter((entry, index) => index === 0 || (index < maxDocuments && entry.score >= topScore - scoreWindow))
    .slice(0, maxDocuments)
    .map((entry) => entry.title);
}

export function filterHitsToFocusedContent(
  hits: CorpusRetrievalHit[],
  focusTerms: string[],
  quotedPhrases: string[],
): CorpusRetrievalHit[] {
  const ranked = rankHitsByQueryFocus(hits, focusTerms, quotedPhrases);
  const filtered = ranked.filter((hit) => {
    const phraseMatches = countPhraseMatches(combineText(hit.sectionTitle, hit.content), quotedPhrases);
    const titleMatches = scoreTermMatches(focusTerms, hit.sectionTitle);
    const contentMatches = Math.min(scoreTermMatches(focusTerms, hit.content), 6);
    return phraseMatches > 0 || titleMatches + contentMatches >= 2;
  });
  return filtered.length > 0 ? filtered : ranked;
}

export function isAllowedConceptRelationship(relationshipType: string): boolean {
  return (ALLOWED_CONCEPT_RELATIONSHIPS as readonly string[]).includes(relationshipType);
}
