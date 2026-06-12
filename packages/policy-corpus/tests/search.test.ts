// searchSections / searchSectionsDetailed: hybrid scoring, grouped retrieval,
// document-type routing, and source-family preferences.

import { describe, expect, it } from 'vitest';
import { SEARCH_SNIPPET_CHARS } from '../src/index.js';
import { createCorpus, queries, sectionHit } from './helpers/graph-fixtures.js';

describe('searchSections', () => {
  it('preserves hybrid search scoring and snippets', async () => {
    const { corpus, embedQuery, expectAllHandlersUsed } = createCorpus([
      {
        label: 'fulltext',
        match: queries.fulltext(),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec-dhhs',
              sectionNumber: '4.1',
              sectionTitle: 'DHHS Match',
              documentTitle: 'DHHS Policy',
              policyNumber: '8C',
              documentType: 'dhhs_policy',
              content: 'Fulltext match',
              score: 3.0,
            }),
          ],
        },
      },
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec-clinical',
              sectionNumber: '1',
              sectionTitle: 'Clinical Match',
              documentTitle: 'Clinical Policy',
              policyNumber: '1A',
              documentType: 'clinical_policy',
              content: 'Clinical content',
              score: 0.91,
            }),
          ],
        },
      },
      {
        label: 'vector dhhs',
        match: queries.sectionVector('dhhs_policy'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec-dhhs',
              sectionNumber: '4.1',
              sectionTitle: 'DHHS Match',
              documentTitle: 'DHHS Policy',
              policyNumber: '8C',
              documentType: 'dhhs_policy',
              content: 'A'.repeat(500),
              score: 0.95,
            }),
          ],
        },
      },
    ]);

    const sections = await corpus.searchSections({ query: 'coverage' });

    expect(embedQuery).toHaveBeenCalledWith('coverage');
    expect(sections).toHaveLength(2);
    expect(sections[0]?.sectionId).toBe('sec-dhhs');
    expect(sections[0]?.score).toBeCloseTo(1.0, 5);
    expect(sections[0]?.contentSnippet).toBe('A'.repeat(SEARCH_SNIPPET_CHARS));
    expect(sections[1]?.sectionId).toBe('sec-clinical');
    expectAllHandlersUsed();
  });
});

describe('searchSectionsDetailed', () => {
  it('matches grouped retrieval ordering and dedup', async () => {
    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:clinical',
              sectionNumber: '1',
              sectionTitle: 'Clinical',
              documentTitle: 'Clinical Policy',
              policyNumber: '1A',
              documentType: 'clinical_policy',
              content: 'clinical content',
              score: 0.91,
            }),
          ],
        },
      },
      {
        label: 'vector dhhs',
        match: queries.sectionVector('dhhs_policy'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:dhhs',
              sectionNumber: '2',
              sectionTitle: 'Eligibility',
              documentTitle: 'DHHS Policy',
              policyNumber: '8C',
              documentType: 'dhhs_policy',
              content: 'dhhs content',
              score: 0.92,
            }),
          ],
        },
      },
      {
        label: 'chunk clinical',
        match: queries.chunkVector('clinical_policy'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:clinical',
              sectionNumber: '1',
              sectionTitle: 'Clinical',
              documentTitle: 'Clinical Policy',
              policyNumber: '1A',
              documentType: 'clinical_policy',
              content: 'chunk content',
              score: 0.96,
            }),
          ],
        },
      },
      {
        label: 'chunk dhhs',
        match: queries.chunkVector('dhhs_policy'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:chunk',
              sectionNumber: '4',
              sectionTitle: 'Chunk Winner',
              documentTitle: 'DHHS Policy',
              policyNumber: '8C',
              documentType: 'dhhs_policy',
              content: 'chunk-only content',
              score: 0.93,
            }),
          ],
        },
      },
      {
        label: 'concept hits',
        match: queries.conceptHits(),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:concept',
              sectionNumber: '3',
              sectionTitle: 'Concept',
              documentTitle: 'DHHS Policy',
              policyNumber: '8C',
              documentType: 'dhhs_policy',
              content: 'concept content',
              score: 0.75,
            }),
          ],
        },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'prior authorization concept',
      topK: 3,
    });

    expect(results).toHaveLength(3);
    // Exact ranked order. The two DHHS sections outrank sec:clinical despite
    // its higher raw merge-max score (0.96 via the chunk backend) because the
    // DHHS Policy document accumulates a document-coverage boost from three
    // hits (sec:dhhs, sec:chunk, sec:concept); sec:concept (0.75) is cut by
    // topK. This pins ordering, dedup, and merge-max in one assertion.
    expect(results.map((row) => row.sectionId)).toEqual(['sec:chunk', 'sec:dhhs', 'sec:clinical']);
    expect(new Set(results.map((row) => row.sectionId)).size).toBe(3);
    const clinicalHit = results.find((row) => row.sectionId === 'sec:clinical');
    expect(clinicalHit).toMatchObject({
      sectionTitle: 'Clinical',
      documentTitle: 'Clinical Policy',
      content: 'chunk content',
    });
    expectAllHandlersUsed();
  });

  it('respects explicit document types', async () => {
    const { corpus, session } = createCorpus([]);

    await corpus.searchSectionsDetailed({
      query: 'eligibility',
      topK: 2,
      documentTypes: ['dhhs_policy'],
    });

    const sectionCalls = session.run.mock.calls.filter(([query]) =>
      (query as string).includes("CALL db.index.vector.queryNodes('section_embeddings'"),
    );
    expect(sectionCalls).toHaveLength(1);
    expect(sectionCalls[0]?.[1]).toMatchObject({ docTypes: ['dhhs_policy'] });
  });

  it('only adds operational source families for operational queries', async () => {
    const { corpus, session } = createCorpus([]);

    await corpus.searchSectionsDetailed({ query: 'Does policy 3L cover telehealth?', topK: 3 });

    const coverageGroups = session.run.mock.calls
      .filter(([query]) => (query as string).includes("CALL db.index.vector.queryNodes('section_embeddings'"))
      .map(([, params]) => (params as Record<string, unknown>).docTypes as string[]);

    expect(coverageGroups.some((docTypes) => docTypes.includes('fee_schedule'))).toBe(false);
    expect(coverageGroups.some((docTypes) => docTypes.includes('billing_guidance'))).toBe(false);

    session.run.mockClear();

    await corpus.searchSectionsDetailed({ query: 'What is the reimbursement rate for T1001?', topK: 3 });

    const operationalGroups = session.run.mock.calls
      .filter(([query]) => (query as string).includes("CALL db.index.vector.queryNodes('section_embeddings'"))
      .map(([, params]) => (params as Record<string, unknown>).docTypes as string[]);

    expect(operationalGroups.some((docTypes) => docTypes.includes('fee_schedule'))).toBe(true);
    expect(operationalGroups.some((docTypes) => docTypes.includes('billing_guidance'))).toBe(true);
  });

  it('prefers fee schedules for reimbursement questions', async () => {
    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:clinical',
              sectionNumber: '1',
              sectionTitle: 'Coverage',
              documentTitle: 'Clinical Policy',
              policyNumber: '1A',
              documentType: 'clinical_policy',
              authorityTier: 'authoritative',
              answerRole: 'coverage',
              answerReady: true,
              content: 'Coverage text',
              score: 0.88,
            }),
            // The strongest clinical competitor: an answer-ready coverage
            // section that names the queried code (T1001) at a higher raw
            // score than the primary fee-schedule row. The fee-schedule
            // preference must beat this, not an empty field.
            sectionHit({
              sectionId: 'sec:clinical-code',
              sectionNumber: 'C',
              sectionTitle: 'Code(s)',
              documentTitle: 'Maternal Care Skilled Nurse Home Visit',
              policyNumber: '1M-6',
              documentType: 'clinical_policy',
              authorityTier: 'authoritative',
              answerRole: 'coverage',
              answerReady: true,
              retrievalReady: true,
              content: 'Covered code T1001',
              score: 0.95,
            }),
          ],
        },
      },
      {
        label: 'vector spa',
        match: queries.sectionVector('state_plan_amendment'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:spa',
              sectionNumber: '.0109',
              sectionTitle: 'Reimbursement methods',
              documentTitle: 'State Plan Amendment',
              policyNumber: 'SPA 25-0026',
              documentType: 'state_plan_amendment',
              authorityTier: 'authoritative',
              answerRole: 'federal_authority',
              answerReady: true,
              retrievalReady: true,
              content: 'General reimbursement methodology for facilities',
              score: 0.97,
            }),
          ],
        },
      },
      {
        label: 'vector fee schedule',
        match: queries.sectionVector('fee_schedule'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:fee:primary',
              sectionTitle: 'Rates',
              documentTitle: 'Fee Schedule 2022',
              documentType: 'fee_schedule',
              authorityTier: 'supporting',
              answerRole: 'reimbursement',
              sourceFormat: 'xlsx',
              answerReady: true,
              corpusBucket: 'primary',
              variantDate: '2022-01-01',
              retrievalReady: true,
              content: 'T1001 rate 125.00',
              score: 0.82,
            }),
            sectionHit({
              sectionId: 'sec:fee:archive',
              sectionTitle: 'Rates',
              documentTitle: 'Fee Schedule 2019',
              documentType: 'fee_schedule',
              authorityTier: 'supporting',
              answerRole: 'reimbursement',
              sourceFormat: 'pdf',
              answerReady: true,
              corpusBucket: 'archive',
              variantDate: '2019-06-01',
              retrievalReady: false,
              content: 'T1001 rate 119.00',
              score: 0.94,
            }),
            sectionHit({
              sectionId: 'sec:fee:companion',
              sectionTitle: 'Rates',
              documentTitle: 'Fee Schedule 2022 PDF',
              documentType: 'fee_schedule',
              authorityTier: 'supporting',
              answerRole: 'reimbursement',
              sourceFormat: 'pdf',
              answerReady: true,
              corpusBucket: 'companion',
              variantDate: '2022-01-01',
              retrievalReady: false,
              content: 'T1001 rate 125.00',
              score: 0.9,
            }),
          ],
        },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'What is the reimbursement rate for T1001?',
      topK: 2,
    });

    expect(results[0]?.documentType).toBe('fee_schedule');
    expect(results[0]?.answerRole).toBe('reimbursement');
    expect(results[0]?.corpusBucket).toBe('primary');
    expect(results[0]?.sourceFormat).toBe('xlsx');
    expectAllHandlersUsed();
  });

  it('can surface fee-schedule history when the query asks for a specific year', async () => {
    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector fee schedule',
        match: queries.sectionVector('fee_schedule'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:fee:current',
              sectionTitle: 'Rates',
              documentTitle: 'Fee Schedule 2022',
              documentType: 'fee_schedule',
              authorityTier: 'supporting',
              answerRole: 'reimbursement',
              sourceFormat: 'xlsx',
              answerReady: true,
              corpusBucket: 'primary',
              variantDate: '2022-01-01',
              retrievalReady: true,
              content: 'T1001 rate 125.00',
              score: 0.9,
            }),
            sectionHit({
              sectionId: 'sec:fee:history',
              sectionTitle: 'Rates',
              documentTitle: 'Fee Schedule 2020',
              documentType: 'fee_schedule',
              authorityTier: 'supporting',
              answerRole: 'reimbursement',
              sourceFormat: 'xlsx',
              answerReady: true,
              corpusBucket: 'history',
              variantDate: '2020-07-28',
              retrievalReady: true,
              content: 'T1001 rate 121.00',
              score: 0.82,
            }),
          ],
        },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'What was the reimbursement rate for T1001 in 2020?',
      topK: 1,
    });

    expect(results[0]?.variantDate).toBe('2020-07-28');
    expect(results[0]?.corpusBucket).toBe('history');
    expectAllHandlersUsed();
  });

  it('prefers managed care contracts for contract-specific queries', async () => {
    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector managed care',
        match: queries.sectionVector('managed_care_contract'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:guidance',
              sectionTitle: 'Managed Care Claims and Prior Authorizations Submission',
              documentTitle: 'Managed Care Hot Topics',
              documentType: 'managed_care_guidance',
              authorityTier: 'supporting',
              answerRole: 'managed_care',
              answerReady: true,
              retrievalReady: true,
              content: 'Operational billing guidance for providers.',
              score: 0.98,
            }),
            sectionHit({
              sectionId: 'sec:contract',
              sectionNumber: 'V.D.2',
              sectionTitle: 'Prompt Payment Requirements',
              documentTitle: 'Standard Plan Contract',
              documentType: 'managed_care_contract',
              authorityTier: 'supporting',
              answerRole: 'managed_care_contract',
              answerReady: true,
              retrievalReady: true,
              content: 'The contractor must pay clean claims within the required timelines.',
              score: 0.9,
            }),
          ],
        },
      },
      {
        label: 'vector federal',
        match: queries.sectionVector('federal_regulation'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:federal',
              sectionNumber: '438.6',
              sectionTitle: 'Special contract provisions related to payment',
              documentTitle: '42 CFR Part 438',
              policyNumber: '42-CFR-438',
              documentType: 'federal_regulation',
              authorityTier: 'authoritative',
              answerRole: 'federal_authority',
              answerReady: true,
              retrievalReady: true,
              content: 'Federal managed care contracts include special provisions related to payment.',
              score: 0.97,
            }),
          ],
        },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'What do NC Medicaid managed care contracts say about provider payment obligations?',
      topK: 3,
    });

    expect(results[0]?.documentType).toBe('managed_care_contract');
    expect(results[0]?.answerRole).toBe('managed_care_contract');
    expect(results[0]?.sectionTitle).toBe('Prompt Payment Requirements');
    expectAllHandlersUsed();
  });

  it('penalizes process sections for yes/no coverage questions', async () => {
    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:request',
              sectionNumber: '5.6',
              sectionTitle: '5.6 Reconsideration Request for initial authorization for PCS',
              documentTitle: 'State Plan Personal Care Services (PCS)',
              policyNumber: '3L',
              documentType: 'clinical_policy',
              authorityTier: 'authoritative',
              answerRole: 'coverage',
              answerReady: true,
              retrievalReady: true,
              content: 'Telehealth reconsideration requests are reviewed after an adverse decision.',
              score: 0.96,
            }),
            sectionHit({
              sectionId: 'sec:not-covered',
              sectionNumber: '4.2.2',
              sectionTitle: '4.2.2 Services not covered by Medicaid',
              documentTitle: 'State Plan Personal Care Services (PCS)',
              policyNumber: '3L',
              documentType: 'clinical_policy',
              authorityTier: 'authoritative',
              answerRole: 'coverage',
              answerReady: true,
              retrievalReady: true,
              content: 'Telehealth is not covered for PCS delivered in congregate settings.',
              score: 0.93,
            }),
            sectionHit({
              sectionId: 'sec:general',
              sectionNumber: '3.1',
              sectionTitle: '3.1 General Criteria Covered',
              documentTitle: 'State Plan Personal Care Services (PCS)',
              policyNumber: '3L',
              documentType: 'clinical_policy',
              authorityTier: 'authoritative',
              answerRole: 'coverage',
              answerReady: true,
              retrievalReady: true,
              content: 'PCS is covered only when the beneficiary meets the general criteria.',
              score: 0.92,
            }),
          ],
        },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'Does policy 3L cover telehealth?',
      topK: 3,
    });

    expect(results[0]?.sectionTitle).not.toContain('Reconsideration Request');
    expect(results.slice(0, 2).map((hit) => hit.sectionTitle)).toEqual(
      expect.arrayContaining(['4.2.2 Services not covered by Medicaid']),
    );
    expectAllHandlersUsed();
  });
});
