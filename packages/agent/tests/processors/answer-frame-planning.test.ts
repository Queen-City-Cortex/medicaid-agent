import { describe, expect, it } from 'vitest';
import { AnswerFramePlanningProcessor } from '../../src/processors/answer-frame-planning.js';

function makeRoute(overrides: Partial<{
  lane: 'baseline_hybrid' | 'graph_reasoning' | 'deterministic_evidence';
  rationale: string;
  widening_policy: 'none' | 'one_step' | 'family_expansion';
  determinism_hints: {
    numeric_evidence_only: boolean;
    latest_revision_only: boolean;
    cite_scope_and_not_covered: boolean;
  };
}> = {}) {
  return {
    lane: 'baseline_hybrid' as const,
    rationale: 'single_document_coverage',
    widening_policy: 'one_step' as const,
    determinism_hints: {
      numeric_evidence_only: false,
      latest_revision_only: false,
      cite_scope_and_not_covered: false,
    },
    ...overrides,
  };
}

function makeToolMessage(output: unknown) {
  return {
    role: 'assistant',
    content: {
      parts: [
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'result',
            toolCallId: 'call-frame',
            toolName: 'resolveAnswerFrame',
            result: output,
          },
        },
      ],
    },
  };
}

function makeArgs(overrides: Record<string, unknown> = {}) {
  return {
    stepNumber: 1,
    messages: [
      {
        role: 'user',
        content: {
          parts: [{ type: 'text', text: 'What does federal law define as home health services under Medicaid, and where must they be provided?' }],
        },
      },
      makeToolMessage({
        frame: {
          questionType: 'federal_authority',
          route: makeRoute({
            lane: 'graph_reasoning',
            rationale: 'federal_multi_hop',
            widening_policy: 'family_expansion',
          }),
          authoritativeDocuments: [
            {
              id: 'doc-440',
              title: '42 CFR Part 440',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-440',
              effectiveDate: null,
              url: 'https://example.com/440',
              status: 'current',
              reason: 'Document containing primary evidence.',
            },
          ],
          primarySections: [
            {
              id: 'sec-44070',
              title: 'Home health services',
              sectionNumber: '440.70',
              content:
                'Home health services must be provided on the order of a physician or other licensed practitioner and under a written plan of care that is reviewed every 60 days. Services are provided at the beneficiary place of residence.',
              effectiveDate: null,
              documentId: 'doc-440',
              documentTitle: '42 CFR Part 440',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-440',
              reason: 'Matched must.',
            },
          ],
          supportingSections: [],
          avoidSections: [],
          latestRevision: null,
          variantReasoning: null,
        },
      }),
    ],
    systemMessages: [],
    messageList: {} as any,
    abort: (() => {
      throw new Error('abort');
    }) as any,
    retryCount: 0,
    state: {},
    ...overrides,
  } as any;
}

describe('AnswerFramePlanningProcessor', () => {
  it('injects a federal answer plan after the frame tool returns', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(makeArgs());

    expect(result?.systemMessages).toHaveLength(1);
    expect(result?.systemMessages?.[0]?.content).toContain('[answer-frame-plan]');
    expect(result?.systemMessages?.[0]?.content).toContain('Route: graph_reasoning');
    expect(result?.systemMessages?.[0]?.content).toContain('Lead with the federal rule');
    expect(result?.systemMessages?.[0]?.content).toContain('written plan of care');
    expect(result?.systemMessages?.[0]?.content).toContain('place-of-residence rule');
  });

  it('adds federal enforcement guidance when the frame separates conditional thresholds from reporting duties', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(
      makeArgs({
        messages: [
          {
            role: 'user',
            content: {
              parts: [
                {
                  type: 'text',
                  text: 'What medical loss ratio (MLR) must Medicaid managed care organizations meet under federal law, and how is this requirement enforced?',
                },
              ],
            },
          },
          makeToolMessage({
            frame: {
              questionType: 'federal_authority',
              route: makeRoute({
                lane: 'graph_reasoning',
                rationale: 'federal_multi_hop',
                widening_policy: 'family_expansion',
              }),
              authoritativeDocuments: [],
              primarySections: [
                {
                  id: 'sec-4388',
                  title: 'Medical loss ratio (MLR) standards',
                  sectionNumber: '438.8',
                  content:
                    'The State must ensure, through its contracts, that each MCO calculate and report a MLR. If a State elects to mandate a minimum MLR, that minimum must be equal to or higher than 85 percent.',
                  effectiveDate: null,
                  documentId: 'doc-438',
                  documentTitle: '42 CFR Part 438',
                  documentType: 'federal_regulation',
                  policyNumber: '42-CFR-438',
                  reason: 'Matched must.',
                },
              ],
              supportingSections: [
                {
                  id: 'sec-43874',
                  title: 'State oversight of the minimum MLR requirement',
                  sectionNumber: '438.74',
                  content:
                    'The State must annually submit reports and include any remittances owed by each MCO, PIHP, or PAHP.',
                  effectiveDate: null,
                  documentId: 'doc-438',
                  documentTitle: '42 CFR Part 438',
                  documentType: 'federal_regulation',
                  policyNumber: '42-CFR-438',
                  reason: 'Supporting enforcement section.',
                },
                {
                  id: 'sec-4388-method',
                  title: 'Standard MLR',
                  sectionNumber: '438.8',
                  content:
                    'The MLR numerator includes incurred claims and activities that improve health care quality; the denominator reflects premium revenue with applicable adjustments and credibility adjustments.',
                  effectiveDate: null,
                  documentId: 'doc-438',
                  documentTitle: '42 CFR Part 438',
                  documentType: 'federal_regulation',
                  policyNumber: '42-CFR-438',
                  reason: 'Supporting MLR methodology section.',
                },
              ],
              avoidSections: [],
              latestRevision: null,
              variantReasoning: null,
            },
          }),
        ],
      }),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('Separate the unconditional reporting/calculation duties');
    expect(result?.systemMessages?.[0]?.content).toContain('Use the enforcement/reporting section');
    expect(result?.systemMessages?.[0]?.content).toContain('Summarize the federal MLR methodology');
    expect(result?.systemMessages?.[0]?.content).toContain('438.74');
    expect(result?.systemMessages?.[0]?.content).toContain('Keep federal authority separate from NC implementation');
  });

  it('adds NC implementation guidance for MLR questions when contract or SPA evidence is surfaced', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(
      makeArgs({
        messages: [
          {
            role: 'user',
            content: {
              parts: [
                {
                  type: 'text',
                  text: 'What medical loss ratio (MLR) must Medicaid managed care organizations meet under federal law, and how does NC implement this requirement?',
                },
              ],
            },
          },
          makeToolMessage({
            frame: {
              questionType: 'federal_authority',
              route: makeRoute({
                lane: 'graph_reasoning',
                rationale: 'federal_multi_hop',
                widening_policy: 'family_expansion',
              }),
              authoritativeDocuments: [],
              primarySections: [
                {
                  id: 'sec-4388',
                  title: 'Medical loss ratio (MLR) standards',
                  sectionNumber: '438.8',
                  content:
                    'The State must ensure, through its contracts, that each MCO calculate and report a MLR. If a State elects to mandate a minimum MLR, that minimum must be equal to or higher than 85 percent.',
                  effectiveDate: null,
                  documentId: 'doc-438',
                  documentTitle: '42 CFR Part 438',
                  documentType: 'federal_regulation',
                  policyNumber: '42-CFR-438',
                  reason: 'Primary federal authority section.',
                },
              ],
              supportingSections: [
                {
                  id: 'sec-contract-mlr',
                  title: '2. Medical Loss Ratio',
                  sectionNumber: 'V.I.2',
                  content:
                    'The PHP shall calculate and report the CMS-defined MLR and Department-defined MLR. The minimum MLR threshold for the PHP shall be exactly eighty-eight percent (88%).',
                  effectiveDate: null,
                  documentId: 'doc-contract',
                  documentTitle: 'Prepaid Health Plan Services Contract',
                  documentType: 'managed_care_contract',
                  policyNumber: 'CONTRACT 30-190029',
                  reason: 'NC implementation or oversight evidence related to the federal rule.',
                },
                {
                  id: 'sec-spa-mlr',
                  title: '3.3 Rate Development Standards and Medical Loss Ratio',
                  sectionNumber: '3.3',
                  content:
                    'North Carolina assures that rates are designed to reasonably achieve a medical loss ratio and describes remittance handling when the minimum MLR required by the State is not met.',
                  effectiveDate: null,
                  documentId: 'doc-spa',
                  documentTitle: 'SPA 22-0013 Proposed Amendments CHIP-Managed Care',
                  documentType: 'state_plan_amendment',
                  policyNumber: 'SPA 22-0013',
                  reason: 'NC implementation or oversight evidence related to the federal rule.',
                },
              ],
              avoidSections: [],
              latestRevision: null,
              variantReasoning: null,
            },
          }),
        ],
      }),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('For NC implementation, use');
    expect(result?.systemMessages?.[0]?.content).toContain('minimum threshold in contract or SPA text');
  });

  it('keeps waiver-application answers on Part 441 requirements and demotes public-notice procedure unless asked', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(
      makeArgs({
        messages: [
          {
            role: 'user',
            content: {
              parts: [
                {
                  type: 'text',
                  text: "What is the federal statutory authority for NC's CAP/DA waiver, and what does the state need to demonstrate in its waiver application?",
                },
              ],
            },
          },
          makeToolMessage({
            frame: {
              questionType: 'federal_authority',
              route: makeRoute({
                lane: 'graph_reasoning',
                rationale: 'federal_multi_hop',
                widening_policy: 'family_expansion',
              }),
              authoritativeDocuments: [
                {
                  id: 'doc-441',
                  title: '42 CFR Part 441',
                  documentType: 'federal_regulation',
                  policyNumber: '42-CFR-441',
                  effectiveDate: null,
                  url: 'https://example.com/441',
                  status: 'current',
                  reason: 'Governing federal waiver authority document.',
                },
              ],
              primarySections: [
                {
                  id: 'sec-441300',
                  title: 'Basis and scope',
                  sectionNumber: '441.300',
                  content: 'Section 1915(c) permits States to provide home and community-based services under a waiver.',
                  effectiveDate: null,
                  documentId: 'doc-441',
                  documentTitle: '42 CFR Part 441',
                  documentType: 'federal_regulation',
                  policyNumber: '42-CFR-441',
                  reason: 'Primary waiver authority section.',
                },
                {
                  id: 'sec-441303',
                  title: 'Supporting documentation required',
                  sectionNumber: '441.303',
                  content: 'The agency must document health and welfare assurances, financial accountability, and cost estimates.',
                  effectiveDate: null,
                  documentId: 'doc-441',
                  documentTitle: '42 CFR Part 441',
                  documentType: 'federal_regulation',
                  policyNumber: '42-CFR-441',
                  reason: 'Primary waiver application section.',
                },
              ],
              supportingSections: [
                {
                  id: 'sec-3k2-31',
                  title: '3.1 General Criteria Covered by Medicaid',
                  sectionNumber: '3.1',
                  content: 'CAP/DA services must meet NC Medicaid general criteria covered by Medicaid.',
                  effectiveDate: null,
                  documentId: 'doc-3k2',
                  documentTitle: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
                  documentType: 'clinical_policy',
                  policyNumber: '3K-2',
                  reason: 'NC implementation section.',
                },
              ],
              avoidSections: [
                {
                  id: 'sec-431408',
                  title: 'State public notice process',
                  sectionNumber: '431.408',
                  content: 'The agency must provide public notice, a comment period, and public hearings before submission.',
                  effectiveDate: null,
                  documentId: 'doc-431',
                  documentTitle: '42 CFR Part 431',
                  documentType: 'federal_regulation',
                  policyNumber: '42-CFR-431',
                  reason: 'Procedural public-notice section.',
                },
              ],
              latestRevision: null,
              variantReasoning: null,
            },
          }),
        ],
      }),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('waiver-application question');
    expect(result?.systemMessages?.[0]?.content).toContain('441.300');
    expect(result?.systemMessages?.[0]?.content).toContain('441.303');
    expect(result?.systemMessages?.[0]?.content).toContain('enumerate the concrete showings');
    expect(result?.systemMessages?.[0]?.content).toContain('public-notice procedure');
  });

  it('adds amendment guidance when the latest revision header is title-only', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(
      makeArgs({
        messages: [
          {
            role: 'user',
            content: {
              parts: [{ type: 'text', text: 'The NEMT policy has been amended. What is the most recent change notice and what changed?' }],
            },
          },
          makeToolMessage({
            frame: {
              questionType: 'amendment',
              route: makeRoute({
                lane: 'deterministic_evidence',
                rationale: 'latest_revision_marker',
                widening_policy: 'none',
                determinism_hints: {
                  numeric_evidence_only: false,
                  latest_revision_only: true,
                  cite_scope_and_not_covered: false,
                },
              }),
              authoritativeDocuments: [],
              primarySections: [],
              supportingSections: [],
              avoidSections: [],
              latestRevision: {
                marker: 'REVISED 03/16/2026 - CHANGE NO. 04-26',
                section: {
                  id: 'sec-latest',
                  title: 'REVISED 03/16/2026 - CHANGE NO. 04-26',
                  sectionNumber: null,
                  content: '',
                  effectiveDate: null,
                  documentId: 'doc-nemt',
                  documentTitle: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
                  documentType: 'dhhs_policy',
                  policyNumber: 'MA-3550',
                  reason: 'Matched change no.',
                },
              },
              variantReasoning: null,
            },
          }),
        ],
      }),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('Lead with the latest revision marker');
    expect(result?.systemMessages?.[0]?.content).toContain('title-only');
    expect(result?.systemMessages?.[0]?.content).toContain('could not confirm the specific substantive changes');
    expect(result?.systemMessages?.[0]?.content).toContain('do not name or summarize older notices');
    expect(result?.systemMessages?.[0]?.content).toContain('Do not backfill the latest-change answer with older notice details, numbers, or summaries');
    expect(result?.systemMessages?.[0]?.content).toContain('Route: deterministic_evidence');
  });

  it('adds telehealth coverage guidance that keeps the answer on the state policy rule', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(
      makeArgs({
        messages: [
          {
            role: 'user',
            content: {
              parts: [{ type: 'text', text: 'Under what conditions can speech therapy be provided via telehealth under NC Medicaid?' }],
            },
          },
          makeToolMessage({
            frame: {
              questionType: 'coverage',
              route: makeRoute(),
              authoritativeDocuments: [
                {
                  id: 'doc-10a',
                  title: 'Clinical Coverage Policy 10A',
                  documentType: 'clinical_policy',
                  policyNumber: '10A',
                  effectiveDate: null,
                  url: 'https://example.com/10A',
                  status: 'current',
                  reason: 'Policy-number lookup result related to the coverage question.',
                },
              ],
              primarySections: [
                {
                  id: 'sec-tele',
                  title: 'e. Telehealth',
                  sectionNumber: null,
                  content:
                    "Telehealth delivery may be medically necessary when a beneficiary's medical condition is such that exposure to others should be avoided, or if their location is remote or underserved. Telehealth must be used as an adjunct to in-person care unless in-person care is contraindicated or unavailable. Telehealth must be used in the best interest of the beneficiary and not as a convenience for the therapist.",
                  effectiveDate: null,
                  documentId: 'doc-10a',
                  documentTitle: 'Clinical Coverage Policy 10A',
                  documentType: 'clinical_policy',
                  policyNumber: '10A',
                  reason: 'Primary telehealth coverage evidence.',
                },
              ],
              supportingSections: [
                {
                  id: 'sec-speech',
                  title: '3.2.1.3 Speech -Language Therapy (ST)',
                  sectionNumber: '3.2.1.3',
                  content:
                    'Speech-language therapy criteria and documented findings still apply, and the provider must document why telehealth is appropriate for the beneficiary.',
                  effectiveDate: null,
                  documentId: 'doc-10a',
                  documentTitle: 'Clinical Coverage Policy 10A',
                  documentType: 'clinical_policy',
                  policyNumber: '10A',
                  reason: 'Service-specific speech-therapy criteria.',
                },
              ],
              avoidSections: [],
              latestRevision: null,
              variantReasoning: null,
            },
          }),
        ],
      }),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('Lead with the telehealth-specific state rule');
    expect(result?.systemMessages?.[0]?.content).toContain('Do not widen to cross-referenced telehealth background or federal rules');
    expect(result?.systemMessages?.[0]?.content).toContain('beneficiary-specific telehealth conditions');
    expect(result?.systemMessages?.[0]?.content).toContain('ordinary speech-language therapy criteria still apply');
    expect(result?.systemMessages?.[0]?.content).toContain('cite that section separately from the telehealth rule');
    expect(result?.systemMessages?.[0]?.content).toContain('the chart should document why telehealth is medically necessary or appropriate for this beneficiary');
  });

  it('adds premium guidance that keeps numeric answers tied to surfaced evidence', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(
      makeArgs({
        messages: [
          {
            role: 'user',
            content: {
              parts: [
                {
                  type: 'text',
                  text: 'Is there a maximum earned income limit for people on HCWD, and what premiums apply?',
                },
              ],
            },
          },
          makeToolMessage({
            frame: {
              questionType: 'coverage',
              route: makeRoute({
                lane: 'deterministic_evidence',
                rationale: 'numeric_thresholds',
                widening_policy: 'none',
                determinism_hints: {
                  numeric_evidence_only: true,
                  latest_revision_only: false,
                  cite_scope_and_not_covered: false,
                },
              }),
              authoritativeDocuments: [
                {
                  id: 'doc-ma2180',
                  title: 'MA-2180 Health Coverage for Workers with Disabilities',
                  documentType: 'dhhs_policy',
                  policyNumber: 'MA-2180',
                  effectiveDate: null,
                  url: 'https://example.com/ma-2180',
                  status: 'current',
                  reason: 'Authoritative HCWD manual.',
                },
              ],
              primarySections: [
                {
                  id: 'sec-income',
                  title: 'F. Income',
                  sectionNumber: null,
                  content: 'Unearned income over 150% FPL makes the beneficiary ineligible.',
                  effectiveDate: null,
                  documentId: 'doc-ma2180',
                  documentTitle: 'MA-2180 Health Coverage for Workers with Disabilities',
                  documentType: 'dhhs_policy',
                  policyNumber: 'MA-2180',
                  reason: 'Income section.',
                },
                {
                  id: 'sec-premium',
                  title: 'I. Premiums',
                  sectionNumber: null,
                  content: 'A $50 enrollment fee applies above 150% FPL, and monthly premiums apply above 200% FPL.',
                  effectiveDate: null,
                  documentId: 'doc-ma2180',
                  documentTitle: 'MA-2180 Health Coverage for Workers with Disabilities',
                  documentType: 'dhhs_policy',
                  policyNumber: 'MA-2180',
                  reason: 'Premium section.',
                },
              ],
              supportingSections: [],
              avoidSections: [],
              latestRevision: null,
              variantReasoning: null,
            },
          }),
        ],
      }),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('state only the numeric thresholds or dollar amounts that appear directly');
    expect(result?.systemMessages?.[0]?.content).toContain('Do not reconstruct full premium charts');
    expect(result?.systemMessages?.[0]?.content).toContain('Do not reconstruct charts, infer updated math');
    expect(result?.systemMessages?.[0]?.content).toContain('Do not widen beyond the current structured frame for extra numeric details');
    expect(result?.systemMessages?.[0]?.content).toContain('the current dollar amounts were not verified in the surfaced evidence');
  });

  it('adds yes/no coverage guidance to cite both scope and not-covered sections', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(
      makeArgs({
        messages: [
          {
            role: 'user',
            content: {
              parts: [{ type: 'text', text: 'Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?' }],
            },
          },
          makeToolMessage({
            frame: {
              questionType: 'coverage',
              route: makeRoute({
                determinism_hints: {
                  numeric_evidence_only: false,
                  latest_revision_only: false,
                  cite_scope_and_not_covered: true,
                },
              }),
              authoritativeDocuments: [
                {
                  id: 'doc-5b',
                  title: 'Orthotics & Prosthetics',
                  documentType: 'clinical_policy',
                  policyNumber: '5B',
                  effectiveDate: null,
                  url: 'https://example.com/5B',
                  status: 'current',
                  reason: 'Policy-number lookup result related to the coverage question.',
                },
              ],
              primarySections: [
                {
                  id: 'sec-41',
                  title: '4.1 General Criteria Not Covered',
                  sectionNumber: '4.1',
                  content: 'Chiropractic services are not covered under this policy.',
                  effectiveDate: null,
                  documentId: 'doc-5b',
                  documentTitle: 'Orthotics & Prosthetics',
                  documentType: 'clinical_policy',
                  policyNumber: '5B',
                  reason: 'Not-covered section.',
                },
              ],
              supportingSections: [
                {
                  id: 'sec-211',
                  title: '2.1.1 Description',
                  sectionNumber: '2.1.1',
                  content: 'This policy covers orthotic and prosthetic devices.',
                  effectiveDate: null,
                  documentId: 'doc-5b',
                  documentTitle: 'Orthotics & Prosthetics',
                  documentType: 'clinical_policy',
                  policyNumber: '5B',
                  reason: 'Scope section.',
                },
              ],
              avoidSections: [],
              latestRevision: null,
              variantReasoning: null,
            },
          }),
        ],
      }),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('answer yes or no first');
    expect(result?.systemMessages?.[0]?.content).toContain('scope section');
    expect(result?.systemMessages?.[0]?.content).toContain('not-covered section');
    expect(result?.systemMessages?.[0]?.content).toContain('pair the governing scope section with the not-covered section');
    expect(result?.systemMessages?.[0]?.content).toContain('governs a different service category than the one asked about');
    expect(result?.systemMessages?.[0]?.content).toContain('keep the citations on the scope/not-covered sections');
  });

  it('adds congregate PCS guidance for assisted-living coverage questions', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(
      makeArgs({
        messages: [
          {
            role: 'user',
            content: {
              parts: [{ type: 'text', text: 'Does NC Medicaid cover Personal Care Services for beneficiaries who live in an assisted living facility?' }],
            },
          },
          makeToolMessage({
            frame: {
              questionType: 'coverage',
              route: makeRoute({
                determinism_hints: {
                  numeric_evidence_only: false,
                  latest_revision_only: false,
                  cite_scope_and_not_covered: true,
                },
              }),
              authoritativeDocuments: [
                {
                  id: 'doc-3l1',
                  title: 'PCS in Congregate Settings',
                  documentType: 'clinical_policy',
                  policyNumber: '3L-1',
                  effectiveDate: null,
                  url: 'https://example.com/3L-1',
                  status: 'current',
                  reason: 'Preferred congregate PCS policy.',
                },
              ],
              primarySections: [
                {
                  id: 'sec-321',
                  title: '3.2.1 Specific criteria covered by Medicaid',
                  sectionNumber: '3.2.1',
                  content: 'PCS is covered in congregate settings when the beneficiary meets the facility and functional criteria.',
                  effectiveDate: null,
                  documentId: 'doc-3l1',
                  documentTitle: 'PCS in Congregate Settings',
                  documentType: 'clinical_policy',
                  policyNumber: '3L-1',
                  reason: 'Congregate-setting eligibility criteria.',
                },
              ],
              supportingSections: [
                {
                  id: 'sec-33',
                  title: '3.3 Personal Care Services',
                  sectionNumber: '3.3',
                  content: 'Covered PCS tasks in congregate settings.',
                  effectiveDate: null,
                  documentId: 'doc-3l1',
                  documentTitle: 'PCS in Congregate Settings',
                  documentType: 'clinical_policy',
                  policyNumber: '3L-1',
                  reason: 'Covered PCS service scope.',
                },
                {
                  id: 'sec-4212',
                  title: 'Room and Board',
                  sectionNumber: '4.2.1.2',
                  content: 'Room and board are not covered.',
                  effectiveDate: null,
                  documentId: 'doc-3l1',
                  documentTitle: 'PCS in Congregate Settings',
                  documentType: 'clinical_policy',
                  policyNumber: '3L-1',
                  reason: 'Room-and-board exclusion.',
                },
              ],
              avoidSections: [
                {
                  id: 'sec-543',
                  title: '5.4.3 Requirements for PCS Eligibility Assessments',
                  sectionNumber: '5.4.3',
                  content: 'Assessment workflow details.',
                  effectiveDate: null,
                  documentId: 'doc-3l1',
                  documentTitle: 'PCS in Congregate Settings',
                  documentType: 'clinical_policy',
                  policyNumber: '3L-1',
                  reason: 'Assessment workflow section.',
                },
              ],
              latestRevision: null,
              variantReasoning: 'Preferred because the query asks about a congregate or facility-based setting.',
            },
          }),
        ],
      }),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('For congregate-setting PCS questions');
    expect(result?.systemMessages?.[0]?.content).toContain('3.2.1');
    expect(result?.systemMessages?.[0]?.content).toContain('3.3');
    expect(result?.systemMessages?.[0]?.content).toContain('4.2.1.2');
    expect(result?.systemMessages?.[0]?.content).toContain('Do not cite workflow sections like § 5.4.3');
  });

  it('guides CAP/DA general eligibility answers to layer baseline eligibility, general coverage, and specific criteria', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(
      makeArgs({
        messages: [
          {
            role: 'user',
            content: {
              parts: [
                {
                  type: 'text',
                  text: 'What are the general eligibility criteria for CAP/DA services under NC Medicaid?',
                },
              ],
            },
          },
          makeToolMessage({
            frame: {
              questionType: 'coverage',
              route: makeRoute(),
              authoritativeDocuments: [
                {
                  id: 'doc-3k2',
                  title: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
                  documentType: 'clinical_policy',
                  policyNumber: '3K-2',
                  effectiveDate: null,
                  url: 'https://example.com/3K-2',
                  status: 'current',
                  reason: 'Policy-number lookup result related to the coverage question.',
                },
              ],
              primarySections: [
                {
                  id: 'sec-211',
                  title: '2.1.1 General',
                  sectionNumber: '2.1.1',
                  content: 'An eligible beneficiary shall be enrolled in the NC Medicaid Program.',
                  effectiveDate: null,
                  documentId: 'doc-3k2',
                  documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
                  documentType: 'clinical_policy',
                  policyNumber: '3K-2',
                  reason: 'General Medicaid-program eligibility section.',
                },
                {
                  id: 'sec-31',
                  title: '3.1 General Criteria Covered',
                  sectionNumber: '3.1',
                  content: 'The service must be individualized, safely furnished, and not primarily for convenience.',
                  effectiveDate: null,
                  documentId: 'doc-3k2',
                  documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
                  documentType: 'clinical_policy',
                  policyNumber: '3K-2',
                  reason: 'General coverage criteria section.',
                },
                {
                  id: 'sec-321',
                  title: '3.2.1 Specific criteria covered by Medicaid',
                  sectionNumber: '3.2.1',
                  content: 'CAP/DA requires nursing facility level of care and a signed service plan.',
                  effectiveDate: null,
                  documentId: 'doc-3k2',
                  documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
                  documentType: 'clinical_policy',
                  policyNumber: '3K-2',
                  reason: 'Specific CAP/DA criteria section.',
                },
              ],
              supportingSections: [
                {
                  id: 'sec-desc',
                  title: 'Description of the Procedure, Product, or Service',
                  sectionNumber: '1.0',
                  content: 'The CAP/DA waiver serves adults with disabilities 18 years of age and older who are at risk of institutionalization.',
                  effectiveDate: null,
                  documentId: 'doc-3k2',
                  documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
                  documentType: 'clinical_policy',
                  policyNumber: '3K-2',
                  reason: 'Program scope section.',
                },
              ],
              avoidSections: [
                {
                  id: 'sec-claim',
                  title: 'CAP/DA Claim Reimbursement',
                  sectionNumber: null,
                  content: 'Prepare a paper claim for the service.',
                  effectiveDate: null,
                  documentId: 'doc-3k2',
                  documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
                  documentType: 'clinical_policy',
                  policyNumber: '3K-2',
                  reason: 'Operational section to avoid.',
                },
              ],
              latestRevision: null,
              variantReasoning: null,
            },
          }),
        ],
      }),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('2.1.1');
    expect(result?.systemMessages?.[0]?.content).toContain('3.1');
    expect(result?.systemMessages?.[0]?.content).toContain('3.2.1');
    expect(result?.systemMessages?.[0]?.content).toContain('scope text § 1.0');
    expect(result?.systemMessages?.[0]?.content).toContain('provider or reimbursement operations');
  });

  it('separates general exclusions from item-specific exclusions for not-covered coverage questions', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(
      makeArgs({
        messages: [
          {
            role: 'user',
            content: {
              parts: [
                {
                  type: 'text',
                  text: 'What DME items are specifically NOT covered by NC Medicaid under the Orthotics and Prosthetics policy, and what general criteria must be met for coverage?',
                },
              ],
            },
          },
          makeToolMessage({
            frame: {
              questionType: 'coverage',
              route: makeRoute(),
              authoritativeDocuments: [
                {
                  id: 'doc-5b',
                  title: 'Orthotics & Prosthetics',
                  documentType: 'clinical_policy',
                  policyNumber: '5B',
                  effectiveDate: null,
                  url: 'https://example.com/5B',
                  status: 'current',
                  reason: 'Policy-number lookup result related to the coverage question.',
                },
              ],
              primarySections: [
                {
                  id: 'sec-41',
                  title: '4.1 General Criteria Not Covered',
                  sectionNumber: '4.1',
                  content: 'Experimental or investigational items and items that do not meet policy criteria are not covered.',
                  effectiveDate: null,
                  documentId: 'doc-5b',
                  documentTitle: 'Orthotics & Prosthetics',
                  documentType: 'clinical_policy',
                  policyNumber: '5B',
                  reason: 'General exclusions section.',
                },
                {
                  id: 'sec-421',
                  title: '4.2.1 Specific Criteria Not Covered by Medicaid',
                  sectionNumber: '4.2.1',
                  content: 'Comfort or convenience devices and backup devices are not covered.',
                  effectiveDate: null,
                  documentId: 'doc-5b',
                  documentTitle: 'Orthotics & Prosthetics',
                  documentType: 'clinical_policy',
                  policyNumber: '5B',
                  reason: 'Specific exclusions section.',
                },
              ],
              supportingSections: [
                {
                  id: 'sec-31',
                  title: '3.1 General Criteria Covered',
                  sectionNumber: '3.1',
                  content: 'General criteria must be met before coverage is available.',
                  effectiveDate: null,
                  documentId: 'doc-5b',
                  documentTitle: 'Orthotics & Prosthetics',
                  documentType: 'clinical_policy',
                  policyNumber: '5B',
                  reason: 'General coverage section.',
                },
                {
                  id: 'sec-321',
                  title: '3.2.1 Specific criteria covered by Medicaid',
                  sectionNumber: '3.2.1',
                  content: 'Orthotic and prosthetic items are covered when the medical-necessity criteria are met.',
                  effectiveDate: null,
                  documentId: 'doc-5b',
                  documentTitle: 'Orthotics & Prosthetics',
                  documentType: 'clinical_policy',
                  policyNumber: '5B',
                  reason: 'Specific covered criteria section.',
                },
              ],
              avoidSections: [],
              latestRevision: null,
              variantReasoning: null,
            },
          }),
        ],
      }),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('Answer the not-covered or limitation part explicitly');
    expect(result?.systemMessages?.[0]?.content).toContain('Separate the general exclusions');
    expect(result?.systemMessages?.[0]?.content).toContain('item-specific exclusions');
    expect(result?.systemMessages?.[0]?.content).toContain('governing coverage criteria');
  });

  it('adds ambulance-specific non-covered guidance that leads with the ambulance exclusion section', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(
      makeArgs({
        messages: [
          {
            role: 'user',
            content: {
              parts: [{ type: 'text', text: 'What ambulance services are NOT covered by NC Medicaid?' }],
            },
          },
          makeToolMessage({
            frame: {
              questionType: 'coverage',
              route: makeRoute({
                determinism_hints: {
                  numeric_evidence_only: false,
                  latest_revision_only: false,
                  cite_scope_and_not_covered: true,
                },
              }),
              authoritativeDocuments: [
                {
                  id: 'doc-15',
                  title: 'Ambulance Services',
                  documentType: 'clinical_policy',
                  policyNumber: '15',
                  effectiveDate: null,
                  url: 'https://example.com/15',
                  status: 'current',
                  reason: 'Ambulance-services policy.',
                },
              ],
              primarySections: [
                {
                  id: 'sec-4214',
                  title: 'Other Non-Covered Ambulance Services',
                  sectionNumber: '4.2.1.4',
                  content: 'False alarm calls, patient refusal, waiting fees, and similar services are not covered.',
                  effectiveDate: null,
                  documentId: 'doc-15',
                  documentTitle: 'Ambulance Services',
                  documentType: 'clinical_policy',
                  policyNumber: '15',
                  reason: 'Ambulance-specific non-covered services.',
                },
              ],
              supportingSections: [
                {
                  id: 'sec-3211',
                  title: 'Air Medical Ambulance',
                  sectionNumber: '3.2.1.1',
                  content: 'Air ambulance is covered only when ground transport is contraindicated or impractical.',
                  effectiveDate: null,
                  documentId: 'doc-15',
                  documentTitle: 'Ambulance Services',
                  documentType: 'clinical_policy',
                  policyNumber: '15',
                  reason: 'Narrow covered boundary for air ambulance.',
                },
              ],
              avoidSections: [
                {
                  id: 'sec-41',
                  title: '4.1 General Criteria Not Covered',
                  sectionNumber: '4.1',
                  content: 'General exclusions.',
                  effectiveDate: null,
                  documentId: 'doc-15',
                  documentTitle: 'Ambulance Services',
                  documentType: 'clinical_policy',
                  policyNumber: '15',
                  reason: 'General exclusions are secondary here.',
                },
              ],
              latestRevision: null,
              variantReasoning: null,
            },
          }),
        ],
      }),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('For this ambulance non-covered question, lead with');
    expect(result?.systemMessages?.[0]?.content).toContain('4.2.1.4');
    expect(result?.systemMessages?.[0]?.content).toContain('keep general exclusions secondary');
    expect(result?.systemMessages?.[0]?.content).toContain('3.2.1.1');
    expect(result?.systemMessages?.[0]?.content).toContain('air ambulance remains covered');
  });

  it('adds pharmacy quantity-limit guidance that leads with section 5.4.3 before prior-approval process details', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(
      makeArgs({
        messages: [
          {
            role: 'user',
            content: {
              parts: [
                {
                  type: 'text',
                  text: 'Are there quantity limits on prescription drugs under NC Medicaid, and when is prior authorization required for pharmacy claims?',
                },
              ],
            },
          },
          makeToolMessage({
            frame: {
              questionType: 'prior_authorization',
              route: makeRoute({
                lane: 'deterministic_evidence',
                rationale: 'numeric_thresholds',
                widening_policy: 'one_step',
                determinism_hints: {
                  numeric_evidence_only: true,
                  latest_revision_only: false,
                  cite_scope_and_not_covered: false,
                },
              }),
              authoritativeDocuments: [
                {
                  id: 'doc-9',
                  title: 'Lock-in Program',
                  documentType: 'clinical_policy',
                  policyNumber: '9',
                  effectiveDate: null,
                  url: 'https://example.com/9',
                  status: 'current',
                  reason: 'Policy 9 is the governing outpatient pharmacy source.',
                },
              ],
              primarySections: [
                {
                  id: 'sec-543',
                  title: '5.4.3 Quantity and Episodic Drugs',
                  sectionNumber: '5.4.3',
                  content:
                    'NC Medicaid may impose quantity limitations for episodic drugs, and prior authorization criteria may also apply.',
                  effectiveDate: null,
                  documentId: 'doc-9',
                  documentTitle: 'Lock-in Program',
                  documentType: 'clinical_policy',
                  policyNumber: '9',
                  reason: 'Quantity-limit section.',
                },
                {
                  id: 'sec-pa-criteria',
                  title: 'Pharmacy Prior Approval Drugs and Criteria',
                  sectionNumber: null,
                  content: 'GLP-1 receptor agonists, hepatitis C medications, and other listed categories require prior approval.',
                  effectiveDate: null,
                  documentId: 'doc-9',
                  documentTitle: 'Lock-in Program',
                  documentType: 'clinical_policy',
                  policyNumber: '9',
                  reason: 'Prior-approval criteria section.',
                },
              ],
              supportingSections: [
                {
                  id: 'sec-attachment-k',
                  title: 'Attachment K: Pharmacy Prior Approval Criteria',
                  sectionNumber: 'Attachment K',
                  content: '',
                  effectiveDate: null,
                  documentId: 'doc-9',
                  documentTitle: 'Lock-in Program',
                  documentType: 'clinical_policy',
                  policyNumber: '9',
                  reason: 'Attachment label for the criteria.',
                },
              ],
              avoidSections: [
                {
                  id: 'sec-request',
                  title: 'Attachment C: Requesting Prior Authorization for Prescription Drugs',
                  sectionNumber: 'Attachment C',
                  content: 'Providers submit by web portal, phone, or fax.',
                  effectiveDate: null,
                  documentId: 'doc-9',
                  documentTitle: 'Lock-in Program',
                  documentType: 'clinical_policy',
                  policyNumber: '9',
                  reason: 'Request process section.',
                },
                {
                  id: 'sec-exception',
                  title: '3.2.3 Exceptions to FDA and NC Medicaid Drug criteria approval.',
                  sectionNumber: '3.2.3',
                  content: 'Medical-necessity exceptions require supporting literature.',
                  effectiveDate: null,
                  documentId: 'doc-9',
                  documentTitle: 'Lock-in Program',
                  documentType: 'clinical_policy',
                  policyNumber: '9',
                  reason: 'Exception procedure section.',
                },
              ],
              latestRevision: null,
              variantReasoning: null,
            },
          }),
        ],
      }),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('Lead with the surfaced quantity-limit and criteria sections');
    expect(result?.systemMessages?.[0]?.content).toContain('5.4.3');
    expect(result?.systemMessages?.[0]?.content).toContain('answer yes first');
    expect(result?.systemMessages?.[0]?.content).toContain('NC Medicaid may impose quantity limitations for episodic drugs');
    expect(result?.systemMessages?.[0]?.content).toContain('prior authorization is required for the drugs or categories listed');
    expect(result?.systemMessages?.[0]?.content).toContain('Attachment K');
    expect(result?.systemMessages?.[0]?.content).toContain('Name the governing source by policy number first: 9');
    expect(result?.systemMessages?.[0]?.content).toContain('Do not present a partial sample drug list');
    expect(result?.systemMessages?.[0]?.content).toContain('Do not say quantity limits were unverified');
    expect(result?.systemMessages?.[0]?.content).toContain('keep request-process or exception procedures secondary');
    expect(result?.systemMessages?.[0]?.content).toContain('unless the user asks about them');
  });

  it('does nothing when a plan is already present', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(
      makeArgs({
        systemMessages: [{ role: 'system', content: '[answer-frame-plan]\nUse the structured frame.' }],
      }),
    );

    expect(result).toBeUndefined();
  });
});
