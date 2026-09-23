// Federal-authority answer frames: federal regulation vs NC implementation
// split, MLR document scoping, same-regulation expansion, alias-driven NC
// support, and statute-vs-regulation authority resolution.

import { describe, expect, it } from 'vitest';
import {
  createCorpus,
  documentGraphHandlers,
  hitFor,
  queries,
  resolveTypedFrame,
  sectionHit,
  sectionRecord,
  type GraphDocument,
} from './helpers/graph-fixtures.js';

describe('federal-authority frame', () => {
  it('prefers federal authority and keeps NC implementation as support', async () => {
    const DOC_440: GraphDocument = {
      id: 'doc-42cfr440',
      title: '42 CFR Part 440',
      documentType: 'federal_regulation',
      policyNumber: '42 CFR 440',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/42cfr440',
      sections: [
        {
          id: 'sec-44070',
          number: '440.70',
          title: 'Home health services',
          content:
            'Home health services must be provided on the order of a physician or other licensed practitioner and are provided to a beneficiary at his or her place of residence.',
          chars: 1000,
        },
      ],
    };
    const DOC_484: GraphDocument = {
      id: 'doc-42cfr484',
      title: '42 CFR Part 484',
      documentType: 'federal_regulation',
      policyNumber: '42 CFR 484',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/42cfr484',
      sections: [
        {
          id: 'sec-48480',
          number: '484.80',
          title: 'Condition of participation: Home health aide services',
          content: 'Home health aide services are provided under the condition of participation requirements.',
          chars: 900,
        },
      ],
    };
    const DOC_441: GraphDocument = {
      id: 'doc-42cfr441',
      title: '42 CFR Part 441',
      documentType: 'federal_regulation',
      policyNumber: '42 CFR 441',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/42cfr441',
      sections: [
        {
          id: 'sec-44116',
          number: '441.16',
          title: 'Home health agency requirements for surety bonds; Prohibition on FFP',
          content: 'Home health agency requirements govern surety bonds.',
          chars: 900,
        },
      ],
    };
    const DOC_SPA: GraphDocument = {
      id: 'doc-spa',
      title: 'NC State Plan Amendment 24-0001',
      documentType: 'state_plan_amendment',
      policyNumber: 'SPA 24-0001',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/spa',
      sections: [
        {
          id: 'sec-nc-impl',
          number: 'Attachment 3.1-A',
          title: 'State Plan Home Health Services',
          content: 'North Carolina implements home health through the approved state plan attachment.',
          chars: 800,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector federal',
        match: queries.sectionVector('federal_regulation'),
        result: {
          records: [
            hitFor(DOC_484, 'sec-48480', 0.99),
            hitFor(DOC_441, 'sec-44116', 0.98),
            hitFor(DOC_440, 'sec-44070', 0.97),
          ],
        },
      },
      {
        label: 'vector spa',
        match: queries.sectionVector('state_plan_amendment'),
        result: { records: [hitFor(DOC_SPA, 'sec-nc-impl', 0.88)] },
      },
      ...documentGraphHandlers(DOC_440),
      ...documentGraphHandlers(DOC_484),
      ...documentGraphHandlers(DOC_441),
      ...documentGraphHandlers(DOC_SPA),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'federal_authority',
      "What does federal law define as 'home health services' under Medicaid, and how does North Carolina implement it?",
    );

    expect(frame.questionType).toBe('federal_authority');
    expect(frame.primarySections[0]?.sectionNumber).toBe('440.70');
    expect(frame.primarySections.every((section) => section.documentTitle === '42 CFR Part 440')).toBe(true);
    expect(frame.supportingSections[0]?.documentType).toBe('state_plan_amendment');
    expectAllHandlersUsed();
  });

  it('keeps MLR implementation evidence scoped to the matching NC document', async () => {
    const DOC_438: GraphDocument = {
      id: 'doc-438',
      title: '42 CFR Part 438',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-438',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/438',
      sections: [
        {
          id: 'sec-4388',
          number: '438.8',
          title: 'Medical loss ratio (MLR) standards',
          content: 'States must require each MCO, PIHP, and PAHP to calculate and report an MLR.',
          chars: 1000,
        },
      ],
    };
    const DOC_158: GraphDocument = {
      id: 'doc-158',
      title: '45 CFR Part 158',
      documentType: 'federal_regulation',
      policyNumber: '45-CFR-158',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/158',
      sections: [
        {
          id: 'sec-158221',
          number: '158.221',
          title: 'Formula for calculating an issuer medical loss ratio',
          content: 'Issuers calculate MLR using the issuer formula.',
          chars: 900,
        },
        {
          id: 'sec-158240',
          number: '158.240',
          title: 'Rebating premium if the applicable medical loss ratio standard is not met',
          content: 'Issuers rebate premium when the applicable MLR standard is not met.',
          chars: 900,
        },
      ],
    };
    const DOC_SPA_MLR: GraphDocument = {
      id: 'doc-spa-mlr',
      title: 'SPA 22-0013 Proposed Amendments CHIP-Managed Care',
      documentType: 'state_plan_amendment',
      policyNumber: 'SPA 22-0013',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/spa-mlr',
      sections: [
        {
          id: 'sec-mlr-impl',
          number: '3.3',
          title: '3.3 Rate Development Standards and Medical Loss Ratio',
          content: 'North Carolina requires a minimum MLR and describes oversight of that requirement in section 3.3.',
          chars: 950,
        },
      ],
    };
    const DOC_STATE_PLAN_NOISY: GraphDocument = {
      id: 'doc-stateplan-noisy',
      title: 'State Plan under Title XIX of the Social Security Act Medical Assistance Program',
      documentType: 'state_plan_amendment',
      policyNumber: null,
      effectiveDate: '2025-01-01',
      url: 'https://example.com/stateplan',
      sections: [
        {
          id: 'sec-noisy-1',
          number: null,
          title: 'Payments for Medical and Remedial Care and Services: Inpatient Hospital',
          content: 'General inpatient hospital payment language.',
          chars: 850,
        },
        {
          id: 'sec-noisy-2',
          number: '4602.1',
          title: '4602.1 Factors Frequently Indicating Need For Intermediate Care (ICF)',
          content: 'Intermediate care factors.',
          chars: 850,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector federal',
        match: queries.sectionVector('federal_regulation'),
        result: {
          records: [
            hitFor(DOC_438, 'sec-4388', 0.99),
            hitFor(DOC_158, 'sec-158221', 0.97),
            hitFor(DOC_158, 'sec-158240', 0.96),
          ],
        },
      },
      {
        label: 'vector spa',
        match: queries.sectionVector('state_plan_amendment'),
        result: {
          records: [
            hitFor(DOC_SPA_MLR, 'sec-mlr-impl', 0.94),
            hitFor(DOC_STATE_PLAN_NOISY, 'sec-noisy-1', 0.93),
            hitFor(DOC_STATE_PLAN_NOISY, 'sec-noisy-2', 0.92),
          ],
        },
      },
      ...documentGraphHandlers(DOC_438),
      ...documentGraphHandlers(DOC_158),
      ...documentGraphHandlers(DOC_SPA_MLR),
      ...documentGraphHandlers(DOC_STATE_PLAN_NOISY),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'federal_authority',
      'What medical loss ratio (MLR) must Medicaid managed care organizations meet under federal law, and how does NC implement this requirement?',
    );

    expect(frame.route.lane).toBe('graph_reasoning');
    expect(frame.primarySections[0]?.sectionNumber).toBe('438.8');
    expect(frame.primarySections.every((section) => section.documentTitle === '42 CFR Part 438')).toBe(true);
    expect(frame.supportingSections[0]?.policyNumber).toBe('SPA 22-0013');
    expect(frame.supportingSections[0]?.title).toContain('Medical Loss Ratio');
    expectAllHandlersUsed();
  });

  it('surfaces NC managed care contract MLR implementation alongside SPA support', async () => {
    const DOC_438: GraphDocument = {
      id: 'doc-438',
      title: '42 CFR Part 438',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-438',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/438',
      sections: [
        {
          id: 'sec-4388',
          number: '438.8',
          title: 'Medical loss ratio (MLR) standards',
          content:
            'The State must ensure, through its contracts, that each MCO, PIHP, and PAHP calculate and report an MLR. If a State elects to mandate a minimum MLR, that minimum must be equal to or higher than 85 percent.',
          chars: 1000,
        },
      ],
    };
    const DOC_CONTRACT: GraphDocument = {
      id: 'doc-contract',
      title: 'Prepaid Health Plan Services Contract',
      documentType: 'managed_care_contract',
      policyNumber: 'CONTRACT 30-190029',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/contract',
      authorityTier: 'supporting',
      answerRole: 'managed_care_contract',
      answerReady: true,
      retrievalReady: true,
      sections: [
        {
          id: 'sec-contract-mlr',
          number: 'V.I.2',
          title: '2. Medical Loss Ratio',
          content:
            'The PHP shall calculate and report the CMS-defined MLR and Department-defined MLR. The minimum MLR threshold for the PHP shall be exactly eighty-eight percent (88%).',
          chars: 1200,
        },
        {
          id: 'sec-contract-report',
          number: 'V.I.2.f',
          title: 'MLR reports and remittances',
          content:
            'The PHP must attest to the accuracy of the MLR calculations and submit the required MLR reports and remittances to the Department.',
          chars: 900,
        },
      ],
    };
    const DOC_SPA_MLR: GraphDocument = {
      id: 'doc-spa-mlr',
      title: 'SPA 22-0013 Proposed Amendments CHIP-Managed Care',
      documentType: 'state_plan_amendment',
      policyNumber: 'SPA 22-0013',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/spa-mlr',
      authorityTier: 'authoritative',
      answerRole: 'managed_care',
      answerReady: true,
      retrievalReady: true,
      sections: [
        {
          id: 'sec-spa-mlr',
          number: '3.3',
          title: '3.3 Rate Development Standards and Medical Loss Ratio',
          content:
            'North Carolina assures that rates are designed to reasonably achieve a medical loss ratio and describes remittance handling when the minimum MLR required by the State is not met.',
          chars: 950,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector federal',
        match: queries.sectionVector('federal_regulation'),
        result: { records: [hitFor(DOC_438, 'sec-4388', 0.99)] },
      },
      {
        label: 'vector managed care',
        match: queries.sectionVector('managed_care_contract'),
        result: { records: [hitFor(DOC_CONTRACT, 'sec-contract-mlr', 0.96), hitFor(DOC_SPA_MLR, 'sec-spa-mlr', 0.9)] },
      },
      ...documentGraphHandlers(DOC_438),
      ...documentGraphHandlers(DOC_CONTRACT),
      ...documentGraphHandlers(DOC_SPA_MLR),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'federal_authority',
      'What medical loss ratio (MLR) must Medicaid managed care organizations meet under federal law, and how does NC implement this requirement?',
    );

    expect(frame.primarySections[0]?.sectionNumber).toBe('438.8');
    expect(frame.supportingSections[0]?.documentType).toBe('managed_care_contract');
    expect(frame.supportingSections.map((section) => section.id)).toEqual(
      expect.arrayContaining(['sec-contract-mlr', 'sec-contract-report', 'sec-spa-mlr']),
    );
    expectAllHandlersUsed();
  });

  it('keeps MLR federal sections focused on MLR calculation and reporting', async () => {
    const DOC_438: GraphDocument = {
      id: 'doc-438',
      title: '42 CFR Part 438',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-438',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/438',
      sections: [
        {
          id: 'sec-4388',
          number: '438.8',
          title: 'Medical loss ratio (MLR) standards',
          content:
            'States must ensure each MCO, PIHP, and PAHP calculate and report an MLR. The MLR is the ratio of numerator to denominator.',
          chars: 1000,
        },
        {
          id: 'sec-43874',
          number: '438.74',
          title: 'Medical loss ratio reports',
          content: 'States submit annual summaries of MLR reports and remittances.',
          chars: 900,
        },
        {
          id: 'sec-438510',
          number: '438.510',
          title: 'Mandatory QRS measure set for Medicaid managed care quality rating system',
          content: 'A noisy managed-care quality section unrelated to loss-ratio calculation or reporting.',
          chars: 900,
        },
      ],
    };
    const DOC_SPA_MLR: GraphDocument = {
      id: 'doc-spa-mlr',
      title: 'SPA 22-0013 Proposed Amendments CHIP-Managed Care',
      documentType: 'state_plan_amendment',
      policyNumber: 'SPA 22-0013',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/spa-mlr',
      sections: [
        {
          id: 'sec-mlr-impl',
          number: '3.3',
          title: '3.3 Rate Development Standards and Medical Loss Ratio',
          content: 'North Carolina describes rate development and remittance handling for MLR.',
          chars: 950,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector federal',
        match: queries.sectionVector('federal_regulation'),
        result: {
          records: [
            hitFor(DOC_438, 'sec-4388', 0.99),
            hitFor(DOC_438, 'sec-43874', 0.97),
            hitFor(DOC_438, 'sec-438510', 0.98),
          ],
        },
      },
      {
        label: 'vector spa',
        match: queries.sectionVector('state_plan_amendment'),
        result: { records: [hitFor(DOC_SPA_MLR, 'sec-mlr-impl', 0.94)] },
      },
      ...documentGraphHandlers(DOC_438),
      ...documentGraphHandlers(DOC_SPA_MLR),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'federal_authority',
      'What medical loss ratio (MLR) must Medicaid managed care organizations meet under federal law, and how does NC implement this requirement?',
    );

    expect(frame.primarySections.map((section) => section.sectionNumber)).toContain('438.8');
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.sectionNumber)).toContain(
      '438.74',
    );
    expect(frame.primarySections.map((section) => section.sectionNumber)).not.toContain('438.510');
    expectAllHandlersUsed();
  });

  it('surfaces federal enforcement sections from the same governing regulation', async () => {
    const DOC_438: GraphDocument = {
      id: 'doc-438',
      title: '42 CFR Part 438',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-438',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/438',
      sections: [
        {
          id: 'sec-4388',
          number: '438.8',
          title: 'Medical loss ratio (MLR) standards',
          content: 'If a State elects to mandate a minimum MLR, that minimum must be equal to or higher than 85 percent.',
          chars: 1000,
        },
        {
          id: 'sec-43874',
          number: '438.74',
          title: 'Medical loss ratio reports',
          content: 'The State must submit an annual summary describing MLR reports and any remittances owed.',
          chars: 900,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector federal',
        match: queries.sectionVector('federal_regulation'),
        result: { records: [hitFor(DOC_438, 'sec-4388', 0.99)] },
      },
      ...documentGraphHandlers(DOC_438),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'federal_authority',
      'What medical loss ratio (MLR) must Medicaid managed care organizations meet under federal law, and how is this requirement enforced?',
    );

    expect(frame.questionType).toBe('federal_authority');
    expect(frame.primarySections.map((section) => section.sectionNumber)).toContain('438.8');
    // 438.74 never appears as a retrieval hit — it must be pulled in through
    // same-document expansion of the governing regulation.
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.sectionNumber)).toContain(
      '438.74',
    );
    expect(
      [...frame.primarySections, ...frame.supportingSections].some((section) => section.documentTitle === '42 CFR Part 438'),
    ).toBe(true);
    expectAllHandlersUsed();
  });

  it('adds aliased NC implementation policy support without displacing federal authority', async () => {
    const DOC_431: GraphDocument = {
      id: 'doc-431',
      title: '42 CFR Part 431',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-431',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/431',
      sections: [
        {
          id: 'sec-431408',
          number: '431.408',
          title: 'State public notice process',
          content: 'The agency must provide public notice, a comment period, and public hearings before submission.',
        },
        {
          id: 'sec-4311010',
          number: '431.1010',
          title: 'Disallowance of Federal financial participation for erroneous State payments',
          content: 'This section addresses PERM disallowance procedures for erroneous State payments.',
        },
      ],
    };
    const DOC_441: GraphDocument = {
      id: 'doc-441',
      title: '42 CFR Part 441',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-441',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/441',
      sections: [
        {
          id: 'sec-441300',
          number: '441.300',
          title: 'Basis and scope',
          content: 'Section 1915(c) permits States to provide home and community-based services under a waiver.',
          chars: 900,
        },
        {
          id: 'sec-441303',
          number: '441.303',
          title: 'Supporting documentation required',
          content: 'The agency must document health and welfare assurances, financial accountability, and cost estimates.',
          chars: 900,
        },
      ],
    };
    const DOC_3K2: GraphDocument = {
      id: 'doc-3k2',
      title: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
      documentType: 'clinical_policy',
      policyNumber: '3K-2',
      effectiveDate: '2025-09-01',
      url: 'https://example.com/3k-2',
      sections: [
        {
          id: 'sec-3k2-31',
          number: '3.1',
          title: '3.1 General Criteria Covered by Medicaid',
          content: 'CAP/DA services must meet NC Medicaid general criteria covered by Medicaid.',
          chars: 850,
        },
        {
          id: 'sec-3k2-321',
          number: '3.2.1',
          title: '3.2.1 Specific Criteria Covered by Medicaid',
          content: 'The CAP/DA waiver describes the specific services and criteria covered by NC Medicaid.',
          chars: 850,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector federal',
        match: queries.sectionVector('federal_regulation'),
        result: {
          records: [
            hitFor(DOC_431, 'sec-431408', 1.01),
            hitFor(DOC_431, 'sec-4311010', 1.0),
            hitFor(DOC_441, 'sec-441300', 0.99),
            hitFor(DOC_441, 'sec-441303', 0.97),
          ],
        },
      },
      ...documentGraphHandlers(DOC_431),
      ...documentGraphHandlers(DOC_441),
      ...documentGraphHandlers(DOC_3K2),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'federal_authority',
      "What is the federal statutory authority for NC's CAP/DA waiver, and what does the state need to demonstrate in its waiver application?",
    );

    expect(frame.questionType).toBe('federal_authority');
    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('42-CFR-441');
    expect(frame.primarySections.map((section) => section.sectionNumber)).toEqual(
      expect.arrayContaining(['441.300', '441.303']),
    );
    expect(frame.primarySections.map((section) => section.sectionNumber)).not.toContain('431.408');
    expect(frame.primarySections.every((section) => section.documentType === 'federal_regulation')).toBe(true);
    expect(frame.supportingSections.some((section) => section.policyNumber === '3K-2')).toBe(true);
    expect(frame.supportingSections.find((section) => section.policyNumber === '3K-2')?.sectionNumber).toBe('3.1');
    expect(frame.avoidSections.map((section) => section.sectionNumber)).toContain('431.408');
    expectAllHandlersUsed();
  });

  it('keeps Part 441 authoritative when mixed federal hits elevate SSA section 1915', async () => {
    const DOC_441: GraphDocument = {
      id: 'doc-441',
      title: '42 CFR Part 441',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-441',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/441',
      sections: [
        {
          id: 'sec-441300',
          number: '441.300',
          title: 'Basis and scope',
          content: 'This subpart implements section 1915(c) waiver authority.',
          chars: 900,
        },
        {
          id: 'sec-441301',
          number: '441.301',
          title: 'Contents of request for a waiver',
          content: 'A waiver request must include the required assurances and requested waivers.',
          chars: 900,
        },
        {
          id: 'sec-441303',
          number: '441.303',
          title: 'Supporting documentation required',
          content: 'The state must document target groups, service definitions, estimates, and safeguards.',
          chars: 900,
        },
      ],
    };
    const DOC_440: GraphDocument = {
      id: 'doc-440',
      title: '42 CFR Part 440',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-440',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/440',
      sections: [
        {
          id: 'sec-440180',
          number: '440.180',
          title: 'Home and community-based waiver services',
          content: 'This section describes HCBS waiver services under Medicaid.',
          chars: 900,
        },
      ],
    };
    const DOC_SSA: GraphDocument = {
      id: 'doc-ssa',
      title: 'Social Security Act — Title XIX (Medicaid)',
      documentType: 'federal_statute',
      policyNumber: 'SSA-Title-19',
      effectiveDate: null,
      url: 'https://example.com/ssa-title-19',
      sections: [
        {
          id: 'sec-1915',
          number: '1915',
          title: 'Section 1915. Compliance with State plan and payment provisions',
          content: 'Section 1915(c) authorizes home and community-based services waivers.',
          chars: 900,
        },
        {
          id: 'sec-1902',
          number: '1902',
          title: 'Section 1902. State plans for medical assistance',
          content: 'This section governs Medicaid state plan requirements.',
          chars: 900,
        },
        {
          id: 'sec-1929',
          number: '1929',
          title: 'Section 1929. Home and community care for functionally disabled elderly individuals',
          content: 'This section describes community care services for elderly individuals.',
          chars: 900,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        // The federal-authority collector issues ONE vector scan covering both
        // federal docTypes (documentTypes: ['federal_regulation',
        // 'federal_statute']). The legacy test stubbed a second
        // federal_statute-only handler that could never match, so the SSA hits
        // silently never entered retrieval; here the mixed hits are returned
        // for real.
        label: 'vector federal',
        match: queries.sectionVector('federal_regulation'),
        result: {
          records: [
            // sec-441745/sec-441464 are retrieval-only noise: top-scoring hits
            // from the winning Part 441 document that the graph fixtures never
            // hydrate (mirroring sections the section listing omits).
            sectionHit({
              sectionId: 'sec-441745',
              sectionNumber: '441.745',
              sectionTitle: 'State plan HCBS administration: State responsibilities and quality improvement',
              documentTitle: '42 CFR Part 441',
              policyNumber: '42-CFR-441',
              documentType: 'federal_regulation',
              content: 'The state must provide assurances and quality improvement information.',
              score: 1.53,
            }),
            sectionHit({
              sectionId: 'sec-441464',
              sectionNumber: '441.464',
              sectionTitle: 'State assurances',
              documentTitle: '42 CFR Part 441',
              policyNumber: '42-CFR-441',
              documentType: 'federal_regulation',
              content: 'The agency must provide state assurances for the HCBS program.',
              score: 1.53,
            }),
            // sec-441310 hydrates individually but is intentionally absent from
            // the Part 441 section listing, so it cannot be re-introduced by
            // document expansion.
            sectionHit({
              sectionId: 'sec-441310',
              sectionNumber: '441.310',
              sectionTitle: 'Limits on Federal financial participation (FFP)',
              documentTitle: '42 CFR Part 441',
              policyNumber: '42-CFR-441',
              documentType: 'federal_regulation',
              content: 'The state must show cost and participation limits for waiver services.',
              score: 1.375,
            }),
            hitFor(DOC_441, 'sec-441300', 1.365),
            hitFor(DOC_440, 'sec-440180', 1.275),
            hitFor(DOC_SSA, 'sec-1915', 1.54),
            hitFor(DOC_SSA, 'sec-1929', 1.19),
            hitFor(DOC_SSA, 'sec-1902', 1.095),
          ],
        },
      },
      {
        label: 'sectionById(sec-441310)',
        optional: true,
        match: queries.sectionById('sec-441310'),
        result: {
          records: [
            sectionRecord({
              id: 'sec-441310',
              title: 'Limits on Federal financial participation (FFP)',
              sectionNumber: '441.310',
              content: 'The state must show cost and participation limits for waiver services.',
              documentId: 'doc-441',
              documentTitle: '42 CFR Part 441',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-441',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/441',
              status: 'current',
            }),
          ],
        },
      },
      ...documentGraphHandlers(DOC_441),
      ...documentGraphHandlers(DOC_440),
      ...documentGraphHandlers(DOC_SSA),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'federal_authority',
      "What is the federal statutory authority for NC's CAP/DA waiver, and what does the state need to demonstrate in its waiver application?",
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('42-CFR-441');
    expect(frame.primarySections.map((section) => section.sectionNumber)).toEqual(
      expect.arrayContaining(['441.301', '441.303']),
    );
    expect(frame.primarySections.map((section) => section.sectionNumber)).not.toContain('1929');
    expectAllHandlersUsed();
  });
});

describe('federal authority statute pairing', () => {
  it('pairs the SSA statute with the implementing regulation on an EPSDT authority question', async () => {
    // h-049 regression: 440.345 ("EPSDT and other required benefits", the
    // benchmark-plan context) had the highest raw score, and single-document
    // title preference scoped out both 441 Subpart B and the SSA statute.
    const DOC_441: GraphDocument = {
      id: 'doc-441',
      title: '42 CFR Part 441',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-441',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/441',
      sections: [
        {
          id: 'sec-44150',
          number: '441.50',
          title: 'Basis and purpose',
          content: 'This subpart implements sections 1902(a)(43) and 1905(a)(4)(B) and (r) of the Act on early and periodic screening, diagnosis, and treatment of individuals under age 21.',
          chars: 900,
        },
        {
          id: 'sec-44156',
          number: '441.56',
          title: 'Required activities: Early and periodic screening, diagnosis, and treatment of individuals under age 21',
          content: 'The agency must require screening, diagnosis, and treatment services for eligible EPSDT recipients.',
          chars: 900,
        },
      ],
    };
    const DOC_440: GraphDocument = {
      id: 'doc-440',
      title: '42 CFR Part 440',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-440',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/440',
      sections: [
        {
          id: 'sec-440345',
          number: '440.345',
          title: 'EPSDT and other required benefits',
          content: 'Benchmark and benchmark-equivalent plans must include EPSDT benefits for children.',
          chars: 900,
        },
      ],
    };
    const DOC_SSA: GraphDocument = {
      id: 'doc-ssa',
      title: 'Social Security Act — Title XIX (Medicaid)',
      documentType: 'federal_statute',
      policyNumber: 'SSA-Title-19',
      effectiveDate: null,
      url: 'https://example.com/ssa-title-19',
      sections: [
        {
          id: 'sec-1905',
          number: '1905',
          title: 'Section 1905. Definitions',
          content: 'The term medical assistance includes early and periodic screening, diagnostic, and treatment services for individuals under age 21, as defined in subsection (r).',
          chars: 900,
        },
      ],
    };

    const { corpus } = createCorpus([
      {
        // ONE combined federal scan covers both federal docTypes.
        label: 'vector federal',
        match: queries.sectionVector('federal_regulation'),
        result: {
          records: [
            hitFor(DOC_440, 'sec-440345', 1.0),
            hitFor(DOC_441, 'sec-44156', 0.97),
            hitFor(DOC_441, 'sec-44150', 0.94),
            hitFor(DOC_SSA, 'sec-1905', 0.9),
          ],
        },
      },
      ...documentGraphHandlers(DOC_441),
      ...documentGraphHandlers(DOC_440),
      ...documentGraphHandlers(DOC_SSA),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'federal_authority',
      'What federal authority establishes the EPSDT benefit for individuals under 21?',
    );

    const primaryNumbers = frame.primarySections.map((section) => section.sectionNumber);
    expect(primaryNumbers.some((sectionNumber) => sectionNumber?.startsWith('441.5'))).toBe(true);
    expect(primaryNumbers).toContain('1905');
    expect(primaryNumbers).not.toContain('440.345');
    expect(frame.primarySections.some((section) => section.documentType === 'federal_statute')).toBe(true);
    const authoritativePolicyNumbers = frame.authoritativeDocuments.map((document) => document.policyNumber);
    expect(authoritativePolicyNumbers).toContain('42-CFR-441');
    expect(authoritativePolicyNumbers).toContain('SSA-Title-19');
    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('42-CFR-441');
  });

  it('retrieves missing statutory evidence for a general EPSDT overview', async () => {
    // h-049 regression: 440.345 ("EPSDT and other required benefits", the
    // benchmark-plan context) had the highest raw score, and single-document
    // title preference scoped out both 441 Subpart B and the SSA statute.
    const DOC_441: GraphDocument = {
      id: 'doc-441',
      title: '42 CFR Part 441',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-441',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/441',
      sections: [
        {
          id: 'sec-44150',
          number: '441.50',
          title: 'Basis and purpose',
          content: 'This subpart implements sections 1902(a)(43) and 1905(a)(4)(B) and (r) of the Act on early and periodic screening, diagnosis, and treatment of individuals under age 21.',
          chars: 900,
        },
        {
          id: 'sec-44156',
          number: '441.56',
          title: 'Required activities: Early and periodic screening, diagnosis, and treatment of individuals under age 21',
          content: 'The agency must require screening, diagnosis, and treatment services for eligible EPSDT recipients.',
          chars: 900,
        },
      ],
    };
    const DOC_440: GraphDocument = {
      id: 'doc-440',
      title: '42 CFR Part 440',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-440',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/440',
      sections: [
        {
          id: 'sec-440345',
          number: '440.345',
          title: 'EPSDT and other required benefits',
          content: 'Benchmark and benchmark-equivalent plans must include EPSDT benefits for children.',
          chars: 900,
        },
      ],
    };
    const DOC_SSA: GraphDocument = {
      id: 'doc-ssa',
      title: 'Social Security Act — Title XIX (Medicaid)',
      documentType: 'federal_statute',
      policyNumber: 'SSA-Title-19',
      effectiveDate: null,
      url: 'https://example.com/ssa-title-19',
      sections: [
        {
          id: 'sec-1905',
          number: '1905',
          title: 'Section 1905. Definitions',
          content: 'The term medical assistance includes early and periodic screening, diagnostic, and treatment services for individuals under age 21, as defined in subsection (r).',
          chars: 900,
        },
      ],
    };

    const { corpus } = createCorpus([
      {
        // ONE combined federal scan covers both federal docTypes.
        label: 'vector federal',
        match: queries.sectionVector('federal_regulation'),
        result: {
          records: [
            hitFor(DOC_440, 'sec-440345', 1.0),
            hitFor(DOC_441, 'sec-44156', 0.97),
            hitFor(DOC_441, 'sec-44150', 0.94),
          ],
        },
      },
      { label: 'statute fallback', match: queries.sectionVector('federal_statute'), result: { records: [hitFor(DOC_SSA, 'sec-1905', 0.9)] } },
      ...documentGraphHandlers(DOC_441),
      ...documentGraphHandlers(DOC_440),
      ...documentGraphHandlers(DOC_SSA),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'general',
      'What does EPSDT require?',
    );

    const primaryNumbers = frame.primarySections.map((section) => section.sectionNumber);
    expect(primaryNumbers.some((sectionNumber) => sectionNumber?.startsWith('441.5'))).toBe(true);
    expect(primaryNumbers).toContain('1905');
    expect(primaryNumbers).not.toContain('440.345');
    expect(frame.primarySections.some((section) => section.documentType === 'federal_statute')).toBe(true);
    const authoritativePolicyNumbers = frame.authoritativeDocuments.map((document) => document.policyNumber);
    expect(authoritativePolicyNumbers).toContain('42-CFR-441');
    expect(authoritativePolicyNumbers).toContain('SSA-Title-19');
    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('42-CFR-441');
  });

  it('adds SSA section 1915 alongside Part 441 Subpart G on a 1915(c) authority question', async () => {
    // h-046 regression: the waiver-authority path anchored only 42-CFR-441
    // and never surfaced the statutory authority the question asks about.
    const DOC_441: GraphDocument = {
      id: 'doc-441',
      title: '42 CFR Part 441',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-441',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/441',
      sections: [
        {
          id: 'sec-441300',
          number: '441.300',
          title: 'Basis and scope',
          content: 'This subpart implements section 1915(c) home and community-based services waiver authority.',
          chars: 900,
        },
        {
          id: 'sec-441301',
          number: '441.301',
          title: 'Contents of request for a waiver',
          content: 'A waiver request must include the required assurances and requested waivers.',
          chars: 900,
        },
      ],
    };
    const DOC_430: GraphDocument = {
      id: 'doc-430',
      title: '42 CFR Part 430',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-430',
      effectiveDate: '2024-07-01',
      url: 'https://example.com/430',
      sections: [
        {
          id: 'sec-43025',
          number: '430.25',
          title: 'Waivers of State plan requirements',
          content: 'Cross-references the home and community-based services waiver provisions of part 441.',
          chars: 900,
        },
      ],
    };
    const DOC_SSA: GraphDocument = {
      id: 'doc-ssa',
      title: 'Social Security Act — Title XIX (Medicaid)',
      documentType: 'federal_statute',
      policyNumber: 'SSA-Title-19',
      effectiveDate: null,
      url: 'https://example.com/ssa-title-19',
      sections: [
        {
          id: 'sec-1915',
          number: '1915',
          title: 'Section 1915. Compliance with State plan and payment provisions',
          content: 'Section 1915(c) authorizes home and community-based services waivers for Medicaid.',
          chars: 900,
        },
      ],
    };

    const { corpus } = createCorpus([
      {
        label: 'vector federal',
        match: queries.sectionVector('federal_regulation'),
        result: {
          records: [
            hitFor(DOC_430, 'sec-43025', 1.0),
            hitFor(DOC_441, 'sec-441300', 0.97),
            hitFor(DOC_441, 'sec-441301', 0.95),
            hitFor(DOC_SSA, 'sec-1915', 0.92),
          ],
        },
      },
      ...documentGraphHandlers(DOC_441),
      ...documentGraphHandlers(DOC_430),
      ...documentGraphHandlers(DOC_SSA),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'federal_authority',
      'Where in the federal regulations is the authority for 1915(c) HCBS waivers?',
    );

    const primaryNumbers = frame.primarySections.map((section) => section.sectionNumber);
    expect(primaryNumbers.some((sectionNumber) => sectionNumber?.startsWith('441.30'))).toBe(true);
    expect(primaryNumbers).toContain('1915');
    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('42-CFR-441');
    expect(frame.primarySections[0]?.sectionNumber).not.toBe('430.25');
  });
});
