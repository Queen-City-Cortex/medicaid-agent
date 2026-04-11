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
} from './types.js';
import { documentMetadataReturn, mapDocumentMetadataRecord } from './document-metadata.js';

export const SEARCH_SNIPPET_CHARS = 300;
const CONCEPT_MATCH_SCORE = 0.7;
const FULLTEXT_BOOST = 0.05;
const BASE_TYPE_GROUPS = [
  ['clinical_policy'],
  ['dhhs_policy'],
  ['federal_regulation'],
  ['federal_statute'],
  ['bulletin', 'state_plan_amendment', 'waiver', 'provider_manual'],
];
const OPERATIONAL_TYPE_GROUPS = [
  ['fee_schedule'],
  ['billing_guidance'],
  ['managed_care_guidance', 'managed_care_contract'],
];
const LUCENE_SPECIAL = /[+\-&|!(){}[\]^"~*?:\\/]/g;
const MAX_CONTENT_CHARS = 6000;
const MAX_COMBINED_CHARS = 6000;
const MAX_PER_GROUP_K = 100;
const MIN_DEFAULT_PER_GROUP_K = 25;
const MIN_EXPLICIT_PER_GROUP_K = 15;
const DEFAULT_PER_GROUP_MULTIPLIER = 4;
const EXPLICIT_PER_GROUP_MULTIPLIER = 3;
const MAX_QUERY_TERMS = 14;
const TITLE_TERM_MATCH_BOOST = 0.03;
const DOCUMENT_TERM_MATCH_BOOST = 0.02;
const CONTENT_TERM_MATCH_BOOST = 0.005;
const PHRASE_MATCH_WEIGHT = 1.8;
const LOW_SIGNAL_TERM_WEIGHT = 0.35;
const POLICY_NUMBER_MATCH_BOOST = 0.12;
const FEDERAL_AUTHORITY_BOOST = 0.08;
const NON_FEDERAL_AUTHORITY_PENALTY = 0.08;
const CHANGE_NOTICE_BOOST = 0.08;
const BOILERPLATE_TITLE_PENALTY = 0.18;
const DOCUMENT_KEYWORD_BASE_SCORE = 0.45;
const DOCUMENT_KEYWORD_DOC_WEIGHT = 0.03;
const DOCUMENT_KEYWORD_SECTION_WEIGHT = 0.015;
const DOCUMENT_KEYWORD_DOC_LIMIT = 6;
const SECTION_KEYWORD_BASE_SCORE = 0.35;
const SECTION_KEYWORD_WEIGHT = 0.015;
const AMENDMENT_CONTEXT_BASE_SCORE = 0.82;
const AMENDMENT_CONTEXT_DOC_WEIGHT = 0.03;
const AMENDMENT_CONTEXT_SECTION_WEIGHT = 0.04;
const AMENDMENT_CONTEXT_DOC_LIMIT = 5;
const POLICY_SCOPED_BASE_SCORE = 0.55;
const POLICY_SCOPED_SECTION_WEIGHT = 0.02;
const EXACT_POLICY_NUMBER_BOOST = 0.2;
const DOCUMENT_COVERAGE_TERM_BOOST = 0.01;
const DOCUMENT_COVERAGE_HIT_BOOST = 0.02;
const MAX_DOCUMENT_COVERAGE_BOOST = 0.16;
const DOCUMENT_EXPANSION_BASE_SCORE = 0.58;
const DOCUMENT_EXPANSION_SECTION_WEIGHT = 0.02;
const DOCUMENT_EXPANSION_DOC_LIMIT = 8;
const CHANGE_NOTICE_HEADER_BASE_SCORE = 1.04;
const CHANGE_NOTICE_HEADER_SECTION_WEIGHT = 0.06;
const ATTACHMENT_TITLE_PENALTY = 0.12;
const GENERIC_SECTION_TITLE_PENALTY = 0.14;
const COVERAGE_EXCLUSION_BOOST = 0.08;
const IMPLEMENTATION_SECTION_BOOST = 0.1;
const REVISION_HEADER_BOOST = 0.12;
const LATEST_CHANGE_MARKER_BOOST = 0.22;
const LATEST_CHANGE_QUERY_EFFECTIVE_SECTION_PENALTY = 0.18;
const MODIFICATION_REVIEW_CLUSTER_BOOST = 0.18;
const MODIFICATION_TOPIC_BOOST = 0.06;
const ANSWER_READY_PENALTY = 0.18;
const NON_AUTHORITATIVE_POLICY_PENALTY = 0.1;
const AUTHORITATIVE_POLICY_BOOST = 0.04;
const OFF_TOPIC_OPERATIONAL_PENALTY = 0.12;
const OPERATIONAL_ROLE_BOOST = 0.12;
const OPERATIONAL_ROLE_MISMATCH_PENALTY = 0.08;
const CONTRACT_ROLE_BOOST = 0.14;
const CONTRACT_ROLE_MISMATCH_PENALTY = 0.14;
const CONTRACT_GOVERNING_SOURCE_BOOST = 0.08;
const CONTRACT_FEDERAL_CONTEXT_PENALTY = 0.18;
const EXACT_REIMBURSEMENT_CODE_BOOST = 0.45;
const REIMBURSEMENT_CODE_ROLE_BOOST = 0.08;
const NON_REIMBURSEMENT_CODE_MATCH_PENALTY = 0.16;
const RETRIEVAL_READY_PENALTY = 0.18;
const PRIMARY_FEE_SCHEDULE_BOOST = 0.12;
const HISTORY_FEE_SCHEDULE_BOOST = 0.08;
const HISTORY_FEE_SCHEDULE_PENALTY = 0.08;
const ARCHIVE_FEE_SCHEDULE_PENALTY = 0.18;
const COMPANION_FEE_SCHEDULE_PENALTY = 0.16;
const SPREADSHEET_FEE_SCHEDULE_BOOST = 0.04;
const REQUESTED_YEAR_MATCH_BOOST = 0.18;
const COVERAGE_PROCESS_SECTION_PENALTY = 0.18;
const FEDERAL_DOCUMENT_TYPES = new Set(['federal_regulation', 'federal_statute']);
const POLICY_ROUTING_DOCUMENT_TYPES = new Set(['clinical_policy', 'dhhs_policy', 'provider_manual', 'waiver']);
const YEAR_QUERY_RE = /\b(19|20)\d{2}\b/g;
const FRAME_PRIMARY_LIMIT = 4;
const FRAME_SUPPORT_LIMIT = 4;
const FRAME_AVOID_LIMIT = 3;
const FRAME_DOCUMENT_LIMIT = 3;
const DOCUMENT_SECTION_PICK_LIMIT = 2;
const BOILERPLATE_SECTION_TITLES = new Set([
  'history',
  'revision information',
  'table of contents',
  'background',
  'introduction',
]);
const SEARCH_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'apply',
  'are',
  'be',
  'can',
  'clinical',
  'coverage',
  'does',
  'for',
  'has',
  'have',
  'how',
  'in',
  'is',
  'it',
  'its',
  'need',
  'medicaid',
  'of',
  'on',
  'or',
  'policy',
  's',
  'service',
  'services',
  'the',
  'their',
  'there',
  'under',
  'what',
  'when',
  'which',
  'with',
]);
const LOW_SIGNAL_SEARCH_TERMS = new Set([
  'document',
  'documentation',
  'provide',
  'provided',
  'requirement',
  'requirements',
]);
const SERVICE_FOCUS_STOPWORDS = new Set([
  ...LOW_SIGNAL_SEARCH_TERMS,
  'cap',
  'carolina',
  'medicaid',
  'nc',
  'policy',
  'policies',
  'program',
  'question',
  'service',
  'services',
]);
const SEARCH_DEBUG = process.env.POLICY_CORPUS_SEARCH_DEBUG === '1';
const SCOPE_SECTION_TERMS = ['scope', 'general', 'introduction', 'purpose', 'policy', 'service criteria'];
const COVERAGE_PRIMARY_TERMS = [
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
const COVERAGE_SUPPORT_TERMS = [
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
const COVERAGE_AVOID_TERMS = ['history', 'revision information', 'table of contents', 'background'];
const REQUIREMENT_QUERY_TERMS = ['requirement', 'requirements', 'documentation', 'document', 'provide'];
const REQUIREMENT_EVIDENCE_TERMS = [
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
const GENERAL_CRITERIA_SECTION_TERMS = [
  'general',
  'eligibility',
  'general criteria',
  'specific criteria covered',
  'criteria covered by medicaid',
  'services covered by medicaid',
];
const COVERAGE_SCOPE_SECTION_TERMS = [
  'scope',
  'description',
  '2.1.1',
  '1.0',
  'general provisions',
  'description of the procedure, product, or service',
];
const ELIGIBILITY_BASELINE_SECTION_TERMS = ['2.1.1', 'general provisions'];
const ELIGIBILITY_SCOPE_SECTION_TERMS = ['1.0', 'description of the procedure, product, or service'];
const COVERAGE_DETAIL_SECTION_TERMS = [
  'services covered by medicaid',
  'specific criteria covered',
  'personal care services',
  'home health services',
  'coverage criteria',
];
const PEDIATRIC_COVERAGE_SECTION_TERMS = [
  'epsdt',
  'under 21 years of age',
  'speech-language therapy',
  'speech -language therapy',
  'audiology therapy',
  'aural rehabilitation',
];
const MODIFICATION_SECTION_TERMS = [
  'equipment, modification and technology',
  'equipment modification and technology',
  'equipment, modification, technology and supplies',
  'home modification',
  'modification and technology',
];
const CONGREGATE_PCS_SUPPORT_SECTION_TERMS = [
  'personal care services',
  'room and board',
  'services not covered',
  'non-covered services',
];
const CONGREGATE_PCS_CRITERIA_SECTION_TERMS = [
  '3.2.1',
  'specific criteria covered by medicaid',
];
const CONGREGATE_PCS_COVERED_SERVICE_SECTION_TERMS = [
  '3.3',
  'personal care services',
];
const CONGREGATE_PCS_NOT_COVERED_SECTION_TERMS = [
  '4.2.1.2',
  'room and board',
];
const COVERAGE_WORKFLOW_AVOID_TERMS = [
  'assessment',
  'admission',
  'expedited',
  'reconsideration',
  'request',
  'appeal',
  'submission',
  'authorization process',
];
const TELEHEALTH_PRIMARY_SECTION_TERMS = [
  'telehealth',
  'virtual communications',
  'remote patient monitoring',
];
const TELEHEALTH_SUPPORT_SECTION_TERMS = [
  'speech/language evaluation',
  'speech/language treatment',
  'telehealth eligible service',
  'speech-language therapy',
  'speech -language therapy',
  'audiology therapy',
];
const TELEHEALTH_DOCUMENTATION_TERMS = [
  'documented',
  'documented findings',
  'documentation',
  'beneficiary need',
  'plan of care',
  'appropriate',
];
const TELEHEALTH_AVOID_TERMS = ['related clinical coverage policies'];
const CERTIFICATION_SECTION_TERMS = [
  'sources of certification',
  'source of certification',
  'timing of certification',
  'certification and recertification of terminal illness',
  'certification',
  'recertification',
  'terminal illness',
];
const HCWD_PRIMARY_SECTION_TERMS = [
  'income',
  'premium',
  'premiums',
  'enrollment fee',
  'income ranges and premium amounts',
];
const HCWD_LIMIT_HISTORY_TERMS = [
  'remove the 150% fpl income limit',
  'only income limit for the hcwd program is the 150% fpl limit on unearned income',
  'regardless of total countable income',
  'remove limits on countable income except for the 150% of federal poverty level',
  'sliding scale premiums',
];
const NOT_COVERED_SECTION_TERMS = [
  'not covered',
  'criteria not covered',
  'specific criteria not covered',
  'services not covered',
  'non-covered',
];
const YES_NO_COVERAGE_SECTION_TERMS = [
  ...GENERAL_CRITERIA_SECTION_TERMS,
  ...NOT_COVERED_SECTION_TERMS,
  'scope',
  'description',
  'general provisions',
];
const PRIOR_AUTH_PRIMARY_TERMS = [
  'prior approval',
  'prior authorization',
  'criteria',
  'prior approval drugs and criteria',
  'drug criteria',
  'medical necessity',
  'coverage criteria',
];
const PRIOR_AUTH_QUANTITY_TERMS = [
  'quantity and episodic drugs',
  'quantity limit',
  'quantity limits',
  'quantity limitation',
  'quantity limitations',
  'episodic drug',
  'episodic drugs',
  'maximum supply',
];
const PRIOR_AUTH_CRITERIA_SECTION_TERMS = [
  'pharmacy prior approval drugs and criteria',
  'prior approval drugs and criteria',
  'pharmacy prior approval criteria',
  'attachment k',
];
const PRIOR_AUTH_SUPPORT_TERMS = ['coverage', 'eligible', 'medical necessity', 'documentation', 'order'];
const PRIOR_AUTH_DOCUMENT_SECTION_TERMS = [
  ...PRIOR_AUTH_PRIMARY_TERMS,
  'pharmacy prior approval drugs and criteria',
  'quantity and episodic drugs',
  'attachment k',
];
const PRIOR_AUTH_PROCESS_SECTION_TERMS = [
  'requesting prior authorization',
  'prior authorization process',
  'retroactive prior authorization',
  'web portal',
  'fax',
  'phone',
  'call center',
];
const PRIOR_AUTH_EXCEPTION_SECTION_TERMS = [
  'exceptions to fda and nc medicaid drug criteria approval',
  'requested drug',
  'peer-reviewed medical literature',
];
const PRIOR_AUTH_AVOID_TERMS = [
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
const AMENDMENT_PRIMARY_TERMS = ['change no', 'revised', 'effective date', 'implementation', 'content of change'];
const AMENDMENT_SUPPORT_TERMS = ['change notice', 'revision', 'policy update', 'summary'];
const FEDERAL_PRIMARY_TERMS = [
  '42 cfr',
  'social security act',
  'section 1902',
  'section 1905',
  'must',
  'defined',
  'definition',
  'includes',
];
const FEDERAL_SUPPORT_TERMS = ['state plan', 'php', 'contract', 'reporting', 'oversight', 'implementation'];
const FEDERAL_DOCUMENT_SUPPORT_TERMS = [
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
const WAIVER_APPLICATION_PRIMARY_TERMS = [
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
const WAIVER_APPLICATION_DOCUMENT_SECTION_TERMS = [
  'basis and scope',
  'contents of request for a waiver',
  'supporting documentation required',
  'request for a waiver',
  '1915(c)',
];
const WAIVER_APPLICATION_AVOID_TERMS = [
  'public notice',
  'comment period',
  'public hearings',
  'disallowance',
  'erroneous state payments',
  'perm review',
];
const WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS = new Set(['440.180', '441.300', '441.301', '441.302', '441.303']);
const MLR_FEDERAL_PRIMARY_SECTION_TERMS = [
  'medical loss ratio',
  'mlr',
  'minimum mlr',
  'calculate and report',
  'numerator',
  'denominator',
];
const MLR_FEDERAL_SUPPORT_SECTION_TERMS = [
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
const MLR_IMPLEMENTATION_SUPPORT_TERMS = [
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
const PEDIATRIC_QUERY_TERMS = ['under 21', 'child', 'children', 'pediatric', 'pediatrics', 'adolescent', 'youth', 'minor'];
const PEDIATRIC_POLICY_TERMS = ['under 21', 'child', 'children', 'pediatric', 'pediatrics'];
const TITLE_CLUSTER_STOPWORDS = new Set([
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
const VARIANT_SETTING_TERMS: Array<{ terms: string[]; titleTerms: string[]; reason: string }> = [
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

interface SectionCandidate {
  sectionId: string;
  score: number;
  reason: string;
}

interface HydratedSectionCandidate {
  section: AnswerFrameSection;
  score: number;
}

interface DocumentCandidate {
  document: DocumentView;
  reason: string;
  score: number;
}

function debugSearch(message: string): void {
  if (SEARCH_DEBUG) {
    console.error(`[policy-corpus] ${message}`);
  }
}

async function timeSearchStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    debugSearch(`${label} took ${Date.now() - startedAt}ms`);
  }
}

function escapeLucene(query: string): string {
  return query.replace(LUCENE_SPECIAL, '\\$&');
}

function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase();
}

function normalizeTitleKey(value: string | null | undefined): string {
  return normalizeSearchText(value).replace(/[:\s]+$/g, '').replace(/\s+/g, ' ').trim();
}

function combineText(...values: Array<string | null | undefined>): string {
  return normalizeSearchText(values.filter(Boolean).join(' '));
}

function includesPhrase(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function scorePhraseMatches(text: string, phrases: readonly string[], weight = 1): number {
  return phrases.reduce((score, phrase) => score + (text.includes(phrase) ? weight : 0), 0);
}

function uniqueBy<T>(items: T[], key: (item: T) => string | null | undefined): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const value = key(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    unique.push(item);
  }
  return unique;
}

function toAnswerFrameDocument(document: DocumentView, reason: string | null): AnswerFrameDocument {
  return {
    ...document,
    reason,
  };
}

function toAnswerFrameSection(section: SectionView, reason: string | null): AnswerFrameSection {
  return {
    ...section,
    reason,
  };
}

function isPriorAuthorizationQuery(queryLower: string): boolean {
  return (
    queryLower.includes('prior authorization') ||
    queryLower.includes('prior approval') ||
    queryLower.includes('prior auth') ||
    (queryLower.includes('pa ') && queryLower.includes('criteria'))
  );
}

function isReimbursementQuery(queryLower: string): boolean {
  return includesAnyTerm(queryLower, [
    'reimbursement',
    'rate ',
    ' rates',
    'fee schedule',
    'fee schedules',
    'allowed amount',
    'allowed amounts',
    'hcpcs',
    'cpt',
    'payment amount',
    'payments',
  ]);
}

function extractRequestedYears(query: string): string[] {
  return Array.from(new Set(query.match(YEAR_QUERY_RE) ?? []));
}

function isHistoricalReimbursementQuery(queryLower: string, requestedYears: string[]): boolean {
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

function variantDateMatchesRequestedYear(variantDate: string | null, requestedYears: string[]): boolean {
  if (!variantDate || requestedYears.length === 0) return false;
  return requestedYears.includes(variantDate.slice(0, 4));
}

function isBillingWorkflowQuery(queryLower: string): boolean {
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

function isManagedCareOperationsQuery(queryLower: string): boolean {
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

function isManagedCareContractQuery(queryLower: string): boolean {
  return (
    queryLower.includes('contract') ||
    queryLower.includes('contracts') ||
    queryLower.includes('contracting') ||
    queryLower.includes('exhibit') ||
    (queryLower.includes('obligation') && isManagedCareOperationsQuery(queryLower))
  );
}

function isOperationalRoutingQuery(queryLower: string): boolean {
  return (
    isReimbursementQuery(queryLower) ||
    isBillingWorkflowQuery(queryLower) ||
    isManagedCareOperationsQuery(queryLower)
  );
}

function isCoverageQuestion(queryLower: string): boolean {
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

function isClinicalCriteriaLifecycleQuery(queryLower: string): boolean {
  return (
    queryLower.includes('entrance criteria') ||
    queryLower.includes('continued service') ||
    queryLower.includes('continued services') ||
    queryLower.includes('continued stay') ||
    queryLower.includes('discharge criteria')
  );
}

function isTelehealthQuery(queryLower: string): boolean {
  return queryLower.includes('telehealth');
}

function asksForTelehealthServiceList(queryLower: string): boolean {
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

function isCongregatePcsQuery(queryLower: string): boolean {
  return (
    includesPhrase(queryLower, ['personal care services', 'pcs']) &&
    includesPhrase(queryLower, ['assisted living', 'congregate', 'adult care home', 'group home'])
  );
}

function isAmbulanceNotCoveredQuery(queryLower: string): boolean {
  return queryLower.includes('ambulance') && asksForNotCoveredDetails(queryLower);
}

function isPharmacyQuantityPriorAuthQuery(queryLower: string): boolean {
  return (
    isDeterministicPriorAuthQuery(queryLower) &&
    includesPhrase(queryLower, ['pharmacy', 'pharmacy claims', 'prescription drug', 'prescription drugs', 'drug', 'drugs'])
  );
}

function asksForPriorAuthSubmissionProcess(queryLower: string): boolean {
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

function isHcwdIncomePremiumQuery(queryLower: string): boolean {
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

function asksForEarnedIncomeLimit(queryLower: string): boolean {
  return (
    queryLower.includes('earned income') &&
    includesPhrase(queryLower, ['maximum', 'limit', 'income limit', 'cap'])
  );
}

function isRequirementDetailQuery(queryLower: string): boolean {
  return includesPhrase(queryLower, REQUIREMENT_QUERY_TERMS);
}

function isEligibilityCriteriaQuery(queryLower: string): boolean {
  return queryLower.includes('eligibility criteria') || queryLower.includes('general eligibility');
}

function asksForGeneralCriteria(queryLower: string): boolean {
  return queryLower.includes('general criteria');
}

function isYesNoCoverageQuery(queryLower: string): boolean {
  return /^(does|is|can)\b/.test(queryLower) && /\bcover\b/.test(queryLower);
}

function asksForNotCoveredDetails(queryLower: string): boolean {
  return queryLower.includes('not covered') || queryLower.includes('not cover');
}

function isPolicyVariantQuery(queryLower: string): boolean {
  const explicitPolicies = extractExplicitPolicyNumbers(queryLower);
  return explicitPolicies.length >= 2 || queryLower.includes('difference between') || queryLower.includes('vs ');
}

function asksForHistory(queryLower: string): boolean {
  return queryLower.includes('history') || queryLower.includes('older') || queryLower.includes('previous');
}

function asksForImplementation(queryLower: string): boolean {
  return (
    queryLower.includes('north carolina') ||
    /\bnc\b/.test(queryLower) ||
    queryLower.includes('implementation') ||
    queryLower.includes('managed care') ||
    queryLower.includes('php') ||
    queryLower.includes('contract')
  );
}

function isWaiverApplicationQuery(queryLower: string): boolean {
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

function asksForPublicNoticeDetails(queryLower: string): boolean {
  return (
    queryLower.includes('public notice') ||
    queryLower.includes('comment period') ||
    queryLower.includes('public hearing') ||
    queryLower.includes('hearing') ||
    queryLower.includes('notice and comment')
  );
}

function asksForCertificationDetails(queryLower: string): boolean {
  return (
    queryLower.includes('certification') ||
    queryLower.includes('recertification') ||
    queryLower.includes('certify') ||
    queryLower.includes('terminally ill') ||
    queryLower.includes('terminal illness')
  );
}

function isMlrQuery(queryLower: string): boolean {
  return queryLower.includes('medical loss ratio') || /\bmlr\b/.test(queryLower);
}

function isPediatricQuery(queryLower: string): boolean {
  return includesPhrase(queryLower, PEDIATRIC_QUERY_TERMS);
}

function isPediatricPolicyHit(hit: CorpusRetrievalHit): boolean {
  return includesPhrase(buildHitText(hit), PEDIATRIC_POLICY_TERMS);
}

function isTitleOnlySection(section: Pick<AnswerFrameSection, 'content'>): boolean {
  return (section.content?.trim().length ?? 0) === 0;
}

function isPriorAuthQuantitySection(section: AnswerFrameSection): boolean {
  const text = combineText(section.sectionNumber, section.title, section.content);
  return normalizeSearchText(section.sectionNumber) === '5.4.3' || includesPhrase(text, PRIOR_AUTH_QUANTITY_TERMS);
}

function isPriorAuthCriteriaSection(section: AnswerFrameSection): boolean {
  return includesPhrase(combineText(section.sectionNumber, section.title, section.content), PRIOR_AUTH_CRITERIA_SECTION_TERMS);
}

function isPriorAuthProcessSection(section: AnswerFrameSection): boolean {
  return includesPhrase(combineText(section.sectionNumber, section.title, section.content), PRIOR_AUTH_PROCESS_SECTION_TERMS);
}

function isPriorAuthExceptionSection(section: AnswerFrameSection): boolean {
  return normalizeSearchText(section.sectionNumber) === '3.2.3'
    || includesPhrase(combineText(section.sectionNumber, section.title, section.content), PRIOR_AUTH_EXCEPTION_SECTION_TERMS);
}

function extractTitleClusterTerms(title: string | null | undefined): string[] {
  const tokens = normalizeSearchText(title).match(/[a-z0-9]+/g) ?? [];
  return dedupeTerms(
    tokens.filter((token) => token.length >= 4 && !TITLE_CLUSTER_STOPWORDS.has(token)),
  );
}

function isCoverageLimitationText(text: string): boolean {
  return includesPhrase(text, ['not covered', 'limitation', 'limitations', 'exclusion']);
}

function isCoverageBoilerplateTitle(title: string | null | undefined): boolean {
  const normalized = normalizeSearchText(title);
  return (
    isBoilerplateTitle(title ?? null) ||
    normalized.startsWith('i understand') ||
    normalized.startsWith('i agree') ||
    normalized.startsWith('revision information')
  );
}

function detectAnswerQuestionType(
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

function buildAnswerRoute({
  lane,
  rationale,
  wideningPolicy,
  numericEvidenceOnly = false,
  latestRevisionOnly = false,
  citeScopeAndNotCovered = false,
}: {
  lane: AnswerFrameRoute['lane'];
  rationale: string;
  wideningPolicy: AnswerFrameRoute['widening_policy'];
  numericEvidenceOnly?: boolean;
  latestRevisionOnly?: boolean;
  citeScopeAndNotCovered?: boolean;
}): AnswerFrameRoute {
  return {
    lane,
    rationale,
    widening_policy: wideningPolicy,
    determinism_hints: {
      numeric_evidence_only: numericEvidenceOnly,
      latest_revision_only: latestRevisionOnly,
      cite_scope_and_not_covered: citeScopeAndNotCovered,
    },
  };
}

function isDeterministicCoverageQuery(queryLower: string): boolean {
  return (
    isHcwdIncomePremiumQuery(queryLower) ||
    includesPhrase(queryLower, ['premium', 'premiums', 'enrollment fee', 'cost sharing']) ||
    (
      queryLower.includes('income') &&
      includesPhrase(queryLower, ['maximum', 'limit', 'cap', 'threshold', 'fpl'])
    )
  );
}

function isDeterministicPriorAuthQuery(queryLower: string): boolean {
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

function selectAnswerRoute(queryLower: string, questionType: AnswerQuestionType): AnswerFrameRoute {
  const citeScopeAndNotCovered = questionType === 'coverage' && isYesNoCoverageQuery(queryLower);

  switch (questionType) {
    case 'federal_authority':
      return buildAnswerRoute({
        lane: 'graph_reasoning',
        rationale: 'federal_multi_hop',
        wideningPolicy: 'family_expansion',
      });
    case 'policy_variant':
      return buildAnswerRoute({
        lane: 'graph_reasoning',
        rationale: 'policy_variant_resolution',
        wideningPolicy: 'family_expansion',
      });
    case 'amendment':
      if (isLatestChangeNoticeQuery(queryLower) && !asksForHistory(queryLower)) {
        return buildAnswerRoute({
          lane: 'deterministic_evidence',
          rationale: 'latest_revision_marker',
          wideningPolicy: 'none',
          latestRevisionOnly: true,
        });
      }
      return buildAnswerRoute({
        lane: 'graph_reasoning',
        rationale: 'amendment_history',
        wideningPolicy: 'family_expansion',
      });
    case 'prior_authorization':
      if (isDeterministicPriorAuthQuery(queryLower)) {
        return buildAnswerRoute({
          lane: 'deterministic_evidence',
          rationale: 'numeric_thresholds',
          wideningPolicy: 'one_step',
          numericEvidenceOnly: true,
        });
      }
      return buildAnswerRoute({
        lane: 'baseline_hybrid',
        rationale: 'single_document_prior_auth',
        wideningPolicy: 'one_step',
      });
    case 'coverage':
      if (isDeterministicCoverageQuery(queryLower)) {
        return buildAnswerRoute({
          lane: 'deterministic_evidence',
          rationale: 'numeric_thresholds',
          wideningPolicy: 'none',
          numericEvidenceOnly: true,
          citeScopeAndNotCovered,
        });
      }
      return buildAnswerRoute({
        lane: 'baseline_hybrid',
        rationale: 'single_document_coverage',
        wideningPolicy: 'one_step',
        citeScopeAndNotCovered,
      });
    default:
      return buildAnswerRoute({
        lane: 'baseline_hybrid',
        rationale: 'default_general',
        wideningPolicy: 'none',
      });
  }
}

function isUsefulSearchTerm(term: string): boolean {
  if (!term || SEARCH_STOPWORDS.has(term)) return false;
  if (term.length >= 3) return true;
  return /\d/.test(term);
}

function dedupeTerms(terms: string[]): string[] {
  return Array.from(new Set(terms.filter((term) => term.length > 0)));
}

function expandSearchToken(token: string): string[] {
  const variants = [token];
  if (token.endsWith('ies') && token.length > 4) {
    variants.push(`${token.slice(0, -3)}y`);
  } else if (token.endsWith('s') && token.length > 4) {
    variants.push(token.slice(0, -1));
  }
  return variants;
}

function extractSearchTerms(query: string): string[] {
  const rawTokens = normalizeSearchText(query).match(/[a-z0-9]+(?:[/-][a-z0-9]+)*/g) ?? [];
  const orderedTokens = rawTokens
    .flatMap((token) => [token, ...token.split(/[/-]+/)])
    .flatMap(expandSearchToken)
    .filter(isUsefulSearchTerm);
  const tokens = dedupeTerms(orderedTokens);
  const phrases: string[] = [];
  for (let index = 0; index < orderedTokens.length - 1; index++) {
    const left = orderedTokens[index];
    const right = orderedTokens[index + 1];
    if (!left || !right) continue;
    const phrase = `${left} ${right}`;
    if (phrase.length >= 7) {
      phrases.push(phrase);
    }
  }

  const expandedTerms = [...tokens, ...phrases];
  const queryLower = normalizeSearchText(query);
  if (queryLower.includes('multidisciplinary team')) {
    expandedTerms.push('mdt');
  }

  return dedupeTerms(expandedTerms).slice(0, MAX_QUERY_TERMS);
}

function extractProcedureCodeTerms(query: string): string[] {
  return dedupeTerms(Array.from(query.toUpperCase().matchAll(/\b(?:[A-Z]\d{4}[A-Z]?|\d{5})\b/g), (match) => match[0] ?? ''));
}

function extractServiceFocusTerms(query: string): string[] {
  return extractSearchTerms(query).filter(
    (term) => term.length >= 4 && !SERVICE_FOCUS_STOPWORDS.has(term) && !/^\d/.test(term),
  );
}

function extractQuotedPhrases(query: string): string[] {
  return Array.from(query.matchAll(/["']([^"']{3,})["']/g), (match) => normalizeSearchText(match[1] ?? '').trim()).filter(
    (phrase) => phrase.length > 0,
  );
}

function countPhraseMatches(text: string | null | undefined, phrases: string[]): number {
  const haystack = normalizeSearchText(text);
  if (!haystack) return 0;
  return phrases.reduce((count, phrase) => count + (haystack.includes(phrase) ? 1 : 0), 0);
}

function countProcedureCodeMatches(text: string | null | undefined, codes: string[]): number {
  const haystack = (text ?? '').toUpperCase();
  if (!haystack) return 0;
  return codes.reduce((count, code) => count + (haystack.includes(code) ? 1 : 0), 0);
}

function buildQueryFocusTerms(query: string, limit = MAX_QUERY_TERMS): string[] {
  return dedupeTerms([...extractQuotedPhrases(query), ...extractSearchTerms(query)])
    .filter((term) => term.length >= 4 || term.includes(' '))
    .slice(0, limit);
}

function buildFocusedFederalQuery(query: string): string | null {
  const focusedTerms = buildQueryFocusTerms(query, 10);
  if (focusedTerms.length === 0) return null;
  return focusedTerms.join(' ');
}

function extractExplicitPolicyNumbers(query: string): string[] {
  const matches = [
    ...(query.match(/\b\d+[A-Za-z](?:-[A-Za-z0-9]+)?\b/g) ?? []),
    ...(query.match(/\b(?:MA|DMA|DHB|DSS)-\d+[A-Za-z0-9-]*\b/gi) ?? []),
  ];
  return dedupeTerms(matches.map((match) => match.toUpperCase()));
}

function extractAliasedPolicyNumbers(queryLower: string): string[] {
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

function scoreTermMatches(terms: string[], text: string | null | undefined): number {
  const haystack = normalizeSearchText(text);
  if (!haystack) return 0;

  let score = 0;
  for (const term of terms) {
    if (!haystack.includes(term)) continue;

    let weight = 1;
    if (term.includes(' ')) {
      weight *= PHRASE_MATCH_WEIGHT;
    }
    if (LOW_SIGNAL_SEARCH_TERMS.has(term)) {
      weight *= LOW_SIGNAL_TERM_WEIGHT;
    }

    score += weight;
  }

  return score;
}

function queryMentionsPolicyNumber(queryLower: string, policyNumber: string | null): boolean {
  if (!policyNumber) return false;
  return queryLower.includes(normalizeSearchText(policyNumber));
}

function isFederalAuthorityQuery(queryLower: string): boolean {
  return (
    queryLower.includes('federal') ||
    queryLower.includes('statutory') ||
    queryLower.includes('social security act') ||
    queryLower.includes('cfr') ||
    (queryLower.includes('waiver') && queryLower.includes('application'))
  );
}

function isChangeNoticeQuery(queryLower: string): boolean {
  return (
    queryLower.includes('change notice') ||
    queryLower.includes('most recent') ||
    queryLower.includes('amended') ||
    queryLower.includes('amendment')
  );
}

function isLatestChangeNoticeQuery(queryLower: string): boolean {
  return (
    isChangeNoticeQuery(queryLower) &&
    (queryLower.includes('most recent') || queryLower.includes('latest') || queryLower.includes('current'))
  );
}

function isBoilerplateTitle(title: string | null): boolean {
  return BOILERPLATE_SECTION_TITLES.has(normalizeTitleKey(title));
}

function isAttachmentTitle(title: string | null): boolean {
  return normalizeTitleKey(title).startsWith('attachment ');
}

function isGenericSectionTitle(title: string | null): boolean {
  const normalized = normalizeTitleKey(title);
  return normalized === 'related clinical coverage policies' || normalized === 'information';
}

function isCoverageProcessTitle(title: string | null | undefined): boolean {
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

function isCoverageAdministrativeTitle(title: string | null | undefined): boolean {
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

function isTelehealthServiceTableSection(section: AnswerFrameSection): boolean {
  const text = combineText(section.title, section.content);
  return (
    includesPhrase(text, ['telehealth eligible service', 'speech/language evaluation', 'speech/language treatment']) &&
    !section.sectionNumber
  );
}

function isRevisionHeaderTitle(title: string | null): boolean {
  const normalized = normalizeSearchText(title);
  return normalized.includes('change no.') || normalized.includes('change no') || normalized.includes('revised');
}

function includesCalendarYear(text: string | null | undefined): boolean {
  return /\b20\d{2}\b/.test(normalizeSearchText(text));
}

function isAdministrativeFormTitle(title: string | null | undefined): boolean {
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

function isHcwdProcessTitle(title: string | null | undefined): boolean {
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

function isYearSpecificPremiumTitle(title: string | null | undefined): boolean {
  const normalized = normalizeSearchText(title);
  return normalized.includes('premium') && includesCalendarYear(normalized);
}

function extractChangeMarkerValue(text: string | null | undefined): number | null {
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

function changeMarkerValueForHit(hit: CorpusRetrievalHit): number | null {
  return extractChangeMarkerValue(hit.sectionTitle) ?? extractChangeMarkerValue(hit.documentTitle);
}

function includesAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function isOperationalSourceHit(hit: CorpusRetrievalHit): boolean {
  return (
    hit.answerRole === 'billing' ||
    hit.answerRole === 'reimbursement' ||
    hit.answerRole === 'managed_care' ||
    hit.answerRole === 'managed_care_contract'
  );
}

function defaultTypeGroupsForQuery(queryLower: string): string[][] {
  return isOperationalRoutingQuery(queryLower)
    ? [...BASE_TYPE_GROUPS, ...OPERATIONAL_TYPE_GROUPS]
    : BASE_TYPE_GROUPS;
}

function federalImplementationDocumentTypes(queryLower: string): string[] {
  const documentTypes = ['state_plan_amendment', 'dhhs_policy', 'clinical_policy', 'waiver', 'provider_manual'];
  if (isMlrQuery(queryLower) || isManagedCareOperationsQuery(queryLower)) {
    documentTypes.push('managed_care_contract');
  }
  return documentTypes;
}

function buildFederalImplementationSectionTerms(queryLower: string, focusTerms: string[]): string[] {
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

function retrievalDocumentMetadataReturn(alias: string): string {
  return `${alias}.authority_tier AS authorityTier,
               ${alias}.answer_role AS answerRole,
               ${alias}.source_format AS sourceFormat,
               ${alias}.answer_ready AS answerReady,
               ${alias}.corpus_bucket AS corpusBucket,
               ${alias}.variant_group AS variantGroup,
               ${alias}.variant_date AS variantDate,
               ${alias}.retrieval_ready AS retrievalReady,`;
}

function isModificationReviewQuery(queryLower: string): boolean {
  return (
    includesAnyTerm(queryLower, ['home modification', 'home modifications', 'equipment', 'technology', 'modification']) &&
    includesAnyTerm(queryLower, ['multidisciplinary team', 'mdt'])
  );
}

function computePerGroupK(topK: number, hasExplicitDocumentTypes: boolean): number {
  const multiplier = hasExplicitDocumentTypes ? EXPLICIT_PER_GROUP_MULTIPLIER : DEFAULT_PER_GROUP_MULTIPLIER;
  const minimum = hasExplicitDocumentTypes ? MIN_EXPLICIT_PER_GROUP_K : MIN_DEFAULT_PER_GROUP_K;
  return Math.min(Math.max(topK * multiplier, minimum), MAX_PER_GROUP_K);
}

function documentKeyForHit(hit: CorpusRetrievalHit): string | null {
  const key = [hit.documentType ?? '', hit.policyNumber ?? '', hit.documentTitle ?? '']
    .map((part) => part.trim())
    .join('::');
  return key.replace(/:+/g, '').trim().length > 0 ? key : null;
}

function computeDocumentCoverageBoosts(hits: CorpusRetrievalHit[], queryTerms: string[]): Map<string, number> {
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

function selectDocumentTitlesForExpansion(
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

function rerankRetrievalHit(
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

function recordToRetrievalHit(record: SessionRecordLike): CorpusRetrievalHit {
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

function retrievalHitToSearchHit(hit: CorpusRetrievalHit): SearchHit {
  return {
    sectionId: hit.sectionId,
    title: hit.sectionTitle,
    policyNumber: hit.policyNumber,
    documentType: hit.documentType,
    contentSnippet: hit.content ? hit.content.slice(0, SEARCH_SNIPPET_CHARS) : null,
    score: hit.score,
  };
}

function mapSectionContextEntry(record: SessionRecordLike): SectionContextEntry {
  return {
    id: record.get('id') as string,
    title: (record.get('title') as string | null | undefined) ?? null,
    sectionNumber: (record.get('sectionNumber') as string | null | undefined) ?? null,
  };
}

function mapDocumentSections(rawSections: Array<{
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

function buildSectionView(record: SessionRecordLike, content: string | null): SectionView {
  const documentTitle = (record.get('documentTitle') as string | null | undefined) ?? null;
  const url = (record.get('url') as string | null | undefined) ?? null;
  return {
    id: record.get('id') as string,
    title: (record.get('title') as string | null | undefined) ?? null,
    sectionNumber: (record.get('sectionNumber') as string | null | undefined) ?? null,
    content,
    effectiveDate: (record.get('effectiveDate') as string | null | undefined) ?? null,
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

function truncateContent(content: string | null): string | null {
  if (!content || content.length <= MAX_CONTENT_CHARS) return content;
  return `${content.slice(0, MAX_CONTENT_CHARS)}\n\n[Content truncated at 6,000 chars. Use getSectionContext to explore sub-sections.]`;
}

function buildHitText(hit: CorpusRetrievalHit): string {
  return combineText(hit.sectionTitle, hit.documentTitle, hit.policyNumber, hit.content);
}

function collectPolicyNumbersForQuery(query: string): string[] {
  const queryLower = normalizeSearchText(query);
  const aliasedPolicyNumbers = isFederalAuthorityQuery(queryLower) ? [] : extractAliasedPolicyNumbers(queryLower);
  return dedupeTerms([...extractExplicitPolicyNumbers(query), ...aliasedPolicyNumbers]);
}

function buildSectionCandidates(
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

function extractDocumentView(document: DocumentWithSectionsView): DocumentView {
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

function pickDocumentSectionsByTitle(
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

function sectionNumberDepth(sectionNumber: string | null | undefined): number {
  const normalized = normalizeSearchText(sectionNumber);
  if (normalized.length === 0) return 0;
  return normalized.split('.').filter((segment) => segment.length > 0).length;
}

function isLikelyCoverageLimitationSectionNumber(sectionNumber: string | null | undefined): boolean {
  return /^4(\.|$)/.test(normalizeSearchText(sectionNumber));
}

function pickLikelyCoverageLimitationSections(
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

function describeLatestRevision(section: SectionView | null, document: DocumentView | null): string | null {
  return section?.title ?? document?.title ?? null;
}

function buildEmptyAnswerFrame(questionType: AnswerQuestionType, route?: AnswerFrameRoute): AnswerFrame {
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

function pickTopDocumentCandidates(candidates: DocumentCandidate[], limit = FRAME_DOCUMENT_LIMIT): AnswerFrameDocument[] {
  return uniqueBy(
    candidates.sort((left, right) => right.score - left.score),
    (candidate) => candidate.document.id,
  )
    .slice(0, limit)
    .map((candidate) => toAnswerFrameDocument(candidate.document, candidate.reason));
}

function scoreVariantDocument(document: DocumentWithSectionsView, queryLower: string, policyNumbers: string[]): DocumentCandidate {
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

function scoreHcwdCoverageDocument(document: DocumentWithSectionsView, queryLower: string): number {
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

function narrowHcwdCoverageDocuments(query: string, documents: DocumentWithSectionsView[]): DocumentWithSectionsView[] {
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

function policyFamilyKey(policyNumber: string | null | undefined): string | null {
  if (!policyNumber) return null;
  return policyNumber.toUpperCase().replace(/-[A-Z0-9]+$/g, '');
}

function looksLikeSiblingPolicySet(documents: DocumentWithSectionsView[]): boolean {
  const families = dedupeTerms(
    documents.map((document) => policyFamilyKey(document.policyNumber)).filter((family): family is string => Boolean(family)),
  );
  if (families.length === 0) return false;

  return families.some((family) => documents.filter((document) => policyFamilyKey(document.policyNumber) === family).length > 1);
}

function narrowInferredCoverageDocuments(documents: DocumentWithSectionsView[]): DocumentWithSectionsView[] {
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

function scoreHitForQueryFocus(
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

function rankHitsByQueryFocus(
  hits: CorpusRetrievalHit[],
  focusTerms: string[],
  quotedPhrases: string[],
): CorpusRetrievalHit[] {
  return [...hits].sort(
    (left, right) =>
      scoreHitForQueryFocus(right, focusTerms, quotedPhrases) - scoreHitForQueryFocus(left, focusTerms, quotedPhrases),
  );
}

function selectPreferredDocumentTitlesByFocus(
  hits: CorpusRetrievalHit[],
  focusTerms: string[],
  quotedPhrases: string[],
  maxDocuments = 2,
  scoreWindow = 0.1,
): string[] {
  const bestByDocumentTitle = new Map<string, number>();
  for (const hit of hits) {
    if (!hit.documentTitle) continue;
    const score = scoreHitForQueryFocus(hit, focusTerms, quotedPhrases);
    const existing = bestByDocumentTitle.get(hit.documentTitle);
    bestByDocumentTitle.set(hit.documentTitle, existing == null ? score : Math.max(existing, score));
  }

  const ranked = Array.from(bestByDocumentTitle.entries()).sort((left, right) => right[1] - left[1]);
  if (ranked.length === 0) return [];

  const topScore = ranked[0]?.[1] ?? 0;
  return ranked
    .filter(([, score], index) => index === 0 || (index < maxDocuments && score >= topScore - scoreWindow))
    .slice(0, maxDocuments)
    .map(([title]) => title);
}

function filterHitsToFocusedContent(
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

function isAllowedConceptRelationship(relationshipType: string): boolean {
  return (ALLOWED_CONCEPT_RELATIONSHIPS as readonly string[]).includes(relationshipType);
}

export function createNeo4jPolicyCorpus({
  withSession,
  embedQuery,
  defaultTopK = 10,
}: PolicyCorpusDependencies): PolicyCorpus {
  const searchSectionsDetailed = async (input: SearchSectionsInput): Promise<CorpusRetrievalHit[]> => {
    const topK = Math.round(input.topK ?? defaultTopK);
    const queryLower = normalizeSearchText(input.query);
    const queryTerms = extractSearchTerms(input.query);
    const procedureCodes = extractProcedureCodeTerms(input.query);
    const requestedYears = extractRequestedYears(input.query);
    const aliasedPolicyNumbers = isFederalAuthorityQuery(queryLower) ? [] : extractAliasedPolicyNumbers(queryLower);
    const explicitPolicyNumbers = dedupeTerms([
      ...extractExplicitPolicyNumbers(input.query),
      ...aliasedPolicyNumbers,
    ]);
    debugSearch(`search start query="${input.query}" topK=${topK}`);
    const embedding = await timeSearchStep('embed query', () => embedQuery(input.query));

    return withSession(async (session) => {
      const typeGroups =
        input.documentTypes && input.documentTypes.length > 0
          ? [input.documentTypes]
          : defaultTypeGroupsForQuery(queryLower);
      const perGroupK = computePerGroupK(topK, Boolean(input.documentTypes && input.documentTypes.length > 0));
      debugSearch(`typeGroups=${typeGroups.map((group) => group.join('+')).join(',')} perGroupK=${perGroupK}`);

      const vectorHits: CorpusRetrievalHit[] = [];
      for (const docTypes of typeGroups) {
        const result = await timeSearchStep(`section vector ${docTypes.join('+')}`, () =>
          session.run(
            `CALL db.index.vector.queryNodes('section_embeddings', toInteger($k), $embedding)
             YIELD node AS s, score
             MATCH (d:Document)-[:HAS_SECTION]->(s)
             WHERE d.document_type IN $docTypes
             RETURN
               s.id AS sectionId,
               s.section_number AS sectionNumber,
               s.title AS sectionTitle,
               d.title AS documentTitle,
               d.policy_number AS policyNumber,
               d.document_type AS documentType,
               ${retrievalDocumentMetadataReturn('d')}
               s.content_text AS content,
               score
             ORDER BY score DESC
             LIMIT toInteger($k)`,
            { embedding, k: perGroupK, docTypes },
          ),
        );
        vectorHits.push(...result.records.map(recordToRetrievalHit));
      }

      const chunkHits: CorpusRetrievalHit[] = [];
      for (const docTypes of typeGroups) {
        try {
          const result = await timeSearchStep(`chunk vector ${docTypes.join('+')}`, () =>
            session.run(
              `CALL db.index.vector.queryNodes('chunk_embeddings', toInteger($k), $embedding)
               YIELD node AS c, score
               MATCH (s:Section)-[:HAS_CHUNK]->(c)
               MATCH (d:Document)-[:HAS_SECTION]->(s)
               WHERE d.document_type IN $docTypes
               RETURN
                 s.id AS sectionId,
                 s.section_number AS sectionNumber,
                 s.title AS sectionTitle,
                 d.title AS documentTitle,
                 d.policy_number AS policyNumber,
                 d.document_type AS documentType,
                 ${retrievalDocumentMetadataReturn('d')}
                 s.content_text AS content,
                 score
               ORDER BY score DESC
               LIMIT toInteger($k)`,
              { embedding, k: perGroupK, docTypes },
            ),
          );
          chunkHits.push(...result.records.map(recordToRetrievalHit));
        } catch {
          // chunk_embeddings index may not exist.
        }
      }

      const conceptHits: CorpusRetrievalHit[] = [];
      try {
        const result = await timeSearchStep('concept hits', () =>
          session.run(
            `MATCH (c:PolicyConcept)
             WHERE toLower($query) CONTAINS toLower(c.name)
                OR ANY(alias IN c.aliases WHERE toLower($query) CONTAINS toLower(alias))
             WITH c LIMIT 2
             MATCH (s:Section)-[:COVERS|DEFINES|RESTRICTS]->(c)
             MATCH (d:Document)-[:HAS_SECTION]->(s)
             WHERE s.content_length > 200
               AND s.section_number IS NOT NULL
             ${input.documentTypes && input.documentTypes.length > 0 ? 'AND d.document_type IN $docTypes' : ''}
             RETURN
               s.id AS sectionId,
               s.section_number AS sectionNumber,
               s.title AS sectionTitle,
               d.title AS documentTitle,
               d.policy_number AS policyNumber,
               d.document_type AS documentType,
               ${retrievalDocumentMetadataReturn('d')}
               s.content_text AS content,
               ${CONCEPT_MATCH_SCORE} AS score
             ORDER BY s.content_length DESC
             LIMIT toInteger($k)`,
            {
              query: input.query,
              k: Math.min(topK, 5),
              docTypes: input.documentTypes ?? [],
            },
          ),
        );
        conceptHits.push(...result.records.map(recordToRetrievalHit));
      } catch {
        // Concept matching is best effort.
      }

      const keywordHits: CorpusRetrievalHit[] = [];
      if (queryTerms.length > 0) {
        for (const docTypes of typeGroups) {
          try {
            const sectionResult = await timeSearchStep(`section keyword ${docTypes.join('+')}`, () =>
              session.run(
                `MATCH (d:Document)-[:HAS_SECTION]->(s:Section)
                 WHERE d.document_type IN $docTypes
                   AND s.content_length > 0
                 WITH d, s,
                      reduce(
                        keywordScore = 0,
                        term IN $terms |
                        keywordScore +
                        CASE
                          WHEN toLower(coalesce(s.title, '')) CONTAINS term THEN 3
                          ELSE 0
                        END +
                        CASE
                          WHEN toLower(coalesce(s.content_text, '')) CONTAINS term THEN 1
                          ELSE 0
                        END +
                        CASE
                          WHEN toLower(coalesce(d.title, '')) CONTAINS term THEN 2
                          ELSE 0
                        END +
                        CASE
                          WHEN toLower(coalesce(d.policy_number, '')) CONTAINS term THEN 3
                          ELSE 0
                        END
                      ) AS keywordScore
                 WHERE keywordScore > 0
                 RETURN
                   s.id AS sectionId,
                   s.section_number AS sectionNumber,
                   s.title AS sectionTitle,
                   d.title AS documentTitle,
                   d.policy_number AS policyNumber,
                   d.document_type AS documentType,
                   ${retrievalDocumentMetadataReturn('d')}
                   s.content_text AS content,
                   (${SECTION_KEYWORD_BASE_SCORE} + keywordScore * ${SECTION_KEYWORD_WEIGHT}) AS score
                 ORDER BY keywordScore DESC, s.content_length DESC
                 LIMIT toInteger($k)`,
                {
                  docTypes,
                  terms: queryTerms,
                  k: perGroupK,
                },
              ),
            );
            keywordHits.push(...sectionResult.records.map(recordToRetrievalHit));

            const result = await timeSearchStep(`document keyword ${docTypes.join('+')}`, () =>
              session.run(
                `MATCH (d:Document)
                 WHERE d.document_type IN $docTypes
                 WITH d,
                      reduce(
                        docScore = 0,
                        term IN $terms |
                        docScore +
                        CASE
                          WHEN toLower(coalesce(d.title, '')) CONTAINS term THEN 2
                          ELSE 0
                        END +
                        CASE
                          WHEN toLower(coalesce(d.policy_number, '')) CONTAINS term THEN 3
                          ELSE 0
                        END
                      ) AS docScore
                 WHERE docScore > 0
                 ORDER BY docScore DESC, coalesce(d.effective_date, '') DESC, d.id ASC
                 LIMIT toInteger($docLimit)
                 MATCH (d)-[:HAS_SECTION]->(s:Section)
                 WHERE s.content_length > 0
                 WITH d, s, docScore,
                      reduce(
                        sectionScore = 0,
                        term IN $terms |
                        sectionScore +
                        CASE
                          WHEN toLower(coalesce(s.title, '')) CONTAINS term THEN 3
                          ELSE 0
                        END +
                        CASE
                          WHEN toLower(coalesce(s.content_text, '')) CONTAINS term THEN 1
                          ELSE 0
                        END
                      ) AS sectionScore
                 WHERE sectionScore > 0
                 RETURN
                   s.id AS sectionId,
                   s.section_number AS sectionNumber,
                   s.title AS sectionTitle,
                   d.title AS documentTitle,
                   d.policy_number AS policyNumber,
                   d.document_type AS documentType,
                   ${retrievalDocumentMetadataReturn('d')}
                   s.content_text AS content,
                   (${DOCUMENT_KEYWORD_BASE_SCORE} + docScore * ${DOCUMENT_KEYWORD_DOC_WEIGHT} + sectionScore * ${DOCUMENT_KEYWORD_SECTION_WEIGHT}) AS score
                 ORDER BY score DESC
                 LIMIT toInteger($k)`,
                {
                  docTypes,
                  terms: queryTerms,
                  docLimit: Math.min(DOCUMENT_KEYWORD_DOC_LIMIT, perGroupK),
                  k: perGroupK,
                },
              ),
            );
            keywordHits.push(...result.records.map(recordToRetrievalHit));
          } catch {
            // Keyword fallback is best effort.
          }
        }

        if (isChangeNoticeQuery(queryLower)) {
          for (const docTypes of typeGroups) {
            try {
              const result = await timeSearchStep(`amendment context ${docTypes.join('+')}`, () =>
                session.run(
                  `MATCH (amend:Document)-[:AMENDS]->(base:Document)
                   WHERE amend.document_type IN $docTypes
                      OR base.document_type IN $docTypes
                   WITH amend, base,
                        reduce(
                          docScore = 0,
                          term IN $terms |
                          docScore +
                          CASE
                            WHEN toLower(coalesce(amend.title, '')) CONTAINS term THEN 2
                            ELSE 0
                          END +
                          CASE
                            WHEN toLower(coalesce(base.title, '')) CONTAINS term THEN 1
                            ELSE 0
                          END
                        ) AS docScore
                   WHERE docScore > 0
                   ORDER BY docScore DESC, coalesce(amend.effective_date, '') DESC, amend.id ASC
                   LIMIT toInteger($docLimit)
                   MATCH (base)-[:HAS_SECTION]->(s:Section)
                   WHERE s.content_length > 0
                   WITH base, s, docScore,
                        CASE
                          WHEN toLower(coalesce(s.title, '')) CONTAINS 'implementation' THEN 3
                          WHEN toLower(coalesce(s.title, '')) CONTAINS 'effective' THEN 2
                          WHEN toLower(coalesce(s.title, '')) CONTAINS 'change' THEN 2
                          ELSE 0
                        END AS sectionScore
                   WHERE sectionScore > 0
                   RETURN
                     s.id AS sectionId,
                     s.section_number AS sectionNumber,
                     s.title AS sectionTitle,
                     base.title AS documentTitle,
                     base.policy_number AS policyNumber,
                     base.document_type AS documentType,
                     ${retrievalDocumentMetadataReturn('base')}
                     s.content_text AS content,
                     (${AMENDMENT_CONTEXT_BASE_SCORE} + docScore * ${AMENDMENT_CONTEXT_DOC_WEIGHT} + sectionScore * ${AMENDMENT_CONTEXT_SECTION_WEIGHT}) AS score
                   ORDER BY score DESC
                   LIMIT toInteger($k)`,
                  {
                    docTypes,
                    terms: queryTerms,
                    docLimit: Math.min(AMENDMENT_CONTEXT_DOC_LIMIT, perGroupK),
                    k: perGroupK,
                  },
                ),
              );
              keywordHits.push(...result.records.map(recordToRetrievalHit));
            } catch {
              // Amendment-context expansion is best effort.
            }
          }
        }
      }

      const policyScopedHits: CorpusRetrievalHit[] = [];
      if (explicitPolicyNumbers.length > 0 && queryTerms.length > 0) {
        for (const docTypes of typeGroups) {
          try {
            const vectorResult = await timeSearchStep(`policy scoped vector ${docTypes.join('+')}`, () =>
              session.run(
                `CALL db.index.vector.queryNodes('section_embeddings', toInteger($k), $embedding)
                 YIELD node AS s, score
                 MATCH (d:Document)-[:HAS_SECTION]->(s)
                 WHERE d.document_type IN $docTypes
                   AND toUpper(coalesce(d.policy_number, '')) IN $policyNumbers
                 RETURN
                   s.id AS sectionId,
                   s.section_number AS sectionNumber,
                   s.title AS sectionTitle,
                   d.title AS documentTitle,
                   d.policy_number AS policyNumber,
                   d.document_type AS documentType,
                   ${retrievalDocumentMetadataReturn('d')}
                   s.content_text AS content,
                   score
                 ORDER BY score DESC
                 LIMIT toInteger($k)`,
                {
                  embedding,
                  docTypes,
                  policyNumbers: explicitPolicyNumbers,
                  k: perGroupK,
                },
              ),
            );
            policyScopedHits.push(...vectorResult.records.map(recordToRetrievalHit));

            const result = await timeSearchStep(`policy scoped ${docTypes.join('+')}`, () =>
              session.run(
                `MATCH (d:Document)
                 WHERE d.document_type IN $docTypes
                   AND toUpper(coalesce(d.policy_number, '')) IN $policyNumbers
                 MATCH (d)-[:HAS_SECTION]->(s:Section)
                 WHERE s.content_length > 0
                 WITH d, s,
                      reduce(
                        sectionScore = 0,
                        term IN $terms |
                        sectionScore +
                        CASE
                          WHEN toLower(coalesce(s.title, '')) CONTAINS term THEN 3
                          ELSE 0
                        END +
                        CASE
                          WHEN toLower(coalesce(s.content_text, '')) CONTAINS term THEN 1
                          ELSE 0
                        END
                      ) AS sectionScore
                 WHERE sectionScore > 0
                 RETURN
                   s.id AS sectionId,
                   s.section_number AS sectionNumber,
                   s.title AS sectionTitle,
                   d.title AS documentTitle,
                   d.policy_number AS policyNumber,
                   d.document_type AS documentType,
                   ${retrievalDocumentMetadataReturn('d')}
                   s.content_text AS content,
                   (${POLICY_SCOPED_BASE_SCORE} + sectionScore * ${POLICY_SCOPED_SECTION_WEIGHT}) AS score
                 ORDER BY score DESC, s.content_length DESC
                 LIMIT toInteger($k)`,
                {
                  docTypes,
                  policyNumbers: explicitPolicyNumbers,
                  terms: queryTerms,
                  k: perGroupK,
                },
              ),
            );
            policyScopedHits.push(...result.records.map(recordToRetrievalHit));
          } catch {
            // Policy-scoped retrieval is best effort.
          }
        }
      }

      const sectionMap = new Map<string, CorpusRetrievalHit>();
      for (const hit of [...vectorHits, ...chunkHits, ...conceptHits, ...keywordHits, ...policyScopedHits]) {
        const existing = sectionMap.get(hit.sectionId);
        if (!existing || hit.score > existing.score) {
          sectionMap.set(hit.sectionId, hit);
        }
      }

      const escapedQuery = escapeLucene(input.query);
      if (escapedQuery.trim()) {
        try {
          const fulltextHits: CorpusRetrievalHit[] = [];
          for (const docTypes of typeGroups) {
            const result = await timeSearchStep(`fulltext ${docTypes.join('+')}`, () =>
              session.run(
                `CALL db.index.fulltext.queryNodes('section_fulltext', $query)
                 YIELD node AS s, score
                 MATCH (d:Document)-[:HAS_SECTION]->(s)
                 WHERE s.content_length > 0
                   AND d.document_type IN $docTypes
                 RETURN
                   s.id AS sectionId,
                   s.section_number AS sectionNumber,
                   s.title AS sectionTitle,
                   d.title AS documentTitle,
                   d.policy_number AS policyNumber,
                   d.document_type AS documentType,
                   ${retrievalDocumentMetadataReturn('d')}
                   s.content_text AS content,
                   score
                 ORDER BY score DESC
                 LIMIT toInteger($k)`,
                { query: escapedQuery, k: perGroupK, docTypes },
              ),
            );
            fulltextHits.push(...result.records.map(recordToRetrievalHit));
          }

          const fulltextIds = new Set(fulltextHits.map((hit) => hit.sectionId));
          for (const [sectionId, hit] of sectionMap) {
            if (fulltextIds.has(sectionId)) {
              hit.score += FULLTEXT_BOOST;
            }
          }

          const scores = Array.from(sectionMap.values()).map((hit) => hit.score);
          const minScore = scores.length > 0 ? Math.min(...scores) : 0.5;
          for (let index = 0; index < fulltextHits.length; index++) {
            const hit = fulltextHits[index];
            if (!sectionMap.has(hit.sectionId)) {
              hit.score = Math.max(minScore - 0.01 * (index + 1), 0.01);
              sectionMap.set(hit.sectionId, hit);
            }
          }
        } catch {
          // Fulltext index may not exist yet.
        }
      }

      if (isChangeNoticeQuery(queryLower)) {
        const changeNoticeTitles = dedupeTerms(
          Array.from(sectionMap.values())
            .map((hit) => hit.documentTitle)
            .filter((title): title is string => Boolean(title) && normalizeSearchText(title).includes('change notice')),
        ).slice(0, 5);

        if (changeNoticeTitles.length > 0) {
          try {
            const result = await timeSearchStep('amendment title expansion', () =>
              session.run(
                `MATCH (amend:Document)-[:AMENDS]->(base:Document)
                 WHERE amend.title IN $titles
                 MATCH (base)-[:HAS_SECTION]->(s:Section)
                 WHERE s.content_length > 0
                 WITH base, s,
                      CASE
                        WHEN toLower(coalesce(s.title, '')) CONTAINS 'implementation' THEN 3
                        WHEN toLower(coalesce(s.title, '')) CONTAINS 'effective' THEN 2
                        WHEN toLower(coalesce(s.title, '')) CONTAINS 'change' THEN 2
                        ELSE 0
                      END AS sectionScore
                 WHERE sectionScore > 0
                 RETURN
                   s.id AS sectionId,
                   s.section_number AS sectionNumber,
                   s.title AS sectionTitle,
                   base.title AS documentTitle,
                   base.policy_number AS policyNumber,
                   base.document_type AS documentType,
                   ${retrievalDocumentMetadataReturn('base')}
                   s.content_text AS content,
                   (${AMENDMENT_CONTEXT_BASE_SCORE} + sectionScore * ${AMENDMENT_CONTEXT_SECTION_WEIGHT}) AS score
                 ORDER BY score DESC, s.content_length DESC
                 LIMIT toInteger($k)`,
                {
                  titles: changeNoticeTitles,
                  k: perGroupK,
                },
              ),
            );

            for (const hit of result.records.map(recordToRetrievalHit)) {
              const existing = sectionMap.get(hit.sectionId);
              if (!existing || hit.score > existing.score) {
                sectionMap.set(hit.sectionId, hit);
              }
            }
          } catch {
            // Title-driven amendment expansion is best effort.
          }
        }
      }

      const documentCoverageBoosts = computeDocumentCoverageBoosts(Array.from(sectionMap.values()), queryTerms);
      const documentTitlesForExpansion = selectDocumentTitlesForExpansion(
        Array.from(sectionMap.values()),
        documentCoverageBoosts,
      );
      if (documentTitlesForExpansion.length > 0 && queryTerms.length > 0) {
        try {
          const result = await timeSearchStep('document expansion', () =>
            session.run(
              `MATCH (d:Document)
               WHERE d.title IN $titles
               MATCH (d)-[:HAS_SECTION]->(s:Section)
               WHERE s.content_length > 0
               WITH d, s,
                    reduce(
                      sectionScore = 0,
                      term IN $terms |
                      sectionScore +
                      CASE
                        WHEN toLower(coalesce(s.title, '')) CONTAINS term THEN 3
                        ELSE 0
                      END +
                      CASE
                        WHEN toLower(coalesce(s.content_text, '')) CONTAINS term THEN 1
                        ELSE 0
                      END
                    ) AS sectionScore
               WHERE sectionScore > 0
               RETURN
                 s.id AS sectionId,
                 s.section_number AS sectionNumber,
                 s.title AS sectionTitle,
                 d.title AS documentTitle,
                 d.policy_number AS policyNumber,
                 d.document_type AS documentType,
                 ${retrievalDocumentMetadataReturn('d')}
                 s.content_text AS content,
                 (${DOCUMENT_EXPANSION_BASE_SCORE} + sectionScore * ${DOCUMENT_EXPANSION_SECTION_WEIGHT}) AS score
               ORDER BY score DESC, s.content_length DESC
               LIMIT toInteger($k)`,
              {
                titles: documentTitlesForExpansion,
                terms: queryTerms,
                k: perGroupK,
              },
            ),
          );

          for (const hit of result.records.map(recordToRetrievalHit)) {
            const existing = sectionMap.get(hit.sectionId);
            if (!existing || hit.score > existing.score) {
              sectionMap.set(hit.sectionId, hit);
            }
          }
        } catch {
          // Document expansion is best effort.
        }
      }

      if (isChangeNoticeQuery(queryLower) && documentTitlesForExpansion.length > 0) {
        try {
          const result = await timeSearchStep('change notice header expansion', () =>
            session.run(
              `MATCH (d:Document)
               WHERE d.title IN $titles
               MATCH (d)-[:HAS_SECTION]->(s:Section)
               WITH d, s,
                    CASE
                      WHEN toLower(coalesce(s.title, '')) CONTAINS 'change no' THEN 4
                      WHEN toLower(coalesce(s.title, '')) CONTAINS 'revised' THEN 4
                      WHEN toLower(coalesce(s.title, '')) CONTAINS 'effective date' THEN 3
                      WHEN toLower(coalesce(s.title, '')) CONTAINS 'implementation' THEN 3
                      WHEN toLower(coalesce(s.title, '')) CONTAINS 'policy update' THEN 2
                      WHEN toLower(coalesce(s.title, '')) CONTAINS 'content of change' THEN 2
                      ELSE 0
                    END AS sectionScore
               WHERE sectionScore > 0
               RETURN
                 s.id AS sectionId,
                 s.section_number AS sectionNumber,
                 s.title AS sectionTitle,
                 d.title AS documentTitle,
                 d.policy_number AS policyNumber,
                 d.document_type AS documentType,
                 ${retrievalDocumentMetadataReturn('d')}
                 coalesce(s.content_text, '') AS content,
                 (${CHANGE_NOTICE_HEADER_BASE_SCORE} + sectionScore * ${CHANGE_NOTICE_HEADER_SECTION_WEIGHT}) AS score
               ORDER BY coalesce(d.effective_date, '') DESC, score DESC, s.id ASC
               LIMIT toInteger($k)`,
              {
                titles: documentTitlesForExpansion,
                k: perGroupK,
              },
            ),
          );

          for (const hit of result.records.map(recordToRetrievalHit)) {
            const existing = sectionMap.get(hit.sectionId);
            if (!existing || hit.score > existing.score) {
              sectionMap.set(hit.sectionId, hit);
            }
          }
        } catch {
          // Change-notice header expansion is best effort.
        }
      }

      const latestChangeMarkerValue = isLatestChangeNoticeQuery(queryLower)
        ? Array.from(sectionMap.values()).reduce<number | null>((latest, hit) => {
            const markerValue = changeMarkerValueForHit(hit);
            if (markerValue === null) return latest;
            return latest === null ? markerValue : Math.max(latest, markerValue);
          }, null)
        : null;

      const finalHits = Array.from(sectionMap.values())
        .map((hit) =>
          rerankRetrievalHit(
            hit,
            queryLower,
            queryTerms,
            procedureCodes,
            requestedYears,
            explicitPolicyNumbers,
            documentCoverageBoosts,
            latestChangeMarkerValue,
          ),
        )
        .sort((left, right) => right.score - left.score)
        .slice(0, topK);
      debugSearch(`search end query="${input.query}" hits=${finalHits.length}`);
      return finalHits;
    });
  };

  const getSectionInternal = async (sectionId: string): Promise<SectionView | null> => {
    return withSession(async (session) => {
      const result = await session.run(
        `MATCH (s:Section {id: $id})
         OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
         RETURN
           s.id AS id,
           s.title AS title,
           s.section_number AS sectionNumber,
           s.content_text AS content,
           s.content_length AS contentLength,
           d.id AS documentId,
           d.title AS documentTitle,
           d.document_type AS documentType,
           d.policy_number AS policyNumber,
           d.effective_date AS effectiveDate,
           d.source_url AS url,
           d.status AS status,
           d.authority_tier AS authorityTier,
           d.answer_role AS answerRole,
           d.source_format AS sourceFormat,
           d.answer_ready AS answerReady,
           d.corpus_bucket AS corpusBucket,
           d.variant_group AS variantGroup,
           d.variant_date AS variantDate,
           d.retrieval_ready AS retrievalReady`,
        { id: sectionId },
      );

      if (result.records.length === 0) return null;

      const record = result.records[0];
      const content = (record.get('content') as string | null | undefined) ?? null;

      if (!content || !content.trim()) {
        const childResult = await session.run(
          `MATCH (s:Section {id: $id})-[:PARENT_OF]->(child:Section)
           WHERE child.content_length > 0
           OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
           RETURN
             collect({
               id: child.id,
               title: child.title,
               sectionNumber: child.section_number,
               content: child.content_text
             }) AS children,
             d.id AS documentId,
             d.title AS documentTitle,
             d.document_type AS documentType,
             d.policy_number AS policyNumber,
             d.effective_date AS effectiveDate,
             d.source_url AS url,
             d.status AS status,
             d.authority_tier AS authorityTier,
             d.answer_role AS answerRole,
             d.source_format AS sourceFormat,
             d.answer_ready AS answerReady,
             d.corpus_bucket AS corpusBucket,
             d.variant_group AS variantGroup,
             d.variant_date AS variantDate,
             d.retrieval_ready AS retrievalReady`,
          { id: sectionId },
        );

        if (childResult.records.length > 0) {
          const childRecord = childResult.records[0];
          const children = (childRecord.get('children') as Array<{
            id: string;
            title: string | null;
            sectionNumber: string | null;
            content: string | null;
          }>) ?? [];

          if (children.length > 0) {
            let combined = '';
            for (const child of children) {
              const entry = `### ${child.title || child.sectionNumber || '(untitled)'}\n${child.content || ''}\n\n`;
              if (combined.length + entry.length > MAX_COMBINED_CHARS) {
                combined += `\n[Truncated — ${children.length - combined.split('###').length + 1} more child sections. Use getSectionContext to explore.]`;
                break;
              }
              combined += entry;
            }

            return buildSectionView(
              {
                get(key: string) {
                  return key === 'id'
                    ? record.get('id')
                    : key === 'title'
                      ? record.get('title')
                      : key === 'sectionNumber'
                        ? record.get('sectionNumber')
                        : childRecord.get(key);
                },
              },
              `[Container heading with ${children.length} child sections:]\n\n${combined}`,
            );
          }
        }
      }

      return buildSectionView(record, truncateContent(content));
    });
  };

  const getDocumentInternal = async (documentId: string): Promise<DocumentWithSectionsView | null> => {
    return withSession(async (session) => {
      const result = await session.run(
        `MATCH (d:Document {id: $id})
         OPTIONAL MATCH (d)-[:HAS_SECTION]->(s:Section)
         WHERE s.content_length > 0
         RETURN
           ${documentMetadataReturn('d')},
           collect({id: s.id, number: s.section_number, title: s.title, chars: s.content_length}) AS sections`,
        { id: documentId },
      );

      if (result.records.length === 0) return null;

      const record = result.records[0];
      return {
        ...mapDocumentMetadataRecord(record),
        sections: mapDocumentSections(
          (record.get('sections') as Array<{
            id: string | null;
            number: string | null;
            title: string | null;
            chars?: number | { toNumber(): number } | null;
          }>) ?? [],
        ),
      };
    });
  };

  const getSectionContextInternal = async (sectionId: string): Promise<SectionContextView> => {
    return withSession(async (session) => {
      const ancestorResult = await session.run(
        `MATCH (s:Section {id: $id})
         MATCH path = (ancestor:Section)-[:PARENT_OF*1..10]->(s)
         RETURN ancestor.id AS id, ancestor.title AS title, ancestor.section_number AS sectionNumber
         ORDER BY length(path) DESC`,
        { id: sectionId },
      );

      const childResult = await session.run(
        `MATCH (s:Section {id: $id})-[:PARENT_OF]->(child:Section)
         RETURN child.id AS id, child.title AS title, child.section_number AS sectionNumber
         ORDER BY child.section_number`,
        { id: sectionId },
      );

      const siblingResult = await session.run(
        `MATCH (s:Section {id: $id})
         OPTIONAL MATCH (parent:Section)-[:PARENT_OF]->(s)
         OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
         CALL {
           WITH s, parent, d
           OPTIONAL MATCH (parent)-[:PARENT_OF]->(parentSibling:Section)
           WITH s, parent, d, [node IN collect(parentSibling) WHERE node IS NOT NULL] AS parentFamily
           OPTIONAL MATCH (d)-[:HAS_SECTION]->(docSibling:Section)
           WHERE parent IS NULL
             AND NOT EXISTS { MATCH (:Section)-[:PARENT_OF]->(docSibling) }
           WITH s, parent, parentFamily, [node IN collect(docSibling) WHERE node IS NOT NULL] AS docFamily
           WITH s, CASE WHEN parent IS NOT NULL THEN parentFamily ELSE docFamily END AS family
           UNWIND family AS sibling
           WITH s, sibling, family
           OPTIONAL MATCH path = (head:Section)-[:NEXT_SIBLING*0..]->(sibling)
           WHERE head IN family
             AND NOT EXISTS {
               MATCH (prev:Section)-[:NEXT_SIBLING]->(head)
               WHERE prev IN family
             }
           WITH s, sibling, min(length(path)) AS nextSiblingOrder
           WHERE sibling.id <> s.id
           RETURN
             sibling.id AS id,
             sibling.title AS title,
             sibling.section_number AS sectionNumber,
             nextSiblingOrder
           ORDER BY
             CASE WHEN nextSiblingOrder IS NULL THEN 1 ELSE 0 END,
             nextSiblingOrder,
             sibling.section_number,
             sibling.id
         }
         RETURN id, title, sectionNumber`,
        { id: sectionId },
      );

      return {
        ancestors: ancestorResult.records.map(mapSectionContextEntry),
        children: childResult.records.map(mapSectionContextEntry),
        siblings: siblingResult.records.map(mapSectionContextEntry),
      } satisfies SectionContextView;
    });
  };

  const followReferencesInternal = async (sectionId: string): Promise<ReferenceView[]> => {
    return withSession(async (session) => {
      const result = await session.run(
        `MATCH (s:Section {id: $id})-[r:REFERENCES|REFERENCES_DOCUMENT]->(target)
         OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(target)
         RETURN
           target.id AS targetId,
           labels(target)[0] AS targetType,
           CASE WHEN target:Section THEN target.title ELSE target.title END AS targetTitle,
           CASE WHEN target:Section THEN d.policy_number ELSE target.policy_number END AS targetPolicyNumber,
           type(r) AS relationshipType,
           r.reference_text AS referenceText`,
        { id: sectionId },
      );

      return result.records.map((record) => ({
        targetId: record.get('targetId') as string,
        targetType: record.get('targetType') as 'Section' | 'Document',
        targetTitle: (record.get('targetTitle') as string | null | undefined) ?? null,
        targetPolicyNumber: (record.get('targetPolicyNumber') as string | null | undefined) ?? null,
        relationshipType: record.get('relationshipType') as string,
        referenceText: (record.get('referenceText') as string | null | undefined) ?? null,
      })) satisfies ReferenceView[];
    });
  };

  const getAmendmentsInternal = async (documentId: string): Promise<AmendmentsView> => {
    return withSession(async (session) => {
      const currentResult = await session.run(
        `MATCH (d:Document {id: $id})
         RETURN
           ${documentMetadataReturn('d')}`,
        { id: documentId },
      );
      const currentDocument =
        currentResult.records.length > 0 ? mapDocumentMetadataRecord(currentResult.records[0]) : null;

      const amendmentResult = await session.run(
        `MATCH (d:Document {id: $id})
         OPTIONAL MATCH (amend:Document)-[r:AMENDS]->(d)
         WHERE amend IS NOT NULL
         RETURN
           ${documentMetadataReturn('amend')},
           r.change_description AS changeDescription
         ORDER BY amend.effective_date DESC, amend.id ASC`,
        { id: documentId },
      );

      const amendments = amendmentResult.records
        .filter((record) => record.get('id') != null)
        .map((record) => ({
          ...mapDocumentMetadataRecord(record),
          changeSummary: (record.get('changeDescription') as string | null | undefined) ?? null,
        }));

      const baseResult = await session.run(
        `MATCH (d:Document {id: $id})-[:AMENDS]->(base:Document)
         RETURN
           ${documentMetadataReturn('base')}
         LIMIT 1`,
        { id: documentId },
      );

      const baseDocument = baseResult.records.length > 0 ? mapDocumentMetadataRecord(baseResult.records[0]) : null;
      const authoritativeDocument = amendments[0]
        ? {
            id: amendments[0].id,
            title: amendments[0].title,
            documentType: amendments[0].documentType,
            policyNumber: amendments[0].policyNumber,
            effectiveDate: amendments[0].effectiveDate,
            url: amendments[0].url,
            citationLink: amendments[0].citationLink,
            status: amendments[0].status,
            authorityTier: amendments[0].authorityTier,
            answerRole: amendments[0].answerRole,
            sourceFormat: amendments[0].sourceFormat,
            answerReady: amendments[0].answerReady,
            corpusBucket: amendments[0].corpusBucket,
            variantGroup: amendments[0].variantGroup,
            variantDate: amendments[0].variantDate,
            retrievalReady: amendments[0].retrievalReady,
          }
        : currentDocument;

      return {
        amendments,
        baseDocument,
        authoritativeDocument,
      } satisfies AmendmentsView;
    });
  };

  const lookupPolicyInternal = async ({ policyNumber }: { policyNumber: string }): Promise<DocumentWithSectionsView[]> => {
    return withSession(async (session) => {
      const result = await session.run(
        `MATCH (d:Document)
         WHERE d.policy_number = $pn
            OR toLower(d.policy_number) = toLower($pn)
            OR d.policy_number STARTS WITH $pn
         OPTIONAL MATCH (d)-[:HAS_SECTION]->(s:Section)
         RETURN
           ${documentMetadataReturn('d')},
           collect({id: s.id, number: s.section_number, title: s.title}) AS sections
         ORDER BY
           CASE WHEN toUpper(coalesce(d.title, '')) CONTAINS 'CHANGE NOTICE' THEN 1 ELSE 0 END,
           CASE WHEN coalesce(d.status, '') = 'amendment' THEN 1 ELSE 0 END,
           CASE WHEN d.effective_date IS NULL THEN 1 ELSE 0 END,
           d.effective_date DESC,
           size(coalesce(d.title, '')) ASC,
           d.id ASC`,
        { pn: policyNumber },
      );

      return result.records.map((record) => ({
        ...mapDocumentMetadataRecord(record),
        sections: mapDocumentSections(
          (record.get('sections') as Array<{
            id: string | null;
            number: string | null;
            title: string | null;
          }>) ?? [],
        ),
      })) satisfies DocumentWithSectionsView[];
    });
  };

  const findConceptSectionsInternal = async ({
    conceptName,
    relationshipType,
  }: FindConceptSectionsInput): Promise<ConceptSectionView[]> => {
    if (relationshipType && !isAllowedConceptRelationship(relationshipType)) {
      return [];
    }

    return withSession(async (session) => {
      const query = relationshipType
        ? `MATCH (s:Section)-[r:${relationshipType}]->(c:PolicyConcept)
           WHERE c.name = $name OR toLower(c.name) = toLower($name)
           OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
           RETURN
             s.id AS sectionId,
             s.title AS sectionTitle,
             s.section_number AS sectionNumber,
             d.id AS documentId,
             d.document_type AS documentType,
             d.policy_number AS policyNumber,
             type(r) AS relationshipType`
        : `MATCH (s:Section)-[r]->(c:PolicyConcept)
           WHERE c.name = $name OR toLower(c.name) = toLower($name)
           OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
           RETURN
             s.id AS sectionId,
             s.title AS sectionTitle,
             s.section_number AS sectionNumber,
             d.id AS documentId,
             d.document_type AS documentType,
             d.policy_number AS policyNumber,
             type(r) AS relationshipType`;

      const result = await session.run(query, { name: conceptName });
      return result.records.map((record) => ({
        sectionId: record.get('sectionId') as string,
        sectionTitle: (record.get('sectionTitle') as string | null | undefined) ?? null,
        sectionNumber: (record.get('sectionNumber') as string | null | undefined) ?? null,
        documentId: (record.get('documentId') as string | null | undefined) ?? null,
        documentType: (record.get('documentType') as string | null | undefined) ?? null,
        policyNumber: (record.get('policyNumber') as string | null | undefined) ?? null,
        relationshipType: record.get('relationshipType') as string,
      })) satisfies ConceptSectionView[];
    });
  };

  const hydrateSectionCandidates = async (
    candidates: SectionCandidate[],
    limit: number,
    seenSectionIds: Set<string> = new Set(),
  ): Promise<HydratedSectionCandidate[]> => {
    const hydrated: HydratedSectionCandidate[] = [];
    for (const candidate of candidates) {
      if (seenSectionIds.has(candidate.sectionId)) continue;
      const section = await getSectionInternal(candidate.sectionId);
      if (!section) continue;
      seenSectionIds.add(candidate.sectionId);
      hydrated.push({
        section: toAnswerFrameSection(section, candidate.reason),
        score: candidate.score,
      });
      if (hydrated.length >= limit) break;
    }
    return hydrated;
  };

  const collectDocumentsForSections = async (
    sections: AnswerFrameSection[],
    defaultReason: string,
  ): Promise<DocumentCandidate[]> => {
    const documentIds = dedupeTerms(
      sections
        .map((section) => section.documentId)
        .filter((documentId): documentId is string => Boolean(documentId)),
    );
    const documents = await Promise.all(documentIds.map((documentId) => getDocumentInternal(documentId)));
    return documents
      .filter((document): document is DocumentWithSectionsView => document != null)
      .map((document) => ({
        document: extractDocumentView(document),
        reason: defaultReason,
        score: 0.5,
      }));
  };

  const collectDocumentsForSectionIds = async (
    sectionIds: string[],
    limit = FRAME_DOCUMENT_LIMIT,
  ): Promise<DocumentWithSectionsView[]> => {
    const documents = await Promise.all(
      dedupeTerms(sectionIds)
        .slice(0, limit)
        .map(async (sectionId) => {
          const section = await getSectionInternal(sectionId);
          if (!section?.documentId) return null;
          return getDocumentInternal(section.documentId);
        }),
    );

    return uniqueBy(
      documents.filter((document): document is DocumentWithSectionsView => document != null),
      (document) => document.id,
    );
  };

  const collectLookupDocuments = async (query: string): Promise<DocumentWithSectionsView[]> => {
    const policyNumbers = collectPolicyNumbersForQuery(query);
    if (policyNumbers.length === 0) return [];

    const documents = await Promise.all(policyNumbers.map((policyNumber) => lookupPolicyInternal({ policyNumber })));
    return uniqueBy(documents.flat(), (document) => document.id);
  };

  const collectImplementationLookupDocuments = async (query: string): Promise<DocumentWithSectionsView[]> => {
    const queryLower = normalizeSearchText(query);
    const policyNumbers = dedupeTerms([...extractExplicitPolicyNumbers(query), ...extractAliasedPolicyNumbers(queryLower)]);
    if (policyNumbers.length === 0) return [];

    const documents = await Promise.all(policyNumbers.map((policyNumber) => lookupPolicyInternal({ policyNumber })));
    return uniqueBy(documents.flat(), (document) => document.id);
  };

  const collectHcwdIncomeHistoryHits = async (): Promise<CorpusRetrievalHit[]> => {
    return withSession(async (session) => {
      const result = await session.run(
        `MATCH (d:Document)-[:HAS_SECTION]->(s:Section)
         WHERE d.document_type = 'dhhs_policy'
           AND coalesce(d.status, '') = 'amendment'
           AND (
             toLower(coalesce(d.title, '')) CONTAINS 'hcwd'
             OR toLower(coalesce(d.title, '')) CONTAINS 'health coverage for workers with disabilities'
           )
         WITH d, s,
              CASE
                WHEN toLower(coalesce(s.content_text, '')) CONTAINS 'remove the 150% fpl income limit' THEN 8
                WHEN toLower(coalesce(s.content_text, '')) CONTAINS 'only income limit for the hcwd program is the 150% fpl limit on unearned income' THEN 7
                WHEN toLower(coalesce(s.content_text, '')) CONTAINS 'regardless of total countable income' THEN 6
                WHEN toLower(coalesce(s.content_text, '')) CONTAINS 'remove limits on countable income except for the 150% of federal poverty level' THEN 6
                WHEN toLower(coalesce(s.content_text, '')) CONTAINS 'sliding scale premiums' THEN 5
                WHEN toLower(coalesce(s.title, '')) CONTAINS 'premium' THEN 4
                WHEN toLower(coalesce(s.title, '')) CONTAINS 'income' THEN 4
                ELSE 0
              END AS sectionScore,
              CASE
                WHEN toLower(coalesce(d.title, '')) CONTAINS '01-14' THEN 3
                ELSE 0
              END AS docBonus
         WHERE sectionScore > 0
         RETURN
           s.id AS sectionId,
           s.section_number AS sectionNumber,
           s.title AS sectionTitle,
           d.title AS documentTitle,
           d.policy_number AS policyNumber,
           d.document_type AS documentType,
           ${retrievalDocumentMetadataReturn('d')}
           s.content_text AS content,
           (${SECTION_KEYWORD_BASE_SCORE} + sectionScore * ${SECTION_KEYWORD_WEIGHT} + docBonus * ${DOCUMENT_KEYWORD_DOC_WEIGHT}) AS score
         ORDER BY score DESC, coalesce(d.effective_date, '') DESC
         LIMIT 8`,
      );

      return result.records.map(recordToRetrievalHit);
    });
  };

  const collectPolicyDocumentsFromHits = async (
    query: string,
    hits: CorpusRetrievalHit[],
    limit = FRAME_DOCUMENT_LIMIT,
  ): Promise<DocumentWithSectionsView[]> => {
    const focusTerms = buildQueryFocusTerms(query);
    const scoresByPolicyNumber = new Map<string, number>();

    for (const hit of hits) {
      if (!hit.policyNumber || !hit.documentType || !POLICY_ROUTING_DOCUMENT_TYPES.has(hit.documentType)) continue;

      const policyNumber = hit.policyNumber.toUpperCase();
      const titleMatches = scoreTermMatches(focusTerms, hit.sectionTitle);
      const documentMatches = scoreTermMatches(focusTerms, hit.documentTitle);
      const contentMatches = Math.min(scoreTermMatches(focusTerms, hit.content), 5);
      if (titleMatches + documentMatches + Math.min(contentMatches, 2) < 2) continue;

      let score = hit.score;
      score += titleMatches * 0.04;
      score += documentMatches * 0.03;
      score += contentMatches * 0.015;

      if (isAttachmentTitle(hit.sectionTitle) && !normalizeSearchText(query).includes('attachment')) {
        score -= ATTACHMENT_TITLE_PENALTY;
      }
      if (isBoilerplateTitle(hit.sectionTitle)) {
        score -= BOILERPLATE_TITLE_PENALTY;
      }

      scoresByPolicyNumber.set(policyNumber, (scoresByPolicyNumber.get(policyNumber) ?? 0) + score);
    }

    const policyNumbers = Array.from(scoresByPolicyNumber.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, limit)
      .map(([policyNumber]) => policyNumber);
    if (policyNumbers.length === 0) return [];

    const documents = await Promise.all(
      policyNumbers.map(async (policyNumber) => {
        const [document] = await lookupPolicyInternal({ policyNumber });
        return document ?? null;
      }),
    );
    return uniqueBy(
      documents.filter((document): document is DocumentWithSectionsView => document != null),
      (document) => document.id,
    );
  };

  const collectCoverageRoutingDocuments = async (
    query: string,
    hits: CorpusRetrievalHit[],
  ): Promise<DocumentWithSectionsView[]> => {
    const lookupDocuments = await collectLookupDocuments(query);
    if (lookupDocuments.length > 0) {
      return isHcwdIncomePremiumQuery(normalizeSearchText(query))
        ? narrowHcwdCoverageDocuments(query, lookupDocuments)
        : lookupDocuments;
    }
    const inferredDocuments = await collectPolicyDocumentsFromHits(query, hits, FRAME_DOCUMENT_LIMIT + 1);
    return narrowInferredCoverageDocuments(inferredDocuments);
  };

  const collectDocumentSectionCandidates = async (
    documents: DocumentWithSectionsView[],
    includeTerms: readonly string[],
    avoidTerms: readonly string[],
    reason: string,
    limit = FRAME_SUPPORT_LIMIT,
  ): Promise<HydratedSectionCandidate[]> => {
    const sectionIds = dedupeTerms(
      documents.flatMap((document) => pickDocumentSectionsByTitle(document, includeTerms, avoidTerms, limit)),
    );
    const hydrated: HydratedSectionCandidate[] = [];
    for (const sectionId of sectionIds) {
      const section = await getSectionInternal(sectionId);
      if (!section) continue;
      hydrated.push({
        section: toAnswerFrameSection(section, reason),
        score: 0.75,
      });
      if (hydrated.length >= limit) break;
    }
    return hydrated;
  };

  const collectLikelyCoverageLimitationSectionCandidates = async (
    documents: DocumentWithSectionsView[],
    reason: string,
    limit = FRAME_SUPPORT_LIMIT,
  ): Promise<HydratedSectionCandidate[]> => {
    const sectionIds = dedupeTerms(
      documents.flatMap((document) => pickLikelyCoverageLimitationSections(document, limit)),
    );
    const hydrated: HydratedSectionCandidate[] = [];
    for (const sectionId of sectionIds) {
      const section = await getSectionInternal(sectionId);
      if (!section) continue;
      hydrated.push({
        section: toAnswerFrameSection(section, reason),
        score: 0.72,
      });
      if (hydrated.length >= limit) break;
    }
    return hydrated;
  };

  const toSectionCandidates = (
    hydrated: HydratedSectionCandidate[],
    scoreBoost = 0,
  ): SectionCandidate[] =>
    hydrated.map((candidate) => ({
      sectionId: candidate.section.id,
      score: candidate.score + scoreBoost,
      reason: candidate.section.reason ?? 'Document-title matched section.',
    }));

  const selectLatestRevision = (
    sections: AnswerFrameSection[],
    documents: AnswerFrameDocument[],
  ): AnswerFrame['latestRevision'] => {
    const section = sections.reduce<AnswerFrameSection | null>((latest, candidate) => {
      const latestValue = latest ? extractChangeMarkerValue(describeLatestRevision(latest, null)) : null;
      const candidateValue = extractChangeMarkerValue(describeLatestRevision(candidate, null));
      if (candidateValue === null) return latest;
      if (latestValue === null || candidateValue > latestValue) return candidate;
      return latest;
    }, null);

    const document = documents.find((candidate) => candidate.id === section?.documentId) ?? documents[0] ?? null;
    if (!section && !document) return null;

    return {
      marker: describeLatestRevision(section, document),
      document: document ?? null,
      section: section ?? null,
    };
  };

  const finalizeFrame = async ({
    questionType,
    route,
    authoritativeCandidates = [],
    primaryCandidates = [],
    supportingCandidates = [],
    avoidCandidates = [],
    variantReasoning = null,
    latestRevisionSections = [],
  }: {
    questionType: AnswerQuestionType;
    route: AnswerFrameRoute;
    authoritativeCandidates?: DocumentCandidate[];
    primaryCandidates?: SectionCandidate[];
    supportingCandidates?: SectionCandidate[];
    avoidCandidates?: SectionCandidate[];
    variantReasoning?: string | null;
    latestRevisionSections?: AnswerFrameSection[];
  }): Promise<AnswerFrame> => {
    const seenSectionIds = new Set<string>();
    const primarySections = (await hydrateSectionCandidates(primaryCandidates, FRAME_PRIMARY_LIMIT, seenSectionIds)).map(
      (candidate) => candidate.section,
    );
    const supportingSections = (
      await hydrateSectionCandidates(supportingCandidates, FRAME_SUPPORT_LIMIT, seenSectionIds)
    ).map((candidate) => candidate.section);
    const avoidSections = (await hydrateSectionCandidates(avoidCandidates, FRAME_AVOID_LIMIT)).map(
      (candidate) => candidate.section,
    );

    const documentCandidates = [
      ...authoritativeCandidates,
      ...(await collectDocumentsForSections(primarySections, 'Document containing primary evidence.')),
      ...(await collectDocumentsForSections(supportingSections, 'Document containing supporting evidence.')),
    ];
    const authoritativeDocuments = pickTopDocumentCandidates(documentCandidates);
    const latestRevision = selectLatestRevision(
      uniqueBy([...latestRevisionSections, ...primarySections, ...supportingSections], (section) => section.id),
      authoritativeDocuments,
    );

    return {
      questionType,
      route,
      authoritativeDocuments,
      primarySections,
      supportingSections,
      avoidSections,
      latestRevision,
      variantReasoning,
    };
  };

  const rebalanceCoverageFrame = (
    frame: AnswerFrame,
    queryLower: string,
    serviceFocusTerms: string[],
    serviceClusterTerms: string[],
  ): AnswerFrame => {
    const surfacedSections = uniqueBy(
      [...frame.primarySections, ...frame.supportingSections, ...frame.avoidSections],
      (section) => section.id,
    );
    if (surfacedSections.length === 0) return frame;

    const generalCriteriaQuery = isEligibilityCriteriaQuery(queryLower) || asksForGeneralCriteria(queryLower);
    const eligibilityFrameworkQuery = isEligibilityCriteriaQuery(queryLower);
    const notCoveredQuery = asksForNotCoveredDetails(queryLower);
    const certificationQuery = asksForCertificationDetails(queryLower);
    const telehealthQuery = isTelehealthQuery(queryLower);
    const telehealthServiceListQuery = asksForTelehealthServiceList(queryLower);
    const ambulanceNotCoveredQuery = isAmbulanceNotCoveredQuery(queryLower);
    const congregatePcsQuery = isCongregatePcsQuery(queryLower);
    const yesNoCoverageQuery = isYesNoCoverageQuery(queryLower);
    const hcwdIncomePremiumQuery = isHcwdIncomePremiumQuery(queryLower);
    const earnedIncomeLimitQuery = asksForEarnedIncomeLimit(queryLower);
    const telehealthAvoidTerms = [...TELEHEALTH_AVOID_TERMS, ...COVERAGE_AVOID_TERMS];
    const generalEligibilityAnchorSections = eligibilityFrameworkQuery
      ? uniqueBy(
          surfacedSections
            .filter((section) => {
              const text = combineText(section.sectionNumber, section.title, section.content);
              const sectionNumber = normalizeSearchText(section.sectionNumber);
              return (
                !isCoverageAdministrativeTitle(section.title) &&
                (
                  sectionNumber === '2.1.1' ||
                  sectionNumber === '3.1' ||
                  sectionNumber === '3.2.1' ||
                  includesPhrase(text, ['general provisions', 'general criteria covered', 'specific criteria covered'])
                )
              );
            })
            .sort((left, right) => {
              const leftNumber = normalizeSearchText(left.sectionNumber);
              const rightNumber = normalizeSearchText(right.sectionNumber);
              const priority = (sectionNumber: string): number => {
                if (sectionNumber === '2.1.1') return 0;
                if (sectionNumber === '3.1') return 1;
                if (sectionNumber === '3.2.1') return 2;
                return 4;
              };
              return priority(leftNumber) - priority(rightNumber);
            }),
          (section) => section.id,
        )
      : [];
    const generalEligibilityContextSections = eligibilityFrameworkQuery
      ? uniqueBy(
          surfacedSections.filter((section) =>
            includesPhrase(combineText(section.sectionNumber, section.title, section.content), [
              '18 years of age',
              'adult with disabilities',
              'risk of institutionalization',
              'enrolled in the nc medicaid program',
              'service restrictions due to their eligibility category',
            ]),
          ),
          (section) => section.id,
        )
      : [];
    const generalEligibilityAdministrativeSections = eligibilityFrameworkQuery
      ? uniqueBy(surfacedSections.filter((section) => isCoverageAdministrativeTitle(section.title)), (section) => section.id)
      : [];
    const generalEligibilityLimitationSections = eligibilityFrameworkQuery && !notCoveredQuery
      ? uniqueBy(
          surfacedSections.filter((section) => isCoverageLimitationText(combineText(section.title, section.content))),
          (section) => section.id,
        )
      : [];
    const coverageScopeSections = yesNoCoverageQuery
      ? uniqueBy(
          surfacedSections.filter((section) => {
            const text = combineText(section.sectionNumber, section.title, section.content);
            const sectionNumber = normalizeSearchText(section.sectionNumber);
            return (
              !isCoverageProcessTitle(section.title) &&
              (
                sectionNumber === '1.0' ||
                sectionNumber === '2.1.1' ||
                includesPhrase(text, COVERAGE_SCOPE_SECTION_TERMS)
              )
            );
          }),
          (section) => section.id,
        )
      : [];
    const congregateCriteriaSections = congregatePcsQuery
      ? uniqueBy(
          surfacedSections.filter((section) => {
            const text = combineText(section.sectionNumber, section.title, section.content);
            return (
              normalizeSearchText(section.sectionNumber) === '3.2.1' ||
              includesPhrase(text, CONGREGATE_PCS_CRITERIA_SECTION_TERMS)
            );
          }),
          (section) => section.id,
        )
      : [];
    const congregateServiceSections = congregatePcsQuery
      ? uniqueBy(
          surfacedSections.filter((section) => {
            const text = combineText(section.sectionNumber, section.title, section.content);
            return (
              normalizeSearchText(section.sectionNumber) === '3.3' ||
              includesPhrase(text, CONGREGATE_PCS_COVERED_SERVICE_SECTION_TERMS)
            );
          }),
          (section) => section.id,
        )
      : [];
    const congregateRoomAndBoardSections = congregatePcsQuery
      ? uniqueBy(
          surfacedSections.filter((section) => {
            const text = combineText(section.sectionNumber, section.title, section.content);
            return (
              normalizeSearchText(section.sectionNumber) === '4.2.1.2' ||
              includesPhrase(text, CONGREGATE_PCS_NOT_COVERED_SECTION_TERMS)
            );
          }),
          (section) => section.id,
        )
      : [];
    const congregateWorkflowSections = congregatePcsQuery
      ? uniqueBy(
          surfacedSections.filter((section) => isCoverageProcessTitle(section.title)),
          (section) => section.id,
        )
      : [];
    const congregateGeneralLimitationSections = congregatePcsQuery
      ? uniqueBy(
          surfacedSections.filter((section) => {
            const sectionNumber = normalizeSearchText(section.sectionNumber);
            return sectionNumber === '4.1' || sectionNumber === '4.2' || sectionNumber === '4.2.1';
          }),
          (section) => section.id,
        )
      : [];
    const scored = surfacedSections.map((section) => {
      const text = combineText(section.title, section.content);
      const focusScore =
        scoreTermMatches(serviceFocusTerms, section.title) + Math.min(scoreTermMatches(serviceFocusTerms, section.content), 4);
      const clusterScore =
        scoreTermMatches(serviceClusterTerms, section.title) +
        Math.min(scoreTermMatches(serviceClusterTerms, section.content), 3);
      const requirementScore = Math.min(scorePhraseMatches(text, REQUIREMENT_EVIDENCE_TERMS, 1), 4);
      const certificationBonus = certificationQuery ? scorePhraseMatches(text, CERTIFICATION_SECTION_TERMS, 1) * 1.1 : 0;
      const generalCriteriaBonus = generalCriteriaQuery
        ? scorePhraseMatches(text, GENERAL_CRITERIA_SECTION_TERMS, 1) * 1.2
        : 0;
      const notCoveredBonus = notCoveredQuery ? scorePhraseMatches(text, NOT_COVERED_SECTION_TERMS, 1) * 1.2 : 0;
      const yesNoCoverageBonus = yesNoCoverageQuery ? scorePhraseMatches(text, YES_NO_COVERAGE_SECTION_TERMS, 1) * 1.3 : 0;
      const telehealthPrimaryBonus = telehealthQuery ? scorePhraseMatches(text, TELEHEALTH_PRIMARY_SECTION_TERMS, 1) * 2.3 : 0;
      const telehealthSupportingBonus = telehealthQuery ? scorePhraseMatches(text, TELEHEALTH_SUPPORT_SECTION_TERMS, 1) * 1.2 : 0;
      const telehealthDocumentationBonus = telehealthQuery
        ? scorePhraseMatches(text, TELEHEALTH_DOCUMENTATION_TERMS, 1) * 1.1
        : 0;
      const telehealthTangentialPenalty = telehealthQuery ? scorePhraseMatches(text, telehealthAvoidTerms, 1) * 3.5 : 0;
      const telehealthTablePenalty =
        telehealthQuery && !telehealthServiceListQuery && isTelehealthServiceTableSection(section) ? 2.8 : 0;
      const hcwdCurrentBonus = hcwdIncomePremiumQuery ? scorePhraseMatches(text, HCWD_PRIMARY_SECTION_TERMS, 1) * 1.3 : 0;
      const hcwdHistoryBonus =
        hcwdIncomePremiumQuery && earnedIncomeLimitQuery ? scorePhraseMatches(text, HCWD_LIMIT_HISTORY_TERMS, 1) * 1.5 : 0;
      const hcwdCurrentDocumentBonus =
        hcwdIncomePremiumQuery && section.policyNumber?.toUpperCase() === 'MA-2180' ? 1.5 : 0;
      const numberedBonus = section.sectionNumber ? 0.5 : 0;
      const limitationBonus = isCoverageLimitationText(text) ? 3 : 0;
      const boilerplatePenalty = isCoverageBoilerplateTitle(section.title) ? 2.5 : 0;
      const attachmentPenalty = isAttachmentTitle(section.title) ? 3 : 0;
      const requestInfoPenalty =
        yesNoCoverageQuery &&
        (
          isAttachmentTitle(section.title) ||
          isGenericSectionTitle(section.title) ||
          normalizeSearchText(section.title).includes('requesting ')
        )
          ? 3.2
          : 0;
      const hcwdHistoricalPrimaryPenalty = hcwdIncomePremiumQuery && section.status === 'amendment' ? 0.9 : 0;
      const hcwdTangentialPenalty =
        hcwdIncomePremiumQuery &&
        (
          isAdministrativeFormTitle(section.title) ||
          isAdministrativeFormTitle(section.documentTitle) ||
          isYearSpecificPremiumTitle(section.title) ||
          isYearSpecificPremiumTitle(section.documentTitle) ||
          isHcwdProcessTitle(section.title) ||
          isHcwdProcessTitle(section.documentTitle)
        )
          ? 2.6
          : 0;
      return {
        section,
        text,
        limitation: isCoverageLimitationText(text),
        primaryScore:
          focusScore * 1.2 +
          clusterScore * 0.8 +
          requirementScore * 0.6 +
          certificationBonus +
          generalCriteriaBonus +
          yesNoCoverageBonus +
          telehealthPrimaryBonus * 1.4 +
          telehealthSupportingBonus * 0.3 +
          telehealthDocumentationBonus * 0.8 +
          hcwdCurrentBonus * 1.1 +
          hcwdHistoryBonus * 0.5 +
          hcwdCurrentDocumentBonus +
          numberedBonus -
          boilerplatePenalty -
          attachmentPenalty -
          requestInfoPenalty -
          telehealthTangentialPenalty -
          telehealthTablePenalty -
          hcwdHistoricalPrimaryPenalty -
          hcwdTangentialPenalty,
        supportScore:
          limitationBonus +
          notCoveredBonus +
          focusScore * 0.6 +
          clusterScore * 0.9 +
          requirementScore * 0.4 +
          certificationBonus * 0.9 +
          yesNoCoverageBonus * 1.1 +
          telehealthPrimaryBonus * 0.8 +
          telehealthSupportingBonus * 1.3 +
          telehealthDocumentationBonus * 1.2 +
          hcwdCurrentBonus * 0.7 +
          hcwdHistoryBonus * 1.3 +
          (section.status === 'amendment' ? 0.5 : 0) +
          numberedBonus -
          boilerplatePenalty -
          attachmentPenalty -
          requestInfoPenalty -
          telehealthTangentialPenalty -
          telehealthTablePenalty -
          hcwdTangentialPenalty,
      };
    });

    const primaryLimit =
      certificationQuery || eligibilityFrameworkQuery
        ? FRAME_PRIMARY_LIMIT
        : serviceFocusTerms.length > 0
          ? 2
          : FRAME_PRIMARY_LIMIT;
    const preferredPrimaryScored = scored.filter((entry) => {
      const text = combineText(entry.section.title, entry.section.content);
      if (entry.limitation && !yesNoCoverageQuery && !notCoveredQuery) return false;
      if ((generalCriteriaQuery || notCoveredQuery) && isAttachmentTitle(entry.section.title)) return false;
      if (telehealthQuery && scorePhraseMatches(text, telehealthAvoidTerms, 1) > 0) return false;
      if (telehealthQuery && !telehealthServiceListQuery && isTelehealthServiceTableSection(entry.section)) return false;
      if (
        yesNoCoverageQuery &&
        (
          isAttachmentTitle(entry.section.title) ||
          isGenericSectionTitle(entry.section.title) ||
          normalizeSearchText(entry.section.title).includes('requesting ')
        )
      ) {
        return false;
      }
      return true;
    });
    const yesNoCoveragePrimaryScored = yesNoCoverageQuery
      ? preferredPrimaryScored.filter((entry) => scorePhraseMatches(entry.text, YES_NO_COVERAGE_SECTION_TERMS, 1) > 0)
      : [];
    const notCoveredPrimaryScored = notCoveredQuery
      ? preferredPrimaryScored.filter(
          (entry) =>
            entry.limitation ||
            scorePhraseMatches(entry.text, NOT_COVERED_SECTION_TERMS, 1) > 0,
        )
      : [];
    const telehealthPrimaryScored = telehealthQuery
      ? preferredPrimaryScored.filter(
          (entry) => scorePhraseMatches(normalizeSearchText(entry.section.title), TELEHEALTH_PRIMARY_SECTION_TERMS, 1) > 0,
        )
      : [];
    const hcwdCurrentPrimaryScored =
      hcwdIncomePremiumQuery
        ? preferredPrimaryScored.filter(
            (entry) =>
              entry.section.status !== 'amendment' &&
              !isYearSpecificPremiumTitle(entry.section.title) &&
              !isYearSpecificPremiumTitle(entry.section.documentTitle) &&
              !isAdministrativeFormTitle(entry.section.title) &&
              !isAdministrativeFormTitle(entry.section.documentTitle) &&
              !isHcwdProcessTitle(entry.section.title) &&
              !isHcwdProcessTitle(entry.section.documentTitle),
          )
        : [];
    const basePrimaryScored =
      hcwdCurrentPrimaryScored.length > 0
        ? hcwdCurrentPrimaryScored
        : preferredPrimaryScored.length > 0
        ? preferredPrimaryScored
        : scored.filter((entry) => !entry.limitation);
    const generalLimitationPrimaryScored =
      yesNoCoverageQuery || notCoveredQuery
        ? uniqueBy(
            surfacedSections
              .filter((section) => {
                const text = combineText(section.sectionNumber, section.title, section.content);
                return (
                  !isAttachmentTitle(section.title) &&
                  !isCoverageProcessTitle(section.title) &&
                  isCoverageLimitationText(text) &&
                  (
                    normalizeSearchText(section.title).includes('general') ||
                    normalizeSearchText(section.sectionNumber) === '4.1' ||
                    sectionNumberDepth(section.sectionNumber) <= 2
                  )
                );
              })
              .sort((left, right) => {
                const leftGeneral = normalizeSearchText(left.title).includes('general') || normalizeSearchText(left.sectionNumber) === '4.1';
                const rightGeneral = normalizeSearchText(right.title).includes('general') || normalizeSearchText(right.sectionNumber) === '4.1';
                if (leftGeneral !== rightGeneral) return leftGeneral ? -1 : 1;
                return sectionNumberDepth(left.sectionNumber) - sectionNumberDepth(right.sectionNumber);
              })
              .map((section) => ({ section, primaryScore: 0, supportScore: 0, text: combineText(section.title, section.content), limitation: true })),
            (entry) => entry.section.id,
          )
        : [];
    const specificLimitationPrimaryScored =
      yesNoCoverageQuery || notCoveredQuery
        ? uniqueBy(
            surfacedSections
              .filter((section) => {
                const text = combineText(section.sectionNumber, section.title, section.content);
                return (
                  !isAttachmentTitle(section.title) &&
                  !isCoverageProcessTitle(section.title) &&
                  isCoverageLimitationText(text) &&
                  (
                    sectionNumberDepth(section.sectionNumber) >= 3 ||
                    includesPhrase(normalizeSearchText(section.title), [
                      'specific',
                      'other non-covered',
                      'other noncovered',
                      'room and board',
                      'comfort or convenience',
                    ])
                  )
                );
              })
              .sort((left, right) => sectionNumberDepth(right.sectionNumber) - sectionNumberDepth(left.sectionNumber))
              .map((section) => ({ section, primaryScore: 0, supportScore: 0, text: combineText(section.title, section.content), limitation: true })),
            (entry) => entry.section.id,
          )
        : [];
    const initialPrimarySections = telehealthPrimaryScored.length > 0
      ? uniqueBy(
          [
            ...telehealthPrimaryScored.sort((left, right) => right.primaryScore - left.primaryScore).slice(0, 1),
            ...basePrimaryScored.sort((left, right) => right.primaryScore - left.primaryScore),
          ],
          (entry) => entry.section.id,
        )
          .slice(0, primaryLimit)
          .map((entry) => entry.section)
      : basePrimaryScored
          .sort((left, right) => right.primaryScore - left.primaryScore)
          .slice(0, primaryLimit)
          .map((entry) => entry.section);
    const primaryIds = new Set(initialPrimarySections.map((section) => section.id));
    const preferredSupportingScored = hcwdIncomePremiumQuery
      ? scored.filter(
          (entry) =>
            !primaryIds.has(entry.section.id) &&
            !isYearSpecificPremiumTitle(entry.section.title) &&
            !isYearSpecificPremiumTitle(entry.section.documentTitle) &&
            !isAdministrativeFormTitle(entry.section.title) &&
            !isAdministrativeFormTitle(entry.section.documentTitle) &&
            !isHcwdProcessTitle(entry.section.title) &&
            !isHcwdProcessTitle(entry.section.documentTitle),
        )
      : scored.filter((entry) => {
          if (primaryIds.has(entry.section.id)) return false;
          if (telehealthQuery && scorePhraseMatches(combineText(entry.section.title, entry.section.content), telehealthAvoidTerms, 1) > 0) {
            return false;
          }
          if (telehealthQuery && !telehealthServiceListQuery && isTelehealthServiceTableSection(entry.section)) {
            return false;
          }
          if (
            yesNoCoverageQuery &&
            (
              isAttachmentTitle(entry.section.title) ||
              isGenericSectionTitle(entry.section.title) ||
              normalizeSearchText(entry.section.title).includes('requesting ')
            )
          ) {
            return false;
          }
          return true;
        });
    const initialSupportingSections = (preferredSupportingScored.length > 0
      ? preferredSupportingScored
      : scored.filter((entry) => !primaryIds.has(entry.section.id)))
      .sort((left, right) => right.supportScore - left.supportScore)
      .slice(0, FRAME_SUPPORT_LIMIT)
      .map((entry) => entry.section);
    const yesNoCoverageAnchorSections = yesNoCoverageQuery
      ? yesNoCoveragePrimaryScored.sort((left, right) => right.primaryScore - left.primaryScore).slice(0, primaryLimit).map(
          (entry) => entry.section,
        )
      : [];
    const yesNoCoverageScopeAnchorSections = yesNoCoverageQuery
      ? yesNoCoveragePrimaryScored
          .filter((entry) => coverageScopeSections.some((section) => section.id === entry.section.id))
          .sort((left, right) => right.primaryScore - left.primaryScore)
          .slice(0, 1)
          .map((entry) => entry.section)
      : [];
    const notCoveredAnchorSections = notCoveredQuery
      ? notCoveredPrimaryScored
          .sort((left, right) => right.supportScore - left.supportScore)
          .slice(0, primaryLimit)
          .map((entry) => entry.section)
      : [];
    const generalLimitationAnchorSections = (yesNoCoverageQuery || notCoveredQuery)
      ? generalLimitationPrimaryScored
          .sort((left, right) => right.supportScore - left.supportScore)
          .slice(0, 1)
          .map((entry) => entry.section)
      : [];
    const specificLimitationAnchorSections = (yesNoCoverageQuery || notCoveredQuery)
      ? specificLimitationPrimaryScored
          .sort((left, right) => right.supportScore - left.supportScore)
          .slice(0, 1)
          .map((entry) => entry.section)
      : [];
    const limitationAnchorSections = notCoveredQuery
      ? uniqueBy([...specificLimitationAnchorSections, ...generalLimitationAnchorSections], (section) => section.id)
      : yesNoCoverageQuery
        ? uniqueBy([...generalLimitationAnchorSections, ...specificLimitationAnchorSections], (section) => section.id).slice(0, 1)
        : [];
    const ambulanceSpecificNotCoveredSections = ambulanceNotCoveredQuery
      ? uniqueBy(
          surfacedSections.filter((section) => {
            const text = combineText(section.title, section.content);
            return (
              includesPhrase(text, ['other non-covered ambulance services', 'other non-covered', 'other noncovered']) ||
              normalizeSearchText(section.sectionNumber) === '4.2.1.4'
            );
          }),
          (section) => section.id,
        )
      : [];
    const ambulanceCoverageContrastSections = ambulanceNotCoveredQuery
      ? uniqueBy(
          surfacedSections.filter((section) =>
            includesPhrase(combineText(section.title, section.content), ['air medical ambulance', 'air ambulance']),
          ),
          (section) => section.id,
        )
      : [];
    const ambulanceGeneralExclusionSections = ambulanceNotCoveredQuery
      ? uniqueBy(
          surfacedSections.filter((section) =>
            includesPhrase(combineText(section.title, section.content), ['general criteria not covered']),
          ),
          (section) => section.id,
        )
      : [];
    const telehealthAnchorSection = telehealthQuery
      ? (
          scored
            .filter(
              (entry) => scorePhraseMatches(normalizeSearchText(entry.section.title), TELEHEALTH_PRIMARY_SECTION_TERMS, 1) > 0,
            )
            .sort((left, right) => right.primaryScore - left.primaryScore)[0]?.section ??
          surfacedSections.find(
            (section) => scorePhraseMatches(normalizeSearchText(section.title), TELEHEALTH_PRIMARY_SECTION_TERMS, 1) > 0,
          ) ??
          null
        )
      : null;
    const primarySections = telehealthAnchorSection
      ? uniqueBy([telehealthAnchorSection, ...initialPrimarySections], (section) => section.id).slice(0, primaryLimit)
      : eligibilityFrameworkQuery && generalEligibilityAnchorSections.length > 0
        ? uniqueBy(
            [
              ...generalEligibilityAnchorSections,
              ...initialPrimarySections.filter(
                (section) => !generalEligibilityAdministrativeSections.some((candidate) => candidate.id === section.id),
              ),
            ],
            (section) => section.id,
          ).slice(0, primaryLimit)
      : congregatePcsQuery && (congregateCriteriaSections.length > 0 || congregateServiceSections.length > 0)
        ? uniqueBy(
            [
              ...congregateCriteriaSections,
              ...congregateServiceSections,
              ...initialPrimarySections.filter(
                (section) => !congregateWorkflowSections.some((candidate) => candidate.id === section.id),
              ),
            ],
            (section) => section.id,
          ).slice(0, primaryLimit)
      : ambulanceNotCoveredQuery && ambulanceSpecificNotCoveredSections.length > 0
        ? uniqueBy(
            [
              ...ambulanceSpecificNotCoveredSections,
              ...initialPrimarySections.filter(
                (section) => !ambulanceGeneralExclusionSections.some((candidate) => candidate.id === section.id),
              ),
            ],
            (section) => section.id,
          ).slice(0, primaryLimit)
      : notCoveredQuery && limitationAnchorSections.length > 0
        ? uniqueBy([...limitationAnchorSections, ...initialPrimarySections], (section) => section.id).slice(0, primaryLimit)
      : yesNoCoverageQuery && (yesNoCoverageScopeAnchorSections.length > 0 || limitationAnchorSections.length > 0)
        ? uniqueBy([...yesNoCoverageScopeAnchorSections, ...limitationAnchorSections, ...initialPrimarySections], (section) => section.id)
            .slice(0, primaryLimit)
      : yesNoCoverageAnchorSections.length > 0
        ? uniqueBy([...yesNoCoverageAnchorSections, ...initialPrimarySections], (section) => section.id).slice(0, primaryLimit)
      : notCoveredAnchorSections.length > 0
        ? uniqueBy([...notCoveredAnchorSections, ...initialPrimarySections], (section) => section.id).slice(0, primaryLimit)
      : initialPrimarySections;
    const rebalancedPrimaryIds = new Set(primarySections.map((section) => section.id));
    const shouldMergeInitialPrimaryIntoSupporting =
      telehealthAnchorSection != null ||
      notCoveredQuery && limitationAnchorSections.length > 0 ||
      yesNoCoverageQuery && (yesNoCoverageScopeAnchorSections.length > 0 || limitationAnchorSections.length > 0) ||
      notCoveredAnchorSections.length > 0;
    let supportingSections = shouldMergeInitialPrimaryIntoSupporting
      ? uniqueBy([...initialPrimarySections, ...initialSupportingSections], (section) => section.id)
          .filter((section) => !rebalancedPrimaryIds.has(section.id))
          .slice(0, FRAME_SUPPORT_LIMIT)
      : initialSupportingSections;
    const demotedTelehealthTableSections =
      telehealthQuery && !telehealthServiceListQuery
        ? supportingSections.filter((section) => isTelehealthServiceTableSection(section))
        : [];
    const demotedTelehealthContextSections = telehealthQuery
      ? supportingSections.filter(
          (section) => scorePhraseMatches(combineText(section.title, section.content), telehealthAvoidTerms, 1) > 0,
        )
      : [];
    if (demotedTelehealthTableSections.length > 0 && supportingSections.length > demotedTelehealthTableSections.length) {
      supportingSections = supportingSections.filter((section) => !isTelehealthServiceTableSection(section));
    }
    if (demotedTelehealthContextSections.length > 0 && supportingSections.length > demotedTelehealthContextSections.length) {
      const demotedIds = new Set(demotedTelehealthContextSections.map((section) => section.id));
      supportingSections = supportingSections.filter((section) => !demotedIds.has(section.id));
    }
    if (ambulanceNotCoveredQuery && ambulanceCoverageContrastSections.length > 0) {
      supportingSections = uniqueBy(
        [
          ...ambulanceCoverageContrastSections,
          ...supportingSections.filter((section) => !ambulanceGeneralExclusionSections.some((candidate) => candidate.id === section.id)),
        ],
        (section) => section.id,
      )
        .filter((section) => !rebalancedPrimaryIds.has(section.id))
        .slice(0, FRAME_SUPPORT_LIMIT);
    }
    if (congregatePcsQuery) {
      supportingSections = uniqueBy(
        [
          ...congregateServiceSections,
          ...congregateRoomAndBoardSections,
          ...supportingSections.filter(
            (section) =>
              !congregateWorkflowSections.some((candidate) => candidate.id === section.id) &&
              !(
                congregateRoomAndBoardSections.length > 0 &&
                congregateGeneralLimitationSections.some((candidate) => candidate.id === section.id)
              ),
          ),
        ],
        (section) => section.id,
      )
        .filter((section) => !rebalancedPrimaryIds.has(section.id))
        .slice(0, FRAME_SUPPORT_LIMIT);
    }
    if (eligibilityFrameworkQuery) {
      const preferredGeneralSupporting = uniqueBy(
        [
          ...generalEligibilityContextSections,
          ...supportingSections.filter(
            (section) =>
              !generalEligibilityAdministrativeSections.some((candidate) => candidate.id === section.id) &&
              !generalEligibilityLimitationSections.some((candidate) => candidate.id === section.id),
          ),
        ],
        (section) => section.id,
      );
      const fallbackGeneralSupporting = supportingSections.filter(
        (section) => !generalEligibilityAdministrativeSections.some((candidate) => candidate.id === section.id),
      );
      supportingSections = (preferredGeneralSupporting.length > 0 ? preferredGeneralSupporting : fallbackGeneralSupporting)
        .filter((section) => !rebalancedPrimaryIds.has(section.id))
        .slice(0, FRAME_SUPPORT_LIMIT);
    }
    const surfacedIds = new Set([...rebalancedPrimaryIds, ...supportingSections.map((section) => section.id)]);
    const avoidSections = uniqueBy(
      [
        ...frame.avoidSections,
        ...demotedTelehealthTableSections,
        ...demotedTelehealthContextSections,
        ...ambulanceGeneralExclusionSections,
        ...congregateWorkflowSections,
        ...generalEligibilityAdministrativeSections,
        ...generalEligibilityLimitationSections,
      ],
      (section) => section.id,
    ).filter((section) => !surfacedIds.has(section.id));

    return {
      ...frame,
      primarySections,
      supportingSections,
      avoidSections,
    };
  };

  const rebalanceFederalAuthorityFrame = (frame: AnswerFrame, queryLower: string): AnswerFrame => {
    const surfacedSections = uniqueBy(
      [...frame.primarySections, ...frame.supportingSections, ...frame.avoidSections],
      (section) => section.id,
    );
    if (surfacedSections.length === 0) return frame;

    const waiverApplicationQuery = isWaiverApplicationQuery(queryLower);
    const publicNoticeQuery = asksForPublicNoticeDetails(queryLower);
    if (!waiverApplicationQuery) return frame;

    const waiverPrimarySections = uniqueBy(
      surfacedSections.filter((section) => {
        const text = combineText(section.sectionNumber, section.title, section.content, section.documentTitle);
        const sectionNumber = normalizeSearchText(section.sectionNumber);
        return (
          section.documentType?.startsWith('federal_') &&
          !includesPhrase(text, WAIVER_APPLICATION_AVOID_TERMS) &&
          (
            sectionNumber.startsWith('441.30') ||
            sectionNumber === '440.180'
          )
        );
      }),
      (section) => section.id,
    );
    const proceduralSections = uniqueBy(
      surfacedSections.filter((section) =>
        includesPhrase(combineText(section.sectionNumber, section.title, section.content, section.documentTitle), [
          ...WAIVER_APPLICATION_AVOID_TERMS,
          '431.408',
        ]),
      ),
      (section) => section.id,
    );
    const implementationSections = uniqueBy(
      surfacedSections.filter((section) => section.documentType && !section.documentType.startsWith('federal_')),
      (section) => section.id,
    );

    const primarySections =
      waiverPrimarySections.length > 0
        ? waiverPrimarySections.slice(0, FRAME_PRIMARY_LIMIT)
        : frame.primarySections;
    const primaryIds = new Set(primarySections.map((section) => section.id));
    const supportingSections = uniqueBy(
      [
        ...implementationSections,
        ...frame.supportingSections,
        ...(publicNoticeQuery ? proceduralSections : []),
      ],
      (section) => section.id,
    )
      .filter(
        (section) =>
          !primaryIds.has(section.id) &&
          (publicNoticeQuery || !proceduralSections.some((candidate) => candidate.id === section.id)),
      )
      .slice(0, FRAME_SUPPORT_LIMIT);
    const surfacedIds = new Set([...primaryIds, ...supportingSections.map((section) => section.id)]);
    const primaryDocumentIds = dedupeTerms(
      primarySections.map((section) => section.documentId).filter((documentId): documentId is string => Boolean(documentId)),
    );
    const authoritativeDocuments = uniqueBy(
      [
        ...primaryDocumentIds
          .map((documentId) => frame.authoritativeDocuments.find((document) => document.id === documentId))
          .filter((document): document is AnswerFrameDocument => document != null),
        ...frame.authoritativeDocuments,
      ],
      (document) => document.id,
    );

    return {
      ...frame,
      authoritativeDocuments,
      primarySections,
      supportingSections,
      avoidSections: uniqueBy([...frame.avoidSections, ...proceduralSections], (section) => section.id).filter(
        (section) => !surfacedIds.has(section.id),
      ),
    };
  };

  const rebalancePriorAuthFrame = (frame: AnswerFrame, queryLower: string): AnswerFrame => {
    const surfacedSections = uniqueBy(
      [...frame.primarySections, ...frame.supportingSections, ...frame.avoidSections],
      (section) => section.id,
    );
    if (surfacedSections.length === 0) return frame;

    const pharmacyQuantityQuery = isPharmacyQuantityPriorAuthQuery(queryLower);
    const submissionProcessQuery = asksForPriorAuthSubmissionProcess(queryLower);
    const quantitySections = pharmacyQuantityQuery
      ? uniqueBy(surfacedSections.filter((section) => isPriorAuthQuantitySection(section)), (section) => section.id)
      : [];
    const contentfulCriteriaSections = uniqueBy(
      surfacedSections.filter((section) => isPriorAuthCriteriaSection(section) && !isTitleOnlySection(section)),
      (section) => section.id,
    );
    const titleOnlyCriteriaSections = uniqueBy(
      surfacedSections.filter((section) => isPriorAuthCriteriaSection(section) && isTitleOnlySection(section)),
      (section) => section.id,
    );
    const processSections = uniqueBy(
      surfacedSections.filter((section) => isPriorAuthProcessSection(section)),
      (section) => section.id,
    );
    const exceptionSections = pharmacyQuantityQuery
      ? uniqueBy(surfacedSections.filter((section) => isPriorAuthExceptionSection(section)), (section) => section.id)
      : [];
    const generalPriorAuthSections = uniqueBy(
      surfacedSections.filter((section) => {
        const text = combineText(section.sectionNumber, section.title, section.content);
        return (
          includesPhrase(text, ['5.1 prior authorization', 'requirements for and limitations on coverage']) &&
          !isPriorAuthProcessSection(section) &&
          !isPriorAuthCriteriaSection(section) &&
          !isPriorAuthExceptionSection(section)
        );
      }),
      (section) => section.id,
    );
    const quantityRelevantSupportingSections = pharmacyQuantityQuery
      ? uniqueBy(
          surfacedSections.filter((section) => {
            const text = combineText(section.sectionNumber, section.title, section.content);
            return (
              isPriorAuthCriteriaSection(section) ||
              isPriorAuthQuantitySection(section) ||
              includesPhrase(text, ['5.0 requirements for and limitations on coverage', '5.1 prior authorization'])
            );
          }),
          (section) => section.id,
        )
      : [];
    const demoteProcessSections = !submissionProcessQuery;

    const removeDemotedProcessSections = (sections: AnswerFrameSection[]): AnswerFrameSection[] =>
      demoteProcessSections
        ? sections.filter((section) => !processSections.some((candidate) => candidate.id === section.id))
        : sections;

    if (!pharmacyQuantityQuery) {
      const primarySections = removeDemotedProcessSections(frame.primarySections);
      const primaryIds = new Set(primarySections.map((section) => section.id));
      const supportingSections = removeDemotedProcessSections(frame.supportingSections).filter(
        (section) => !primaryIds.has(section.id),
      );
      const surfacedIds = new Set([...primaryIds, ...supportingSections.map((section) => section.id)]);
      return {
        ...frame,
        primarySections,
        supportingSections,
        avoidSections: uniqueBy([...frame.avoidSections, ...processSections], (section) => section.id).filter(
          (section) => !surfacedIds.has(section.id),
        ),
      };
    }

    const primarySections = uniqueBy(
      [
        ...quantitySections,
        ...contentfulCriteriaSections,
        ...removeDemotedProcessSections(frame.primarySections).filter(
          (section) =>
            !exceptionSections.some((candidate) => candidate.id === section.id) &&
            !titleOnlyCriteriaSections.some((candidate) => candidate.id === section.id),
        ),
      ],
      (section) => section.id,
    ).slice(0, FRAME_PRIMARY_LIMIT);
    const primaryIds = new Set(primarySections.map((section) => section.id));
    const supportingSections = uniqueBy(
      [
        ...titleOnlyCriteriaSections,
        ...quantityRelevantSupportingSections,
        ...generalPriorAuthSections,
      ],
      (section) => section.id,
    )
      .filter(
        (section) =>
          !primaryIds.has(section.id) &&
          !exceptionSections.some((candidate) => candidate.id === section.id),
      )
      .slice(0, FRAME_SUPPORT_LIMIT);
    const surfacedIds = new Set([...primaryIds, ...supportingSections.map((section) => section.id)]);
    const avoidSections = uniqueBy(
      [...frame.avoidSections, ...processSections, ...exceptionSections],
      (section) => section.id,
    ).filter((section) => !surfacedIds.has(section.id));

    return {
      ...frame,
      primarySections,
      supportingSections,
      avoidSections,
    };
  };

  const buildPolicyVariantFrameForDocuments = async (
    query: string,
    candidateDocuments: DocumentWithSectionsView[],
    route: AnswerFrameRoute = selectAnswerRoute(normalizeSearchText(query), 'policy_variant'),
  ): Promise<AnswerFrame> => {
    const queryLower = normalizeSearchText(query);
    if (candidateDocuments.length === 0) {
      return buildEmptyAnswerFrame('policy_variant', route);
    }

    const policyNumbers = collectPolicyNumbersForQuery(query);
    const authoritativeCandidates = candidateDocuments.map((document) =>
      scoreVariantDocument(document, queryLower, policyNumbers),
    );
    const authoritativeDocuments = pickTopDocumentCandidates(authoritativeCandidates);
    const preferredDocumentId = authoritativeDocuments[0]?.id ?? null;
    const preferredDocuments = preferredDocumentId
      ? candidateDocuments.filter((document) => document.id === preferredDocumentId)
      : [];
    const siblingDocuments = preferredDocumentId
      ? candidateDocuments.filter((document) => document.id !== preferredDocumentId)
      : candidateDocuments;
    const primarySections = await collectDocumentSectionCandidates(
      preferredDocuments,
      SCOPE_SECTION_TERMS,
      COVERAGE_AVOID_TERMS,
      'Scope/general section from the preferred policy variant.',
    );
    const supportingSections = await collectDocumentSectionCandidates(
      siblingDocuments,
      SCOPE_SECTION_TERMS,
      COVERAGE_AVOID_TERMS,
      'Scope/general section from a sibling policy variant for comparison.',
    );

    return {
      questionType: 'policy_variant',
      route,
      authoritativeDocuments,
      primarySections: primarySections.map((candidate) => candidate.section),
      supportingSections: supportingSections.map((candidate) => candidate.section),
      avoidSections: [],
      latestRevision: null,
      variantReasoning: authoritativeDocuments[0]?.reason ?? null,
    };
  };

  const resolvePolicyVariantFrameInternal = async (
    query: string,
    route: AnswerFrameRoute = selectAnswerRoute(normalizeSearchText(query), 'policy_variant'),
  ): Promise<AnswerFrame> => {
    const lookupDocuments = await collectLookupDocuments(query);
    const candidateDocuments =
      lookupDocuments.length > 0
        ? lookupDocuments
        : await collectPolicyDocumentsFromHits(query, await searchSectionsDetailed({ query, topK: 16 }), FRAME_DOCUMENT_LIMIT + 1);
    return buildPolicyVariantFrameForDocuments(query, candidateDocuments, route);
  };

  const resolveCoverageFrameInternal = async (
    query: string,
    route: AnswerFrameRoute = selectAnswerRoute(normalizeSearchText(query), 'coverage'),
  ): Promise<AnswerFrame> => {
    const queryLower = normalizeSearchText(query);
    const certificationQuery = asksForCertificationDetails(queryLower);
    const telehealthQuery = isTelehealthQuery(queryLower);
    const congregatePcsQuery = isCongregatePcsQuery(queryLower);
    const yesNoCoverageQuery = isYesNoCoverageQuery(queryLower);
    const hcwdIncomePremiumQuery = isHcwdIncomePremiumQuery(queryLower);
    const baseHits = await searchSectionsDetailed({
      query,
      topK: route.lane === 'deterministic_evidence' ? 16 : route.lane === 'baseline_hybrid' ? 18 : 24,
    });
    const hcwdHistoryHits =
      hcwdIncomePremiumQuery && asksForEarnedIncomeLimit(queryLower)
        ? await collectHcwdIncomeHistoryHits()
        : [];
    const queryTerms = extractSearchTerms(query);
    const serviceFocusTerms = extractServiceFocusTerms(query);
    const focusHits = serviceFocusTerms.length === 0 || route.lane === 'deterministic_evidence'
      ? []
      : await searchSectionsDetailed({
          query: serviceFocusTerms.join(' '),
          topK: route.lane === 'baseline_hybrid' ? 8 : 12,
        });
    const hits = uniqueBy(
      [
        ...focusHits.map((hit) => ({
          ...hit,
          score: hit.score + 0.08,
        })),
        ...baseHits,
        ...hcwdHistoryHits.map((hit) => ({
          ...hit,
          score: hit.score + 0.12,
        })),
      ],
      (hit) => hit.sectionId,
    );
    const routingDocuments = await collectCoverageRoutingDocuments(query, hits);
    const variantFrame =
      route.widening_policy !== 'none' && routingDocuments.length > 1 && looksLikeSiblingPolicySet(routingDocuments)
        ? await buildPolicyVariantFrameForDocuments(query, routingDocuments, selectAnswerRoute(queryLower, 'policy_variant'))
        : null;
    const preferredDocumentId = variantFrame?.authoritativeDocuments[0]?.id ?? null;
    const preferredRoutingDocuments = preferredDocumentId
      ? routingDocuments.filter((document) => document.id === preferredDocumentId)
      : routingDocuments;
    const scopedRoutingDocuments = preferredRoutingDocuments.length > 0 ? preferredRoutingDocuments : routingDocuments;
    const preferredPolicyNumbers = new Set(
      scopedRoutingDocuments
        .map((document) => document.policyNumber?.toUpperCase())
        .filter((policyNumber): policyNumber is string => Boolean(policyNumber)),
    );
    const supplementalCandidateHits = hcwdIncomePremiumQuery
      ? hits.filter((hit) => {
          const documentTitle = normalizeSearchText(hit.documentTitle);
          const text = buildHitText(hit);
          return (
            documentTitle.includes('change notice') &&
            (documentTitle.includes('hcwd') || documentTitle.includes('health coverage for workers with disabilities')) &&
            includesPhrase(text, HCWD_LIMIT_HISTORY_TERMS)
          );
        })
      : [];
    const candidateHits =
      preferredPolicyNumbers.size === 0
        ? uniqueBy([...hits, ...supplementalCandidateHits], (hit) => hit.sectionId)
        : (() => {
            const scoped = hits.filter(
              (hit) => hit.policyNumber && preferredPolicyNumbers.has(hit.policyNumber.toUpperCase()),
            );
            return uniqueBy([...(scoped.length > 0 ? scoped : hits), ...supplementalCandidateHits], (hit) => hit.sectionId);
          })();
    const limitationHits = candidateHits.filter((hit) =>
      includesPhrase(buildHitText(hit), ['not covered', 'limitation', 'limitations', 'exclusion']),
    );
    const primaryHits = candidateHits.filter(
      (hit) => !limitationHits.some((candidate) => candidate.sectionId === hit.sectionId),
    );
    const serviceFocusedHits = serviceFocusTerms.length === 0
      ? []
      : uniqueBy([...focusHits, ...primaryHits], (hit) => hit.sectionId).filter((hit) => {
          const focusMatches =
            scoreTermMatches(serviceFocusTerms, hit.sectionTitle) +
            Math.min(scoreTermMatches(serviceFocusTerms, hit.content), 4);
          return focusMatches >= 2;
        });
    const weaklyServiceFocusedHits = serviceFocusTerms.length === 0
      ? []
      : uniqueBy([...focusHits, ...primaryHits], (hit) => hit.sectionId).filter((hit) => {
          const focusMatches =
            scoreTermMatches(serviceFocusTerms, hit.sectionTitle) +
            Math.min(scoreTermMatches(serviceFocusTerms, hit.content), 4);
          return focusMatches >= 1;
        });
    const coverageFocusedPrimaryHits = primaryHits.filter(
      (hit) => {
        const titleText = normalizeSearchText(hit.sectionTitle);
        const querySpecificMatches =
          scoreTermMatches(queryTerms, hit.sectionTitle) + Math.min(scoreTermMatches(queryTerms, hit.content), 4);
        return includesPhrase(titleText, COVERAGE_PRIMARY_TERMS) || querySpecificMatches >= 3;
      },
    );
    const primarySeedHits =
      serviceFocusedHits.length > 0
        ? serviceFocusedHits
        : weaklyServiceFocusedHits.length > 0
          ? weaklyServiceFocusedHits
          : coverageFocusedPrimaryHits.length > 0
          ? coverageFocusedPrimaryHits
          : primaryHits.slice(0, 3);
    const serviceClusterTerms = extractTitleClusterTerms(
      primarySeedHits[0]?.sectionTitle ?? primaryHits[0]?.sectionTitle ?? null,
    );
    const documentPrimaryHydrated = uniqueBy(
      [
        ...((isEligibilityCriteriaQuery(queryLower) || asksForGeneralCriteria(queryLower))
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              ELIGIBILITY_BASELINE_SECTION_TERMS,
              COVERAGE_AVOID_TERMS,
              'Baseline Medicaid-program eligibility section from the preferred document.',
              FRAME_PRIMARY_LIMIT,
            )
          : []),
        ...((isEligibilityCriteriaQuery(queryLower) || asksForGeneralCriteria(queryLower))
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              GENERAL_CRITERIA_SECTION_TERMS,
              NOT_COVERED_SECTION_TERMS,
              'General eligibility or coverage section from the preferred document.',
              FRAME_PRIMARY_LIMIT,
            )
          : []),
        ...(yesNoCoverageQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              COVERAGE_SCOPE_SECTION_TERMS,
              [...COVERAGE_AVOID_TERMS, ...COVERAGE_WORKFLOW_AVOID_TERMS],
              'Scope or description section for the yes/no coverage question.',
              FRAME_PRIMARY_LIMIT,
            )
          : []),
        ...((isPediatricQuery(queryLower) || queryLower.includes('epsdt'))
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              PEDIATRIC_COVERAGE_SECTION_TERMS,
              COVERAGE_AVOID_TERMS,
              'EPSDT or pediatric service section from the preferred document.',
              FRAME_PRIMARY_LIMIT,
            )
          : []),
        ...(isModificationReviewQuery(queryLower)
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              MODIFICATION_SECTION_TERMS,
              COVERAGE_AVOID_TERMS,
              'Coverage or documentation section for the requested modification service.',
              FRAME_PRIMARY_LIMIT,
            )
          : []),
        ...(telehealthQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              TELEHEALTH_PRIMARY_SECTION_TERMS,
              [...COVERAGE_AVOID_TERMS, ...TELEHEALTH_AVOID_TERMS],
              'Telehealth coverage section from the preferred document.',
              FRAME_PRIMARY_LIMIT,
            )
          : []),
        ...(yesNoCoverageQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              YES_NO_COVERAGE_SECTION_TERMS,
              [...COVERAGE_AVOID_TERMS, ...COVERAGE_WORKFLOW_AVOID_TERMS],
              'Scope or not-covered section for the yes/no coverage question.',
              FRAME_PRIMARY_LIMIT,
            )
          : []),
        ...(certificationQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              CERTIFICATION_SECTION_TERMS,
              COVERAGE_AVOID_TERMS,
              'Certification or recertification section from the preferred document.',
              FRAME_PRIMARY_LIMIT,
            )
          : []),
        ...(hcwdIncomePremiumQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              HCWD_PRIMARY_SECTION_TERMS,
              [...COVERAGE_AVOID_TERMS, 'notice', 'authorization'],
              'Income, fee, or premium section from the preferred HCWD document.',
              FRAME_PRIMARY_LIMIT,
            )
          : []),
        ...(queryLower.includes('cover')
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              COVERAGE_DETAIL_SECTION_TERMS,
              NOT_COVERED_SECTION_TERMS,
              'Direct coverage-detail section from the preferred document.',
              FRAME_PRIMARY_LIMIT,
            )
          : []),
        ...(congregatePcsQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              CONGREGATE_PCS_CRITERIA_SECTION_TERMS,
              [...COVERAGE_AVOID_TERMS, ...COVERAGE_WORKFLOW_AVOID_TERMS],
              'Congregate PCS beneficiary and facility criteria section from the preferred document.',
              FRAME_PRIMARY_LIMIT,
            )
          : []),
        ...(congregatePcsQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              CONGREGATE_PCS_COVERED_SERVICE_SECTION_TERMS,
              [...COVERAGE_AVOID_TERMS, ...COVERAGE_WORKFLOW_AVOID_TERMS],
              'Congregate PCS covered-service section from the preferred document.',
              FRAME_PRIMARY_LIMIT,
            )
          : []),
        ...(congregatePcsQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              CONGREGATE_PCS_SUPPORT_SECTION_TERMS,
              [...COVERAGE_AVOID_TERMS, ...COVERAGE_WORKFLOW_AVOID_TERMS],
              'Congregate PCS covered-service or non-covered section from the preferred document.',
              FRAME_PRIMARY_LIMIT,
            )
          : []),
      ],
      (candidate) => candidate.section.id,
    );
    const documentSupportingHydrated = uniqueBy(
      [
        ...(asksForNotCoveredDetails(queryLower)
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              NOT_COVERED_SECTION_TERMS,
              [],
              'Not-covered section from the preferred document.',
              FRAME_SUPPORT_LIMIT,
            )
          : []),
        ...(isEligibilityCriteriaQuery(queryLower)
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              ELIGIBILITY_SCOPE_SECTION_TERMS,
              COVERAGE_AVOID_TERMS,
              'Program scope or description section from the preferred document.',
              FRAME_SUPPORT_LIMIT,
            )
          : []),
        ...(yesNoCoverageQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              COVERAGE_SCOPE_SECTION_TERMS,
              [...COVERAGE_AVOID_TERMS, ...COVERAGE_WORKFLOW_AVOID_TERMS],
              'Additional scope or description section for the yes/no coverage question.',
              FRAME_SUPPORT_LIMIT,
            )
          : []),
        ...((isPediatricQuery(queryLower) || queryLower.includes('epsdt'))
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              PEDIATRIC_COVERAGE_SECTION_TERMS,
              COVERAGE_AVOID_TERMS,
              'Additional EPSDT or pediatric service section from the preferred document.',
              FRAME_SUPPORT_LIMIT,
            )
          : []),
        ...(isModificationReviewQuery(queryLower)
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              MODIFICATION_SECTION_TERMS,
              COVERAGE_AVOID_TERMS,
              'Additional coverage or documentation section for the requested modification service.',
              FRAME_SUPPORT_LIMIT,
            )
          : []),
        ...(telehealthQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              TELEHEALTH_SUPPORT_SECTION_TERMS,
              [...COVERAGE_AVOID_TERMS, ...TELEHEALTH_AVOID_TERMS],
              'Service-specific telehealth section from the preferred document.',
              FRAME_SUPPORT_LIMIT,
            )
          : []),
        ...(yesNoCoverageQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              YES_NO_COVERAGE_SECTION_TERMS,
              [...COVERAGE_AVOID_TERMS, ...COVERAGE_WORKFLOW_AVOID_TERMS],
              'Additional scope or not-covered section for the yes/no coverage question.',
              FRAME_SUPPORT_LIMIT,
            )
          : []),
        ...(certificationQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              CERTIFICATION_SECTION_TERMS,
              COVERAGE_AVOID_TERMS,
              'Additional certification or recertification section from the preferred document.',
              FRAME_SUPPORT_LIMIT,
            )
          : []),
        ...(hcwdIncomePremiumQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              HCWD_PRIMARY_SECTION_TERMS,
              [...COVERAGE_AVOID_TERMS, 'notice', 'authorization'],
              'Additional income, fee, or premium section from the preferred HCWD document.',
              FRAME_SUPPORT_LIMIT,
            )
          : []),
        ...((yesNoCoverageQuery || asksForNotCoveredDetails(queryLower))
          ? await collectLikelyCoverageLimitationSectionCandidates(
              scopedRoutingDocuments,
              'Likely limitation or non-covered subsection from the preferred document.',
              FRAME_SUPPORT_LIMIT,
            )
          : []),
        ...(congregatePcsQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              CONGREGATE_PCS_COVERED_SERVICE_SECTION_TERMS,
              [...COVERAGE_AVOID_TERMS, ...COVERAGE_WORKFLOW_AVOID_TERMS],
              'Additional congregate PCS covered-service section from the preferred document.',
              FRAME_SUPPORT_LIMIT,
            )
          : []),
        ...(congregatePcsQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              CONGREGATE_PCS_NOT_COVERED_SECTION_TERMS,
              [...COVERAGE_AVOID_TERMS, ...COVERAGE_WORKFLOW_AVOID_TERMS],
              'Room-and-board or specific non-covered congregate PCS section from the preferred document.',
              FRAME_SUPPORT_LIMIT,
            )
          : []),
        ...(congregatePcsQuery
          ? await collectDocumentSectionCandidates(
              scopedRoutingDocuments,
              CONGREGATE_PCS_SUPPORT_SECTION_TERMS,
              [...COVERAGE_AVOID_TERMS, ...COVERAGE_WORKFLOW_AVOID_TERMS],
              'Additional congregate PCS covered-service or non-covered section from the preferred document.',
              FRAME_SUPPORT_LIMIT,
            )
          : []),
      ],
      (candidate) => candidate.section.id,
    );
    const primaryCandidateLimit = serviceFocusTerms.length > 0 ? 2 : FRAME_PRIMARY_LIMIT * 2;
    const primaryCandidates = uniqueBy(
      [
        ...toSectionCandidates(documentPrimaryHydrated, 0.35),
        ...buildSectionCandidates(
          primarySeedHits,
          COVERAGE_PRIMARY_TERMS,
          COVERAGE_AVOID_TERMS,
          primaryCandidateLimit,
          'Primary coverage evidence.',
        ),
      ],
      (candidate) => candidate.sectionId,
    ).slice(0, FRAME_PRIMARY_LIMIT * 2);
    const limitationCandidates = buildSectionCandidates(
      limitationHits,
      ['not covered', 'limitation', 'limitations', 'exclusion'],
      [],
      FRAME_SUPPORT_LIMIT * 4,
      'Supporting limitation evidence.',
    );
    const numberedClusteredSupportingCandidates = serviceClusterTerms.length === 0
      ? []
      : buildSectionCandidates(
          candidateHits.filter((hit) => hit.sectionNumber && scoreTermMatches(serviceClusterTerms, hit.sectionTitle) >= 2),
          serviceClusterTerms,
          [],
          FRAME_SUPPORT_LIMIT * 4,
          'Supporting numbered section from the same service cluster.',
        );
    const clusteredSupportingCandidates = serviceClusterTerms.length === 0
      ? []
      : buildSectionCandidates(
          candidateHits.filter((hit) => scoreTermMatches(serviceClusterTerms, hit.sectionTitle) >= 2),
          serviceClusterTerms,
          [],
          FRAME_SUPPORT_LIMIT * 4,
          'Supporting section from the same service cluster.',
        );
    const supportingCandidates = uniqueBy(
      [
        ...toSectionCandidates(documentSupportingHydrated, 0.35),
        ...limitationCandidates,
        ...numberedClusteredSupportingCandidates,
        ...clusteredSupportingCandidates,
        ...buildSectionCandidates(
          [...limitationHits, ...candidateHits],
          [...COVERAGE_SUPPORT_TERMS, ...serviceClusterTerms],
          PRIOR_AUTH_AVOID_TERMS,
          FRAME_SUPPORT_LIMIT * 4,
          'Supporting limitation or documentation evidence.',
        ),
      ],
      (candidate) => candidate.sectionId,
    ).slice(0, FRAME_SUPPORT_LIMIT * 4);
    const avoidCandidates = buildSectionCandidates(
      candidateHits,
      [...PRIOR_AUTH_AVOID_TERMS, ...COVERAGE_AVOID_TERMS, ...(telehealthQuery ? TELEHEALTH_AVOID_TERMS : [])],
      [],
      FRAME_AVOID_LIMIT,
      'Tangential or process-focused section to avoid unless explicitly requested.',
    );

    const authoritativeCandidates: DocumentCandidate[] = [
      ...(variantFrame?.authoritativeDocuments ?? []).map((document, index) => ({
        document,
        reason: document.reason ?? 'Preferred policy variant for the coverage question.',
        score: 1.3 - index * 0.1,
      })),
      ...scopedRoutingDocuments.map((document) => ({
        document: extractDocumentView(document),
        reason: 'Policy-number lookup result related to the coverage question.',
        score: 1.0,
      })),
    ];

    const frame = await finalizeFrame({
      questionType: 'coverage',
      route,
      authoritativeCandidates,
      primaryCandidates,
      supportingCandidates,
      avoidCandidates,
      variantReasoning: variantFrame?.variantReasoning ?? null,
      latestRevisionSections: [],
    });
    return rebalanceCoverageFrame(frame, queryLower, serviceFocusTerms, serviceClusterTerms);
  };

  const resolvePriorAuthFrameInternal = async (
    query: string,
    route: AnswerFrameRoute = selectAnswerRoute(normalizeSearchText(query), 'prior_authorization'),
  ): Promise<AnswerFrame> => {
    const queryLower = normalizeSearchText(query);
    const hits = await searchSectionsDetailed({
      query,
      topK: route.lane === 'deterministic_evidence' ? 10 : 12,
    });
    const lookupDocuments = await collectLookupDocuments(query);
    const routingDocuments =
      lookupDocuments.length > 0 ? lookupDocuments : await collectPolicyDocumentsFromHits(query, hits, FRAME_DOCUMENT_LIMIT);
    const primaryCandidates = buildSectionCandidates(
      hits,
      PRIOR_AUTH_PRIMARY_TERMS,
      PRIOR_AUTH_AVOID_TERMS,
      FRAME_PRIMARY_LIMIT * 2,
      'Primary prior-authorization criteria section.',
    );
    const supportingCandidates = buildSectionCandidates(
      hits,
      PRIOR_AUTH_SUPPORT_TERMS,
      PRIOR_AUTH_AVOID_TERMS,
      FRAME_SUPPORT_LIMIT * 2,
      'Supporting medical-necessity or coverage section.',
    );
    const avoidCandidates = buildSectionCandidates(
      hits,
      PRIOR_AUTH_AVOID_TERMS,
      [],
      FRAME_AVOID_LIMIT,
      'Submission or request-process section that is secondary to the criteria.',
    );
    const documentPrimaryCandidates = toSectionCandidates(
      await collectDocumentSectionCandidates(
        routingDocuments,
        PRIOR_AUTH_DOCUMENT_SECTION_TERMS,
        PRIOR_AUTH_AVOID_TERMS,
        'Title-matched prior-authorization criteria section from the preferred document.',
        FRAME_PRIMARY_LIMIT * 2,
      ),
      0.08,
    );
    const quantityDocumentPrimaryCandidates = isPharmacyQuantityPriorAuthQuery(queryLower)
      ? toSectionCandidates(
          await collectDocumentSectionCandidates(
            routingDocuments,
            PRIOR_AUTH_QUANTITY_TERMS,
            PRIOR_AUTH_AVOID_TERMS,
            'Quantity-limit section from the governing pharmacy policy.',
            Math.max(FRAME_PRIMARY_LIMIT, 2),
          ),
          0.2,
        )
      : [];
    const criteriaDocumentPrimaryCandidates = isPharmacyQuantityPriorAuthQuery(queryLower)
      ? toSectionCandidates(
          await collectDocumentSectionCandidates(
            routingDocuments,
            PRIOR_AUTH_CRITERIA_SECTION_TERMS,
            PRIOR_AUTH_AVOID_TERMS,
            'Pharmacy prior-approval criteria section from the governing policy.',
            Math.max(FRAME_PRIMARY_LIMIT, 2),
          ),
          0.16,
        )
      : [];
    const documentSupportingCandidates = toSectionCandidates(
      await collectDocumentSectionCandidates(
        routingDocuments,
        PRIOR_AUTH_SUPPORT_TERMS,
        PRIOR_AUTH_AVOID_TERMS,
        'Title-matched supporting prior-authorization section from the preferred document.',
        FRAME_SUPPORT_LIMIT * 2,
      ),
      0.04,
    );

    const authoritativeCandidates = lookupDocuments.map((document) => ({
      document: extractDocumentView(document),
      reason: 'Policy lookup result for the prior-authorization question.',
      score: 1.0,
    }));

    const frame = await finalizeFrame({
      questionType: 'prior_authorization',
      route,
      authoritativeCandidates,
      primaryCandidates: uniqueBy(
        [
          ...quantityDocumentPrimaryCandidates,
          ...criteriaDocumentPrimaryCandidates,
          ...documentPrimaryCandidates,
          ...primaryCandidates,
        ],
        (candidate) => candidate.sectionId,
      ),
      supportingCandidates: uniqueBy(
        [...documentSupportingCandidates, ...supportingCandidates],
        (candidate) => candidate.sectionId,
      ),
      avoidCandidates,
    });

    return rebalancePriorAuthFrame(frame, queryLower);
  };

  const resolveAmendmentFrameInternal = async (
    query: string,
    route: AnswerFrameRoute = selectAnswerRoute(normalizeSearchText(query), 'amendment'),
  ): Promise<AnswerFrame> => {
    const hits = await searchSectionsDetailed({
      query,
      topK: route.lane === 'deterministic_evidence' ? 10 : 12,
    });
    const latestRevisionOnly = route.determinism_hints.latest_revision_only;
    const revisionHeaderHits = hits.filter((hit) => isRevisionHeaderTitle(hit.sectionTitle));
    const latestRevisionMarkerValue = revisionHeaderHits.reduce<number | null>((latest, hit) => {
      const candidate = changeMarkerValueForHit(hit);
      if (candidate === null) return latest;
      if (latest === null || candidate > latest) return candidate;
      return latest;
    }, null);
    const latestRevisionHeaderHits =
      latestRevisionOnly && latestRevisionMarkerValue !== null
        ? revisionHeaderHits.filter((hit) => changeMarkerValueForHit(hit) === latestRevisionMarkerValue)
        : revisionHeaderHits;
    const latestRevisionPrimaryCandidates =
      latestRevisionOnly && latestRevisionHeaderHits.length > 0
        ? buildSectionCandidates(
            latestRevisionHeaderHits,
            AMENDMENT_PRIMARY_TERMS,
            COVERAGE_AVOID_TERMS,
            FRAME_PRIMARY_LIMIT * 2,
            'Latest revision header from the governing policy document.',
          )
        : [];
    const latestRevisionHydrated = latestRevisionOnly
      ? await hydrateSectionCandidates(latestRevisionPrimaryCandidates, FRAME_PRIMARY_LIMIT)
      : [];
    const lookupDocuments = await collectLookupDocuments(query);
    const baseDocuments = lookupDocuments.length > 0
      ? lookupDocuments
      : uniqueBy(
          (
            await Promise.all(
              dedupeTerms(hits.map((hit) => hit.sectionId)).slice(0, 4).map(async (sectionId) => {
                const section = await getSectionInternal(sectionId);
                if (!section?.documentId) return null;
                return getDocumentInternal(section.documentId);
              }),
            )
          ).filter((document): document is DocumentWithSectionsView => document != null),
          (document) => document.id,
        );
    const amendmentViews = await Promise.all(baseDocuments.map((document) => getAmendmentsInternal(document.id)));
    const authoritativeCandidates: DocumentCandidate[] = [
      ...(await collectDocumentsForSections(
        latestRevisionHydrated.map((candidate) => candidate.section),
        'Document containing the latest verified revision marker.',
      )).map((candidate, index) => ({
        ...candidate,
        score: 1.7 - index * 0.05,
      })),
    ];
    for (const [index, view] of amendmentViews.entries()) {
      if (!latestRevisionOnly && view.authoritativeDocument) {
        authoritativeCandidates.push({
          document: view.authoritativeDocument,
          reason: 'Authoritative document from amendment lookup.',
          score: 1.3 - index * 0.05,
        });
      }
      if (!latestRevisionOnly && view.baseDocument) {
        authoritativeCandidates.push({
          document: view.baseDocument,
          reason: 'Base document referenced by the amendment trail.',
          score: 0.9 - index * 0.05,
        });
      }
    }

    const primaryCandidates = uniqueBy(
      [
        ...latestRevisionPrimaryCandidates,
        ...buildSectionCandidates(
          latestRevisionOnly && latestRevisionHeaderHits.length > 0 ? latestRevisionHeaderHits : hits,
          AMENDMENT_PRIMARY_TERMS,
          COVERAGE_AVOID_TERMS,
          FRAME_PRIMARY_LIMIT * 2,
          latestRevisionOnly ? 'Latest revision header or marker section.' : 'Revision header or amendment section.',
        ),
      ],
      (candidate) => candidate.sectionId,
    );
    const supportingCandidates = asksForHistory(normalizeSearchText(query))
      ? buildSectionCandidates(
          hits,
          AMENDMENT_SUPPORT_TERMS,
          [],
          FRAME_SUPPORT_LIMIT * 2,
          'Older amendment context requested by the question.',
        )
      : [];
    const avoidCandidates = asksForHistory(normalizeSearchText(query)) || latestRevisionOnly
      ? []
      : buildSectionCandidates(
          latestRevisionOnly && latestRevisionHeaderHits.length > 0
            ? hits.filter((hit) => !latestRevisionHeaderHits.some((headerHit) => headerHit.sectionId === hit.sectionId))
            : hits,
          latestRevisionOnly
            ? ['content of change', 'change notice', 'effective date', 'history', 'background']
            : ['effective date', 'history', 'background'],
          [],
          FRAME_AVOID_LIMIT,
          latestRevisionOnly
            ? 'Older amendment details that should not displace the latest verified revision marker.'
            : 'Older or low-signal amendment context that should not displace the latest revision.',
        );

    return finalizeFrame({
      questionType: 'amendment',
      route,
      authoritativeCandidates,
      primaryCandidates,
      supportingCandidates,
      avoidCandidates,
    });
  };

  const resolveFederalAuthorityFrameInternal = async (
    query: string,
    route: AnswerFrameRoute = selectAnswerRoute(normalizeSearchText(query), 'federal_authority'),
  ): Promise<AnswerFrame> => {
    const queryLower = normalizeSearchText(query);
    const waiverApplicationQuery = isWaiverApplicationQuery(queryLower);
    const publicNoticeQuery = asksForPublicNoticeDetails(queryLower);
    const focusTerms = buildQueryFocusTerms(query);
    const quotedPhrases = extractQuotedPhrases(query);
    const mlrQuery = isMlrQuery(queryLower);
    const implementationSectionTerms = buildFederalImplementationSectionTerms(queryLower, focusTerms);
    const implementationLookupDocuments = asksForImplementation(queryLower)
      ? await collectImplementationLookupDocuments(query)
      : [];
    const federalHits = await searchSectionsDetailed({
      query,
      topK: 8,
      documentTypes: ['federal_regulation', 'federal_statute'],
    });
    const focusedFederalQuery = buildFocusedFederalQuery(query);
    const focusedFederalHits =
      focusedFederalQuery && focusedFederalQuery !== query
        ? await searchSectionsDetailed({
            query: focusedFederalQuery,
            topK: 8,
            documentTypes: ['federal_regulation', 'federal_statute'],
          })
        : [];
    const mergedFederalHits = uniqueBy(
      [
        ...focusedFederalHits.map((hit) => ({
          ...hit,
          score: hit.score + 0.08,
        })),
        ...federalHits,
      ],
      (hit) => hit.sectionId,
    );
    const rankedFederalHits = rankHitsByQueryFocus(mergedFederalHits, focusTerms, quotedPhrases);
    const waiverRankedFederalHits = waiverApplicationQuery
      ? [...rankedFederalHits]
          .map((hit) => {
            const text = buildHitText(hit);
            const sectionNumber = normalizeSearchText(hit.sectionNumber);
            let score = hit.score;

            if (
              hit.policyNumber?.toUpperCase() === '42-CFR-441' ||
              normalizeSearchText(hit.documentTitle).includes('42 cfr part 441')
            ) {
              score += 0.34;
            } else if (normalizeSearchText(hit.documentTitle).includes('42 cfr part 440')) {
              score += 0.12;
            }

            if (WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS.has(sectionNumber)) {
              score += 0.45;
            }

            if (includesPhrase(text, WAIVER_APPLICATION_PRIMARY_TERMS)) {
              score += 0.18;
            }

            if (includesPhrase(text, WAIVER_APPLICATION_AVOID_TERMS) || (!publicNoticeQuery && sectionNumber === '431.408')) {
              score -= 0.55;
            }

            return { ...hit, score };
          })
          .sort((left, right) => right.score - left.score)
      : rankedFederalHits;
    const preferredFederalDocumentTitles = selectPreferredDocumentTitlesByFocus(
      waiverApplicationQuery ? waiverRankedFederalHits : mergedFederalHits,
      waiverApplicationQuery ? dedupeTerms([...focusTerms, ...WAIVER_APPLICATION_PRIMARY_TERMS]) : focusTerms,
      quotedPhrases,
      1,
      0.08,
    );
    const primaryFederalHits =
      preferredFederalDocumentTitles.length === 0
        ? waiverApplicationQuery
          ? waiverRankedFederalHits
          : rankedFederalHits
        : (() => {
            const candidateHits = waiverApplicationQuery ? waiverRankedFederalHits : rankedFederalHits;
            const scoped = candidateHits.filter(
              (hit) => hit.documentTitle && preferredFederalDocumentTitles.includes(hit.documentTitle),
            );
            return scoped.length > 0 ? scoped : candidateHits;
          })();
    const scopedPrimaryFederalHits =
      waiverApplicationQuery
        ? filterHitsToFocusedContent(
            primaryFederalHits,
            dedupeTerms([...focusTerms, ...WAIVER_APPLICATION_PRIMARY_TERMS]),
            quotedPhrases,
          )
        : mlrQuery
          ? filterHitsToFocusedContent(
              primaryFederalHits,
              dedupeTerms([...focusTerms, ...MLR_FEDERAL_PRIMARY_SECTION_TERMS]),
              quotedPhrases,
            )
          : primaryFederalHits;
    const filteredPrimaryFederalHits =
      waiverApplicationQuery
        ? (() => {
            const focused = scopedPrimaryFederalHits.filter((hit) => {
              const text = buildHitText(hit);
              const sectionNumber = normalizeSearchText(hit.sectionNumber);
              return (
                (hit.documentType === 'federal_regulation' || hit.documentType === 'federal_statute') &&
                !includesPhrase(text, WAIVER_APPLICATION_AVOID_TERMS) &&
                (
                  sectionNumber.startsWith('441.30') ||
                  sectionNumber === '440.180'
                )
              );
            });
            return focused.length > 0 ? focused : scopedPrimaryFederalHits;
          })()
        : mlrQuery
          ? (() => {
              const focused = scopedPrimaryFederalHits.filter((hit) => {
                const mlrMatches =
                  scoreTermMatches(MLR_FEDERAL_PRIMARY_SECTION_TERMS, hit.sectionTitle) +
                  Math.min(scoreTermMatches(MLR_FEDERAL_PRIMARY_SECTION_TERMS, hit.content), 4);
                return mlrMatches >= 1;
              });
              return focused.length > 0 ? focused : scopedPrimaryFederalHits;
            })()
          : scopedPrimaryFederalHits;
    const implementationHits = asksForImplementation(normalizeSearchText(query))
      ? await searchSectionsDetailed({
          query,
          topK: mlrQuery ? 8 : 6,
          documentTypes: federalImplementationDocumentTypes(queryLower),
        })
      : [];
    const focusedImplementationHits = filterHitsToFocusedContent(implementationHits, focusTerms, quotedPhrases);
    const rankedImplementationHits = (
      mlrQuery
        ? focusedImplementationHits.map((hit) =>
            hit.answerRole === 'managed_care_contract'
              ? {
                  ...hit,
                  score: hit.score + CONTRACT_ROLE_BOOST,
                }
              : hit,
          )
        : focusedImplementationHits
    ).sort((left, right) => right.score - left.score);
    const preferredImplementationDocumentTitles = selectPreferredDocumentTitlesByFocus(
      rankedImplementationHits,
      focusTerms,
      quotedPhrases,
      mlrQuery ? 2 : 1,
      0.08,
    );
    const scopedImplementationHits =
      preferredImplementationDocumentTitles.length === 0
        ? rankedImplementationHits
        : (() => {
            const scoped = rankedImplementationHits.filter(
              (hit) => hit.documentTitle && preferredImplementationDocumentTitles.includes(hit.documentTitle),
            );
            return scoped.length > 0 ? scoped : rankedImplementationHits;
          })();
    const implementationDocuments = uniqueBy(
      [
        ...implementationLookupDocuments,
        ...(await collectDocumentsForSectionIds(
          scopedImplementationHits.map((hit) => hit.sectionId),
          FRAME_DOCUMENT_LIMIT,
        )),
      ],
      (document) => document.id,
    );
    const primaryIncludeTerms = dedupeTerms([...FEDERAL_PRIMARY_TERMS, ...focusTerms]);
    const supportIncludeTerms = dedupeTerms([...FEDERAL_SUPPORT_TERMS, ...focusTerms]);
    const initialPrimaryCandidates = buildSectionCandidates(
      filteredPrimaryFederalHits,
      primaryIncludeTerms,
      [],
      FRAME_PRIMARY_LIMIT * 2,
      'Primary federal authority section.',
    );
    const hydratedFederalPrimary = await hydrateSectionCandidates(initialPrimaryCandidates, FRAME_PRIMARY_LIMIT * 2);
    const primaryFederalDocumentIds = dedupeTerms(
      hydratedFederalPrimary
        .map((candidate) => candidate.section.documentId)
        .filter((documentId): documentId is string => Boolean(documentId)),
    );
    const primaryFederalDocuments = (
      await Promise.all(primaryFederalDocumentIds.map((documentId) => getDocumentInternal(documentId)))
    ).filter((document): document is DocumentWithSectionsView => document != null);
    const primaryDocumentCandidates = toSectionCandidates(
      waiverApplicationQuery
        ? await collectDocumentSectionCandidates(
            primaryFederalDocuments,
            WAIVER_APPLICATION_DOCUMENT_SECTION_TERMS,
            publicNoticeQuery ? [] : WAIVER_APPLICATION_AVOID_TERMS,
            'Primary federal waiver-authority or application-requirement section.',
            FRAME_PRIMARY_LIMIT * 2,
          )
        : mlrQuery
          ? await collectDocumentSectionCandidates(
              primaryFederalDocuments,
              MLR_FEDERAL_PRIMARY_SECTION_TERMS,
              [],
              'Primary MLR calculation or reporting section from the governing regulation.',
              FRAME_PRIMARY_LIMIT * 2,
            )
          : [],
      0.08,
    );
    const primaryCandidates = uniqueBy(
      [...primaryDocumentCandidates, ...initialPrimaryCandidates],
      (candidate) => candidate.sectionId,
    );
    const federalDocumentSupportCandidates = toSectionCandidates(
      await collectDocumentSectionCandidates(
        primaryFederalDocuments,
        dedupeTerms([
          ...FEDERAL_DOCUMENT_SUPPORT_TERMS,
          ...focusTerms,
          ...(waiverApplicationQuery ? WAIVER_APPLICATION_PRIMARY_TERMS : []),
          ...(mlrQuery ? MLR_FEDERAL_SUPPORT_SECTION_TERMS : []),
        ]),
        publicNoticeQuery || !waiverApplicationQuery ? [] : WAIVER_APPLICATION_AVOID_TERMS,
        'Supporting federal reporting or enforcement section from the same authority document.',
        FRAME_SUPPORT_LIMIT * 2,
      ),
      0.05,
    );
    const implementationDocumentSupportCandidates = toSectionCandidates(
      await collectDocumentSectionCandidates(
        implementationDocuments,
        implementationSectionTerms,
        COVERAGE_AVOID_TERMS,
        'State implementation section from the NC policy document named by the question.',
        FRAME_SUPPORT_LIMIT * 2,
      ),
      0.12,
    );
    const implementationSupportCandidates = buildSectionCandidates(
      scopedImplementationHits,
      implementationSectionTerms,
      [],
      FRAME_SUPPORT_LIMIT * 2,
      'NC implementation or oversight evidence related to the federal rule.',
    );
    const avoidCandidates = buildSectionCandidates(
      waiverApplicationQuery
        ? uniqueBy(
            [
              ...scopedImplementationHits,
              ...waiverRankedFederalHits.filter((hit) => includesPhrase(buildHitText(hit), WAIVER_APPLICATION_AVOID_TERMS)),
            ],
            (hit) => hit.sectionId,
          )
        : scopedImplementationHits,
      waiverApplicationQuery ? WAIVER_APPLICATION_AVOID_TERMS : COVERAGE_PRIMARY_TERMS,
      [],
      FRAME_AVOID_LIMIT,
      waiverApplicationQuery
        ? 'Procedural federal section that should stay secondary to the waiver authority and application requirements.'
        : 'Service-specific policy evidence that should not displace the federal authority.',
    );
    const authoritativeCandidates = primaryFederalDocuments.map((document, index) => ({
      document: extractDocumentView(document),
      reason: waiverApplicationQuery
        ? 'Governing federal waiver authority document.'
        : 'Document containing primary federal evidence.',
      score: 1.1 - index * 0.05,
    }));

    const frame = await finalizeFrame({
      questionType: 'federal_authority',
      route,
      authoritativeCandidates,
      primaryCandidates,
      supportingCandidates: uniqueBy(
        asksForImplementation(queryLower)
          ? [
              ...implementationDocumentSupportCandidates,
              ...implementationSupportCandidates,
              ...federalDocumentSupportCandidates,
            ]
          : [...federalDocumentSupportCandidates, ...implementationSupportCandidates],
        (candidate) => candidate.sectionId,
      ),
      avoidCandidates,
    });
    return rebalanceFederalAuthorityFrame(frame, queryLower);
  };

  const resolveGeneralFrameInternal = async (
    query: string,
    route: AnswerFrameRoute = selectAnswerRoute(normalizeSearchText(query), 'general'),
  ): Promise<AnswerFrame> => {
    const hits = await searchSectionsDetailed({
      query,
      topK: route.lane === 'deterministic_evidence' ? 8 : 10,
    });
    return finalizeFrame({
      questionType: 'general',
      route,
      primaryCandidates: buildSectionCandidates(hits, extractSearchTerms(query), [], FRAME_PRIMARY_LIMIT * 2, 'Top search result.'),
      supportingCandidates: buildSectionCandidates(
        hits,
        [...COVERAGE_SUPPORT_TERMS, ...PRIOR_AUTH_SUPPORT_TERMS],
        [],
        FRAME_SUPPORT_LIMIT * 2,
        'Supporting result from the same search.',
      ),
    });
  };

  const resolveAnswerFrameInternal = async ({
    query,
    questionType,
  }: ResolveAnswerFrameInput): Promise<AnswerFrame> => {
    const queryLower = normalizeSearchText(query);
    const resolvedQuestionType = detectAnswerQuestionType(queryLower, questionType);
    const route = selectAnswerRoute(queryLower, resolvedQuestionType);
    switch (resolvedQuestionType) {
      case 'coverage':
        return resolveCoverageFrameInternal(query, route);
      case 'prior_authorization':
        return resolvePriorAuthFrameInternal(query, route);
      case 'amendment':
        return resolveAmendmentFrameInternal(query, route);
      case 'federal_authority':
        return resolveFederalAuthorityFrameInternal(query, route);
      case 'policy_variant':
        return resolvePolicyVariantFrameInternal(query, route);
      default:
        return resolveGeneralFrameInternal(query, route);
    }
  };

  return {
    async searchSections(input) {
      const hits = await searchSectionsDetailed(input);
      return hits.map(retrievalHitToSearchHit);
    },

    searchSectionsDetailed,
    resolveAnswerFrame: resolveAnswerFrameInternal,
    resolveCoverageFrame: resolveCoverageFrameInternal,
    resolvePriorAuthFrame: resolvePriorAuthFrameInternal,
    resolveAmendmentFrame: resolveAmendmentFrameInternal,
    resolveFederalAuthorityFrame: resolveFederalAuthorityFrameInternal,
    resolvePolicyVariantFrame: resolvePolicyVariantFrameInternal,
    getSection: getSectionInternal,
    getDocument: getDocumentInternal,
    getSectionContext: getSectionContextInternal,
    followReferences: followReferencesInternal,
    getAmendments: getAmendmentsInternal,
    lookupPolicy: lookupPolicyInternal,
    findConceptSections: findConceptSectionsInternal,
  };
}
