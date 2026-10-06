import type {
  AnswerFrame,
  AnswerFrameDocument,
  AnswerFrameRoute,
  AnswerFrameSection,
} from '@nc-medicaid/policy-corpus';

// Frame fixtures flow through message content as plain JSON, so tests only
// need the fields the processors actually read — hence Partial<> shapes
// derived from the canonical types rather than fully-populated objects.
export type SectionFixture = Partial<AnswerFrameSection>;
export type DocumentFixture = Partial<AnswerFrameDocument>;

export interface LatestRevisionFixture {
  marker: string | null;
  document?: DocumentFixture | null;
  section?: SectionFixture | null;
}

export interface FrameFixture
  extends Omit<
    Partial<AnswerFrame>,
    'authoritativeDocuments' | 'primarySections' | 'supportingSections' | 'avoidSections' | 'latestRevision'
  > {
  authoritativeDocuments?: DocumentFixture[];
  primarySections?: SectionFixture[];
  supportingSections?: SectionFixture[];
  avoidSections?: SectionFixture[];
  latestRevision?: LatestRevisionFixture | null;
}

export function makeRoute(overrides: Partial<AnswerFrameRoute> = {}): AnswerFrameRoute {
  return {
    lane: 'baseline_hybrid',
    rationale: 'single_document_coverage',
    widening_policy: 'one_step',
    determinism_hints: {
      numeric_evidence_only: false,
      latest_revision_only: false,
      cite_scope_and_not_covered: false,
    },
    ...overrides,
  };
}

export function makeSection(overrides: SectionFixture = {}): SectionFixture {
  return {
    id: 'sec-x',
    title: '',
    sectionNumber: null,
    content: '',
    effectiveDate: null,
    documentId: 'doc-x',
    documentTitle: 'Test Document',
    documentType: 'clinical_policy',
    policyNumber: 'TEST',
    reason: 'test',
    ...overrides,
  };
}

/**
 * Bind the shared document fields once (documentId/documentTitle/etc.) and get
 * back a makeSection that only needs the per-section overrides.
 */
export function sectionMaker(docDefaults: SectionFixture) {
  return (overrides: SectionFixture = {}): SectionFixture =>
    makeSection({ ...docDefaults, ...overrides });
}

export function makeDocument(overrides: DocumentFixture = {}): DocumentFixture {
  return {
    id: 'doc-x',
    title: 'Test Document',
    documentType: 'clinical_policy',
    policyNumber: 'TEST',
    effectiveDate: null,
    url: 'https://example.com/doc',
    status: 'current',
    reason: 'test',
    ...overrides,
  };
}

export function makeFrame(overrides: FrameFixture = {}): FrameFixture {
  return {
    questionType: 'coverage',
    route: makeRoute(),
    authoritativeDocuments: [],
    primarySections: [],
    supportingSections: [],
    avoidSections: [],
    latestRevision: null,
    variantReasoning: null,
    ...overrides,
  };
}

// --- Real template-policy sections -------------------------------------------
//
// Copied from two parsed NC clinical coverage policies (packages/pipeline/data/
// parsed/clinical-policies, June 2026 parse): 5b_orthotics-prosthetics, whose
// section 2.2.1 holds the EPSDT provision, and 8c_outpatient-behavioral-health-
// services-provided-by-direct-enrolled-providers, whose 2.2.1 is an empty
// heading with the provision under the unnumbered "a. 42 U.S.C. § 1396d(r)"
// heading. Bodies are excerpts. The 3.0/4.0/5.0/7.0 sections are the one-line
// notes that name the provision without being it.

export const template5b = sectionMaker({
  documentId: 'doc-5b',
  documentTitle: 'Orthotics & Prosthetics',
  policyNumber: '5B',
});

export const template8c = sectionMaker({
  documentId: 'doc-8c',
  documentTitle: 'Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers',
  policyNumber: '8C',
});

export const TEMPLATE_5B_SECTIONS = {
  description: template5b({
    id: 'sec-5b-1.0',
    title: '1.0 Description of the Procedure, Product, or Service',
    sectionNumber: '1.0',
    content: 'Orthotic and prosthetic devices are covered by NC Medicaid (Medicaid) when they are prescribed by the beneficiary\'s treating physician, physician\'s assistant, or nurse practitioner and medical necessity is documented. An orthotic or prosthetic device is medically necessary if it is needed to',
  }),
  epsdtProvision: template5b({
    id: 'sec-5b-2.2.1',
    title: '2.2.1 EPSDT Special Provision: Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age',
    sectionNumber: '2.2.1',
    content: '42 U.S.C. § 1396d(r) [1905(r) of the Social Security Act]\nEarly and Periodic Screening, Diagnostic, and Treatment (EPSDT) is a federal Medicaid requirement that requires the state Medicaid agency to cover services, products, or procedures for Medicaid beneficiary under 21 years of age if the service is medically necessary health care to correct or ameliorate a defect, physical or mental illness, or a condition [health problem] identified through a screening examination (includes any evaluation by a physician or other licensed practitioner).\nThis means EPSDT covers most of the medical or remedial care a child',
  }),
  covered: template5b({
    id: 'sec-5b-3.0',
    title: '3.0 When the Procedure, Product, or Service Is Covered',
    sectionNumber: '3.0',
    content: 'Note: Refer to Subsection 2.2.1 regarding EPSDT Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age.',
  }),
  notCovered: template5b({
    id: 'sec-5b-4.0',
    title: '4.0 When the Procedure, Product, or Service Is Not Covered',
    sectionNumber: '4.0',
    content: 'Note: Refer to Subsection 2.2.1 regarding EPSDT Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age.',
  }),
  generalNotCovered: template5b({
    id: 'sec-5b-4.1',
    title: '4.1 General Criteria Not Covered',
    sectionNumber: '4.1',
    content: 'Medicaid shall not cover the procedure, product, or service related to this policy when:\nthe beneficiary does not meet the eligibility requirements listed in Section 2.0;\nthe beneficiary does not meet the criteria listed in Section 3.0;\nthe procedure, product, or service duplicates another provider\'s procedure, product, or service; or\nthe procedure, product, or service is experimental, investigational, or part of a clinical trial.',
  }),
  requirements: template5b({
    id: 'sec-5b-5.0',
    title: '5.0 Requirements for and Limitations on Coverage',
    sectionNumber: '5.0',
    content: 'Note: Refer to Subsection 2.2.1 regarding EPSDT Exception to Policy Limitations for Medicaid Beneficiaries under 21 Years of Age.',
  }),
  additional: template5b({
    id: 'sec-5b-7.0',
    title: '7.0 Additional Requirements',
    sectionNumber: '7.0',
    content: 'Note: Refer to Subsection 2.2.1 regarding EPSDT Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age.',
  }),
  specificNotCovered: template5b({
    id: 'sec-5b-4.2.1',
    title: '4.2.1 Specific Criteria Not Covered by Medicaid',
    sectionNumber: '4.2.1',
    content: 'Medicaid shall not cover the following devices and supplies:\nDevices for the beneficiary\'s comfort or convenience or for the convenience of the beneficiary\'s caregiver(s);\nDevices to have on hand for backup or duplicates to have available at various locations;\nDevices and supplies for residents of nursing facilities;\nDevices or supplies covered by another agency; and\nEquipment or supplies for beneficiaries receiving hospice care, as defined in Subsection 7.3, Coordinating Care',
  }),
};

export const TEMPLATE_8C_SECTIONS = {
  description: template8c({
    id: 'sec-8c-1.0',
    title: '1.0 Description of the Procedure, Product, or Service',
    sectionNumber: '1.0',
    content: 'Outpatient behavioral health services are psychiatric and comprehensive clinical assessment, medication management, individual, group, and family therapies, psychotherapy for crisis, and psychological testing for eligible beneficiaries.\nOutpatient services for substance use disorders (SUD) are for',
  }),
  emptyEpsdtProvision: template8c({
    id: 'sec-8c-2.2.1',
    title: '2.2.1 EPSDT Special Provision: Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age',
    sectionNumber: '2.2.1',
    content: '',
  }),
  epsdtStatute: template8c({
    id: 'sec-8c-epsdtStatute',
    title: 'a. 42 U.S.C. § 1396d(r) [1905(r) of the Social Security Act]',
    sectionNumber: null,
    content: 'Early and Periodic Screening, Diagnostic, and Treatment (EPSDT) is a federal Medicaid requirement that requires the state Medicaid agency to cover services, products, or procedures for Medicaid beneficiary under 21 years of age if the service is medically necessary health care to correct or ameliorate a defect, physical or mental illness, or a condition [health problem] identified through a screening examination (includes any evaluation by a physician or other licensed practitioner).\nThis means EPSDT covers most of the medical or remedial care a child needs to improve or maintain his or her health in the best',
  }),
  notCovered: template8c({
    id: 'sec-8c-4.0',
    title: '4.0 When the Procedure, Product, or Service Is Not Covered',
    sectionNumber: '4.0',
    content: 'Note: Refer to Subsection 2.2.1 regarding EPSDT Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age.',
  }),
  generalNotCovered: template8c({
    id: 'sec-8c-4.1',
    title: '4.1 General Criteria Not Covered',
    sectionNumber: '4.1',
    content: 'Medicaid shall not cover procedures, products, and services related to this policy when:\nthe beneficiary does not meet the eligibility requirements listed in Section 2.0;\nthe beneficiary does not meet the criteria listed in Section 3.0;\nthe procedure, product, or service duplicates another provider\'s procedure, product, or service; or\nthe procedure, product, or service is experimental, investigational, or part of a clinical trial.',
  }),
  specificCovered: template8c({
    id: 'sec-8c-3.2.1.1',
    title: '3.2.1.1 Entrance Criteria',
    sectionNumber: '3.2.1.1',
    content: 'All of the following criteria are necessary for admission of a beneficiary to outpatient treatment services:\nA current Diagnostic and Statistical Manual of Mental Disorders, Fifth Edition [(DSM-5) or any subsequent editions of this reference material] diagnosis;\nThe beneficiary presents behavioral, psychological, or biological dysfunction and functional impairment, which are consistent and associated with the current diagnosis;\nIf a higher level of care is indicated but unavailable or the',
  }),
  behavioralHealthNotCovered: template8c({
    id: 'sec-8c-4.2.1.1',
    title: '4.2.1.1 Outpatient Behavioral Health',
    sectionNumber: '4.2.1.1',
    content: 'Medicaid shall not cover Outpatient Behavioral Health Services for the following:\nsleep therapy for psychiatric disorders;\nwhen services are not provided in-person or in accordance with Attachment A;\nwhen a beneficiary presents with a medical, cognitive, intellectual or development issue that would not benefit from outpatient treatment services;\nwhen the focus of treatment does not address the symptoms of the diagnosis;\nwhen the requirements and limitations in Section 5.0 are not followed; and\nwhen Psychotherapy for Crisis codes are billed, the same provider shall not bill Special Services: After Hours codes. Refer to clinical coverage policy 1A-38, Special Services: After Hours, located on NC Medicaid\'s website at https://medicaid.ncdhhs.gov/, for the same event.',
  }),
};
