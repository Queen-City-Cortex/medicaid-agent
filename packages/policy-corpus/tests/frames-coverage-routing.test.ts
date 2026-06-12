// Coverage answer frames, document-routing behaviors: EPSDT pairing,
// attachment demotion, eligibility scoping, sibling-policy preference,
// specific-exclusion promotion, hospice certification, and HCWD income rules.

import { describe, expect, it } from 'vitest';
import {
  createCorpus,
  documentGraphHandlers,
  hitFor,
  policyLookupHandler,
  queries,
  resolveTypedFrame,
  sectionHit,
  type GraphDocument,
} from './helpers/graph-fixtures.js';

describe('coverage frame document routing', () => {
  it('pairs EPSDT coverage with pediatric therapy sections from the preferred document', async () => {
    const DOC_10A: GraphDocument = {
      id: 'doc-10a',
      title: 'Clinical Coverage Policy 10A',
      documentType: 'clinical_policy',
      policyNumber: '10A',
      effectiveDate: '2025-02-01',
      url: 'https://example.com/10A',
      sections: [
        {
          id: 'sec-epsdt',
          number: '2.2.1',
          title:
            '2.2.1 EPSDT Special Provision: Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age',
          content:
            'EPSDT allows medically necessary services for beneficiaries under 21 even when those services exceed policy limitations.',
          chars: 1200,
        },
        {
          id: 'sec-st',
          number: '3.2.1.3',
          title: '3.2.1.3 Speech -Language Therapy (ST)',
          content: 'Speech-language therapy is covered for beneficiaries under 21 when EPSDT criteria are met.',
          chars: 900,
        },
        {
          id: 'sec-aud',
          number: '3.2.1.4',
          title: '3.2.1.4 Audiology Therapy (Aural Rehabilitation)',
          content: 'Audiology services are covered for beneficiaries under 21 when EPSDT criteria are met.',
          chars: 900,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec-federal-noise',
              sectionNumber: '1935',
              sectionTitle: 'Section 1935. Special provisions relating to medicare prescription drug benefit',
              documentTitle: 'Social Security Act — Title XIX (Medicaid)',
              policyNumber: 'SSA-Title-19',
              documentType: 'federal_statute',
              content: 'A noisy federal result.',
              score: 0.99,
            }),
            hitFor(DOC_10A, 'sec-st', 0.95),
          ],
        },
      },
      ...documentGraphHandlers(DOC_10A),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'How does the EPSDT special provision affect coverage for outpatient therapy services for Medicaid beneficiaries under age 21?',
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('10A');
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.sectionNumber)).toEqual(
      expect.arrayContaining(['2.2.1', '3.2.1.3', '3.2.1.4']),
    );
    expectAllHandlersUsed();
  });

  it('infers the governing policy document and promotes general/not-covered sections over attachments', async () => {
    const DOC_5B: GraphDocument = {
      id: 'doc-5b',
      title: 'Orthotics & Prosthetics',
      documentType: 'clinical_policy',
      policyNumber: '5B',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/5B',
      sections: [
        {
          id: 'sec-31',
          number: '3.1',
          title: '3.1 General Criteria Covered',
          content: 'General criteria must be met before coverage is available.',
          chars: 1200,
        },
        {
          id: 'sec-321',
          number: '3.2.1',
          title: '3.2.1 Specific criteria covered by Medicaid',
          content: 'Orthotic and prosthetic items are covered when the medical-necessity criteria are met.',
          chars: 1000,
        },
        {
          id: 'sec-41',
          number: '4.1',
          title: '4.1 General Criteria Not Covered',
          content: 'Items that do not meet the policy criteria are not covered.',
          chars: 900,
        },
        {
          id: 'sec-421',
          number: '4.2.1',
          title: '4.2.1 Specific Criteria Not Covered by Medicaid',
          content: 'Comfort or convenience devices and backup devices are not covered.',
          chars: 850,
        },
        {
          id: 'sec-attach-c',
          number: 'Attachment C',
          title: 'Attachment C: Completing a Claim for Orthotic or Prosthetic Services',
          content: 'Billing and submission instructions.',
          chars: 800,
        },
        {
          id: 'sec-attach-e',
          number: 'Attachment E',
          title: 'Attachment E: Requesting Unlisted Orthotics and Prosthetics for Adults',
          content: 'Request-process instructions for unlisted items.',
          chars: 850,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            hitFor(DOC_5B, 'sec-attach-e', 0.97, {
              content: 'Providers request unlisted orthotics and prosthetics using the adult attachment.',
            }),
            hitFor(DOC_5B, 'sec-attach-c', 0.95, {
              content: 'Providers submit claims using the attachment process.',
            }),
            hitFor(DOC_5B, 'sec-421', 0.91),
          ],
        },
      },
      ...documentGraphHandlers(DOC_5B),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'What DME items are specifically NOT covered by NC Medicaid under the Orthotics and Prosthetics policy, and what general criteria must be met for coverage?',
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('5B');
    expect(frame.primarySections.map((section) => section.sectionNumber)).toEqual(expect.arrayContaining(['4.1', '4.2.1']));
    expect(frame.primarySections.every((section) => !String(section.sectionNumber).startsWith('Attachment'))).toBe(true);
    expect(frame.supportingSections.map((section) => section.sectionNumber)).toEqual(expect.arrayContaining(['3.1', '3.2.1']));
    expectAllHandlersUsed();
  });

  it('keeps CAP/DA general eligibility questions on broad eligibility sections instead of reimbursement or provider operations', async () => {
    const DOC_3K2: GraphDocument = {
      id: 'doc-3k2',
      title: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
      documentType: 'clinical_policy',
      policyNumber: '3K-2',
      effectiveDate: '2025-09-01',
      url: 'https://example.com/3k-2',
      sections: [
        {
          id: 'sec-3k2-desc',
          number: '1.0',
          title: 'Description of the Procedure, Product, or Service',
          content:
            'The CAP/DA waiver serves adults with disabilities 18 years of age and older who are at risk of institutionalization.',
          chars: 900,
        },
        {
          id: 'sec-3k2-211',
          number: '2.1.1',
          title: '2.1.1 General',
          content:
            'An eligible beneficiary shall be enrolled in the NC Medicaid Program and may have service restrictions due to the eligibility category.',
          chars: 900,
        },
        {
          id: 'sec-3k2-31',
          number: '3.1',
          title: '3.1 General Criteria Covered',
          content: 'The procedure or service must be individualized, safely furnished, and not primarily for convenience.',
          chars: 900,
        },
        {
          id: 'sec-3k2-321',
          number: '3.2.1',
          title: '3.2.1 Specific criteria covered by Medicaid',
          content: 'CAP/DA specific criteria include nursing facility level of care and a service plan.',
          chars: 900,
        },
        {
          id: 'sec-3k2-41',
          number: '4.1',
          title: '4.1 General Criteria Not Covered',
          content: 'The beneficiary does not meet the eligibility requirements listed in Section 2.0.',
          chars: 900,
        },
        {
          id: 'sec-3k2-641',
          number: '6.4.1',
          title: '6.4.1 CAP/DA Mandated Requirements to be an Appointed Case Management Entity',
          content: 'Case management entities must maintain an advisory committee.',
          chars: 900,
        },
        {
          id: 'sec-3k2-claim',
          number: null,
          title: 'CAP/DA Claim Reimbursement',
          content: 'Prepare a paper claim for the service.',
          chars: 900,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            hitFor(DOC_3K2, 'sec-3k2-321', 0.99),
            hitFor(DOC_3K2, 'sec-3k2-desc', 0.98),
            hitFor(DOC_3K2, 'sec-3k2-claim', 0.97),
            hitFor(DOC_3K2, 'sec-3k2-41', 0.96),
            hitFor(DOC_3K2, 'sec-3k2-641', 0.95),
          ],
        },
      },
      // This fixture deliberately has no getDocument record: routing relies on
      // the lookupPolicy listing (which carries chars) plus section hydration.
      policyLookupHandler('3K-2', [DOC_3K2], { includeChars: true }),
      ...documentGraphHandlers(DOC_3K2, { policyLookup: false, documentById: false }),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'What are the general eligibility criteria for CAP/DA services under NC Medicaid?',
    );

    expect(frame.primarySections.map((section) => section.sectionNumber)).toEqual(
      expect.arrayContaining(['2.1.1', '3.1', '3.2.1']),
    );
    expect(frame.primarySections.map((section) => section.title)).not.toContain('CAP/DA Claim Reimbursement');
    expect(
      [...frame.primarySections, ...frame.supportingSections].some((section) => (section.content ?? '').includes('18 years of age')),
    ).toBe(true);
    expect(frame.avoidSections.map((section) => section.title)).toEqual(
      expect.arrayContaining([
        'CAP/DA Claim Reimbursement',
        '6.4.1 CAP/DA Mandated Requirements to be an Appointed Case Management Entity',
      ]),
    );
    expectAllHandlersUsed();
  });

  it('prefers the congregate sibling policy for assisted-living PCS questions without explicit policy numbers', async () => {
    const DOC_3L1: GraphDocument = {
      id: 'doc-3l1',
      title: 'PCS in Congregate Settings',
      documentType: 'clinical_policy',
      policyNumber: '3L-1',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/3L-1',
      sections: [
        {
          id: 'sec-3l1-33',
          number: '3.3',
          title: '3.3 Personal Care Services',
          content: 'This section governs PCS provided in assisted living and other congregate settings.',
          chars: 1000,
        },
        {
          id: 'sec-3l1-321',
          number: '3.2.1',
          title: '3.2.1 Specific criteria covered by Medicaid',
          content: 'PCS is covered in congregate settings when the policy criteria are met.',
          chars: 900,
        },
        {
          id: 'sec-3l1-4212',
          number: '4.2.1.2',
          title: 'Room and Board',
          content: 'Room and board and non-PCS supports are not covered.',
          chars: 700,
        },
        {
          id: 'sec-3l1-543',
          number: '5.4.3',
          title: '5.4.3 Requirements for PCS Eligibility Assessments',
          content: 'Assessment workflow for PCS eligibility.',
          chars: 750,
          lookupOmit: true,
        },
      ],
    };
    const DOC_3L: GraphDocument = {
      id: 'doc-3l',
      title: 'State Plan PCS',
      documentType: 'clinical_policy',
      policyNumber: '3L',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/3L',
      sections: [
        {
          id: 'sec-3l-33',
          number: '3.3',
          title: '3.3 Personal Care Services in In-Home Settings',
          content: 'This section governs PCS provided in the beneficiary home.',
          chars: 1000,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            hitFor(DOC_3L1, 'sec-3l1-33', 0.98),
            hitFor(DOC_3L, 'sec-3l-33', 0.95),
            hitFor(DOC_3L1, 'sec-3l1-321', 0.94),
            hitFor(DOC_3L1, 'sec-3l1-4212', 0.9),
            hitFor(DOC_3L1, 'sec-3l1-543', 0.97),
          ],
        },
      },
      ...documentGraphHandlers(DOC_3L1),
      ...documentGraphHandlers(DOC_3L),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Does NC Medicaid cover Personal Care Services for beneficiaries who live in an assisted living facility?',
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('3L-1');
    expect(frame.route.lane).toBe('baseline_hybrid');
    expect(frame.variantReasoning).toContain('congregate');
    expect(frame.primarySections[0]?.policyNumber).toBe('3L-1');
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.sectionNumber)).toEqual(
      expect.arrayContaining(['3.2.1', '3.3', '4.2.1.2']),
    );
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.sectionNumber)).not.toContain(
      '5.4.3',
    );
    expect(frame.avoidSections.map((section) => section.sectionNumber)).toContain('5.4.3');
    expect(frame.primarySections.every((section) => section.policyNumber === '3L-1')).toBe(true);
    expectAllHandlersUsed();
  });

  it('keeps an adult-care-home PCS question on the congregate policy despite a non-sibling distractor', async () => {
    // h-005 regression: CAP/DA (3K-2) outranked PCS-in-congregate-settings
    // (3L-1) on raw scores, and narrowInferredCoverageDocuments kept only the
    // raw-score winner because 3K-2 and 3L-1 are not policy siblings. The
    // setting preference must scope routing documents before that narrowing.
    const DOC_3L1: GraphDocument = {
      id: 'doc-3l1',
      title: 'PCS in Congregate Settings',
      documentType: 'clinical_policy',
      policyNumber: '3L-1',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/3L-1',
      sections: [
        {
          id: 'sec-3l1-321',
          number: '3.2.1',
          title: '3.2.1 Specific criteria covered by Medicaid',
          content: 'PCS is covered in congregate settings such as adult care homes when the policy criteria are met.',
          chars: 900,
        },
        {
          id: 'sec-3l1-33',
          number: '3.3',
          title: '3.3 Personal Care Services',
          content: 'This section governs PCS provided in assisted living and other congregate settings.',
          chars: 1000,
        },
      ],
    };
    const DOC_3K2: GraphDocument = {
      id: 'doc-3k2',
      title: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
      documentType: 'clinical_policy',
      policyNumber: '3K-2',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/3K-2',
      sections: [
        {
          id: 'sec-3k2-31',
          number: '3.1',
          title: '3.1 General criteria covered',
          content: 'CAP/DA covers in-home aide services, personal care assistance, and supports for disabled adults living at home.',
          chars: 1100,
        },
        {
          id: 'sec-3k2-41',
          number: '4.1',
          title: '4.1 Services not covered',
          content: 'Room and board are not covered for adults receiving waiver services while living in the home.',
          chars: 800,
        },
      ],
    };

    const { corpus } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            hitFor(DOC_3K2, 'sec-3k2-31', 0.99),
            hitFor(DOC_3K2, 'sec-3k2-41', 0.96),
            hitFor(DOC_3L1, 'sec-3l1-321', 0.94),
            hitFor(DOC_3L1, 'sec-3l1-33', 0.93),
          ],
        },
      },
      ...documentGraphHandlers(DOC_3K2),
      ...documentGraphHandlers(DOC_3L1),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'My mother lives in an adult care home (assisted living). Can she receive Personal Care Services through NC Medicaid while living there?',
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('3L-1');
    expect(frame.variantReasoning).toContain('congregate');
    expect(frame.primarySections.every((section) => section.policyNumber === '3L-1')).toBe(true);
  });

  it('keeps a nursing-facility therapeutic-leave question on the nursing facility policy', async () => {
    // h-012 regression: 'therapeutic leave' appears in both the Nursing
    // Facilities policy (2B-1, 60 days/year) and Residential Treatment
    // Services (8D-2, 45 days/year). When 8D-2 outranked on raw scores the
    // answer quoted the wrong policy's limits. The query names the facility
    // type — that must steer document selection.
    const DOC_2B1: GraphDocument = {
      id: 'doc-2b1',
      title: 'Nursing Facilities',
      documentType: 'clinical_policy',
      policyNumber: '2B-1',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/2B-1',
      sections: [
        {
          id: 'sec-2b1-leave',
          number: '5.8',
          title: '5.8 Therapeutic Leave',
          content: 'A nursing facility resident may take up to 60 days of therapeutic leave per calendar year when ordered by the attending physician.',
          chars: 900,
        },
      ],
    };
    const DOC_8D2: GraphDocument = {
      id: 'doc-8d2',
      title: '8D-2, Residential Treatment Services',
      documentType: 'clinical_policy',
      policyNumber: '8D-2',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/8D-2',
      sections: [
        {
          id: 'sec-8d2-leave',
          number: '6.1',
          title: '6.1 Therapeutic Leave',
          content: 'A resident of a Level II, III, or IV residential facility may take up to 45 days of therapeutic leave per calendar year, limited to 15 days per quarter.',
          chars: 900,
        },
      ],
    };

    const { corpus } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            hitFor(DOC_8D2, 'sec-8d2-leave', 0.99),
            hitFor(DOC_2B1, 'sec-2b1-leave', 0.93),
          ],
        },
      },
      ...documentGraphHandlers(DOC_8D2),
      ...documentGraphHandlers(DOC_2B1),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'How many days of therapeutic leave per year can a nursing facility resident take under NC Medicaid, and what conditions apply to that leave?',
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('2B-1');
    expect(frame.primarySections.every((section) => section.policyNumber === '2B-1')).toBe(true);
  });

  it('promotes specific ambulance non-covered subsections over general exclusions', async () => {
    const DOC_15: GraphDocument = {
      id: 'doc-15',
      title: 'Ambulance Services',
      documentType: 'clinical_policy',
      policyNumber: '15',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/15',
      sections: [
        {
          id: 'sec-15-3211',
          number: '3.2.1.1',
          title: 'Air Medical Ambulance',
          content: 'Air ambulance is covered only when ground transport is contraindicated or impractical.',
          chars: 800,
        },
        {
          id: 'sec-15-41',
          number: '4.1',
          title: '4.1 General Criteria Not Covered',
          content: 'General ambulance exclusions.',
          chars: 700,
        },
        {
          id: 'sec-15-4214',
          number: '4.2.1.4',
          title: 'Other Non-Covered Ambulance Services',
          content: 'False alarm calls, patient refusal, waiting fees, and similar services are not covered.',
          chars: 900,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            hitFor(DOC_15, 'sec-15-41', 0.95),
            hitFor(DOC_15, 'sec-15-4214', 0.93),
            hitFor(DOC_15, 'sec-15-3211', 0.88),
            sectionHit({
              sectionId: 'sec-ma3550-j',
              sectionTitle: 'J. Ambulance Transportation arranged by the local agency',
              documentTitle: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
              policyNumber: 'MA-3550',
              documentType: 'dhhs_policy',
              content: 'Local agency-arranged ambulance transportation in rare non-medically-necessary cases.',
              score: 0.97,
            }),
          ],
        },
      },
      ...documentGraphHandlers(DOC_15),
    ]);

    const frame = await resolveTypedFrame(corpus, 'coverage', 'What ambulance services are NOT covered by NC Medicaid?');

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('15');
    expect(frame.primarySections.map((section) => section.sectionNumber)).toContain('4.2.1.4');
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.sectionNumber)).toContain(
      '3.2.1.1',
    );
    expect(frame.primarySections.map((section) => section.sectionNumber)).not.toContain('4.1');
    expect(frame.avoidSections.map((section) => section.sectionNumber)).toContain('4.1');
    expectAllHandlersUsed();
  });

  it('surfaces hospice certification-source sections for terminal-illness questions', async () => {
    const DOC_3D: GraphDocument = {
      id: 'doc-3d',
      title: 'Hospice Services',
      documentType: 'clinical_policy',
      policyNumber: '3D',
      effectiveDate: '2024-03-15',
      url: 'https://example.com/3d',
      sections: [
        {
          id: 'sec-3d-timing',
          number: '5.4.1',
          title: '5.4.1 Timing of certification',
          content: 'The hospice provider shall obtain written certification of terminal illness for each benefit period.',
          chars: 1000,
        },
        {
          id: 'sec-3d-sources',
          number: '5.4.3',
          title: '5.4.3 Sources of certification',
          content:
            'For the initial 90-day period, the hospice medical director or physician member of the IDG and the attending physician, if the beneficiary has one, must certify terminal illness.',
          chars: 1000,
        },
        {
          id: 'sec-3d-rec',
          number: null,
          title: 'D. Certification and Recertification of Terminal Illness',
          content: 'The certification must include a narrative and supporting clinical findings.',
          chars: 900,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            hitFor(DOC_3D, 'sec-3d-timing', 0.98),
            hitFor(DOC_3D, 'sec-3d-sources', 0.97),
            hitFor(DOC_3D, 'sec-3d-rec', 0.95),
          ],
        },
      },
      ...documentGraphHandlers(DOC_3D),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      "How does NC Medicaid define 'terminally ill' for purposes of hospice eligibility, and what certification is required?",
    );

    expect(frame.questionType).toBe('coverage');
    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('3D');
    expect(frame.primarySections.map((section) => section.sectionNumber)).toContain('5.4.3');
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.title)).toContain(
      'D. Certification and Recertification of Terminal Illness',
    );
    expectAllHandlersUsed();
  });

  it('keeps HCWD income/premium questions on current MA-2180 while surfacing the earned-income-cap removal notice', async () => {
    const MA_2180: GraphDocument = {
      id: 'doc-ma2180',
      title: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES',
      documentType: 'dhhs_policy',
      policyNumber: 'MA-2180',
      effectiveDate: '2025-03-01',
      url: 'https://example.com/ma-2180',
      sections: [
        {
          id: 'sec-ma-income',
          number: null,
          title: 'F. Income',
          content:
            'Those who have unearned incomes greater than 150% of FPL are not eligible for HCWD. Those whose total countable income is greater than 150% of FPL must pay a $50 annual enrollment fee. Those whose total countable monthly income exceeds 200% of FPL must pay a monthly premium.',
          chars: 1100,
        },
        {
          id: 'sec-ma-premiums',
          number: null,
          title: 'I. Premiums',
          content: 'The income ranges and associated premiums are found in the following chart.',
          chars: 1000,
        },
        {
          id: 'sec-ma-process',
          number: null,
          title: '2. Determine if a Premium is due',
          content:
            'Calculate the amount of total countable net earned and unearned income. If total countable monthly income exceeds 200% of FPL, a premium is required.',
          chars: 900,
        },
      ],
    };
    const MA_2180_2019: GraphDocument = {
      id: 'doc-ma2180-2019',
      title: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES – 2019 HCWD Premiums',
      documentType: 'dhhs_policy',
      policyNumber: 'MA-2180',
      effectiveDate: '2019-04-01',
      url: 'https://example.com/ma-2180-2019',
      sections: [
        {
          id: 'sec-2019-chart',
          number: null,
          title: '2019 HCWD Premiums (Effective April 1, 2019)',
          content: '2019 premium chart for HCWD beneficiaries.',
          chars: 700,
        },
      ],
    };
    const CN_0114: GraphDocument = {
      id: 'doc-cn-0114',
      title: 'CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III',
      documentType: 'dhhs_policy',
      policyNumber: null,
      effectiveDate: '2014-04-01',
      url: 'https://example.com/cn-01-14',
      status: 'amendment',
      sections: [
        {
          id: 'sec-cn-limit',
          number: null,
          title: 'A. MA-500, Classification, is revised in:',
          content:
            'I.B.1.c., to remove the 150% FPL income limit from policy; III.B.2., to state that the only income limit for the HCWD program is the 150% FPL limit on unearned income.',
          chars: 900,
        },
        {
          id: 'sec-cn-hcwd',
          number: null,
          title: 'D. MA-2180, Health Coverage for Workers with Disabilities, is revised in:',
          content:
            'II., to state that HCWD covers individuals regardless of total countable income; IV.E., to remove limits on countable income except for the 150% of Federal Poverty Level cap on unearned income and provide information about sliding scale premiums.',
          chars: 1200,
        },
      ],
    };
    const PREMIUM_NOTICE: GraphDocument = {
      id: 'doc-premium-notice',
      title: 'dma-5146 Health Coverage for Workers with Disabilities Premium Notice',
      documentType: 'dhhs_policy',
      policyNumber: null,
      effectiveDate: '2025-03-01',
      url: 'https://example.com/premium-notice',
      sections: [
        {
          id: 'sec-premium-notice',
          number: null,
          title: 'HEALTH COVERAGE FOR WORKERS WITH DISABILITIES PREMIUM NOTICE',
          content: 'Premium payment notice form.',
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector dhhs',
        match: queries.sectionVector('dhhs_policy'),
        result: {
          records: [
            hitFor(MA_2180, 'sec-ma-income', 0.93),
            hitFor(MA_2180, 'sec-ma-premiums', 0.9),
            hitFor(MA_2180, 'sec-ma-process', 0.94),
            hitFor(MA_2180_2019, 'sec-2019-chart', 0.98),
            hitFor(PREMIUM_NOTICE, 'sec-premium-notice', 0.97),
          ],
        },
      },
      {
        label: 'hcwd amendment history',
        match: queries.hcwdAmendmentHistory(),
        result: { records: [hitFor(CN_0114, 'sec-cn-limit', 0.72), hitFor(CN_0114, 'sec-cn-hcwd', 0.71)] },
      },
      policyLookupHandler('MA-2180', [MA_2180, MA_2180_2019]),
      ...documentGraphHandlers(MA_2180, { policyLookup: false }),
      ...documentGraphHandlers(MA_2180_2019, { policyLookup: false }),
      ...documentGraphHandlers(CN_0114),
      ...documentGraphHandlers(PREMIUM_NOTICE, { documentById: false }),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Is there a maximum earned income limit for people on HCWD (Health Coverage for Workers with Disabilities), and what premiums apply?',
    );

    const primaryTitles = frame.primarySections.map((section) => section.title);
    const supportingTitles = frame.supportingSections.map((section) => section.title);
    const surfacedTitles = [...primaryTitles, ...supportingTitles];

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('MA-2180');
    expect(frame.route.lane).toBe('deterministic_evidence');
    expect(frame.route.determinism_hints.numeric_evidence_only).toBe(true);
    expect(primaryTitles).toEqual(expect.arrayContaining(['F. Income', 'I. Premiums']));
    expect(supportingTitles).toEqual(
      expect.arrayContaining([
        'A. MA-500, Classification, is revised in:',
        'D. MA-2180, Health Coverage for Workers with Disabilities, is revised in:',
      ]),
    );
    expect(surfacedTitles).not.toContain('2019 HCWD Premiums (Effective April 1, 2019)');
    expect(surfacedTitles).not.toContain('HEALTH COVERAGE FOR WORKERS WITH DISABILITIES PREMIUM NOTICE');
    expect(surfacedTitles).not.toContain('2. Determine if a Premium is due');
    expectAllHandlersUsed();
  });
});
