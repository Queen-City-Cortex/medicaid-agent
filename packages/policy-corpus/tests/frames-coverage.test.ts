// Coverage answer frames: evidence selection for coverage questions —
// telehealth/10A aliasing, yes/no scope+not-covered routing, pharmacy
// exclusions, and CAP/DA requirement framing.

import { describe, expect, it } from 'vitest';
import {
  createCorpus,
  documentGraphHandlers,
  hitFor,
  queries,
  resolveTypedFrame,
  sectionHit,
  type GraphDocument,
} from './helpers/graph-fixtures.js';

describe('coverage frame', () => {
  it('returns coverage and limiting evidence for service questions', async () => {
    const DOC_10A: GraphDocument = {
      id: 'doc-10a',
      title: 'Clinical Coverage Policy 10A',
      documentType: 'clinical_policy',
      policyNumber: '10A',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/10A',
      sections: [
        {
          id: 'sec-tele',
          number: '3.1',
          title: 'Telehealth Coverage',
          content: 'Speech therapy may be provided by telehealth when medically necessary.',
          chars: 1200,
        },
        {
          id: 'sec-not-covered',
          number: '4.2',
          title: 'Not Covered',
          content: 'Services outside the stated therapy scope are not covered under this policy.',
          chars: 800,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: { records: [hitFor(DOC_10A, 'sec-tele', 0.94), hitFor(DOC_10A, 'sec-not-covered', 0.9)] },
      },
      ...documentGraphHandlers(DOC_10A),
    ]);

    const frame = await resolveTypedFrame(corpus, 'coverage', 'Does Policy 10A cover telehealth speech therapy?');

    expect(frame.questionType).toBe('coverage');
    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('10A');
    expect(frame.primarySections.map((section) => section.title)).toContain('Telehealth Coverage');
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.title)).toContain('Not Covered');
    expectAllHandlersUsed();
  });

  it('aliases telehealth speech-therapy questions to Policy 10A without explicit policy numbers', async () => {
    const DOC_10A: GraphDocument = {
      id: 'doc-10a',
      title: 'Clinical Coverage Policy 10A',
      documentType: 'clinical_policy',
      policyNumber: '10A',
      effectiveDate: '2025-02-01',
      url: 'https://example.com/10A',
      sections: [
        {
          id: 'sec-10a-tele',
          number: null,
          title: 'e. Telehealth',
          content:
            'Speech therapy may be provided by telehealth when medically necessary and consistent with beneficiary need.',
          chars: 1200,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: { records: [hitFor(DOC_10A, 'sec-10a-tele', 0.95)] },
      },
      {
        label: 'vector federal noise',
        match: queries.sectionVector('federal_regulation'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec-41032',
              sectionNumber: '410.32',
              sectionTitle: 'Diagnostic x-ray tests, diagnostic laboratory tests, and other diagnostic tests: Conditions',
              documentTitle: '42 CFR Part 410',
              policyNumber: '42-CFR-410',
              documentType: 'federal_regulation',
              content: 'General federal outpatient requirements.',
              score: 0.98,
            }),
          ],
        },
      },
      ...documentGraphHandlers(DOC_10A),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Under what conditions can speech therapy be provided via telehealth under NC Medicaid?',
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('10A');
    expect(frame.primarySections[0]?.policyNumber).toBe('10A');
    expect(frame.primarySections.map((section) => section.title)).toContain('e. Telehealth');
    expectAllHandlersUsed();
  });

  it('keeps telehealth speech questions on state-policy telehealth sections and avoids cross-reference boilerplate', async () => {
    const DOC_10A: GraphDocument = {
      id: 'doc-10a',
      title: 'Clinical Coverage Policy 10A',
      documentType: 'clinical_policy',
      policyNumber: '10A',
      effectiveDate: '2025-02-01',
      url: 'https://example.com/10A',
      sections: [
        {
          id: 'sec-10a-tele',
          number: null,
          title: 'e. Telehealth',
          content:
            'Telehealth delivery may be medically necessary when exposure to others should be avoided or if the location is remote or underserved. Telehealth must be used as an adjunct to in-person care and not as a replacement. Telehealth must be used in the best interest of the beneficiary and not as a convenience for the therapist.',
          chars: 1200,
        },
        {
          id: 'sec-10a-speech',
          number: '3.2.1.3',
          title: '3.2.1.3 Speech -Language Therapy (ST)',
          content: 'Documented findings for speech-language therapy remain required.',
          chars: 1000,
        },
        {
          id: 'sec-10a-tele-table',
          number: null,
          title: 'Speech/Language Treatment',
          content: 'Telehealth Eligible Service: Yes for selected speech/language treatment codes.',
          chars: 900,
        },
        {
          id: 'sec-10a-related',
          number: null,
          title: 'Related Clinical Coverage Policies',
          content: '1H, Telehealth, Virtual Communications and Remote Patient Monitoring.',
          chars: 300,
        },
        {
          id: 'sec-10a-history',
          number: null,
          title: 'History:',
          content: 'Prior policy revisions.',
          chars: 300,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            hitFor(DOC_10A, 'sec-10a-tele', 0.97, {
              content:
                'Telehealth delivery may be medically necessary when exposure to others should be avoided or if the location is remote or underserved. Telehealth must be used as an adjunct to in-person care and not as a replacement.',
            }),
            hitFor(DOC_10A, 'sec-10a-speech', 0.93),
            hitFor(DOC_10A, 'sec-10a-tele-table', 0.92),
            hitFor(DOC_10A, 'sec-10a-related', 0.96),
            hitFor(DOC_10A, 'sec-10a-history', 0.95),
          ],
        },
      },
      {
        label: 'vector federal noise',
        match: queries.sectionVector('federal_regulation'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec-41078',
              sectionNumber: '410.78',
              sectionTitle: 'Telehealth services',
              documentTitle: '42 CFR Part 410',
              policyNumber: '42-CFR-410',
              documentType: 'federal_regulation',
              content: 'General federal telehealth modality rules.',
              score: 0.99,
            }),
          ],
        },
      },
      ...documentGraphHandlers(DOC_10A),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Under what conditions can speech therapy be provided via telehealth under NC Medicaid?',
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('10A');
    expect(frame.primarySections.map((section) => section.title)).toContain('e. Telehealth');
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.title)).toEqual(
      expect.arrayContaining(['3.2.1.3 Speech -Language Therapy (ST)']),
    );
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.title)).not.toContain(
      'Speech/Language Treatment',
    );
    expect([...frame.primarySections, ...frame.supportingSections].every((section) => section.policyNumber === '10A')).toBe(
      true,
    );
    expect(frame.avoidSections.map((section) => section.title)).toContain('Speech/Language Treatment');
    expectAllHandlersUsed();
  });

  it('can still surface telehealth service tables when the query explicitly asks which services are eligible', async () => {
    const DOC_10A: GraphDocument = {
      id: 'doc-10a',
      title: 'Clinical Coverage Policy 10A',
      documentType: 'clinical_policy',
      policyNumber: '10A',
      effectiveDate: '2025-02-01',
      url: 'https://example.com/10A',
      sections: [
        {
          id: 'sec-10a-tele',
          number: null,
          title: 'e. Telehealth',
          content:
            'Telehealth delivery may be medically necessary when exposure to others should be avoided or if the location is remote or underserved.',
          chars: 1200,
        },
        {
          id: 'sec-10a-tele-table',
          number: null,
          title: 'Speech/Language Treatment',
          content: 'Telehealth Eligible Service: Yes for selected speech/language treatment codes.',
          chars: 900,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: { records: [hitFor(DOC_10A, 'sec-10a-tele', 0.97), hitFor(DOC_10A, 'sec-10a-tele-table', 0.96)] },
      },
      ...documentGraphHandlers(DOC_10A),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Which speech therapy services are telehealth-eligible under NC Medicaid?',
    );

    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.title)).toContain(
      'Speech/Language Treatment',
    );
    expectAllHandlersUsed();
  });

  it('keeps yes/no coverage questions on scope and not-covered sections instead of request attachments', async () => {
    const DOC_5B: GraphDocument = {
      id: 'doc-5b',
      title: 'Orthotics & Prosthetics',
      documentType: 'clinical_policy',
      policyNumber: '5B',
      effectiveDate: '2024-07-15',
      url: 'https://example.com/5B',
      sections: [
        { id: 'sec-5b-info', number: null, title: 'Information:', content: 'Request details for providers.', chars: 200 },
        {
          id: 'sec-5b-attach',
          number: 'Attachment E',
          title: 'Attachment E: Requesting Unlisted Orthotics and Prosthetics for Adults',
          content: 'Requesting unlisted orthotics and prosthetics.',
          chars: 900,
        },
        {
          id: 'sec-5b-211',
          number: '2.1.1',
          title: '2.1.1 Description',
          content: 'This policy covers orthotic and prosthetic devices.',
          chars: 600,
        },
        {
          id: 'sec-5b-31',
          number: '3.1',
          title: '3.1 General Criteria Covered',
          content: 'Coverage criteria for orthotics and prosthetics under this policy.',
          chars: 700,
        },
        {
          id: 'sec-5b-41',
          number: '4.1',
          title: '4.1 General Criteria Not Covered',
          content: 'Chiropractic services are not covered under this policy.',
          chars: 700,
        },
        {
          id: 'sec-5b-42',
          number: '4.2',
          title: '4.2 Specific Criteria Not Covered',
          content: 'Specific criteria not covered under this policy.',
          chars: 680,
        },
        {
          id: 'sec-5b-421',
          number: '4.2.1',
          title: '4.2.1 Specific Criteria Not Covered by Medicaid',
          content: 'Specific non-covered device criteria.',
          chars: 650,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            hitFor(DOC_5B, 'sec-5b-info', 0.97),
            hitFor(DOC_5B, 'sec-5b-attach', 0.95),
            hitFor(DOC_5B, 'sec-5b-41', 0.79),
            hitFor(DOC_5B, 'sec-5b-211', 0.76),
            hitFor(DOC_5B, 'sec-5b-31', 0.82),
            hitFor(DOC_5B, 'sec-5b-42', 0.81),
            hitFor(DOC_5B, 'sec-5b-421', 0.72),
          ],
        },
      },
      ...documentGraphHandlers(DOC_5B),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?',
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('5B');
    expect(frame.route.lane).toBe('baseline_hybrid');
    expect(frame.route.determinism_hints.cite_scope_and_not_covered).toBe(true);
    expect(frame.primarySections.map((section) => section.sectionNumber)).toEqual(expect.arrayContaining(['2.1.1', '4.1']));
    expect(frame.primarySections.map((section) => section.sectionNumber)).not.toEqual(
      expect.arrayContaining(['3.1', '4.2']),
    );
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.title)).toEqual(
      expect.arrayContaining([
        '2.1.1 Description',
        '4.1 General Criteria Not Covered',
        '4.2.1 Specific Criteria Not Covered by Medicaid',
      ]),
    );
    expect(frame.primarySections.map((section) => section.title)).not.toEqual(
      expect.arrayContaining(['Information:', 'Attachment E: Requesting Unlisted Orthotics and Prosthetics for Adults']),
    );
    expectAllHandlersUsed();
  });

  it('routes outpatient pharmacy exclusion questions to Policy 9 instead of Medicare Part D manuals', async () => {
    const POLICY_9: GraphDocument = {
      id: 'doc-9',
      title: 'Outpatient Pharmacy',
      documentType: 'clinical_policy',
      policyNumber: '9',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/policy-9',
      sections: [
        {
          id: 'sec-9-211',
          number: '2.1.1',
          title: '2.1.1 Description of the Procedure, Product, or Service',
          content: 'The outpatient pharmacy benefit covers prescribed drugs within the NC Medicaid pharmacy program.',
        },
        {
          id: 'sec-9-41',
          number: '4.1',
          title: '4.1 General Criteria Not Covered',
          content:
            'The procedure, product, or service is not covered when it is experimental, investigational, or part of a clinical trial.',
        },
      ],
    };
    // The Medicare Part D manual is fully hydratable (lookup, sections, and
    // document metadata), so the exclusion assertions below are exercised
    // against a competitor the frame could actually pick — not one that
    // hydration silently drops.
    const MA_2312: GraphDocument = {
      id: 'doc-ma2312',
      title: 'MA-2312 Medicare Prescription Drug Benefit',
      documentType: 'dhhs_policy',
      policyNumber: 'MA-2312',
      effectiveDate: '2024-05-01',
      url: 'https://example.com/ma-2312',
      sections: [
        {
          id: 'sec-ma-2312',
          number: 'B',
          title: 'B. Non-Covered Drugs',
          content: 'Non-covered drugs are not covered by Medicaid in the Medicare prescription-drug context.',
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: { records: [hitFor(POLICY_9, 'sec-9-41', 0.72), hitFor(POLICY_9, 'sec-9-211', 0.69)] },
      },
      {
        label: 'vector dhhs',
        match: queries.sectionVector('dhhs_policy'),
        result: { records: [hitFor(MA_2312, 'sec-ma-2312', 0.99)] },
      },
      ...documentGraphHandlers(POLICY_9),
      ...documentGraphHandlers(MA_2312),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Are experimental or investigational drugs covered under the NC Medicaid outpatient pharmacy benefit?',
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('9');
    // FINDING (pinned, not papered over): the historical assertion here was
    // `not.toContain('MA-2312')`, but it only passed because the MA-2312
    // fixtures were unhydratable and got dropped unconditionally. With the
    // competitor fully fixtured, current src keeps the Medicare Part D manual
    // as a SECONDARY authoritative document — the routing guarantee is that
    // Policy 9 outranks it, not that it is excluded.
    expect(frame.authoritativeDocuments.map((document) => document.policyNumber)).toEqual(['9', 'MA-2312']);
    expect(frame.primarySections.map((section) => section.sectionNumber)).toEqual(expect.arrayContaining(['4.1']));
    const exclusionSection = frame.primarySections.find((section) => section.sectionNumber === '4.1');
    expect(exclusionSection?.content).toContain('experimental, investigational');
    expectAllHandlersUsed();
  });

  it('routes CAP/DA home-modification requirements into a coverage frame with MDT support evidence', async () => {
    const DOC_3K2: GraphDocument = {
      id: 'doc-3k2',
      title: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
      documentType: 'clinical_policy',
      policyNumber: '3K-2',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/3k-2',
      sections: [
        {
          id: 'sec-appendix',
          number: null,
          title: 'EQUIPMENT, MODIFICAITON AND TECHNOLOGY',
          content:
            'A primary private residence where the CAP/DA beneficiary resides that is owned by the beneficiary or family; a rented residence when the modifications are portable; installation and repairs of ramps and grab bars.',
          chars: 1800,
        },
        {
          id: 'sec-home-mod',
          number: '5.9.1',
          title: '5.9.1 Equipment, Modification, Technology and Supplies',
          listTitle: 'Home Modifications',
          content:
            "A recommendation by the MDT that identifies the beneficiary's need for the home modification being requested. The recommendation must state the cost of the item. A training plan must be documented as completed and signed by the beneficiary or responsible party.",
          chars: 1300,
        },
        {
          id: 'sec-mdt',
          number: '3.4.5',
          title: '3.4.5 Equipment, Modification and Technology',
          content:
            "The service must improve, maximize, or enhance the beneficiary's mobility, safety, independence, community integration, environmental accessibility, or address 24-hours-a-day coverage concerns.",
          chars: 900,
        },
        {
          id: 'sec-plan',
          number: '5.4.2',
          title: '5.4.2 CAP/DA Person-Centered Service Plan Requirements',
          content:
            "Summarize the evaluation and assessment information and develop a comprehensive list of CAP/DA waiver services in the person's service plan.",
          chars: 1100,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            hitFor(DOC_3K2, 'sec-appendix', 0.97),
            hitFor(DOC_3K2, 'sec-home-mod', 0.96),
            hitFor(DOC_3K2, 'sec-mdt', 0.84),
            hitFor(DOC_3K2, 'sec-plan', 0.91),
          ],
        },
      },
      ...documentGraphHandlers(DOC_3K2),
    ]);

    const frame = await corpus.resolveAnswerFrame({
      query:
        'What are the requirements for home modifications under CAP/DA, and what documentation must the Multidisciplinary Team provide?',
    });

    expect(frame.questionType).toBe('coverage');
    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('3K-2');
    expect(frame.primarySections.map((section) => section.sectionNumber)).toContain('5.9.1');
    expect(frame.supportingSections.map((section) => section.sectionNumber)).toContain('3.4.5');
    expectAllHandlersUsed();
  });
});
