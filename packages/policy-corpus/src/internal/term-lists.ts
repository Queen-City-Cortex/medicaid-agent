// Topical vocabulary used to recognize section roles and steer answer-frame
// section selection: which phrases mark coverage criteria, prior-auth criteria,
// federal-authority text, change notices, telehealth tables, HCWD income rules,
// and so on. These are pure data — no logic — and are consumed by the section
// predicates, rerank scoring, and frame pipelines.

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
// Topical vocabulary for HCWD income/premium rule text. Deliberately NOT
// sentences from any expected answer: the previous list contained verbatim
// golden-dataset answer text ("remove the 150% fpl income limit", …), which
// is eval contamination — boosting sections that contain the answer only
// "works" when the answer is already known.
export const HCWD_INCOME_RULE_TERMS = [
  'income limit',
  'countable income',
  'unearned income',
  'earned income',
  'federal poverty level',
  'sliding scale',
  'premium amount',
  'premium amounts',
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
// NC clinical-policy TEMPLATE heading vocabulary for the standard EPSDT
// special-provision section (usually 2.2.x) that modifies adult limitations
// for beneficiaries under 21. Section-heading phrases from the policy
// template itself — not golden-answer sentences.
export const EPSDT_EXCEPTION_SECTION_TERMS = [
  'epsdt special provision',
  'exception to policy limitations',
  'early and periodic screening, diagnostic and treatment',
  'under 21 years of age',
];

// Statutory/regulatory program-name glossary: acronym ↔ the official
// multi-word name as it appears in statute and CFR section HEADINGS. Pure
// legal vocabulary — not derived from any eval question or expected answer.
// Applied only inside the federal-authority frame's focus terms so the
// bitwise-pinned search/rerank scores stay untouched.
export const FEDERAL_PROGRAM_NAME_EXPANSIONS: ReadonlyArray<{ token: string; expansions: string[] }> = [
  { token: 'epsdt', expansions: ['early and periodic screening'] },
  { token: 'hcbs', expansions: ['home and community-based services'] },
  { token: 'mlr', expansions: ['medical loss ratio'] },
];

// Care-setting preferences. `terms` are query-side and matched as whole words
// (matchesTerm: "in-home" also matches "in home"; plurals are listed, not
// inferred). A document matches a setting when its policy number is exactly
// one of `policyNumbers`, or else when its title contains a `titleTerms`
// phrase. The personal-care pair needs the exact number: Policy 3L's title
// names no setting, and "3L" is a prefix of "3L-1".
export const VARIANT_SETTING_TERMS: Array<{
  terms: string[];
  titleTerms: string[];
  policyNumbers?: string[];
  reason: string;
}> = [
  {
    terms: [
      'congregate',
      'adult care home',
      'adult care homes',
      'group home',
      'group homes',
      'ach',
      'assisted living',
      'assisted living facility',
      'assisted living facilities',
    ],
    titleTerms: ['congregate', 'adult care home', 'group home'],
    policyNumbers: ['3L-1'],
    reason: 'Preferred because the query asks about a congregate or facility-based setting.',
  },
  {
    terms: ['in-home', 'home-based', 'home setting', 'at home'],
    titleTerms: ['in-home', 'in home'],
    policyNumbers: ['3L'],
    reason: 'Preferred because the query asks about in-home services.',
  },
  // Nursing facility vs residential treatment: both policy families use
  // "therapeutic leave"/"resident" vocabulary, so raw scores routinely cross
  // (a nursing-facility leave question routed to Residential Treatment
  // Services). The query's facility type names the governing family.
  {
    terms: ['nursing facility', 'nursing facilities', 'nursing home', 'nursing homes', 'skilled nursing'],
    titleTerms: ['nursing facility', 'nursing facilities', 'nursing home'],
    reason: 'Preferred because the query asks about a nursing facility setting.',
  },
  {
    terms: [
      'residential treatment',
      'residential facility',
      'residential facilities',
      'residential treatment facility',
      'residential treatment facilities',
    ],
    titleTerms: ['residential treatment'],
    reason: 'Preferred because the query asks about a residential treatment setting.',
  },
];
