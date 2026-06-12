// Prior-authorization and policy-variant answer frames: criteria-over-process
// section selection, deterministic numeric-evidence routing for quantity
// limits, and sibling-policy variant resolution.

import { describe, expect, it } from 'vitest';
import {
  createCorpus,
  documentGraphHandlers,
  hitFor,
  queries,
  resolveTypedFrame,
  type GraphDocument,
} from './helpers/graph-fixtures.js';

describe('prior-auth frame', () => {
  it('prefers criteria sections over request-process attachments', async () => {
    const DOC_9A: GraphDocument = {
      id: 'doc-9a',
      title: 'Clinical Coverage Policy 9A',
      documentType: 'clinical_policy',
      policyNumber: '9A',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/9A',
      sections: [
        {
          id: 'sec-criteria',
          number: 'Attachment A',
          title: 'Prior Approval Drugs and Criteria',
          content: 'The following drugs require prior approval and must meet these criteria...',
          chars: 1400,
        },
        {
          id: 'sec-request',
          number: 'Attachment B',
          title: 'Prior Approval Request Process',
          content: 'Providers submit requests by fax using the attached form.',
          chars: 700,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: { records: [hitFor(DOC_9A, 'sec-criteria', 0.96), hitFor(DOC_9A, 'sec-request', 0.9)] },
      },
      ...documentGraphHandlers(DOC_9A),
    ]);

    const frame = await resolveTypedFrame(corpus, 'prior_authorization', 'What prior approval criteria apply under Policy 9A?');

    expect(frame.questionType).toBe('prior_authorization');
    expect(frame.primarySections[0]?.title).toBe('Prior Approval Drugs and Criteria');
    expect(frame.avoidSections.map((section) => section.title)).toContain('Prior Approval Request Process');
    expectAllHandlersUsed();
  });

  it('surfaces pharmacy quantity limits together with the prior-approval criteria section', async () => {
    const DOC_9: GraphDocument = {
      id: 'doc-9',
      title: 'Lock-in Program',
      documentType: 'clinical_policy',
      policyNumber: '9',
      effectiveDate: '2024-07-15',
      url: 'https://example.com/9',
      sections: [
        {
          id: 'sec-quantity',
          number: '5.4.3',
          title: '5.4.3 Quantity and Episodic Drugs',
          content: 'Evaluating the applicability of quantity limitations of episodic drugs and prior authorization criteria.',
          chars: 350,
        },
        {
          id: 'sec-pa-criteria',
          number: null,
          title: 'Pharmacy Prior Approval Drugs and Criteria',
          content: 'GLP-1 Receptor Agonists and Combinations; Hepatitis C medications; Opioid Analgesics.',
          chars: 1000,
        },
        {
          id: 'sec-exception',
          number: '3.2.3',
          title: '3.2.3 Exceptions to FDA and NC Medicaid Drug criteria approval.',
          content: 'Providers may submit medical-necessity literature for off-label exceptions.',
          chars: 800,
        },
        {
          id: 'sec-request',
          number: 'Attachment C',
          title: 'Attachment C: Requesting Prior Authorization for Prescription Drugs',
          content: 'Prescribers submit requests by web portal, phone, or fax.',
          chars: 900,
        },
      ],
    };
    const DOC_STATE_PLAN: GraphDocument = {
      id: 'doc-stateplan',
      title: 'State Plan under Title XIX of the Social Security Act Medical Assistance Program',
      documentType: 'state_plan_amendment',
      policyNumber: null,
      effectiveDate: '2025-01-01',
      url: 'https://example.com/stateplan',
      sections: [
        {
          id: 'sec-state-quantity',
          number: null,
          title: '12.a. Prescribed Drugs (continued)',
          content: 'The Department may establish authorizations, limitations, and reviews for specific drugs or quantities.',
          chars: 600,
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            hitFor(DOC_9, 'sec-quantity', 0.97),
            hitFor(DOC_9, 'sec-request', 0.94),
            hitFor(DOC_9, 'sec-exception', 0.92),
          ],
        },
      },
      {
        label: 'vector spa',
        match: queries.sectionVector('state_plan_amendment'),
        result: { records: [hitFor(DOC_STATE_PLAN, 'sec-state-quantity', 0.91)] },
      },
      ...documentGraphHandlers(DOC_9),
      ...documentGraphHandlers(DOC_STATE_PLAN),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'prior_authorization',
      'Are there quantity limits on prescription drugs under NC Medicaid, and when is prior authorization required for pharmacy claims?',
    );

    expect(frame.questionType).toBe('prior_authorization');
    expect(frame.route.lane).toBe('deterministic_evidence');
    expect(frame.route.determinism_hints.numeric_evidence_only).toBe(true);
    expect(frame.primarySections[0]?.title).toBe('5.4.3 Quantity and Episodic Drugs');
    expect(frame.primarySections.map((section) => section.title)).toContain('Pharmacy Prior Approval Drugs and Criteria');
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.title)).not.toContain(
      '3.2.3 Exceptions to FDA and NC Medicaid Drug criteria approval.',
    );
    expect(frame.avoidSections.map((section) => section.title)).toContain(
      'Attachment C: Requesting Prior Authorization for Prescription Drugs',
    );
    expect(frame.avoidSections.map((section) => section.title)).toContain(
      '3.2.3 Exceptions to FDA and NC Medicaid Drug criteria approval.',
    );
    expectAllHandlersUsed();
  });
});

describe('policy-variant frame', () => {
  it('picks the matching sibling policy and explains why', async () => {
    const DOC_3L: GraphDocument = {
      id: 'doc-3l',
      title: 'State Plan PCS',
      documentType: 'clinical_policy',
      policyNumber: '3L',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/3L',
      sections: [
        {
          id: 'sec-3l-scope',
          number: '1.0',
          title: 'Scope',
          content: 'This policy governs state plan PCS delivered in the home.',
        },
      ],
    };
    const DOC_3L1: GraphDocument = {
      id: 'doc-3l1',
      title: 'PCS in Congregate Settings',
      documentType: 'clinical_policy',
      policyNumber: '3L-1',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/3L-1',
      sections: [
        {
          id: 'sec-3l1-scope',
          number: '1.0',
          title: 'Scope',
          content: 'This policy governs PCS in congregate settings, including adult care homes.',
        },
      ],
    };

    const { corpus, expectAllHandlersUsed } = createCorpus([
      ...documentGraphHandlers(DOC_3L),
      ...documentGraphHandlers(DOC_3L1),
    ]);

    const frame = await resolveTypedFrame(corpus, 'policy_variant', 'For PCS in congregate settings, should I use 3L or 3L-1?');

    expect(frame.questionType).toBe('policy_variant');
    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('3L-1');
    expect(frame.variantReasoning).toContain('congregate');
    expect(frame.primarySections[0]?.policyNumber).toBe('3L-1');
    expect(frame.supportingSections[0]?.policyNumber).toBe('3L');
    expectAllHandlersUsed();
  });
});
