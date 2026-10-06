import { describe, expect, it } from 'vitest';
import { analyzeQuery } from '@nc-medicaid/policy-corpus';
import { AnswerFramePlanningProcessor } from '../../src/processors/answer-frame-planning.js';
import {
  type FrameFixture,
  makeDocument,
  makeFrame,
  makeRoute,
  makeSection,
  sectionMaker,
} from '../helpers/answer-frame-fixtures.js';

// Route shapes shared by several frames below.
const federalGraphRoute = () =>
  makeRoute({
    lane: 'graph_reasoning',
    rationale: 'federal_multi_hop',
    widening_policy: 'family_expansion',
  });

const scopeAndNotCoveredRoute = () =>
  makeRoute({
    determinism_hints: {
      numeric_evidence_only: false,
      latest_revision_only: false,
      cite_scope_and_not_covered: true,
    },
  });

// Section makers bound to documents that appear in more than one test.
const sec438 = sectionMaker({
  documentId: 'doc-438',
  documentTitle: '42 CFR Part 438',
  documentType: 'federal_regulation',
  policyNumber: '42-CFR-438',
});

const sec5b = sectionMaker({
  documentId: 'doc-5b',
  documentTitle: 'Orthotics & Prosthetics',
  policyNumber: '5B',
});

function makeUserMessage(text: string) {
  return {
    role: 'user',
    content: {
      parts: [{ type: 'text', text }],
    },
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
      makeUserMessage('What does federal law define as home health services under Medicaid, and where must they be provided?'),
      makeToolMessage({
        frame: makeFrame({
          questionType: 'federal_authority',
          route: federalGraphRoute(),
          authoritativeDocuments: [
            makeDocument({
              id: 'doc-440',
              title: '42 CFR Part 440',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-440',
              url: 'https://example.com/440',
              reason: 'Document containing primary evidence.',
            }),
          ],
          primarySections: [
            makeSection({
              id: 'sec-44070',
              title: 'Home health services',
              sectionNumber: '440.70',
              content:
                'Home health services must be provided on the order of a physician or other licensed practitioner and under a written plan of care that is reviewed every 60 days. Services are provided at the beneficiary place of residence.',
              documentId: 'doc-440',
              documentTitle: '42 CFR Part 440',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-440',
              reason: 'Matched must.',
            }),
          ],
        }),
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

/** Args whose messages are just the user question plus a resolveAnswerFrame result. */
function makeFrameArgs(question: string, frame: FrameFixture) {
  return makeArgs({ messages: [makeUserMessage(question), makeToolMessage({ frame })] });
}

/** The plan's checklist items, in order, as the model sees them. */
function checklistLines(plan: unknown): string[] {
  return String(plan ?? '')
    .split('\n')
    .filter((line) => line.startsWith('- '));
}

describe('AnswerFramePlanningProcessor', () => {
  it('injects a federal answer plan after the frame tool returns', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(makeArgs());

    expect(result?.systemMessages).toHaveLength(1);
    expect(result?.systemMessages?.[0]?.content).toContain('[answer-frame-plan]');
    expect(result?.systemMessages?.[0]?.content).toContain('Route: graph_reasoning');
    expect(result?.systemMessages?.[0]?.content).toContain('Lead with the federal rule');
    expect(result?.systemMessages?.[0]?.content).toContain('place-of-residence rule');
  });

  it('adds no 60-day or plan-of-care directive when a federal section mentions 60 days', () => {
    const processor = new AnswerFramePlanningProcessor();
    const sec441 = sectionMaker({
      documentId: 'doc-441',
      documentTitle: '42 CFR Part 441',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-441',
    });

    const result = processor.processInputStep!(
      makeFrameArgs(
        'What does federal law define as home health services under Medicaid, and where must they be provided?',
        makeFrame({
          questionType: 'federal_authority',
          route: federalGraphRoute(),
          primarySections: [
            makeSection({
              id: 'sec-44070',
              title: 'Home health services',
              sectionNumber: '440.70',
              content:
                'Home health services are provided on orders written by a physician, nurse practitioner, clinical nurse specialist or physician assistant, as part of a written plan of care that the ordering practitioner reviews every 60 days.',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-440',
            }),
          ],
          supportingSections: [
            sec441({
              id: 'sec-44156',
              title: 'Required activities',
              sectionNumber: '441.56',
              content:
                'The agency must provide for a combination of written and oral methods designed to inform effectively all EPSDT eligible individuals within 60 days of the determination of Medicaid eligibility.',
            }),
          ],
        }),
      ),
    );

    const checklist = checklistLines(result?.systemMessages?.[0]?.content);
    expect(checklist).toContain('- Lead with the federal rule from § 440.70 Home health services.');
    for (const line of checklist) {
      expect(line).not.toMatch(/60[- ]day|plan of care|core conditions|ordering practitioner/i);
    }
  });

  it('adds federal enforcement guidance when the frame separates conditional thresholds from reporting duties', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(
      makeFrameArgs(
        'What medical loss ratio (MLR) must Medicaid managed care organizations meet under federal law, and how is this requirement enforced?',
        makeFrame({
          questionType: 'federal_authority',
          route: federalGraphRoute(),
          primarySections: [
            sec438({
              id: 'sec-4388',
              title: 'Medical loss ratio (MLR) standards',
              sectionNumber: '438.8',
              content:
                'The State must ensure, through its contracts, that each MCO calculate and report a MLR. If a State elects to mandate a minimum MLR, that minimum must be equal to or higher than 85 percent.',
              reason: 'Matched must.',
            }),
          ],
          supportingSections: [
            sec438({
              id: 'sec-43874',
              title: 'State oversight of the minimum MLR requirement',
              sectionNumber: '438.74',
              content:
                'The State must annually submit reports and include any remittances owed by each MCO, PIHP, or PAHP.',
              reason: 'Supporting enforcement section.',
            }),
            sec438({
              id: 'sec-4388-method',
              title: 'Standard MLR',
              sectionNumber: '438.8',
              content:
                'The MLR numerator includes incurred claims and activities that improve health care quality; the denominator reflects premium revenue with applicable adjustments and credibility adjustments.',
              reason: 'Supporting MLR methodology section.',
            }),
          ],
        }),
      ),
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
      makeFrameArgs(
        'What medical loss ratio (MLR) must Medicaid managed care organizations meet under federal law, and how does NC implement this requirement?',
        makeFrame({
          questionType: 'federal_authority',
          route: federalGraphRoute(),
          primarySections: [
            sec438({
              id: 'sec-4388',
              title: 'Medical loss ratio (MLR) standards',
              sectionNumber: '438.8',
              content:
                'The State must ensure, through its contracts, that each MCO calculate and report a MLR. If a State elects to mandate a minimum MLR, that minimum must be equal to or higher than 85 percent.',
              reason: 'Primary federal authority section.',
            }),
          ],
          supportingSections: [
            makeSection({
              id: 'sec-contract-mlr',
              title: '2. Medical Loss Ratio',
              sectionNumber: 'V.I.2',
              content:
                'The PHP shall calculate and report the CMS-defined MLR and Department-defined MLR. The minimum MLR threshold for the PHP shall be exactly eighty-eight percent (88%).',
              documentId: 'doc-contract',
              documentTitle: 'Prepaid Health Plan Services Contract',
              documentType: 'managed_care_contract',
              policyNumber: 'CONTRACT 30-190029',
              reason: 'NC implementation or oversight evidence related to the federal rule.',
            }),
            makeSection({
              id: 'sec-spa-mlr',
              title: '3.3 Rate Development Standards and Medical Loss Ratio',
              sectionNumber: '3.3',
              content:
                'North Carolina assures that rates are designed to reasonably achieve a medical loss ratio and describes remittance handling when the minimum MLR required by the State is not met.',
              documentId: 'doc-spa',
              documentTitle: 'SPA 22-0013 Proposed Amendments CHIP-Managed Care',
              documentType: 'state_plan_amendment',
              policyNumber: 'SPA 22-0013',
              reason: 'NC implementation or oversight evidence related to the federal rule.',
            }),
          ],
        }),
      ),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('For NC implementation, use');
    expect(result?.systemMessages?.[0]?.content).toContain('minimum threshold in contract or SPA text');
  });

  it('keeps waiver-application answers on Part 441 requirements and demotes public-notice procedure unless asked', () => {
    const processor = new AnswerFramePlanningProcessor();

    const sec441 = sectionMaker({
      documentId: 'doc-441',
      documentTitle: '42 CFR Part 441',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-441',
    });

    const result = processor.processInputStep!(
      makeFrameArgs(
        "What is the federal statutory authority for NC's CAP/DA waiver, and what does the state need to demonstrate in its waiver application?",
        makeFrame({
          questionType: 'federal_authority',
          route: federalGraphRoute(),
          authoritativeDocuments: [
            makeDocument({
              id: 'doc-441',
              title: '42 CFR Part 441',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-441',
              url: 'https://example.com/441',
              reason: 'Governing federal waiver authority document.',
            }),
          ],
          primarySections: [
            sec441({
              id: 'sec-441300',
              title: 'Basis and scope',
              sectionNumber: '441.300',
              content: 'Section 1915(c) permits States to provide home and community-based services under a waiver.',
              reason: 'Primary waiver authority section.',
            }),
            sec441({
              id: 'sec-441303',
              title: 'Supporting documentation required',
              sectionNumber: '441.303',
              content: 'The agency must document health and welfare assurances, financial accountability, and cost estimates.',
              reason: 'Primary waiver application section.',
            }),
          ],
          supportingSections: [
            makeSection({
              id: 'sec-3k2-31',
              title: '3.1 General Criteria Covered by Medicaid',
              sectionNumber: '3.1',
              content: 'CAP/DA services must meet NC Medicaid general criteria covered by Medicaid.',
              documentId: 'doc-3k2',
              documentTitle: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
              policyNumber: '3K-2',
              reason: 'NC implementation section.',
            }),
          ],
          avoidSections: [
            makeSection({
              id: 'sec-431408',
              title: 'State public notice process',
              sectionNumber: '431.408',
              content: 'The agency must provide public notice, a comment period, and public hearings before submission.',
              documentId: 'doc-431',
              documentTitle: '42 CFR Part 431',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-431',
              reason: 'Procedural public-notice section.',
            }),
          ],
        }),
      ),
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
      makeFrameArgs(
        'The NEMT policy has been amended. What is the most recent change notice and what changed?',
        makeFrame({
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
          latestRevision: {
            marker: 'REVISED 03/16/2026 - CHANGE NO. 04-26',
            section: makeSection({
              id: 'sec-latest',
              title: 'REVISED 03/16/2026 - CHANGE NO. 04-26',
              documentId: 'doc-nemt',
              documentTitle: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
              documentType: 'dhhs_policy',
              policyNumber: 'MA-3550',
              reason: 'Matched change no.',
            }),
          },
        }),
      ),
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

    const sec10a = sectionMaker({
      documentId: 'doc-10a',
      documentTitle: 'Clinical Coverage Policy 10A',
      policyNumber: '10A',
    });

    const result = processor.processInputStep!(
      makeFrameArgs(
        'Under what conditions can speech therapy be provided via telehealth under NC Medicaid?',
        makeFrame({
          authoritativeDocuments: [
            makeDocument({
              id: 'doc-10a',
              title: 'Clinical Coverage Policy 10A',
              policyNumber: '10A',
              url: 'https://example.com/10A',
              reason: 'Policy-number lookup result related to the coverage question.',
            }),
          ],
          primarySections: [
            sec10a({
              id: 'sec-tele',
              title: 'e. Telehealth',
              content:
                "Telehealth delivery may be medically necessary when a beneficiary's medical condition is such that exposure to others should be avoided, or if their location is remote or underserved. Telehealth must be used as an adjunct to in-person care unless in-person care is contraindicated or unavailable. Telehealth must be used in the best interest of the beneficiary and not as a convenience for the therapist.",
              reason: 'Primary telehealth coverage evidence.',
            }),
          ],
          supportingSections: [
            sec10a({
              id: 'sec-speech',
              title: '3.2.1.3 Speech -Language Therapy (ST)',
              sectionNumber: '3.2.1.3',
              content:
                'Speech-language therapy criteria and documented findings still apply, and the provider must document why telehealth is appropriate for the beneficiary.',
              reason: 'Service-specific speech-therapy criteria.',
            }),
          ],
        }),
      ),
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

    const secMa2180 = sectionMaker({
      documentId: 'doc-ma2180',
      documentTitle: 'MA-2180 Health Coverage for Workers with Disabilities',
      documentType: 'dhhs_policy',
      policyNumber: 'MA-2180',
    });

    const result = processor.processInputStep!(
      makeFrameArgs(
        'Is there a maximum earned income limit for people on HCWD, and what premiums apply?',
        makeFrame({
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
            makeDocument({
              id: 'doc-ma2180',
              title: 'MA-2180 Health Coverage for Workers with Disabilities',
              documentType: 'dhhs_policy',
              policyNumber: 'MA-2180',
              url: 'https://example.com/ma-2180',
              reason: 'Authoritative HCWD manual.',
            }),
          ],
          primarySections: [
            secMa2180({
              id: 'sec-income',
              title: 'F. Income',
              content: 'Unearned income over 150% FPL makes the beneficiary ineligible.',
              reason: 'Income section.',
            }),
            secMa2180({
              id: 'sec-premium',
              title: 'I. Premiums',
              content: 'A $50 enrollment fee applies above 150% FPL, and monthly premiums apply above 200% FPL.',
              reason: 'Premium section.',
            }),
          ],
        }),
      ),
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
      makeFrameArgs(
        'Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?',
        makeFrame({
          route: scopeAndNotCoveredRoute(),
          authoritativeDocuments: [
            makeDocument({
              id: 'doc-5b',
              title: 'Orthotics & Prosthetics',
              policyNumber: '5B',
              url: 'https://example.com/5B',
              reason: 'Policy-number lookup result related to the coverage question.',
            }),
          ],
          primarySections: [
            sec5b({
              id: 'sec-41',
              title: '4.1 General Criteria Not Covered',
              sectionNumber: '4.1',
              content: 'Chiropractic services are not covered under this policy.',
              reason: 'Not-covered section.',
            }),
          ],
          supportingSections: [
            sec5b({
              id: 'sec-211',
              title: '2.1.1 Description',
              sectionNumber: '2.1.1',
              content: 'This policy covers orthotic and prosthetic devices.',
              reason: 'Scope section.',
            }),
          ],
        }),
      ),
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

    const sec3l1 = sectionMaker({
      documentId: 'doc-3l1',
      documentTitle: 'PCS in Congregate Settings',
      policyNumber: '3L-1',
    });

    const result = processor.processInputStep!(
      makeFrameArgs(
        'Does NC Medicaid cover Personal Care Services for beneficiaries who live in an assisted living facility?',
        makeFrame({
          route: scopeAndNotCoveredRoute(),
          authoritativeDocuments: [
            makeDocument({
              id: 'doc-3l1',
              title: 'PCS in Congregate Settings',
              policyNumber: '3L-1',
              url: 'https://example.com/3L-1',
              reason: 'Preferred congregate PCS policy.',
            }),
          ],
          primarySections: [
            sec3l1({
              id: 'sec-321',
              title: '3.2.1 Specific criteria covered by Medicaid',
              sectionNumber: '3.2.1',
              content: 'PCS is covered in congregate settings when the beneficiary meets the facility and functional criteria.',
              reason: 'Congregate-setting eligibility criteria.',
            }),
          ],
          supportingSections: [
            sec3l1({
              id: 'sec-33',
              title: '3.3 Personal Care Services',
              sectionNumber: '3.3',
              content: 'Covered PCS tasks in congregate settings.',
              reason: 'Covered PCS service scope.',
            }),
            sec3l1({
              id: 'sec-4212',
              title: 'Room and Board',
              sectionNumber: '4.2.1.2',
              content: 'Room and board are not covered.',
              reason: 'Room-and-board exclusion.',
            }),
          ],
          avoidSections: [
            sec3l1({
              id: 'sec-543',
              title: '5.4.3 Requirements for PCS Eligibility Assessments',
              sectionNumber: '5.4.3',
              content: 'Assessment workflow details.',
              reason: 'Assessment workflow section.',
            }),
          ],
          variantReasoning: 'Preferred because the query asks about a congregate or facility-based setting.',
        }),
      ),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('For congregate-setting PCS questions');
    expect(result?.systemMessages?.[0]?.content).toContain('3.2.1');
    expect(result?.systemMessages?.[0]?.content).toContain('3.3');
    expect(result?.systemMessages?.[0]?.content).toContain('4.2.1.2');
    expect(result?.systemMessages?.[0]?.content).toContain('Do not cite workflow sections like § 5.4.3');
  });

  it('guides CAP/DA general eligibility answers to layer baseline eligibility, general coverage, and specific criteria', () => {
    const processor = new AnswerFramePlanningProcessor();

    const sec3k2 = sectionMaker({
      documentId: 'doc-3k2',
      documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
      policyNumber: '3K-2',
    });

    const result = processor.processInputStep!(
      makeFrameArgs(
        'What are the general eligibility criteria for CAP/DA services under NC Medicaid?',
        makeFrame({
          authoritativeDocuments: [
            makeDocument({
              id: 'doc-3k2',
              title: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              policyNumber: '3K-2',
              url: 'https://example.com/3K-2',
              reason: 'Policy-number lookup result related to the coverage question.',
            }),
          ],
          primarySections: [
            sec3k2({
              id: 'sec-211',
              title: '2.1.1 General',
              sectionNumber: '2.1.1',
              content: 'An eligible beneficiary shall be enrolled in the NC Medicaid Program.',
              reason: 'General Medicaid-program eligibility section.',
            }),
            sec3k2({
              id: 'sec-31',
              title: '3.1 General Criteria Covered',
              sectionNumber: '3.1',
              content: 'The service must be individualized, safely furnished, and not primarily for convenience.',
              reason: 'General coverage criteria section.',
            }),
            sec3k2({
              id: 'sec-321',
              title: '3.2.1 Specific criteria covered by Medicaid',
              sectionNumber: '3.2.1',
              content: 'CAP/DA requires nursing facility level of care and a signed service plan.',
              reason: 'Specific CAP/DA criteria section.',
            }),
          ],
          supportingSections: [
            sec3k2({
              id: 'sec-desc',
              title: 'Description of the Procedure, Product, or Service',
              sectionNumber: '1.0',
              content: 'The CAP/DA waiver serves adults with disabilities 18 years of age and older who are at risk of institutionalization.',
              reason: 'Program scope section.',
            }),
          ],
          avoidSections: [
            sec3k2({
              id: 'sec-claim',
              title: 'CAP/DA Claim Reimbursement',
              content: 'Prepare a paper claim for the service.',
              reason: 'Operational section to avoid.',
            }),
          ],
        }),
      ),
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
      makeFrameArgs(
        'What DME items are specifically NOT covered by NC Medicaid under the Orthotics and Prosthetics policy, and what general criteria must be met for coverage?',
        makeFrame({
          authoritativeDocuments: [
            makeDocument({
              id: 'doc-5b',
              title: 'Orthotics & Prosthetics',
              policyNumber: '5B',
              url: 'https://example.com/5B',
              reason: 'Policy-number lookup result related to the coverage question.',
            }),
          ],
          primarySections: [
            sec5b({
              id: 'sec-41',
              title: '4.1 General Criteria Not Covered',
              sectionNumber: '4.1',
              content: 'Experimental or investigational items and items that do not meet policy criteria are not covered.',
              reason: 'General exclusions section.',
            }),
            sec5b({
              id: 'sec-421',
              title: '4.2.1 Specific Criteria Not Covered by Medicaid',
              sectionNumber: '4.2.1',
              content: 'Comfort or convenience devices and backup devices are not covered.',
              reason: 'Specific exclusions section.',
            }),
          ],
          supportingSections: [
            sec5b({
              id: 'sec-31',
              title: '3.1 General Criteria Covered',
              sectionNumber: '3.1',
              content: 'General criteria must be met before coverage is available.',
              reason: 'General coverage section.',
            }),
            sec5b({
              id: 'sec-321',
              title: '3.2.1 Specific criteria covered by Medicaid',
              sectionNumber: '3.2.1',
              content: 'Orthotic and prosthetic items are covered when the medical-necessity criteria are met.',
              reason: 'Specific covered criteria section.',
            }),
          ],
        }),
      ),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('Answer the not-covered or limitation part explicitly');
    expect(result?.systemMessages?.[0]?.content).toContain('Separate the general exclusions');
    expect(result?.systemMessages?.[0]?.content).toContain('item-specific exclusions');
    expect(result?.systemMessages?.[0]?.content).toContain('governing coverage criteria');
  });

  it('adds ambulance-specific non-covered guidance that leads with the ambulance exclusion section', () => {
    const processor = new AnswerFramePlanningProcessor();

    const sec15 = sectionMaker({
      documentId: 'doc-15',
      documentTitle: 'Ambulance Services',
      policyNumber: '15',
    });

    const result = processor.processInputStep!(
      makeFrameArgs(
        'What ambulance services are NOT covered by NC Medicaid?',
        makeFrame({
          route: scopeAndNotCoveredRoute(),
          authoritativeDocuments: [
            makeDocument({
              id: 'doc-15',
              title: 'Ambulance Services',
              policyNumber: '15',
              url: 'https://example.com/15',
              reason: 'Ambulance-services policy.',
            }),
          ],
          primarySections: [
            sec15({
              id: 'sec-4214',
              title: 'Other Non-Covered Ambulance Services',
              sectionNumber: '4.2.1.4',
              content: 'False alarm calls, patient refusal, waiting fees, and similar services are not covered.',
              reason: 'Ambulance-specific non-covered services.',
            }),
          ],
          supportingSections: [
            sec15({
              id: 'sec-3211',
              title: 'Air Medical Ambulance',
              sectionNumber: '3.2.1.1',
              content: 'Air ambulance is covered only when ground transport is contraindicated or impractical.',
              reason: 'Narrow covered boundary for air ambulance.',
            }),
          ],
          avoidSections: [
            sec15({
              id: 'sec-41',
              title: '4.1 General Criteria Not Covered',
              sectionNumber: '4.1',
              content: 'General exclusions.',
              reason: 'General exclusions are secondary here.',
            }),
          ],
        }),
      ),
    );

    expect(result?.systemMessages?.[0]?.content).toContain('For this ambulance non-covered question, lead with');
    expect(result?.systemMessages?.[0]?.content).toContain('4.2.1.4');
    expect(result?.systemMessages?.[0]?.content).toContain('keep general exclusions secondary');
    expect(result?.systemMessages?.[0]?.content).toContain('3.2.1.1');
    expect(result?.systemMessages?.[0]?.content).toContain('air ambulance remains covered');
  });

  it('adds pharmacy quantity-limit guidance that leads with section 5.4.3 before prior-approval process details', () => {
    const processor = new AnswerFramePlanningProcessor();

    const sec9 = sectionMaker({
      documentId: 'doc-9',
      documentTitle: 'Lock-in Program',
      policyNumber: '9',
    });

    const result = processor.processInputStep!(
      makeFrameArgs(
        'Are there quantity limits on prescription drugs under NC Medicaid, and when is prior authorization required for pharmacy claims?',
        makeFrame({
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
            makeDocument({
              id: 'doc-9',
              title: 'Lock-in Program',
              policyNumber: '9',
              url: 'https://example.com/9',
              reason: 'Policy 9 is the governing outpatient pharmacy source.',
            }),
          ],
          primarySections: [
            sec9({
              id: 'sec-543',
              title: '5.4.3 Quantity and Episodic Drugs',
              sectionNumber: '5.4.3',
              content:
                'NC Medicaid may impose quantity limitations for episodic drugs, and prior authorization criteria may also apply.',
              reason: 'Quantity-limit section.',
            }),
            sec9({
              id: 'sec-pa-criteria',
              title: 'Pharmacy Prior Approval Drugs and Criteria',
              content: 'GLP-1 receptor agonists, hepatitis C medications, and other listed categories require prior approval.',
              reason: 'Prior-approval criteria section.',
            }),
          ],
          supportingSections: [
            sec9({
              id: 'sec-attachment-k',
              title: 'Attachment K: Pharmacy Prior Approval Criteria',
              sectionNumber: 'Attachment K',
              reason: 'Attachment label for the criteria.',
            }),
          ],
          avoidSections: [
            sec9({
              id: 'sec-request',
              title: 'Attachment C: Requesting Prior Authorization for Prescription Drugs',
              sectionNumber: 'Attachment C',
              content: 'Providers submit by web portal, phone, or fax.',
              reason: 'Request process section.',
            }),
            sec9({
              id: 'sec-exception',
              title: '3.2.3 Exceptions to FDA and NC Medicaid Drug criteria approval.',
              sectionNumber: '3.2.3',
              content: 'Medical-necessity exceptions require supporting literature.',
              reason: 'Exception procedure section.',
            }),
          ],
        }),
      ),
    );

    const plan = result?.systemMessages?.[0]?.content ?? '';
    expect(plan).toContain('Lead with the surfaced quantity-limit and criteria sections');
    expect(plan).toContain('5.4.3');
    // The plan must direct WHERE to look, never assert the conclusion —
    // pre-baked "answer yes first: the policy says X" lines were injected
    // from keyword matches without reading the section text.
    expect(plan).toContain('state the yes/no conclusion only as that text supports it');
    expect(plan).not.toContain('answer yes first');
    expect(plan).not.toContain('NC Medicaid may impose quantity limitations');
    expect(plan).toContain('which drugs or categories the pharmacy prior-approval criteria list');
    expect(plan).toContain('Attachment K');
    expect(plan).toContain('Name the governing source by policy number first: 9');
    expect(plan).toContain('Do not present a partial sample drug list');
    expect(plan).toContain('Keep request-process or exception procedures secondary');
    expect(plan).toContain('unless the user asks about them');
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

  const makeCoverageSection = sectionMaker({
    documentId: 'doc-10a',
    documentTitle: 'Outpatient Specialized Therapies',
    policyNumber: '10A',
  });

  const ADULT_EXCLUSION_QUESTION = 'Does Policy 10A cover routine massage therapy for beneficiaries over age 21?';

  // The route is the router's own output for the question, and the frame
  // carries one avoid section, as live coverage frames usually do.
  function makeAdultExclusionFrame(withEpsdtSection: boolean, question: string): FrameFixture {
    return makeFrame({
      route: analyzeQuery(question).route,
      avoidSections: [
        makeCoverageSection({
          id: 'sec-attachment-a',
          title: 'Attachment A: Claims-Related Information',
          sectionNumber: 'Attachment A',
        }),
      ],
      primarySections: [
        makeCoverageSection({
          id: 'sec-scope',
          title: 'Description of the Procedure, Product, or Service',
          sectionNumber: '2.1.1',
          content: 'Outpatient specialized therapies include physical, occupational, and speech therapy.',
        }),
        makeCoverageSection({
          id: 'sec-notcovered',
          title: 'General Criteria Not Covered',
          sectionNumber: '4.1',
          content: 'Routine massage therapy is not covered for beneficiaries 21 years of age and older.',
        }),
      ],
      supportingSections: withEpsdtSection
        ? [
            makeCoverageSection({
              id: 'sec-epsdt',
              title:
                'EPSDT Special Provision: Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age',
              sectionNumber: '2.2.1',
              content:
                'EPSDT requires coverage of medically necessary services for beneficiaries under 21 even when this policy limits them.',
            }),
          ]
        : [],
    });
  }

  function makeAdultExclusionArgs(withEpsdtSection: boolean, question = ADULT_EXCLUSION_QUESTION) {
    return makeFrameArgs(question, makeAdultExclusionFrame(withEpsdtSection, question));
  }

  const EPSDT_SECTION_LABEL =
    '§ 2.2.1 EPSDT Special Provision: Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age';
  const START_WITH_LINE = `- Start with the governing coverage rule from § 2.1.1 Description of the Procedure, Product, or Service; § 4.1 General Criteria Not Covered; ${EPSDT_SECTION_LABEL} before lower-level details.`;
  const EPSDT_LINE = `- The frame surfaced an EPSDT special-provision section (${EPSDT_SECTION_LABEL}). Before finalizing a no-coverage conclusion for adults, read that section and state what it says about beneficiaries under 21, citing it. Do not assert what the exception allows beyond that section's text.`;
  const NUMERIC_EVIDENCE_LINES = [
    '- State only numbers, thresholds, dates, and change markers that appear directly in surfaced evidence.',
    '- Do not reconstruct charts, infer updated math, or fill in missing numeric tables from context.',
    '- If the surfaced current sections point to a chart or table without reproducing the figures, say the current dollar amounts were not verified in the surfaced evidence.',
  ];

  it('adds an evidence-gated EPSDT-exception directive when the section is surfaced for an adult exclusion question', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(makeAdultExclusionArgs(true));
    const plan = result?.systemMessages?.[0]?.content ?? '';

    // The router's real route for this question, not the fixture default.
    expect(plan).toContain('Route: baseline_hybrid (single_document_coverage)');
    expect(plan).toContain('Do not lead with: § Attachment A');
    // Eight items are candidates here; the pinned EPSDT directive keeps its
    // place and the cap removes later unpinned items instead.
    expect(checklistLines(plan)).toEqual([
      '- Answer directly from the current frame before widening further.',
      '- For this yes/no coverage question, answer yes or no first and pair the governing scope section with the not-covered section.',
      '- Keep attachments, request-process instructions, and other procedural sections secondary unless the user asked for them.',
      START_WITH_LINE,
      '- For this yes/no coverage question, answer yes or no first, then cite both the scope section § 2.1.1 Description of the Procedure, Product, or Service and the not-covered section § 4.1 General Criteria Not Covered.',
      EPSDT_LINE,
    ]);
    expect(plan).toContain('EPSDT special-provision section');
    expect(plan).toContain('2.2.1');
    // De-contamination pins: the directive directs WHERE to look and forbids
    // asserting beyond the section text — it must never contain golden-answer
    // conclusion phrasing.
    expect(plan).toContain("Do not assert what the exception allows beyond that section's text");
    expect(plan).not.toContain('may permit broader coverage');
    expect(plan).not.toContain('is covered for beneficiaries under 21');
  });

  it('keeps the numeric-evidence and EPSDT directives when more than six items are candidates', () => {
    const processor = new AnswerFramePlanningProcessor();
    const question = 'Does Policy 10A cover routine massage therapy for adults, and how much is the monthly premium?';
    const route = analyzeQuery(question).route;
    expect(route.lane).toBe('deterministic_evidence');
    expect(route.determinism_hints.numeric_evidence_only).toBe(true);

    const frame = makeAdultExclusionFrame(true, question);
    const scopedFrame: FrameFixture = {
      ...frame,
      coverageScope: {
        policyId: 'test-policy',
        limitationIds: ['test-limitation'],
        notice: 'Test scope notice.',
        requestedDate: null,
        requiredSourceUrls: [],
        requirements: ['Test scope requirement.'],
      },
    };

    const first = checklistLines(processor.processInputStep!(makeFrameArgs(question, scopedFrame))?.systemMessages?.[0]?.content);
    const second = checklistLines(processor.processInputStep!(makeFrameArgs(question, scopedFrame))?.systemMessages?.[0]?.content);

    // Six pinned items fill the cap, so no unpinned item is added.
    expect(first).toEqual(['- Test scope notice.', '- Test scope requirement.', ...NUMERIC_EVIDENCE_LINES, EPSDT_LINE]);
    expect(second).toEqual(first);
    // Without the scope items two unpinned slots open, filled in rule order
    // around the pinned items rather than after them.
    expect(checklistLines(processor.processInputStep!(makeFrameArgs(question, frame))?.systemMessages?.[0]?.content)).toEqual([
      ...NUMERIC_EVIDENCE_LINES,
      '- Do not widen beyond the current structured frame for extra numeric details. Finalize from the verified evidence you already have.',
      START_WITH_LINE,
      EPSDT_LINE,
    ]);
  });

  it('omits the EPSDT directive when no EPSDT section is surfaced', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(makeAdultExclusionArgs(false));
    const plan = result?.systemMessages?.[0]?.content ?? '';

    expect(plan).not.toContain('EPSDT special-provision section');
  });

  it('does not add the adult-exclusion EPSDT directive when the question itself asks about under-21', () => {
    const processor = new AnswerFramePlanningProcessor();

    const result = processor.processInputStep!(
      makeAdultExclusionArgs(true, 'How does the EPSDT special provision affect massage therapy coverage for children under 21?'),
    );
    const plan = result?.systemMessages?.[0]?.content ?? '';

    expect(plan).not.toContain('Before finalizing a no-coverage conclusion for adults');
  });
});
