import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_SNIPPET_CHARS, createNeo4jPolicyCorpus } from '../src/index.js';

function mockRecord(data: Record<string, unknown>) {
  return { get: (key: string) => data[key] };
}

function strictMockRecord(data: Record<string, unknown>) {
  return {
    get(key: string) {
      if (!(key in data)) {
        throw new Error(`Missing test record field: ${key}`);
      }
      return data[key];
    },
  };
}

function createCorpusWithRuns(runs: Array<{ records: ReturnType<typeof mockRecord>[] }>) {
  let callIndex = 0;
  const session = {
    run: vi.fn(async () => {
      const result = runs[callIndex] ?? { records: [] };
      callIndex++;
      return result;
    }),
  };

  const corpus = createNeo4jPolicyCorpus({
    withSession: async (fn) => fn(session),
    embedQuery: vi.fn(async () => [0.1, 0.2, 0.3]),
    defaultTopK: 10,
  });

  return { corpus, session };
}

function createCorpusWithSearchHandlers(
  handlers: Array<{
    match: (query: string, params: Record<string, unknown>) => boolean;
    result?: { records: ReturnType<typeof mockRecord>[] };
    error?: Error;
  }>,
) {
  const session = {
    run: vi.fn(async (query: string, params: Record<string, unknown> = {}) => {
      const handler = handlers.find((candidate) => candidate.match(query, params));
      if (!handler) return { records: [] };
      if (handler.error) throw handler.error;
      return handler.result ?? { records: [] };
    }),
  };

  const embedQuery = vi.fn(async () => [0.1, 0.2, 0.3]);
  const corpus = createNeo4jPolicyCorpus({
    withSession: async (fn) => fn(session),
    embedQuery,
    defaultTopK: 10,
  });

  return { corpus, session, embedQuery };
}

describe('Neo4jPolicyCorpus', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('searchSections preserves hybrid search scoring and snippets', async () => {
    const { corpus, embedQuery } = createCorpusWithSearchHandlers([
      {
        match: (query) => query.includes('section_fulltext'),
        result: {
          records: [
            mockRecord({
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
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
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
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('dhhs_policy'),
        result: {
          records: [
            mockRecord({
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
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
    ]);

    const sections = await corpus.searchSections({ query: 'coverage' });

    expect(embedQuery).toHaveBeenCalledWith('coverage');
    expect(sections).toHaveLength(2);
    expect(sections[0]?.sectionId).toBe('sec-dhhs');
    expect(sections[0]?.score).toBeCloseTo(1.0, 5);
    expect(sections[0]?.contentSnippet).toBe('A'.repeat(SEARCH_SNIPPET_CHARS));
    expect(sections[1]?.sectionId).toBe('sec-clinical');
  });

  it('searchSectionsDetailed matches grouped retrieval ordering and dedup', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
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
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('dhhs_policy'),
        result: {
          records: [
            mockRecord({
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
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
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
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('dhhs_policy'),
        result: {
          records: [
            mockRecord({
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
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: {
          records: [
            mockRecord({
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
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'prior authorization concept',
      topK: 3,
    });

    expect(results).toHaveLength(3);
    expect(results.map((row) => row.sectionId)).toEqual(expect.arrayContaining([
      'sec:clinical',
      'sec:chunk',
      'sec:dhhs',
    ]));
    expect(new Set(results.map((row) => row.sectionId)).size).toBe(3);
    const clinicalHit = results.find((row) => row.sectionId === 'sec:clinical');
    expect(clinicalHit).toMatchObject({
      sectionTitle: 'Clinical',
      documentTitle: 'Clinical Policy',
      content: 'chunk content',
    });
  });

  it('searchSectionsDetailed respects explicit document types', async () => {
    const { corpus, session } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('dhhs_policy'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
      },
    ]);

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

  it('searchSectionsDetailed only adds operational source families for operational queries', async () => {
    const { corpus, session } = createCorpusWithSearchHandlers([]);

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

  it('searchSectionsDetailed prefers fee schedules for reimbursement questions', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
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
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec:clinical',
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
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('state_plan_amendment'),
        result: {
          records: [
            mockRecord({
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
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('fee_schedule'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec:fee:primary',
              sectionNumber: null,
              sectionTitle: 'Rates',
              documentTitle: 'Fee Schedule 2022',
              policyNumber: null,
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
            mockRecord({
              sectionId: 'sec:fee:archive',
              sectionNumber: null,
              sectionTitle: 'Rates',
              documentTitle: 'Fee Schedule 2019',
              policyNumber: null,
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
            mockRecord({
              sectionId: 'sec:fee:companion',
              sectionNumber: null,
              sectionTitle: 'Rates',
              documentTitle: 'Fee Schedule 2022 PDF',
              policyNumber: null,
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
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
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
  });

  it('searchSectionsDetailed can surface fee-schedule history when the query asks for a specific year', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('fee_schedule'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec:fee:current',
              sectionNumber: null,
              sectionTitle: 'Rates',
              documentTitle: 'Fee Schedule 2022',
              policyNumber: null,
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
            mockRecord({
              sectionId: 'sec:fee:history',
              sectionNumber: null,
              sectionTitle: 'Rates',
              documentTitle: 'Fee Schedule 2020',
              policyNumber: null,
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
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'What was the reimbursement rate for T1001 in 2020?',
      topK: 1,
    });

    expect(results[0]?.variantDate).toBe('2020-07-28');
    expect(results[0]?.corpusBucket).toBe('history');
  });

  it('searchSectionsDetailed prefers managed care contracts for contract-specific queries', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('managed_care_contract'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec:guidance',
              sectionNumber: null,
              sectionTitle: 'Managed Care Claims and Prior Authorizations Submission',
              documentTitle: 'Managed Care Hot Topics',
              policyNumber: null,
              documentType: 'managed_care_guidance',
              authorityTier: 'supporting',
              answerRole: 'managed_care',
              answerReady: true,
              retrievalReady: true,
              content: 'Operational billing guidance for providers.',
              score: 0.98,
            }),
            mockRecord({
              sectionId: 'sec:contract',
              sectionNumber: 'V.D.2',
              sectionTitle: 'Prompt Payment Requirements',
              documentTitle: 'Standard Plan Contract',
              policyNumber: null,
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
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('federal_regulation'),
        result: {
          records: [
            mockRecord({
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
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'What do NC Medicaid managed care contracts say about provider payment obligations?',
      topK: 3,
    });

    expect(results[0]?.documentType).toBe('managed_care_contract');
    expect(results[0]?.answerRole).toBe('managed_care_contract');
    expect(results[0]?.sectionTitle).toBe('Prompt Payment Requirements');
  });

  it('searchSectionsDetailed penalizes process sections for yes/no coverage questions', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
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
            mockRecord({
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
            mockRecord({
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
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
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
  });

  it('searchSectionsDetailed filters generic concept matches', async () => {
    const { corpus, session } = createCorpusWithSearchHandlers([
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('section_embeddings'"),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec:primary',
              sectionNumber: '5.9.1',
              sectionTitle: 'Primary',
              documentTitle: 'Clinical Policy',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content: 'primary content',
              score: 0.9,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec:supporting',
              sectionNumber: '3.4.5',
              sectionTitle: 'Supporting',
              documentTitle: 'Clinical Policy',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content: 'supporting semantic content',
              score: 0.74,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'home modifications cap/da',
      topK: 2,
    });

    expect(results.map((row) => row.sectionId)).toEqual([
      'sec:primary',
      'sec:supporting',
    ]);
    const conceptQueries = session.run.mock.calls
      .map(([query]) => query as string)
      .filter((query) => query.includes('MATCH (c:PolicyConcept)'));
    expect(conceptQueries).toHaveLength(1);
    expect(conceptQueries[0]).toContain('s.section_number IS NOT NULL');
  });

  it('searchSectionsDetailed reranks specific title matches above boilerplate', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec:history',
              sectionNumber: '1.9',
              sectionTitle: 'History:',
              documentTitle: 'Clinical Coverage Policy 10A',
              policyNumber: '10A',
              documentType: 'clinical_policy',
              content: 'Revision dates and publishing notes',
              score: 0.92,
            }),
            mockRecord({
              sectionId: 'sec:epsdt',
              sectionNumber: '2.2.1',
              sectionTitle: 'EPSDT Special Provision',
              documentTitle: 'Clinical Coverage Policy 10A',
              policyNumber: '10A',
              documentType: 'clinical_policy',
              content: 'Beneficiaries under 21 may receive medically necessary services.',
              score: 0.88,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (d:Document)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'How does the EPSDT special provision affect beneficiaries under 21?',
      topK: 2,
    });

    expect(results.map((row) => row.sectionId)).toEqual([
      'sec:epsdt',
      'sec:history',
    ]);
  });

  it('searchSectionsDetailed boosts high-signal matches above generic requirements', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec:generic',
              sectionNumber: '6.4.1',
              sectionTitle: 'CAP/DA Mandated Requirements',
              documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content: 'Case management entity requirements and staffing expectations.',
              score: 0.96,
            }),
            mockRecord({
              sectionId: 'sec:target',
              sectionNumber: '5.9.1',
              sectionTitle: 'Equipment, Modification, Technology and Supplies',
              documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content: 'A recommendation by the MDT identifying the home modification or equipment requested.',
              score: 0.89,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (d:Document)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'What documentation must the CAP/DA multidisciplinary team provide for a home modification?',
      topK: 2,
    });

    expect(results.map((row) => row.sectionId)).toEqual([
      'sec:target',
      'sec:generic',
    ]);
  });

  it('searchSectionsDetailed falls back to document keyword matches', async () => {
    const { corpus, session } = createCorpusWithSearchHandlers([
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('section_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document)') &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec:doc:clinical_policy:5B:4.1',
              sectionNumber: '4.1',
              sectionTitle: 'Criteria Not Covered',
              documentTitle: 'Clinical Coverage Policy 5B',
              policyNumber: '5B',
              documentType: 'clinical_policy',
              content: 'Chiropractic services are not covered under this policy.',
              score: 0.62,
            }),
          ],
        },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?',
      topK: 1,
    });

    expect(results[0]?.sectionId).toBe('sec:doc:clinical_policy:5B:4.1');
    const keywordQueries = session.run.mock.calls.filter(([query]) => (query as string).includes('MATCH (d:Document)'));
    expect(keywordQueries.length).toBeGreaterThan(0);
  });

  it('searchSectionsDetailed expands change-notice revision headers from matching manuals', async () => {
    const { corpus, session } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('dhhs_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec:doc:dhhs_policy:MA-3550:_s78',
              sectionNumber: null,
              sectionTitle: 'Mileage Effective (1/1/2026)',
              documentTitle: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
              policyNumber: 'MA-3550',
              documentType: 'dhhs_policy',
              content: 'Current mileage reimbursement values.',
              score: 0.99,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('change notice header expansion'),
        result: { records: [] },
      },
      {
        match: (query) =>
          query.includes("WHEN toLower(coalesce(s.title, '')) CONTAINS 'change no'") &&
          query.includes('MATCH (d:Document)'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec:doc:dhhs_policy:MA-3550:_s2',
              sectionNumber: null,
              sectionTitle: 'REVISED 03/16/2026 -CHANGE NO. 04-26',
              documentTitle: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
              policyNumber: 'MA-3550',
              documentType: 'dhhs_policy',
              content: '',
              score: 1.28,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes('MATCH (d:Document)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'Which change notice is the most recent for NEMT, and what did it change?',
      topK: 2,
    });

    expect(results[0]?.sectionId).toBe('sec:doc:dhhs_policy:MA-3550:_s2');
    expect(session.run.mock.calls.some(([query]) => (query as string).includes("CONTAINS 'change no'"))).toBe(true);
  });

  it('searchSectionsDetailed prefers the newest parsed change marker for latest-change queries', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('dhhs_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec:doc:dhhs_policy:MA-3550:_s78',
              sectionNumber: null,
              sectionTitle: 'Mileage Effective (1/1/2026)',
              documentTitle: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
              policyNumber: 'MA-3550',
              documentType: 'dhhs_policy',
              content: 'Current mileage reimbursement values.',
              score: 1.02,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) =>
          query.includes("WHEN toLower(coalesce(s.title, '')) CONTAINS 'change no'") &&
          query.includes('MATCH (d:Document)'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec:doc:dhhs_policy:MA-3550:_s2',
              sectionNumber: null,
              sectionTitle: 'REVISED 03/16/2026 -CHANGE NO. 04-26',
              documentTitle: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
              policyNumber: 'MA-3550',
              documentType: 'dhhs_policy',
              content: '',
              score: 1.28,
            }),
            mockRecord({
              sectionId: 'sec:doc:dhhs_policy:MA-2910:_s2',
              sectionNumber: null,
              sectionTitle: 'REVISED 02/01/2026 -CHANGE NO. 02-26',
              documentTitle: 'MA-2910 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
              policyNumber: 'MA-2910',
              documentType: 'dhhs_policy',
              content: '',
              score: 1.31,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes('MATCH (d:Document)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'Which change notice is the most recent for NEMT?',
      topK: 3,
    });

    expect(results.map((result) => result.sectionId)).toEqual([
      'sec:doc:dhhs_policy:MA-3550:_s2',
      'sec:doc:dhhs_policy:MA-2910:_s2',
      'sec:doc:dhhs_policy:MA-3550:_s78',
    ]);
  });

  it('searchSectionsDetailed prefers the general PDN policy over under-21 variants when the query is not pediatric', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec:3g2',
              sectionNumber: '5.2.4.1',
              sectionTitle: 'Notification of Termination',
              documentTitle: '3G-2 Private Duty Nursing for Beneficiaries Under 21 Years of Age',
              policyNumber: '3G-2',
              documentType: 'clinical_policy',
              content: 'The provider must notify NC Medicaid when services terminate.',
              score: 0.95,
            }),
            mockRecord({
              sectionId: 'sec:3g1',
              sectionNumber: '5.2.4.1',
              sectionTitle: 'Notification of Termination',
              documentTitle: '3G-1 Private Duty Nursing',
              policyNumber: '3G-1',
              documentType: 'clinical_policy',
              content: 'The provider must submit DMA-3513 within five business days.',
              score: 0.92,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'If a Private Duty Nursing provider terminates services for a Medicaid beneficiary, what notification requirements must they follow?',
      topK: 2,
    });

    expect(results.map((result) => result.policyNumber)).toEqual(['3G-1', '3G-2']);
  });

  it('getSection returns document metadata, citationLink, and effectiveDate', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          mockRecord({
            id: 'sec-1',
            title: 'Eligibility',
            sectionNumber: '4.1',
            content: 'Full section content here.',
            documentId: 'doc-1',
            documentTitle: 'Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2025-01-01',
            url: 'https://example.com/8C',
            status: 'current',
            authorityTier: null,
            answerRole: null,
            sourceFormat: null,
            answerReady: null,
            corpusBucket: null,
            variantGroup: null,
            variantDate: null,
            retrievalReady: null,
          }),
        ],
      },
    ]);

    const section = await corpus.getSection('sec-1');

    expect(section).toEqual({
      id: 'sec-1',
      title: 'Eligibility',
      sectionNumber: '4.1',
      content: 'Full section content here.',
      effectiveDate: '2025-01-01',
      lastRevised: null,
      federalRegisterCite: null,
      documentId: 'doc-1',
      documentTitle: 'Policy 8C',
      documentType: 'dhhs_policy',
      policyNumber: '8C',
      url: 'https://example.com/8C',
      citationLink: '[Policy 8C](https://example.com/8C)',
      status: 'current',
      authorityTier: null,
      answerRole: null,
      sourceFormat: null,
      answerReady: null,
      corpusBucket: null,
      variantGroup: null,
      variantDate: null,
      retrievalReady: null,
    });
  });

  it('getSection aggregates child content for container headings', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          mockRecord({
            id: 'sec-parent',
            title: 'Parent Section',
            sectionNumber: '4',
            content: '',
            lastRevised: null,
            federalRegisterCite: null,
            documentId: 'doc-1',
            documentTitle: 'Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2025-01-01',
            url: 'https://example.com/8C',
            status: 'current',
            authorityTier: null,
            answerRole: null,
            sourceFormat: null,
            answerReady: null,
            corpusBucket: null,
            variantGroup: null,
            variantDate: null,
            retrievalReady: null,
          }),
        ],
      },
      {
        records: [
          strictMockRecord({
            children: [
              { id: 'sec-child-1', title: 'Child A', sectionNumber: '4.1', content: 'Child A content' },
              { id: 'sec-child-2', title: 'Child B', sectionNumber: '4.2', content: 'Child B content' },
            ],
            documentId: 'doc-1',
            documentTitle: 'Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2025-01-01',
            url: 'https://example.com/8C',
            status: 'current',
            authorityTier: null,
            answerRole: null,
            sourceFormat: null,
            answerReady: null,
            corpusBucket: null,
            variantGroup: null,
            variantDate: null,
            retrievalReady: null,
          }),
        ],
      },
    ]);

    const section = await corpus.getSection('sec-parent');

    expect(section?.content).toContain('[Container heading with 2 child sections:]');
    expect(section?.content).toContain('### Child A');
    expect(section?.citationLink).toBe('[Policy 8C](https://example.com/8C)');
  });

  it('getDocument filters null sections and preserves citation metadata', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          mockRecord({
            id: 'doc-1',
            title: 'Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2025-01-01',
            url: 'https://example.com/8C',
            status: 'current',
            sections: [
              { id: 'sec-1', number: '1', title: 'Intro', chars: 100 },
              { id: null, number: null, title: null, chars: null },
              { id: 'sec-2', number: '2', title: 'Coverage', chars: 200 },
            ],
          }),
        ],
      },
    ]);

    const document = await corpus.getDocument('doc-1');

    expect(document?.citationLink).toBe('[Policy 8C](https://example.com/8C)');
    expect(document?.sections).toEqual([
      { id: 'sec-1', number: '1', title: 'Intro', chars: 100 },
      { id: 'sec-2', number: '2', title: 'Coverage', chars: 200 },
    ]);
  });

  it('getSectionContext returns ancestors, children, and siblings', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          mockRecord({ id: 'sec-root', title: 'Root', sectionNumber: '1' }),
          mockRecord({ id: 'sec-parent', title: 'Parent', sectionNumber: '1.1' }),
        ],
      },
      {
        records: [
          mockRecord({ id: 'sec-child-1', title: 'Child 1', sectionNumber: '1.1.1.1' }),
          mockRecord({ id: 'sec-child-2', title: 'Child 2', sectionNumber: '1.1.1.2' }),
        ],
      },
      {
        records: [
          mockRecord({ id: 'sec-sibling', title: 'Sibling', sectionNumber: '1.1.2' }),
          mockRecord({ id: 'sec-sibling-2', title: 'Sibling 2', sectionNumber: '1.1.3' }),
        ],
      },
    ]);

    const context = await corpus.getSectionContext('sec-1.1.1');

    expect(context.ancestors).toHaveLength(2);
    expect(context.children).toHaveLength(2);
    expect(context.siblings).toHaveLength(2);
  });

  it('followReferences maps section and document targets', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          mockRecord({
            targetId: 'sec-target-1',
            targetType: 'Section',
            targetTitle: 'Target Section',
            targetPolicyNumber: '1A',
            relationshipType: 'REFERENCES',
            referenceText: 'see section 1A',
          }),
          mockRecord({
            targetId: 'doc-target-1',
            targetType: 'Document',
            targetTitle: 'Target Document',
            targetPolicyNumber: '42 CFR 440',
            relationshipType: 'REFERENCES_DOCUMENT',
            referenceText: 'pursuant to 42 CFR 440',
          }),
        ],
      },
    ]);

    const references = await corpus.followReferences('sec-1');

    expect(references).toEqual([
      {
        targetId: 'sec-target-1',
        targetType: 'Section',
        targetTitle: 'Target Section',
        targetPolicyNumber: '1A',
        relationshipType: 'REFERENCES',
        referenceText: 'see section 1A',
      },
      {
        targetId: 'doc-target-1',
        targetType: 'Document',
        targetTitle: 'Target Document',
        targetPolicyNumber: '42 CFR 440',
        relationshipType: 'REFERENCES_DOCUMENT',
        referenceText: 'pursuant to 42 CFR 440',
      },
    ]);
  });

  it('getAmendments returns the latest amendment as authoritative', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          mockRecord({
            id: 'doc-1',
            title: 'Current Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2025-01-01',
            url: 'https://example.com/8C',
            status: 'current',
          }),
        ],
      },
      {
        records: [
          mockRecord({
            id: 'amend-2',
            title: 'Change Notice 2025-03',
            documentType: 'change_notice',
            policyNumber: '8C-CN-03',
            effectiveDate: '2025-08-01',
            url: 'https://example.com/cn-03',
            status: 'amendment',
            changeDescription: 'This change notice supersedes the prior revision.',
          }),
          mockRecord({
            id: 'amend-1',
            title: 'Change Notice 2025-01',
            documentType: 'change_notice',
            policyNumber: '8C-CN-01',
            effectiveDate: '2025-06-01',
            url: 'https://example.com/cn-01',
            status: 'amendment',
            changeDescription: 'MA-2180 is revised in the following way...',
          }),
        ],
      },
      {
        records: [
          mockRecord({
            id: 'doc-base',
            title: 'Original Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2024-01-01',
            url: 'https://example.com/8C',
            status: 'current',
          }),
        ],
      },
    ]);

    const amendments = await corpus.getAmendments('doc-1');

    expect(amendments.amendments).toHaveLength(2);
    expect(amendments.authoritativeDocument?.id).toBe('amend-2');
    expect(amendments.baseDocument?.id).toBe('doc-base');
  });

  it('lookupPolicy returns documents with metadata and sections', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          mockRecord({
            id: 'doc-8c',
            title: 'Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2025-01-01',
            url: 'https://example.com/8C',
            status: 'current',
            sections: [
              { id: 'sec-1', number: '1', title: 'Introduction' },
              { id: 'sec-2', number: '2', title: 'Coverage' },
            ],
          }),
        ],
      },
    ]);

    const documents = await corpus.lookupPolicy({ policyNumber: '8C' });

    expect(documents).toEqual([
      {
        id: 'doc-8c',
        title: 'Policy 8C',
        documentType: 'dhhs_policy',
        policyNumber: '8C',
        effectiveDate: '2025-01-01',
        url: 'https://example.com/8C',
        citationLink: '[Policy 8C](https://example.com/8C)',
        status: 'current',
        authorityTier: null,
        answerRole: null,
        sourceFormat: null,
        answerReady: null,
        corpusBucket: null,
        variantGroup: null,
        variantDate: null,
        retrievalReady: null,
        sections: [
          { id: 'sec-1', number: '1', title: 'Introduction' },
          { id: 'sec-2', number: '2', title: 'Coverage' },
        ],
      },
    ]);
  });

  it('findConceptSections rejects invalid relationship filters before querying', async () => {
    const { corpus, session } = createCorpusWithRuns([{ records: [] }]);

    const sections = await corpus.findConceptSections({
      conceptName: 'EPSDT',
      relationshipType: 'DEFINES}]->(x) DETACH DELETE x //',
    });

    expect(sections).toEqual([]);
    expect(session.run).not.toHaveBeenCalled();
  });

  it('resolveCoverageFrame returns coverage and limiting evidence for service questions', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-tele',
              sectionNumber: '3.1',
              sectionTitle: 'Telehealth Coverage',
              documentTitle: 'Clinical Coverage Policy 10A',
              policyNumber: '10A',
              documentType: 'clinical_policy',
              content: 'Speech therapy may be provided by telehealth when medically necessary.',
              score: 0.94,
            }),
            mockRecord({
              sectionId: 'sec-not-covered',
              sectionNumber: '4.2',
              sectionTitle: 'Not Covered',
              documentTitle: 'Clinical Coverage Policy 10A',
              policyNumber: '10A',
              documentType: 'clinical_policy',
              content: 'Services outside the stated therapy scope are not covered under this policy.',
              score: 0.9,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '10A',
        result: {
          records: [
            mockRecord({
              id: 'doc-10a',
              title: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/10A',
              status: 'current',
              sections: [
                { id: 'sec-tele', number: '3.1', title: 'Telehealth Coverage' },
                { id: 'sec-not-covered', number: '4.2', title: 'Not Covered' },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-tele',
        result: {
          records: [
            mockRecord({
              id: 'sec-tele',
              title: 'Telehealth Coverage',
              sectionNumber: '3.1',
              content: 'Speech therapy may be provided by telehealth when medically necessary.',
              documentId: 'doc-10a',
              documentTitle: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/10A',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-not-covered',
        result: {
          records: [
            mockRecord({
              id: 'sec-not-covered',
              title: 'Not Covered',
              sectionNumber: '4.2',
              content: 'Services outside the stated therapy scope are not covered under this policy.',
              documentId: 'doc-10a',
              documentTitle: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/10A',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-10a',
        result: {
          records: [
            mockRecord({
              id: 'doc-10a',
              title: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/10A',
              status: 'current',
              sections: [
                { id: 'sec-tele', number: '3.1', title: 'Telehealth Coverage', chars: 1200 },
                { id: 'sec-not-covered', number: '4.2', title: 'Not Covered', chars: 800 },
              ],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveCoverageFrame('Does Policy 10A cover telehealth speech therapy?');

    expect(frame.questionType).toBe('coverage');
    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('10A');
    expect(frame.primarySections.map((section) => section.title)).toContain('Telehealth Coverage');
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.title)).toContain('Not Covered');
  });

  it('resolveCoverageFrame aliases telehealth speech-therapy questions to Policy 10A without explicit policy numbers', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-10a-tele',
              sectionNumber: null,
              sectionTitle: 'e. Telehealth',
              documentTitle: 'Clinical Coverage Policy 10A',
              policyNumber: '10A',
              documentType: 'clinical_policy',
              content: 'Speech therapy may be provided by telehealth when medically necessary and consistent with beneficiary need.',
              score: 0.95,
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('federal_regulation'),
        result: {
          records: [
            mockRecord({
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
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '10A',
        result: {
          records: [
            mockRecord({
              id: 'doc-10a',
              title: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-02-01',
              url: 'https://example.com/10A',
              status: 'current',
              sections: [{ id: 'sec-10a-tele', number: null, title: 'e. Telehealth' }],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-10a-tele',
        result: {
          records: [
            mockRecord({
              id: 'sec-10a-tele',
              title: 'e. Telehealth',
              sectionNumber: null,
              content: 'Speech therapy may be provided by telehealth when medically necessary and consistent with beneficiary need.',
              documentId: 'doc-10a',
              documentTitle: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-02-01',
              url: 'https://example.com/10A',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-10a',
        result: {
          records: [
            mockRecord({
              id: 'doc-10a',
              title: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-02-01',
              url: 'https://example.com/10A',
              status: 'current',
              sections: [{ id: 'sec-10a-tele', number: null, title: 'e. Telehealth', chars: 1200 }],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveCoverageFrame(
      'Under what conditions can speech therapy be provided via telehealth under NC Medicaid?',
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('10A');
    expect(frame.primarySections[0]?.policyNumber).toBe('10A');
    expect(frame.primarySections.map((section) => section.title)).toContain('e. Telehealth');
  });

  it('resolveCoverageFrame keeps telehealth speech questions on state-policy telehealth sections and avoids cross-reference boilerplate', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-10a-tele',
              sectionNumber: null,
              sectionTitle: 'e. Telehealth',
              documentTitle: 'Clinical Coverage Policy 10A',
              policyNumber: '10A',
              documentType: 'clinical_policy',
              content:
                'Telehealth delivery may be medically necessary when exposure to others should be avoided or if the location is remote or underserved. Telehealth must be used as an adjunct to in-person care and not as a replacement.',
              score: 0.97,
            }),
            mockRecord({
              sectionId: 'sec-10a-speech',
              sectionNumber: '3.2.1.3',
              sectionTitle: '3.2.1.3 Speech -Language Therapy (ST)',
              documentTitle: 'Clinical Coverage Policy 10A',
              policyNumber: '10A',
              documentType: 'clinical_policy',
              content: 'Documented findings for speech-language therapy remain required.',
              score: 0.93,
            }),
            mockRecord({
              sectionId: 'sec-10a-tele-table',
              sectionNumber: null,
              sectionTitle: 'Speech/Language Treatment',
              documentTitle: 'Clinical Coverage Policy 10A',
              policyNumber: '10A',
              documentType: 'clinical_policy',
              content: 'Telehealth Eligible Service: Yes for selected speech/language treatment codes.',
              score: 0.92,
            }),
            mockRecord({
              sectionId: 'sec-10a-related',
              sectionNumber: null,
              sectionTitle: 'Related Clinical Coverage Policies',
              documentTitle: 'Clinical Coverage Policy 10A',
              policyNumber: '10A',
              documentType: 'clinical_policy',
              content: '1H, Telehealth, Virtual Communications and Remote Patient Monitoring.',
              score: 0.96,
            }),
            mockRecord({
              sectionId: 'sec-10a-history',
              sectionNumber: null,
              sectionTitle: 'History:',
              documentTitle: 'Clinical Coverage Policy 10A',
              policyNumber: '10A',
              documentType: 'clinical_policy',
              content: 'Prior policy revisions.',
              score: 0.95,
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('federal_regulation'),
        result: {
          records: [
            mockRecord({
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
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '10A',
        result: {
          records: [
            mockRecord({
              id: 'doc-10a',
              title: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-02-01',
              url: 'https://example.com/10A',
              status: 'current',
              sections: [
                { id: 'sec-10a-tele', number: null, title: 'e. Telehealth' },
                { id: 'sec-10a-speech', number: '3.2.1.3', title: '3.2.1.3 Speech -Language Therapy (ST)' },
                { id: 'sec-10a-tele-table', number: null, title: 'Speech/Language Treatment' },
                { id: 'sec-10a-related', number: null, title: 'Related Clinical Coverage Policies' },
                { id: 'sec-10a-history', number: null, title: 'History:' },
              ],
            }),
          ],
        },
      },
      ...[
        {
          id: 'sec-10a-tele',
          title: 'e. Telehealth',
          sectionNumber: null,
          content:
            'Telehealth delivery may be medically necessary when exposure to others should be avoided or if the location is remote or underserved. Telehealth must be used as an adjunct to in-person care and not as a replacement. Telehealth must be used in the best interest of the beneficiary and not as a convenience for the therapist.',
        },
        {
          id: 'sec-10a-speech',
          title: '3.2.1.3 Speech -Language Therapy (ST)',
          sectionNumber: '3.2.1.3',
          content: 'Documented findings for speech-language therapy remain required.',
        },
        {
          id: 'sec-10a-tele-table',
          title: 'Speech/Language Treatment',
          sectionNumber: null,
          content: 'Telehealth Eligible Service: Yes for selected speech/language treatment codes.',
        },
        {
          id: 'sec-10a-related',
          title: 'Related Clinical Coverage Policies',
          sectionNumber: null,
          content: '1H, Telehealth, Virtual Communications and Remote Patient Monitoring.',
        },
        {
          id: 'sec-10a-history',
          title: 'History:',
          sectionNumber: null,
          content: 'Prior policy revisions.',
        },
      ].map((section) => ({
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === section.id,
        result: {
          records: [
            mockRecord({
              ...section,
              documentId: 'doc-10a',
              documentTitle: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-02-01',
              url: 'https://example.com/10A',
              status: 'current',
            }),
          ],
        },
      })),
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-10a',
        result: {
          records: [
            mockRecord({
              id: 'doc-10a',
              title: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-02-01',
              url: 'https://example.com/10A',
              status: 'current',
              sections: [
                { id: 'sec-10a-tele', number: null, title: 'e. Telehealth', chars: 1200 },
                { id: 'sec-10a-speech', number: '3.2.1.3', title: '3.2.1.3 Speech -Language Therapy (ST)', chars: 1000 },
                { id: 'sec-10a-tele-table', number: null, title: 'Speech/Language Treatment', chars: 900 },
                { id: 'sec-10a-related', number: null, title: 'Related Clinical Coverage Policies', chars: 300 },
                { id: 'sec-10a-history', number: null, title: 'History:', chars: 300 },
              ],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveCoverageFrame(
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
    expect([...frame.primarySections, ...frame.supportingSections].every((section) => section.policyNumber === '10A')).toBe(true);
    expect(frame.avoidSections.map((section) => section.title)).toContain('Speech/Language Treatment');
  });

  it('resolveCoverageFrame can still surface telehealth service tables when the query explicitly asks which services are eligible', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-10a-tele',
              sectionNumber: null,
              sectionTitle: 'e. Telehealth',
              documentTitle: 'Clinical Coverage Policy 10A',
              policyNumber: '10A',
              documentType: 'clinical_policy',
              content:
                'Telehealth delivery may be medically necessary when exposure to others should be avoided or if the location is remote or underserved.',
              score: 0.97,
            }),
            mockRecord({
              sectionId: 'sec-10a-tele-table',
              sectionNumber: null,
              sectionTitle: 'Speech/Language Treatment',
              documentTitle: 'Clinical Coverage Policy 10A',
              policyNumber: '10A',
              documentType: 'clinical_policy',
              content: 'Telehealth Eligible Service: Yes for selected speech/language treatment codes.',
              score: 0.96,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '10A',
        result: {
          records: [
            mockRecord({
              id: 'doc-10a',
              title: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-02-01',
              url: 'https://example.com/10A',
              status: 'current',
              sections: [
                { id: 'sec-10a-tele', number: null, title: 'e. Telehealth' },
                { id: 'sec-10a-tele-table', number: null, title: 'Speech/Language Treatment' },
              ],
            }),
          ],
        },
      },
      ...[
        {
          id: 'sec-10a-tele',
          title: 'e. Telehealth',
          sectionNumber: null,
          content:
            'Telehealth delivery may be medically necessary when exposure to others should be avoided or if the location is remote or underserved.',
        },
        {
          id: 'sec-10a-tele-table',
          title: 'Speech/Language Treatment',
          sectionNumber: null,
          content: 'Telehealth Eligible Service: Yes for selected speech/language treatment codes.',
        },
      ].map((section) => ({
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === section.id,
        result: {
          records: [
            mockRecord({
              ...section,
              documentId: 'doc-10a',
              documentTitle: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-02-01',
              url: 'https://example.com/10A',
              status: 'current',
            }),
          ],
        },
      })),
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-10a',
        result: {
          records: [
            mockRecord({
              id: 'doc-10a',
              title: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-02-01',
              url: 'https://example.com/10A',
              status: 'current',
              sections: [
                { id: 'sec-10a-tele', number: null, title: 'e. Telehealth', chars: 1200 },
                { id: 'sec-10a-tele-table', number: null, title: 'Speech/Language Treatment', chars: 900 },
              ],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveCoverageFrame(
      'Which speech therapy services are telehealth-eligible under NC Medicaid?',
    );

    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.title)).toContain(
      'Speech/Language Treatment',
    );
  });

  it('resolveCoverageFrame keeps yes/no coverage questions on scope and not-covered sections instead of request attachments', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-5b-info',
              sectionNumber: null,
              sectionTitle: 'Information:',
              documentTitle: 'Orthotics & Prosthetics',
              policyNumber: '5B',
              documentType: 'clinical_policy',
              content: 'Request details for providers.',
              score: 0.97,
            }),
            mockRecord({
              sectionId: 'sec-5b-attach',
              sectionNumber: 'Attachment E',
              sectionTitle: 'Attachment E: Requesting Unlisted Orthotics and Prosthetics for Adults',
              documentTitle: 'Orthotics & Prosthetics',
              policyNumber: '5B',
              documentType: 'clinical_policy',
              content: 'Requesting unlisted orthotics and prosthetics.',
              score: 0.95,
            }),
            mockRecord({
              sectionId: 'sec-5b-41',
              sectionNumber: '4.1',
              sectionTitle: '4.1 General Criteria Not Covered',
              documentTitle: 'Orthotics & Prosthetics',
              policyNumber: '5B',
              documentType: 'clinical_policy',
              content: 'Chiropractic services are not covered under this policy.',
              score: 0.79,
            }),
            mockRecord({
              sectionId: 'sec-5b-211',
              sectionNumber: '2.1.1',
              sectionTitle: '2.1.1 Description',
              documentTitle: 'Orthotics & Prosthetics',
              policyNumber: '5B',
              documentType: 'clinical_policy',
              content: 'This policy covers orthotic and prosthetic devices.',
              score: 0.76,
            }),
            mockRecord({
              sectionId: 'sec-5b-31',
              sectionNumber: '3.1',
              sectionTitle: '3.1 General Criteria Covered',
              documentTitle: 'Orthotics & Prosthetics',
              policyNumber: '5B',
              documentType: 'clinical_policy',
              content: 'Coverage criteria for orthotics and prosthetics under this policy.',
              score: 0.82,
            }),
            mockRecord({
              sectionId: 'sec-5b-42',
              sectionNumber: '4.2',
              sectionTitle: '4.2 Specific Criteria Not Covered',
              documentTitle: 'Orthotics & Prosthetics',
              policyNumber: '5B',
              documentType: 'clinical_policy',
              content: 'Specific criteria not covered under this policy.',
              score: 0.81,
            }),
            mockRecord({
              sectionId: 'sec-5b-421',
              sectionNumber: '4.2.1',
              sectionTitle: '4.2.1 Specific Criteria Not Covered by Medicaid',
              documentTitle: 'Orthotics & Prosthetics',
              policyNumber: '5B',
              documentType: 'clinical_policy',
              content: 'Specific non-covered device criteria.',
              score: 0.72,
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document)') &&
          query.includes("toUpper(coalesce(d.policy_number, ''))") &&
          Array.isArray(params.policyNumbers) &&
          (params.policyNumbers as string[]).includes('5B'),
        result: {
          records: [
            mockRecord({
              id: 'doc-5b',
              title: 'Orthotics & Prosthetics',
              documentType: 'clinical_policy',
              policyNumber: '5B',
              effectiveDate: '2024-07-15',
              url: 'https://example.com/5B',
              status: 'current',
            }),
          ],
        },
      },
      ...[
        {
          id: 'sec-5b-info',
          title: 'Information:',
          sectionNumber: null,
          content: 'Request details for providers.',
        },
        {
          id: 'sec-5b-attach',
          title: 'Attachment E: Requesting Unlisted Orthotics and Prosthetics for Adults',
          sectionNumber: 'Attachment E',
          content: 'Requesting unlisted orthotics and prosthetics.',
        },
        {
          id: 'sec-5b-41',
          title: '4.1 General Criteria Not Covered',
          sectionNumber: '4.1',
          content: 'Chiropractic services are not covered under this policy.',
        },
        {
          id: 'sec-5b-211',
          title: '2.1.1 Description',
          sectionNumber: '2.1.1',
          content: 'This policy covers orthotic and prosthetic devices.',
        },
        {
          id: 'sec-5b-31',
          title: '3.1 General Criteria Covered',
          sectionNumber: '3.1',
          content: 'Coverage criteria for orthotics and prosthetics under this policy.',
        },
        {
          id: 'sec-5b-42',
          title: '4.2 Specific Criteria Not Covered',
          sectionNumber: '4.2',
          content: 'Specific criteria not covered under this policy.',
        },
        {
          id: 'sec-5b-421',
          title: '4.2.1 Specific Criteria Not Covered by Medicaid',
          sectionNumber: '4.2.1',
          content: 'Specific non-covered device criteria.',
        },
      ].map((section) => ({
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === section.id,
        result: {
          records: [
            mockRecord({
              ...section,
              documentId: 'doc-5b',
              documentTitle: 'Orthotics & Prosthetics',
              documentType: 'clinical_policy',
              policyNumber: '5B',
              effectiveDate: '2024-07-15',
              url: 'https://example.com/5B',
              status: 'current',
            }),
          ],
        },
      })),
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-5b',
        result: {
          records: [
            mockRecord({
              id: 'doc-5b',
              title: 'Orthotics & Prosthetics',
              documentType: 'clinical_policy',
              policyNumber: '5B',
              effectiveDate: '2024-07-15',
              url: 'https://example.com/5B',
              status: 'current',
              sections: [
                { id: 'sec-5b-info', number: null, title: 'Information:', chars: 200 },
                { id: 'sec-5b-attach', number: 'Attachment E', title: 'Attachment E: Requesting Unlisted Orthotics and Prosthetics for Adults', chars: 900 },
                { id: 'sec-5b-211', number: '2.1.1', title: '2.1.1 Description', chars: 600 },
                { id: 'sec-5b-31', number: '3.1', title: '3.1 General Criteria Covered', chars: 700 },
                { id: 'sec-5b-41', number: '4.1', title: '4.1 General Criteria Not Covered', chars: 700 },
                { id: 'sec-5b-42', number: '4.2', title: '4.2 Specific Criteria Not Covered', chars: 680 },
                { id: 'sec-5b-421', number: '4.2.1', title: '4.2.1 Specific Criteria Not Covered by Medicaid', chars: 650 },
              ],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveCoverageFrame('Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?');

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('5B');
    expect(frame.route.lane).toBe('baseline_hybrid');
    expect(frame.route.determinism_hints.cite_scope_and_not_covered).toBe(true);
    expect(frame.primarySections.map((section) => section.sectionNumber)).toEqual(
      expect.arrayContaining(['2.1.1', '4.1']),
    );
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
      expect.arrayContaining([
        'Information:',
        'Attachment E: Requesting Unlisted Orthotics and Prosthetics for Adults',
      ]),
    );
  });

  it('resolveCoverageFrame routes outpatient pharmacy exclusion questions to Policy 9 instead of Medicare Part D manuals', async () => {
    const policy9Sections = [
      {
        id: 'sec-9-211',
        title: '2.1.1 Description of the Procedure, Product, or Service',
        sectionNumber: '2.1.1',
        content: 'The outpatient pharmacy benefit covers prescribed drugs within the NC Medicaid pharmacy program.',
      },
      {
        id: 'sec-9-41',
        title: '4.1 General Criteria Not Covered',
        sectionNumber: '4.1',
        content:
          'The procedure, product, or service is not covered when it is experimental, investigational, or part of a clinical trial.',
      },
    ];
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-9-41',
              sectionNumber: '4.1',
              sectionTitle: '4.1 General Criteria Not Covered',
              documentTitle: 'Outpatient Pharmacy',
              policyNumber: '9',
              documentType: 'clinical_policy',
              content:
                'The procedure, product, or service is not covered when it is experimental, investigational, or part of a clinical trial.',
              score: 0.72,
            }),
            mockRecord({
              sectionId: 'sec-9-211',
              sectionNumber: '2.1.1',
              sectionTitle: '2.1.1 Description of the Procedure, Product, or Service',
              documentTitle: 'Outpatient Pharmacy',
              policyNumber: '9',
              documentType: 'clinical_policy',
              content: 'The outpatient pharmacy benefit covers prescribed drugs within the NC Medicaid pharmacy program.',
              score: 0.69,
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('dhhs_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-ma-2312',
              sectionNumber: 'B',
              sectionTitle: 'B. Non-Covered Drugs',
              documentTitle: 'MA-2312 Medicare Prescription Drug Benefit',
              policyNumber: 'MA-2312',
              documentType: 'dhhs_policy',
              content: 'Non-covered drugs are not covered by Medicaid in the Medicare prescription-drug context.',
              score: 0.99,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '9',
        result: {
          records: [
            mockRecord({
              id: 'doc-9',
              title: 'Outpatient Pharmacy',
              documentType: 'clinical_policy',
              policyNumber: '9',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/policy-9',
              status: 'current',
              sections: policy9Sections.map((section) => ({
                id: section.id,
                number: section.sectionNumber,
                title: section.title,
                chars: section.content.length,
              })),
            }),
          ],
        },
      },
      ...policy9Sections.map((section) => ({
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === section.id,
        result: {
          records: [
            mockRecord({
              ...section,
              documentId: 'doc-9',
              documentTitle: 'Outpatient Pharmacy',
              documentType: 'clinical_policy',
              policyNumber: '9',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/policy-9',
              status: 'current',
            }),
          ],
        },
      })),
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-9',
        result: {
          records: [
            mockRecord({
              id: 'doc-9',
              title: 'Outpatient Pharmacy',
              documentType: 'clinical_policy',
              policyNumber: '9',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/policy-9',
              status: 'current',
              sections: policy9Sections.map((section) => ({
                id: section.id,
                number: section.sectionNumber,
                title: section.title,
                chars: section.content.length,
              })),
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveCoverageFrame(
      'Are experimental or investigational drugs covered under the NC Medicaid outpatient pharmacy benefit?',
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('9');
    expect(frame.authoritativeDocuments.map((document) => document.policyNumber)).not.toContain('MA-2312');
    expect(frame.primarySections.map((section) => section.sectionNumber)).toEqual(
      expect.arrayContaining(['4.1']),
    );
    const exclusionSection = frame.primarySections.find((section) => section.sectionNumber === '4.1');
    expect(exclusionSection?.content).toContain('experimental, investigational');
  });

  it('resolveAnswerFrame routes CAP/DA home-modification requirements into a coverage frame with MDT support evidence', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-appendix',
              sectionNumber: null,
              sectionTitle: 'EQUIPMENT, MODIFICAITON AND TECHNOLOGY',
              documentTitle: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content:
                'A primary private residence where the CAP/DA beneficiary resides that is owned by the beneficiary or family; a rented residence when the modifications are portable; installation and repairs of ramps and grab bars.',
              score: 0.97,
            }),
            mockRecord({
              sectionId: 'sec-home-mod',
              sectionNumber: '5.9.1',
              sectionTitle: '5.9.1 Equipment, Modification, Technology and Supplies',
              documentTitle: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content:
                "A recommendation by the MDT that identifies the beneficiary's need for the home modification being requested. The recommendation must state the cost of the item. A training plan must be documented as completed and signed by the beneficiary or responsible party.",
              score: 0.96,
            }),
            mockRecord({
              sectionId: 'sec-mdt',
              sectionNumber: '3.4.5',
              sectionTitle: '3.4.5 Equipment, Modification and Technology',
              documentTitle: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content:
                "The service must improve, maximize, or enhance the beneficiary's mobility, safety, independence, community integration, environmental accessibility, or address 24-hours-a-day coverage concerns.",
              score: 0.84,
            }),
            mockRecord({
              sectionId: 'sec-plan',
              sectionNumber: '5.4.2',
              sectionTitle: '5.4.2 CAP/DA Person-Centered Service Plan Requirements',
              documentTitle: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content:
                "Summarize the evaluation and assessment information and develop a comprehensive list of CAP/DA waiver services in the person's service plan.",
              score: 0.91,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '3K-2',
        result: {
          records: [
            mockRecord({
              id: 'doc-3k2',
              title: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3k-2',
              status: 'current',
              sections: [
                { id: 'sec-appendix', number: null, title: 'EQUIPMENT, MODIFICAITON AND TECHNOLOGY' },
                { id: 'sec-home-mod', number: '5.9.1', title: 'Home Modifications' },
                { id: 'sec-mdt', number: '3.4.5', title: '3.4.5 Equipment, Modification and Technology' },
                { id: 'sec-plan', number: '5.4.2', title: '5.4.2 CAP/DA Person-Centered Service Plan Requirements' },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-appendix',
        result: {
          records: [
            mockRecord({
              id: 'sec-appendix',
              title: 'EQUIPMENT, MODIFICAITON AND TECHNOLOGY',
              sectionNumber: null,
              content:
                'A primary private residence where the CAP/DA beneficiary resides that is owned by the beneficiary or family; a rented residence when the modifications are portable; installation and repairs of ramps and grab bars.',
              documentId: 'doc-3k2',
              documentTitle: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3k-2',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-home-mod',
        result: {
          records: [
            mockRecord({
              id: 'sec-home-mod',
              title: '5.9.1 Equipment, Modification, Technology and Supplies',
              sectionNumber: '5.9.1',
              content:
                "A recommendation by the MDT that identifies the beneficiary's need for the home modification being requested. The recommendation must state the cost of the item. A training plan must be documented as completed and signed by the beneficiary or responsible party.",
              documentId: 'doc-3k2',
              documentTitle: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3k-2',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-mdt',
        result: {
          records: [
            mockRecord({
              id: 'sec-mdt',
              title: '3.4.5 Equipment, Modification and Technology',
              sectionNumber: '3.4.5',
              content:
                "The service must improve, maximize, or enhance the beneficiary's mobility, safety, independence, community integration, environmental accessibility, or address 24-hours-a-day coverage concerns.",
              documentId: 'doc-3k2',
              documentTitle: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3k-2',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-plan',
        result: {
          records: [
            mockRecord({
              id: 'sec-plan',
              title: '5.4.2 CAP/DA Person-Centered Service Plan Requirements',
              sectionNumber: '5.4.2',
              content:
                "Summarize the evaluation and assessment information and develop a comprehensive list of CAP/DA waiver services in the person's service plan.",
              documentId: 'doc-3k2',
              documentTitle: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3k-2',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-3k2',
        result: {
          records: [
            mockRecord({
              id: 'doc-3k2',
              title: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3k-2',
              status: 'current',
              sections: [
                { id: 'sec-appendix', number: null, title: 'EQUIPMENT, MODIFICAITON AND TECHNOLOGY', chars: 1800 },
                { id: 'sec-home-mod', number: '5.9.1', title: '5.9.1 Equipment, Modification, Technology and Supplies', chars: 1300 },
                { id: 'sec-mdt', number: '3.4.5', title: '3.4.5 Equipment, Modification and Technology', chars: 900 },
                { id: 'sec-plan', number: '5.4.2', title: '5.4.2 CAP/DA Person-Centered Service Plan Requirements', chars: 1100 },
              ],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveAnswerFrame({
      query:
        'What are the requirements for home modifications under CAP/DA, and what documentation must the Multidisciplinary Team provide?',
    });

    expect(frame.questionType).toBe('coverage');
    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('3K-2');
    expect(frame.primarySections.map((section) => section.sectionNumber)).toContain('5.9.1');
    expect(frame.supportingSections.map((section) => section.sectionNumber)).toContain('3.4.5');
  });

  it('resolveCoverageFrame pairs EPSDT coverage with pediatric therapy sections from the preferred document', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-federal-noise',
              sectionNumber: '1935',
              sectionTitle: 'Section 1935. Special provisions relating to medicare prescription drug benefit',
              documentTitle: 'Social Security Act — Title XIX (Medicaid)',
              policyNumber: 'SSA-Title-19',
              documentType: 'federal_statute',
              content: 'A noisy federal result.',
              score: 0.99,
            }),
            mockRecord({
              sectionId: 'sec-st',
              sectionNumber: '3.2.1.3',
              sectionTitle: '3.2.1.3 Speech -Language Therapy (ST)',
              documentTitle: 'Clinical Coverage Policy 10A',
              policyNumber: '10A',
              documentType: 'clinical_policy',
              content: 'Speech-language therapy is covered for beneficiaries under 21 when EPSDT criteria are met.',
              score: 0.95,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '10A',
        result: {
          records: [
            mockRecord({
              id: 'doc-10a',
              title: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-02-01',
              url: 'https://example.com/10A',
              status: 'current',
              sections: [
                { id: 'sec-epsdt', number: '2.2.1', title: '2.2.1 EPSDT Special Provision: Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age' },
                { id: 'sec-st', number: '3.2.1.3', title: '3.2.1.3 Speech -Language Therapy (ST)' },
                { id: 'sec-aud', number: '3.2.1.4', title: '3.2.1.4 Audiology Therapy (Aural Rehabilitation)' },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-epsdt',
        result: {
          records: [
            mockRecord({
              id: 'sec-epsdt',
              title: '2.2.1 EPSDT Special Provision: Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age',
              sectionNumber: '2.2.1',
              content: 'EPSDT allows medically necessary services for beneficiaries under 21 even when those services exceed policy limitations.',
              documentId: 'doc-10a',
              documentTitle: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-02-01',
              url: 'https://example.com/10A',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-st',
        result: {
          records: [
            mockRecord({
              id: 'sec-st',
              title: '3.2.1.3 Speech -Language Therapy (ST)',
              sectionNumber: '3.2.1.3',
              content: 'Speech-language therapy is covered for beneficiaries under 21 when EPSDT criteria are met.',
              documentId: 'doc-10a',
              documentTitle: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-02-01',
              url: 'https://example.com/10A',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-aud',
        result: {
          records: [
            mockRecord({
              id: 'sec-aud',
              title: '3.2.1.4 Audiology Therapy (Aural Rehabilitation)',
              sectionNumber: '3.2.1.4',
              content: 'Audiology services are covered for beneficiaries under 21 when EPSDT criteria are met.',
              documentId: 'doc-10a',
              documentTitle: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-02-01',
              url: 'https://example.com/10A',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-10a',
        result: {
          records: [
            mockRecord({
              id: 'doc-10a',
              title: 'Clinical Coverage Policy 10A',
              documentType: 'clinical_policy',
              policyNumber: '10A',
              effectiveDate: '2025-02-01',
              url: 'https://example.com/10A',
              status: 'current',
              sections: [
                { id: 'sec-epsdt', number: '2.2.1', title: '2.2.1 EPSDT Special Provision: Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age', chars: 1200 },
                { id: 'sec-st', number: '3.2.1.3', title: '3.2.1.3 Speech -Language Therapy (ST)', chars: 900 },
                { id: 'sec-aud', number: '3.2.1.4', title: '3.2.1.4 Audiology Therapy (Aural Rehabilitation)', chars: 900 },
              ],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveCoverageFrame(
      'How does the EPSDT special provision affect coverage for outpatient therapy services for Medicaid beneficiaries under age 21?',
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('10A');
    expect(
      [...frame.primarySections, ...frame.supportingSections].map((section) => section.sectionNumber),
    ).toEqual(expect.arrayContaining(['2.2.1', '3.2.1.3', '3.2.1.4']));
  });

  it('resolveCoverageFrame infers the governing policy document and promotes general/not-covered sections over attachments', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-attach-e',
              sectionNumber: 'Attachment E',
              sectionTitle: 'Attachment E: Requesting Unlisted Orthotics and Prosthetics for Adults',
              documentTitle: 'Orthotics & Prosthetics',
              policyNumber: '5B',
              documentType: 'clinical_policy',
              content: 'Providers request unlisted orthotics and prosthetics using the adult attachment.',
              score: 0.97,
            }),
            mockRecord({
              sectionId: 'sec-attach-c',
              sectionNumber: 'Attachment C',
              sectionTitle: 'Attachment C: Completing a Claim for Orthotic or Prosthetic Services',
              documentTitle: 'Orthotics & Prosthetics',
              policyNumber: '5B',
              documentType: 'clinical_policy',
              content: 'Providers submit claims using the attachment process.',
              score: 0.95,
            }),
            mockRecord({
              sectionId: 'sec-421',
              sectionNumber: '4.2.1',
              sectionTitle: '4.2.1 Specific Criteria Not Covered by Medicaid',
              documentTitle: 'Orthotics & Prosthetics',
              policyNumber: '5B',
              documentType: 'clinical_policy',
              content: 'Comfort or convenience devices and backup devices are not covered.',
              score: 0.91,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '5B',
        result: {
          records: [
            mockRecord({
              id: 'doc-5b',
              title: 'Orthotics & Prosthetics',
              documentType: 'clinical_policy',
              policyNumber: '5B',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/5B',
              status: 'current',
              sections: [
                { id: 'sec-31', number: '3.1', title: '3.1 General Criteria Covered' },
                { id: 'sec-321', number: '3.2.1', title: '3.2.1 Specific criteria covered by Medicaid' },
                { id: 'sec-41', number: '4.1', title: '4.1 General Criteria Not Covered' },
                { id: 'sec-421', number: '4.2.1', title: '4.2.1 Specific Criteria Not Covered by Medicaid' },
                { id: 'sec-attach-c', number: 'Attachment C', title: 'Attachment C: Completing a Claim for Orthotic or Prosthetic Services' },
                { id: 'sec-attach-e', number: 'Attachment E', title: 'Attachment E: Requesting Unlisted Orthotics and Prosthetics for Adults' },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-31',
        result: {
          records: [
            mockRecord({
              id: 'sec-31',
              title: '3.1 General Criteria Covered',
              sectionNumber: '3.1',
              content: 'General criteria must be met before coverage is available.',
              documentId: 'doc-5b',
              documentTitle: 'Orthotics & Prosthetics',
              documentType: 'clinical_policy',
              policyNumber: '5B',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/5B',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-321',
        result: {
          records: [
            mockRecord({
              id: 'sec-321',
              title: '3.2.1 Specific criteria covered by Medicaid',
              sectionNumber: '3.2.1',
              content: 'Orthotic and prosthetic items are covered when the medical-necessity criteria are met.',
              documentId: 'doc-5b',
              documentTitle: 'Orthotics & Prosthetics',
              documentType: 'clinical_policy',
              policyNumber: '5B',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/5B',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-41',
        result: {
          records: [
            mockRecord({
              id: 'sec-41',
              title: '4.1 General Criteria Not Covered',
              sectionNumber: '4.1',
              content: 'Items that do not meet the policy criteria are not covered.',
              documentId: 'doc-5b',
              documentTitle: 'Orthotics & Prosthetics',
              documentType: 'clinical_policy',
              policyNumber: '5B',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/5B',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-421',
        result: {
          records: [
            mockRecord({
              id: 'sec-421',
              title: '4.2.1 Specific Criteria Not Covered by Medicaid',
              sectionNumber: '4.2.1',
              content: 'Comfort or convenience devices and backup devices are not covered.',
              documentId: 'doc-5b',
              documentTitle: 'Orthotics & Prosthetics',
              documentType: 'clinical_policy',
              policyNumber: '5B',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/5B',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-attach-c',
        result: {
          records: [
            mockRecord({
              id: 'sec-attach-c',
              title: 'Attachment C: Completing a Claim for Orthotic or Prosthetic Services',
              sectionNumber: 'Attachment C',
              content: 'Billing and submission instructions.',
              documentId: 'doc-5b',
              documentTitle: 'Orthotics & Prosthetics',
              documentType: 'clinical_policy',
              policyNumber: '5B',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/5B',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-attach-e',
        result: {
          records: [
            mockRecord({
              id: 'sec-attach-e',
              title: 'Attachment E: Requesting Unlisted Orthotics and Prosthetics for Adults',
              sectionNumber: 'Attachment E',
              content: 'Request-process instructions for unlisted items.',
              documentId: 'doc-5b',
              documentTitle: 'Orthotics & Prosthetics',
              documentType: 'clinical_policy',
              policyNumber: '5B',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/5B',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-5b',
        result: {
          records: [
            mockRecord({
              id: 'doc-5b',
              title: 'Orthotics & Prosthetics',
              documentType: 'clinical_policy',
              policyNumber: '5B',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/5B',
              status: 'current',
              sections: [
                { id: 'sec-31', number: '3.1', title: '3.1 General Criteria Covered', chars: 1200 },
                { id: 'sec-321', number: '3.2.1', title: '3.2.1 Specific criteria covered by Medicaid', chars: 1000 },
                { id: 'sec-41', number: '4.1', title: '4.1 General Criteria Not Covered', chars: 900 },
                { id: 'sec-421', number: '4.2.1', title: '4.2.1 Specific Criteria Not Covered by Medicaid', chars: 850 },
                { id: 'sec-attach-c', number: 'Attachment C', title: 'Attachment C: Completing a Claim for Orthotic or Prosthetic Services', chars: 800 },
                { id: 'sec-attach-e', number: 'Attachment E', title: 'Attachment E: Requesting Unlisted Orthotics and Prosthetics for Adults', chars: 850 },
              ],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveCoverageFrame(
      'What DME items are specifically NOT covered by NC Medicaid under the Orthotics and Prosthetics policy, and what general criteria must be met for coverage?',
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('5B');
    expect(frame.primarySections.map((section) => section.sectionNumber)).toEqual(expect.arrayContaining(['4.1', '4.2.1']));
    expect(frame.primarySections.every((section) => !String(section.sectionNumber).startsWith('Attachment'))).toBe(true);
    expect(frame.supportingSections.map((section) => section.sectionNumber)).toEqual(expect.arrayContaining(['3.1', '3.2.1']));
  });

  it('resolveCoverageFrame keeps CAP/DA general eligibility questions on broad eligibility sections instead of reimbursement or provider operations', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-3k2-321',
              sectionNumber: '3.2.1',
              sectionTitle: '3.2.1 Specific criteria covered by Medicaid',
              documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content: 'CAP/DA specific criteria include nursing facility level of care and a service plan.',
              score: 0.99,
            }),
            mockRecord({
              sectionId: 'sec-3k2-desc',
              sectionNumber: '1.0',
              sectionTitle: 'Description of the Procedure, Product, or Service',
              documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content: 'The CAP/DA waiver serves adults with disabilities 18 years of age and older who are at risk of institutionalization.',
              score: 0.98,
            }),
            mockRecord({
              sectionId: 'sec-3k2-claim',
              sectionNumber: null,
              sectionTitle: 'CAP/DA Claim Reimbursement',
              documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content: 'Prepare a paper claim for the service.',
              score: 0.97,
            }),
            mockRecord({
              sectionId: 'sec-3k2-41',
              sectionNumber: '4.1',
              sectionTitle: '4.1 General Criteria Not Covered',
              documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content: 'The beneficiary does not meet the eligibility requirements listed in Section 2.0.',
              score: 0.96,
            }),
            mockRecord({
              sectionId: 'sec-3k2-641',
              sectionNumber: '6.4.1',
              sectionTitle: '6.4.1 CAP/DA Mandated Requirements to be an Appointed Case Management Entity',
              documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content: 'Case management entities must maintain an advisory committee.',
              score: 0.95,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '3K-2',
        result: {
          records: [
            mockRecord({
              id: 'doc-3k2',
              title: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-09-01',
              url: 'https://example.com/3k-2',
              status: 'current',
              sections: [
                { id: 'sec-3k2-desc', number: '1.0', title: 'Description of the Procedure, Product, or Service', chars: 900 },
                { id: 'sec-3k2-211', number: '2.1.1', title: '2.1.1 General', chars: 900 },
                { id: 'sec-3k2-31', number: '3.1', title: '3.1 General Criteria Covered', chars: 900 },
                { id: 'sec-3k2-321', number: '3.2.1', title: '3.2.1 Specific criteria covered by Medicaid', chars: 900 },
                { id: 'sec-3k2-41', number: '4.1', title: '4.1 General Criteria Not Covered', chars: 900 },
                { id: 'sec-3k2-641', number: '6.4.1', title: '6.4.1 CAP/DA Mandated Requirements to be an Appointed Case Management Entity', chars: 900 },
                { id: 'sec-3k2-claim', number: null, title: 'CAP/DA Claim Reimbursement', chars: 900 },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3k2-desc',
        result: {
          records: [
            mockRecord({
              id: 'sec-3k2-desc',
              title: 'Description of the Procedure, Product, or Service',
              sectionNumber: '1.0',
              content: 'The CAP/DA waiver serves adults with disabilities 18 years of age and older who are at risk of institutionalization.',
              documentId: 'doc-3k2',
              documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-09-01',
              url: 'https://example.com/3k-2',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3k2-211',
        result: {
          records: [
            mockRecord({
              id: 'sec-3k2-211',
              title: '2.1.1 General',
              sectionNumber: '2.1.1',
              content: 'An eligible beneficiary shall be enrolled in the NC Medicaid Program and may have service restrictions due to the eligibility category.',
              documentId: 'doc-3k2',
              documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-09-01',
              url: 'https://example.com/3k-2',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3k2-31',
        result: {
          records: [
            mockRecord({
              id: 'sec-3k2-31',
              title: '3.1 General Criteria Covered',
              sectionNumber: '3.1',
              content: 'The procedure or service must be individualized, safely furnished, and not primarily for convenience.',
              documentId: 'doc-3k2',
              documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-09-01',
              url: 'https://example.com/3k-2',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3k2-321',
        result: {
          records: [
            mockRecord({
              id: 'sec-3k2-321',
              title: '3.2.1 Specific criteria covered by Medicaid',
              sectionNumber: '3.2.1',
              content: 'CAP/DA specific criteria include nursing facility level of care and a service plan.',
              documentId: 'doc-3k2',
              documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-09-01',
              url: 'https://example.com/3k-2',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3k2-41',
        result: {
          records: [
            mockRecord({
              id: 'sec-3k2-41',
              title: '4.1 General Criteria Not Covered',
              sectionNumber: '4.1',
              content: 'The beneficiary does not meet the eligibility requirements listed in Section 2.0.',
              documentId: 'doc-3k2',
              documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-09-01',
              url: 'https://example.com/3k-2',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3k2-641',
        result: {
          records: [
            mockRecord({
              id: 'sec-3k2-641',
              title: '6.4.1 CAP/DA Mandated Requirements to be an Appointed Case Management Entity',
              sectionNumber: '6.4.1',
              content: 'Case management entities must maintain an advisory committee.',
              documentId: 'doc-3k2',
              documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-09-01',
              url: 'https://example.com/3k-2',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3k2-claim',
        result: {
          records: [
            mockRecord({
              id: 'sec-3k2-claim',
              title: 'CAP/DA Claim Reimbursement',
              sectionNumber: null,
              content: 'Prepare a paper claim for the service.',
              documentId: 'doc-3k2',
              documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-09-01',
              url: 'https://example.com/3k-2',
              status: 'current',
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveCoverageFrame('What are the general eligibility criteria for CAP/DA services under NC Medicaid?');

    expect(frame.primarySections.map((section) => section.sectionNumber)).toEqual(
      expect.arrayContaining(['2.1.1', '3.1', '3.2.1']),
    );
    expect(frame.primarySections.map((section) => section.title)).not.toContain('CAP/DA Claim Reimbursement');
    expect([...frame.primarySections, ...frame.supportingSections].some((section) => (section.content ?? '').includes('18 years of age'))).toBe(true);
    expect(frame.avoidSections.map((section) => section.title)).toEqual(
      expect.arrayContaining([
        'CAP/DA Claim Reimbursement',
        '6.4.1 CAP/DA Mandated Requirements to be an Appointed Case Management Entity',
      ]),
    );
  });

  it('resolveCoverageFrame prefers the congregate sibling policy for assisted-living PCS questions without explicit policy numbers', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-3l1-33',
              sectionNumber: '3.3',
              sectionTitle: '3.3 Personal Care Services',
              documentTitle: 'PCS in Congregate Settings',
              policyNumber: '3L-1',
              documentType: 'clinical_policy',
              content: 'This section governs PCS provided in assisted living and other congregate settings.',
              score: 0.98,
            }),
            mockRecord({
              sectionId: 'sec-3l-33',
              sectionNumber: '3.3',
              sectionTitle: '3.3 Personal Care Services in In-Home Settings',
              documentTitle: 'State Plan PCS',
              policyNumber: '3L',
              documentType: 'clinical_policy',
              content: 'This section governs PCS provided in the beneficiary home.',
              score: 0.95,
            }),
            mockRecord({
              sectionId: 'sec-3l1-321',
              sectionNumber: '3.2.1',
              sectionTitle: '3.2.1 Specific criteria covered by Medicaid',
              documentTitle: 'PCS in Congregate Settings',
              policyNumber: '3L-1',
              documentType: 'clinical_policy',
              content: 'PCS is covered in congregate settings when the policy criteria are met.',
              score: 0.94,
            }),
            mockRecord({
              sectionId: 'sec-3l1-4212',
              sectionNumber: '4.2.1.2',
              sectionTitle: 'Room and Board',
              documentTitle: 'PCS in Congregate Settings',
              policyNumber: '3L-1',
              documentType: 'clinical_policy',
              content: 'Room and board and non-PCS supports are not covered.',
              score: 0.9,
            }),
            mockRecord({
              sectionId: 'sec-3l1-543',
              sectionNumber: '5.4.3',
              sectionTitle: '5.4.3 Requirements for PCS Eligibility Assessments',
              documentTitle: 'PCS in Congregate Settings',
              policyNumber: '3L-1',
              documentType: 'clinical_policy',
              content: 'Assessment workflow for PCS eligibility.',
              score: 0.97,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '3L-1',
        result: {
          records: [
            mockRecord({
              id: 'doc-3l1',
              title: 'PCS in Congregate Settings',
              documentType: 'clinical_policy',
              policyNumber: '3L-1',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3L-1',
              status: 'current',
              sections: [
                { id: 'sec-3l1-33', number: '3.3', title: '3.3 Personal Care Services' },
                { id: 'sec-3l1-321', number: '3.2.1', title: '3.2.1 Specific criteria covered by Medicaid' },
                { id: 'sec-3l1-4212', number: '4.2.1.2', title: 'Room and Board' },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '3L',
        result: {
          records: [
            mockRecord({
              id: 'doc-3l',
              title: 'State Plan PCS',
              documentType: 'clinical_policy',
              policyNumber: '3L',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3L',
              status: 'current',
              sections: [{ id: 'sec-3l-33', number: '3.3', title: '3.3 Personal Care Services in In-Home Settings' }],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3l1-33',
        result: {
          records: [
            mockRecord({
              id: 'sec-3l1-33',
              title: '3.3 Personal Care Services',
              sectionNumber: '3.3',
              content: 'This section governs PCS provided in assisted living and other congregate settings.',
              documentId: 'doc-3l1',
              documentTitle: 'PCS in Congregate Settings',
              documentType: 'clinical_policy',
              policyNumber: '3L-1',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3L-1',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3l1-321',
        result: {
          records: [
            mockRecord({
              id: 'sec-3l1-321',
              title: '3.2.1 Specific criteria covered by Medicaid',
              sectionNumber: '3.2.1',
              content: 'PCS is covered in congregate settings when the policy criteria are met.',
              documentId: 'doc-3l1',
              documentTitle: 'PCS in Congregate Settings',
              documentType: 'clinical_policy',
              policyNumber: '3L-1',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3L-1',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3l-33',
        result: {
          records: [
            mockRecord({
              id: 'sec-3l-33',
              title: '3.3 Personal Care Services in In-Home Settings',
              sectionNumber: '3.3',
              content: 'This section governs PCS provided in the beneficiary home.',
              documentId: 'doc-3l',
              documentTitle: 'State Plan PCS',
              documentType: 'clinical_policy',
              policyNumber: '3L',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3L',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3l1-4212',
        result: {
          records: [
            mockRecord({
              id: 'sec-3l1-4212',
              title: 'Room and Board',
              sectionNumber: '4.2.1.2',
              content: 'Room and board and non-PCS supports are not covered.',
              documentId: 'doc-3l1',
              documentTitle: 'PCS in Congregate Settings',
              documentType: 'clinical_policy',
              policyNumber: '3L-1',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3L-1',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3l1-543',
        result: {
          records: [
            mockRecord({
              id: 'sec-3l1-543',
              title: '5.4.3 Requirements for PCS Eligibility Assessments',
              sectionNumber: '5.4.3',
              content: 'Assessment workflow for PCS eligibility.',
              documentId: 'doc-3l1',
              documentTitle: 'PCS in Congregate Settings',
              documentType: 'clinical_policy',
              policyNumber: '3L-1',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3L-1',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-3l1',
        result: {
          records: [
            mockRecord({
              id: 'doc-3l1',
              title: 'PCS in Congregate Settings',
              documentType: 'clinical_policy',
              policyNumber: '3L-1',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3L-1',
              status: 'current',
              sections: [
                { id: 'sec-3l1-33', number: '3.3', title: '3.3 Personal Care Services', chars: 1000 },
                { id: 'sec-3l1-321', number: '3.2.1', title: '3.2.1 Specific criteria covered by Medicaid', chars: 900 },
                { id: 'sec-3l1-4212', number: '4.2.1.2', title: 'Room and Board', chars: 700 },
                { id: 'sec-3l1-543', number: '5.4.3', title: '5.4.3 Requirements for PCS Eligibility Assessments', chars: 750 },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-3l',
        result: {
          records: [
            mockRecord({
              id: 'doc-3l',
              title: 'State Plan PCS',
              documentType: 'clinical_policy',
              policyNumber: '3L',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3L',
              status: 'current',
              sections: [{ id: 'sec-3l-33', number: '3.3', title: '3.3 Personal Care Services in In-Home Settings', chars: 1000 }],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveCoverageFrame(
      'Does NC Medicaid cover Personal Care Services for beneficiaries who live in an assisted living facility?',
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('3L-1');
    expect(frame.route.lane).toBe('baseline_hybrid');
    expect(frame.variantReasoning).toContain('congregate');
    expect(frame.primarySections[0]?.policyNumber).toBe('3L-1');
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.sectionNumber)).toEqual(
      expect.arrayContaining(['3.2.1', '3.3', '4.2.1.2']),
    );
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.sectionNumber)).not.toContain('5.4.3');
    expect(frame.avoidSections.map((section) => section.sectionNumber)).toContain('5.4.3');
    expect(frame.primarySections.every((section) => section.policyNumber === '3L-1')).toBe(true);
  });

  it('resolveCoverageFrame promotes specific ambulance non-covered subsections over general exclusions', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-15-41',
              sectionNumber: '4.1',
              sectionTitle: '4.1 General Criteria Not Covered',
              documentTitle: 'Ambulance Services',
              policyNumber: '15',
              documentType: 'clinical_policy',
              content: 'General ambulance exclusions.',
              score: 0.95,
            }),
            mockRecord({
              sectionId: 'sec-15-4214',
              sectionNumber: '4.2.1.4',
              sectionTitle: 'Other Non-Covered Ambulance Services',
              documentTitle: 'Ambulance Services',
              policyNumber: '15',
              documentType: 'clinical_policy',
              content: 'False alarm calls, patient refusal, waiting fees, and similar services are not covered.',
              score: 0.93,
            }),
            mockRecord({
              sectionId: 'sec-15-3211',
              sectionNumber: '3.2.1.1',
              sectionTitle: 'Air Medical Ambulance',
              documentTitle: 'Ambulance Services',
              policyNumber: '15',
              documentType: 'clinical_policy',
              content: 'Air ambulance is covered only when ground transport is contraindicated or impractical.',
              score: 0.88,
            }),
            mockRecord({
              sectionId: 'sec-ma3550-j',
              sectionNumber: null,
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
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '15',
        result: {
          records: [
            mockRecord({
              id: 'doc-15',
              title: 'Ambulance Services',
              documentType: 'clinical_policy',
              policyNumber: '15',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/15',
              status: 'current',
              sections: [
                { id: 'sec-15-3211', number: '3.2.1.1', title: 'Air Medical Ambulance' },
                { id: 'sec-15-41', number: '4.1', title: '4.1 General Criteria Not Covered' },
                { id: 'sec-15-4214', number: '4.2.1.4', title: 'Other Non-Covered Ambulance Services' },
              ],
            }),
          ],
        },
      },
      ...[
        {
          id: 'sec-15-3211',
          title: 'Air Medical Ambulance',
          sectionNumber: '3.2.1.1',
          content: 'Air ambulance is covered only when ground transport is contraindicated or impractical.',
        },
        {
          id: 'sec-15-41',
          title: '4.1 General Criteria Not Covered',
          sectionNumber: '4.1',
          content: 'General ambulance exclusions.',
        },
        {
          id: 'sec-15-4214',
          title: 'Other Non-Covered Ambulance Services',
          sectionNumber: '4.2.1.4',
          content: 'False alarm calls, patient refusal, waiting fees, and similar services are not covered.',
        },
      ].map((section) => ({
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === section.id,
        result: {
          records: [
            mockRecord({
              ...section,
              documentId: 'doc-15',
              documentTitle: 'Ambulance Services',
              documentType: 'clinical_policy',
              policyNumber: '15',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/15',
              status: 'current',
            }),
          ],
        },
      })),
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-15',
        result: {
          records: [
            mockRecord({
              id: 'doc-15',
              title: 'Ambulance Services',
              documentType: 'clinical_policy',
              policyNumber: '15',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/15',
              status: 'current',
              sections: [
                { id: 'sec-15-3211', number: '3.2.1.1', title: 'Air Medical Ambulance', chars: 800 },
                { id: 'sec-15-41', number: '4.1', title: '4.1 General Criteria Not Covered', chars: 700 },
                { id: 'sec-15-4214', number: '4.2.1.4', title: 'Other Non-Covered Ambulance Services', chars: 900 },
              ],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveCoverageFrame('What ambulance services are NOT covered by NC Medicaid?');

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('15');
    expect(frame.primarySections.map((section) => section.sectionNumber)).toContain('4.2.1.4');
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.sectionNumber)).toContain('3.2.1.1');
    expect(frame.primarySections.map((section) => section.sectionNumber)).not.toContain('4.1');
    expect(frame.avoidSections.map((section) => section.sectionNumber)).toContain('4.1');
  });

  it('resolveCoverageFrame surfaces hospice certification-source sections for terminal-illness questions', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-3d-timing',
              sectionNumber: '5.4.1',
              sectionTitle: '5.4.1 Timing of certification',
              documentTitle: 'Hospice Services',
              policyNumber: '3D',
              documentType: 'clinical_policy',
              content: 'The hospice provider shall obtain written certification of terminal illness for each benefit period.',
              score: 0.98,
            }),
            mockRecord({
              sectionId: 'sec-3d-sources',
              sectionNumber: '5.4.3',
              sectionTitle: '5.4.3 Sources of certification',
              documentTitle: 'Hospice Services',
              policyNumber: '3D',
              documentType: 'clinical_policy',
              content:
                'For the initial 90-day period, the hospice medical director or physician member of the IDG and the attending physician, if the beneficiary has one, must certify terminal illness.',
              score: 0.97,
            }),
            mockRecord({
              sectionId: 'sec-3d-rec',
              sectionNumber: null,
              sectionTitle: 'D. Certification and Recertification of Terminal Illness',
              documentTitle: 'Hospice Services',
              policyNumber: '3D',
              documentType: 'clinical_policy',
              content: 'The certification must include a narrative and supporting clinical findings.',
              score: 0.95,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '3D',
        result: {
          records: [
            mockRecord({
              id: 'doc-3d',
              title: 'Hospice Services',
              documentType: 'clinical_policy',
              policyNumber: '3D',
              effectiveDate: '2024-03-15',
              url: 'https://example.com/3d',
              status: 'current',
              sections: [
                { id: 'sec-3d-timing', number: '5.4.1', title: '5.4.1 Timing of certification' },
                { id: 'sec-3d-sources', number: '5.4.3', title: '5.4.3 Sources of certification' },
                { id: 'sec-3d-rec', number: null, title: 'D. Certification and Recertification of Terminal Illness' },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3d-timing',
        result: {
          records: [
            mockRecord({
              id: 'sec-3d-timing',
              title: '5.4.1 Timing of certification',
              sectionNumber: '5.4.1',
              content: 'The hospice provider shall obtain written certification of terminal illness for each benefit period.',
              documentId: 'doc-3d',
              documentTitle: 'Hospice Services',
              documentType: 'clinical_policy',
              policyNumber: '3D',
              effectiveDate: '2024-03-15',
              url: 'https://example.com/3d',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3d-sources',
        result: {
          records: [
            mockRecord({
              id: 'sec-3d-sources',
              title: '5.4.3 Sources of certification',
              sectionNumber: '5.4.3',
              content:
                'For the initial 90-day period, the hospice medical director or physician member of the IDG and the attending physician, if the beneficiary has one, must certify terminal illness.',
              documentId: 'doc-3d',
              documentTitle: 'Hospice Services',
              documentType: 'clinical_policy',
              policyNumber: '3D',
              effectiveDate: '2024-03-15',
              url: 'https://example.com/3d',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3d-rec',
        result: {
          records: [
            mockRecord({
              id: 'sec-3d-rec',
              title: 'D. Certification and Recertification of Terminal Illness',
              sectionNumber: null,
              content: 'The certification must include a narrative and supporting clinical findings.',
              documentId: 'doc-3d',
              documentTitle: 'Hospice Services',
              documentType: 'clinical_policy',
              policyNumber: '3D',
              effectiveDate: '2024-03-15',
              url: 'https://example.com/3d',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-3d',
        result: {
          records: [
            mockRecord({
              id: 'doc-3d',
              title: 'Hospice Services',
              documentType: 'clinical_policy',
              policyNumber: '3D',
              effectiveDate: '2024-03-15',
              url: 'https://example.com/3d',
              status: 'current',
              sections: [
                { id: 'sec-3d-timing', number: '5.4.1', title: '5.4.1 Timing of certification', chars: 1000 },
                { id: 'sec-3d-sources', number: '5.4.3', title: '5.4.3 Sources of certification', chars: 1000 },
                { id: 'sec-3d-rec', number: null, title: 'D. Certification and Recertification of Terminal Illness', chars: 900 },
              ],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveCoverageFrame(
      "How does NC Medicaid define 'terminally ill' for purposes of hospice eligibility, and what certification is required?",
    );

    expect(frame.questionType).toBe('coverage');
    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('3D');
    expect(frame.primarySections.map((section) => section.sectionNumber)).toContain('5.4.3');
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.title)).toContain(
      'D. Certification and Recertification of Terminal Illness',
    );
  });

  it('resolveCoverageFrame keeps HCWD income/premium questions on current MA-2180 while surfacing the earned-income-cap removal notice', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('dhhs_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-ma-income',
              sectionNumber: null,
              sectionTitle: 'F. Income',
              documentTitle: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES',
              policyNumber: 'MA-2180',
              documentType: 'dhhs_policy',
              content:
                'Those who have unearned incomes greater than 150% of FPL are not eligible for HCWD. Those whose total countable income is greater than 150% of FPL must pay a $50 annual enrollment fee. Those whose total countable monthly income exceeds 200% of FPL must pay a monthly premium.',
              score: 0.93,
            }),
            mockRecord({
              sectionId: 'sec-ma-premiums',
              sectionNumber: null,
              sectionTitle: 'I. Premiums',
              documentTitle: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES',
              policyNumber: 'MA-2180',
              documentType: 'dhhs_policy',
              content: 'The income ranges and associated premiums are found in the following chart.',
              score: 0.9,
            }),
            mockRecord({
              sectionId: 'sec-ma-process',
              sectionNumber: null,
              sectionTitle: '2. Determine if a Premium is due',
              documentTitle: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES',
              policyNumber: 'MA-2180',
              documentType: 'dhhs_policy',
              content:
                'Calculate the amount of total countable net earned and unearned income. If total countable monthly income exceeds 200% of FPL, a premium is required.',
              score: 0.94,
            }),
            mockRecord({
              sectionId: 'sec-2019-chart',
              sectionNumber: null,
              sectionTitle: '2019 HCWD Premiums (Effective April 1, 2019)',
              documentTitle: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES – 2019 HCWD Premiums',
              policyNumber: 'MA-2180',
              documentType: 'dhhs_policy',
              content: '2019 premium chart for HCWD beneficiaries.',
              score: 0.98,
            }),
            mockRecord({
              sectionId: 'sec-premium-notice',
              sectionNumber: null,
              sectionTitle: 'HEALTH COVERAGE FOR WORKERS WITH DISABILITIES PREMIUM NOTICE',
              documentTitle: 'dma-5146 Health Coverage for Workers with Disabilities Premium Notice',
              policyNumber: null,
              documentType: 'dhhs_policy',
              content: 'Premium payment notice form.',
              score: 0.97,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) =>
          query.includes("coalesce(d.status, '') = 'amendment'") &&
          query.includes("CONTAINS 'hcwd'"),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-cn-limit',
              sectionNumber: null,
              sectionTitle: 'A. MA-500, Classification, is revised in:',
              documentTitle: 'CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III',
              policyNumber: null,
              documentType: 'dhhs_policy',
              content:
                'I.B.1.c., to remove the 150% FPL income limit from policy; III.B.2., to state that the only income limit for the HCWD program is the 150% FPL limit on unearned income.',
              score: 0.72,
            }),
            mockRecord({
              sectionId: 'sec-cn-hcwd',
              sectionNumber: null,
              sectionTitle: 'D. MA-2180, Health Coverage for Workers with Disabilities, is revised in:',
              documentTitle: 'CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III',
              policyNumber: null,
              documentType: 'dhhs_policy',
              content:
                'II., to state that HCWD covers individuals regardless of total countable income; IV.E., to remove limits on countable income except for the 150% of Federal Poverty Level cap on unearned income and provide information about sliding scale premiums.',
              score: 0.71,
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === 'MA-2180',
        result: {
          records: [
            mockRecord({
              id: 'doc-ma2180',
              title: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES',
              documentType: 'dhhs_policy',
              policyNumber: 'MA-2180',
              effectiveDate: '2025-03-01',
              url: 'https://example.com/ma-2180',
              status: 'current',
              sections: [
                { id: 'sec-ma-income', number: null, title: 'F. Income' },
                { id: 'sec-ma-premiums', number: null, title: 'I. Premiums' },
                { id: 'sec-ma-process', number: null, title: '2. Determine if a Premium is due' },
              ],
            }),
            mockRecord({
              id: 'doc-ma2180-2019',
              title: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES – 2019 HCWD Premiums',
              documentType: 'dhhs_policy',
              policyNumber: 'MA-2180',
              effectiveDate: '2019-04-01',
              url: 'https://example.com/ma-2180-2019',
              status: 'current',
              sections: [{ id: 'sec-2019-chart', number: null, title: '2019 HCWD Premiums (Effective April 1, 2019)' }],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-ma-income',
        result: {
          records: [
            mockRecord({
              id: 'sec-ma-income',
              title: 'F. Income',
              sectionNumber: null,
              content:
                'Those who have unearned incomes greater than 150% of FPL are not eligible for HCWD. Those whose total countable income is greater than 150% of FPL must pay a $50 annual enrollment fee. Those whose total countable monthly income exceeds 200% of FPL must pay a monthly premium.',
              documentId: 'doc-ma2180',
              documentTitle: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES',
              documentType: 'dhhs_policy',
              policyNumber: 'MA-2180',
              effectiveDate: '2025-03-01',
              url: 'https://example.com/ma-2180',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-ma-premiums',
        result: {
          records: [
            mockRecord({
              id: 'sec-ma-premiums',
              title: 'I. Premiums',
              sectionNumber: null,
              content: 'The income ranges and associated premiums are found in the following chart.',
              documentId: 'doc-ma2180',
              documentTitle: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES',
              documentType: 'dhhs_policy',
              policyNumber: 'MA-2180',
              effectiveDate: '2025-03-01',
              url: 'https://example.com/ma-2180',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-ma-process',
        result: {
          records: [
            mockRecord({
              id: 'sec-ma-process',
              title: '2. Determine if a Premium is due',
              sectionNumber: null,
              content:
                'Calculate the amount of total countable net earned and unearned income. If total countable monthly income exceeds 200% of FPL, a premium is required.',
              documentId: 'doc-ma2180',
              documentTitle: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES',
              documentType: 'dhhs_policy',
              policyNumber: 'MA-2180',
              effectiveDate: '2025-03-01',
              url: 'https://example.com/ma-2180',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-2019-chart',
        result: {
          records: [
            mockRecord({
              id: 'sec-2019-chart',
              title: '2019 HCWD Premiums (Effective April 1, 2019)',
              sectionNumber: null,
              content: '2019 premium chart for HCWD beneficiaries.',
              documentId: 'doc-ma2180-2019',
              documentTitle: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES – 2019 HCWD Premiums',
              documentType: 'dhhs_policy',
              policyNumber: 'MA-2180',
              effectiveDate: '2019-04-01',
              url: 'https://example.com/ma-2180-2019',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-premium-notice',
        result: {
          records: [
            mockRecord({
              id: 'sec-premium-notice',
              title: 'HEALTH COVERAGE FOR WORKERS WITH DISABILITIES PREMIUM NOTICE',
              sectionNumber: null,
              content: 'Premium payment notice form.',
              documentId: 'doc-premium-notice',
              documentTitle: 'dma-5146 Health Coverage for Workers with Disabilities Premium Notice',
              documentType: 'dhhs_policy',
              policyNumber: null,
              effectiveDate: '2025-03-01',
              url: 'https://example.com/premium-notice',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-cn-limit',
        result: {
          records: [
            mockRecord({
              id: 'sec-cn-limit',
              title: 'A. MA-500, Classification, is revised in:',
              sectionNumber: null,
              content:
                'I.B.1.c., to remove the 150% FPL income limit from policy; III.B.2., to state that the only income limit for the HCWD program is the 150% FPL limit on unearned income.',
              documentId: 'doc-cn-0114',
              documentTitle: 'CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III',
              documentType: 'dhhs_policy',
              policyNumber: null,
              effectiveDate: '2014-04-01',
              url: 'https://example.com/cn-01-14',
              status: 'amendment',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-cn-hcwd',
        result: {
          records: [
            mockRecord({
              id: 'sec-cn-hcwd',
              title: 'D. MA-2180, Health Coverage for Workers with Disabilities, is revised in:',
              sectionNumber: null,
              content:
                'II., to state that HCWD covers individuals regardless of total countable income; IV.E., to remove limits on countable income except for the 150% of Federal Poverty Level cap on unearned income and provide information about sliding scale premiums.',
              documentId: 'doc-cn-0114',
              documentTitle: 'CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III',
              documentType: 'dhhs_policy',
              policyNumber: null,
              effectiveDate: '2014-04-01',
              url: 'https://example.com/cn-01-14',
              status: 'amendment',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-ma2180',
        result: {
          records: [
            mockRecord({
              id: 'doc-ma2180',
              title: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES',
              documentType: 'dhhs_policy',
              policyNumber: 'MA-2180',
              effectiveDate: '2025-03-01',
              url: 'https://example.com/ma-2180',
              status: 'current',
              sections: [
                { id: 'sec-ma-income', number: null, title: 'F. Income', chars: 1100 },
                { id: 'sec-ma-premiums', number: null, title: 'I. Premiums', chars: 1000 },
                { id: 'sec-ma-process', number: null, title: '2. Determine if a Premium is due', chars: 900 },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-ma2180-2019',
        result: {
          records: [
            mockRecord({
              id: 'doc-ma2180-2019',
              title: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES – 2019 HCWD Premiums',
              documentType: 'dhhs_policy',
              policyNumber: 'MA-2180',
              effectiveDate: '2019-04-01',
              url: 'https://example.com/ma-2180-2019',
              status: 'current',
              sections: [{ id: 'sec-2019-chart', number: null, title: '2019 HCWD Premiums (Effective April 1, 2019)', chars: 700 }],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-cn-0114',
        result: {
          records: [
            mockRecord({
              id: 'doc-cn-0114',
              title: 'CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III',
              documentType: 'dhhs_policy',
              policyNumber: null,
              effectiveDate: '2014-04-01',
              url: 'https://example.com/cn-01-14',
              status: 'amendment',
              sections: [
                { id: 'sec-cn-limit', number: null, title: 'A. MA-500, Classification, is revised in:', chars: 900 },
                { id: 'sec-cn-hcwd', number: null, title: 'D. MA-2180, Health Coverage for Workers with Disabilities, is revised in:', chars: 1200 },
              ],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveCoverageFrame(
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
  });

  it('resolvePriorAuthFrame prefers criteria sections over request-process attachments', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-criteria',
              sectionNumber: 'Attachment A',
              sectionTitle: 'Prior Approval Drugs and Criteria',
              documentTitle: 'Clinical Coverage Policy 9A',
              policyNumber: '9A',
              documentType: 'clinical_policy',
              content: 'The following drugs require prior approval and must meet these criteria...',
              score: 0.96,
            }),
            mockRecord({
              sectionId: 'sec-request',
              sectionNumber: 'Attachment B',
              sectionTitle: 'Prior Approval Request Process',
              documentTitle: 'Clinical Coverage Policy 9A',
              policyNumber: '9A',
              documentType: 'clinical_policy',
              content: 'Providers submit requests by fax using the attached form.',
              score: 0.9,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '9A',
        result: {
          records: [
            mockRecord({
              id: 'doc-9a',
              title: 'Clinical Coverage Policy 9A',
              documentType: 'clinical_policy',
              policyNumber: '9A',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/9A',
              status: 'current',
              sections: [
                { id: 'sec-criteria', number: 'Attachment A', title: 'Prior Approval Drugs and Criteria' },
                { id: 'sec-request', number: 'Attachment B', title: 'Prior Approval Request Process' },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-criteria',
        result: {
          records: [
            mockRecord({
              id: 'sec-criteria',
              title: 'Prior Approval Drugs and Criteria',
              sectionNumber: 'Attachment A',
              content: 'The following drugs require prior approval and must meet these criteria...',
              documentId: 'doc-9a',
              documentTitle: 'Clinical Coverage Policy 9A',
              documentType: 'clinical_policy',
              policyNumber: '9A',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/9A',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-request',
        result: {
          records: [
            mockRecord({
              id: 'sec-request',
              title: 'Prior Approval Request Process',
              sectionNumber: 'Attachment B',
              content: 'Providers submit requests by fax using the attached form.',
              documentId: 'doc-9a',
              documentTitle: 'Clinical Coverage Policy 9A',
              documentType: 'clinical_policy',
              policyNumber: '9A',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/9A',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-9a',
        result: {
          records: [
            mockRecord({
              id: 'doc-9a',
              title: 'Clinical Coverage Policy 9A',
              documentType: 'clinical_policy',
              policyNumber: '9A',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/9A',
              status: 'current',
              sections: [
                { id: 'sec-criteria', number: 'Attachment A', title: 'Prior Approval Drugs and Criteria', chars: 1400 },
                { id: 'sec-request', number: 'Attachment B', title: 'Prior Approval Request Process', chars: 700 },
              ],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolvePriorAuthFrame('What prior approval criteria apply under Policy 9A?');

    expect(frame.questionType).toBe('prior_authorization');
    expect(frame.primarySections[0]?.title).toBe('Prior Approval Drugs and Criteria');
    expect(frame.avoidSections.map((section) => section.title)).toContain('Prior Approval Request Process');
  });

  it('resolvePriorAuthFrame surfaces pharmacy quantity limits together with the prior-approval criteria section', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-quantity',
              sectionNumber: '5.4.3',
              sectionTitle: '5.4.3 Quantity and Episodic Drugs',
              documentTitle: 'Lock-in Program',
              policyNumber: '9',
              documentType: 'clinical_policy',
              content: 'Evaluating the applicability of quantity limitations of episodic drugs and prior authorization criteria.',
              score: 0.97,
            }),
            mockRecord({
              sectionId: 'sec-request',
              sectionNumber: 'Attachment C',
              sectionTitle: 'Attachment C: Requesting Prior Authorization for Prescription Drugs',
              documentTitle: 'Lock-in Program',
              policyNumber: '9',
              documentType: 'clinical_policy',
              content: 'Prescribers submit requests by web portal, phone, or fax.',
              score: 0.94,
            }),
            mockRecord({
              sectionId: 'sec-exception',
              sectionNumber: '3.2.3',
              sectionTitle: '3.2.3 Exceptions to FDA and NC Medicaid Drug criteria approval.',
              documentTitle: 'Lock-in Program',
              policyNumber: '9',
              documentType: 'clinical_policy',
              content: 'Providers may submit medical-necessity literature for off-label exceptions.',
              score: 0.92,
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('state_plan_amendment'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-state-quantity',
              sectionNumber: null,
              sectionTitle: '12.a. Prescribed Drugs (continued)',
              documentTitle: 'State Plan under Title XIX of the Social Security Act Medical Assistance Program',
              policyNumber: null,
              documentType: 'state_plan_amendment',
              content: 'The Department may establish authorizations, limitations, and reviews for specific drugs or quantities.',
              score: 0.91,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '9',
        result: {
          records: [
            mockRecord({
              id: 'doc-9',
              title: 'Lock-in Program',
              documentType: 'clinical_policy',
              policyNumber: '9',
              effectiveDate: '2024-07-15',
              url: 'https://example.com/9',
              status: 'current',
              sections: [
                { id: 'sec-quantity', number: '5.4.3', title: '5.4.3 Quantity and Episodic Drugs' },
                { id: 'sec-pa-criteria', number: null, title: 'Pharmacy Prior Approval Drugs and Criteria' },
                { id: 'sec-exception', number: '3.2.3', title: '3.2.3 Exceptions to FDA and NC Medicaid Drug criteria approval.' },
                { id: 'sec-request', number: 'Attachment C', title: 'Attachment C: Requesting Prior Authorization for Prescription Drugs' },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-quantity',
        result: {
          records: [
            mockRecord({
              id: 'sec-quantity',
              title: '5.4.3 Quantity and Episodic Drugs',
              sectionNumber: '5.4.3',
              content: 'Evaluating the applicability of quantity limitations of episodic drugs and prior authorization criteria.',
              documentId: 'doc-9',
              documentTitle: 'Lock-in Program',
              documentType: 'clinical_policy',
              policyNumber: '9',
              effectiveDate: '2024-07-15',
              url: 'https://example.com/9',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-pa-criteria',
        result: {
          records: [
            mockRecord({
              id: 'sec-pa-criteria',
              title: 'Pharmacy Prior Approval Drugs and Criteria',
              sectionNumber: null,
              content: 'GLP-1 Receptor Agonists and Combinations; Hepatitis C medications; Opioid Analgesics.',
              documentId: 'doc-9',
              documentTitle: 'Lock-in Program',
              documentType: 'clinical_policy',
              policyNumber: '9',
              effectiveDate: '2024-07-15',
              url: 'https://example.com/9',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-exception',
        result: {
          records: [
            mockRecord({
              id: 'sec-exception',
              title: '3.2.3 Exceptions to FDA and NC Medicaid Drug criteria approval.',
              sectionNumber: '3.2.3',
              content:
                'Providers may submit medical-necessity literature for off-label exceptions.',
              documentId: 'doc-9',
              documentTitle: 'Lock-in Program',
              documentType: 'clinical_policy',
              policyNumber: '9',
              effectiveDate: '2024-07-15',
              url: 'https://example.com/9',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-request',
        result: {
          records: [
            mockRecord({
              id: 'sec-request',
              title: 'Attachment C: Requesting Prior Authorization for Prescription Drugs',
              sectionNumber: 'Attachment C',
              content: 'Prescribers submit requests by web portal, phone, or fax.',
              documentId: 'doc-9',
              documentTitle: 'Lock-in Program',
              documentType: 'clinical_policy',
              policyNumber: '9',
              effectiveDate: '2024-07-15',
              url: 'https://example.com/9',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-state-quantity',
        result: {
          records: [
            mockRecord({
              id: 'sec-state-quantity',
              title: '12.a. Prescribed Drugs (continued)',
              sectionNumber: null,
              content: 'The Department may establish authorizations, limitations, and reviews for specific drugs or quantities.',
              documentId: 'doc-stateplan',
              documentTitle: 'State Plan under Title XIX of the Social Security Act Medical Assistance Program',
              documentType: 'state_plan_amendment',
              policyNumber: null,
              effectiveDate: '2025-01-01',
              url: 'https://example.com/stateplan',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-9',
        result: {
          records: [
            mockRecord({
              id: 'doc-9',
              title: 'Lock-in Program',
              documentType: 'clinical_policy',
              policyNumber: '9',
              effectiveDate: '2024-07-15',
              url: 'https://example.com/9',
              status: 'current',
              sections: [
                { id: 'sec-quantity', number: '5.4.3', title: '5.4.3 Quantity and Episodic Drugs', chars: 350 },
                { id: 'sec-pa-criteria', number: null, title: 'Pharmacy Prior Approval Drugs and Criteria', chars: 1000 },
                {
                  id: 'sec-exception',
                  number: '3.2.3',
                  title: '3.2.3 Exceptions to FDA and NC Medicaid Drug criteria approval.',
                  chars: 800,
                },
                { id: 'sec-request', number: 'Attachment C', title: 'Attachment C: Requesting Prior Authorization for Prescription Drugs', chars: 900 },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-stateplan',
        result: {
          records: [
            mockRecord({
              id: 'doc-stateplan',
              title: 'State Plan under Title XIX of the Social Security Act Medical Assistance Program',
              documentType: 'state_plan_amendment',
              policyNumber: null,
              effectiveDate: '2025-01-01',
              url: 'https://example.com/stateplan',
              status: 'current',
              sections: [{ id: 'sec-state-quantity', number: null, title: '12.a. Prescribed Drugs (continued)', chars: 600 }],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolvePriorAuthFrame(
      'Are there quantity limits on prescription drugs under NC Medicaid, and when is prior authorization required for pharmacy claims?',
    );

    expect(frame.questionType).toBe('prior_authorization');
    expect(frame.route.lane).toBe('deterministic_evidence');
    expect(frame.route.determinism_hints.numeric_evidence_only).toBe(true);
    expect(frame.primarySections[0]?.title).toBe('5.4.3 Quantity and Episodic Drugs');
    expect(frame.primarySections.map((section) => section.title)).toContain('5.4.3 Quantity and Episodic Drugs');
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
  });

  it('resolveAmendmentFrame surfaces the latest revision header and authoritative document', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('dhhs_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-revised',
              sectionNumber: null,
              sectionTitle: 'REVISED CHANGE NO. 04-26',
              documentTitle: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
              policyNumber: 'MA-3550',
              documentType: 'dhhs_policy',
              content: 'Revision header for the current NEMT manual.',
              score: 0.98,
            }),
            mockRecord({
              sectionId: 'sec-content',
              sectionNumber: null,
              sectionTitle: 'Content of Change',
              documentTitle: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
              policyNumber: 'MA-3550',
              documentType: 'dhhs_policy',
              content: 'Older readable change context.',
              score: 0.9,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-revised',
        result: {
          records: [
            mockRecord({
              id: 'sec-revised',
              title: 'REVISED CHANGE NO. 04-26',
              sectionNumber: null,
              content: 'Revision header for the current NEMT manual.',
              documentId: 'doc-ma3550',
              documentTitle: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
              documentType: 'dhhs_policy',
              policyNumber: 'MA-3550',
              effectiveDate: '2026-04-01',
              url: 'https://example.com/ma3550',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-content',
        result: {
          records: [
            mockRecord({
              id: 'sec-content',
              title: 'Content of Change',
              sectionNumber: null,
              content: 'Older readable change context.',
              documentId: 'doc-ma3550',
              documentTitle: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
              documentType: 'dhhs_policy',
              policyNumber: 'MA-3550',
              effectiveDate: '2026-04-01',
              url: 'https://example.com/ma3550',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-ma3550',
        result: {
          records: [
            mockRecord({
              id: 'doc-ma3550',
              title: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
              documentType: 'dhhs_policy',
              policyNumber: 'MA-3550',
              effectiveDate: '2026-04-01',
              url: 'https://example.com/ma3550',
              status: 'current',
              sections: [
                { id: 'sec-revised', number: null, title: 'REVISED CHANGE NO. 04-26', chars: 120 },
                { id: 'sec-content', number: null, title: 'Content of Change', chars: 250 },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          !query.includes('collect({id: s.id') &&
          !query.includes('OPTIONAL MATCH (amend:Document)-[r:AMENDS]->(d)') &&
          !query.includes('-[:AMENDS]->(base:Document)') &&
          params.id === 'doc-ma3550',
        result: {
          records: [
            mockRecord({
              id: 'doc-ma3550',
              title: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
              documentType: 'dhhs_policy',
              policyNumber: 'MA-3550',
              effectiveDate: '2026-04-01',
              url: 'https://example.com/ma3550',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('OPTIONAL MATCH (amend:Document)-[r:AMENDS]->(d)') && params.id === 'doc-ma3550',
        result: {
          records: [
            mockRecord({
              id: 'amend-04-26',
              title: 'Change Notice 04-26',
              documentType: 'change_notice',
              policyNumber: 'MA-3550-CN-04-26',
              effectiveDate: '2026-04-01',
              url: 'https://example.com/cn-04-26',
              status: 'amendment',
              changeDescription: 'Updates the current NEMT revision.',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document {id: $id})-[:AMENDS]->(base:Document)') && params.id === 'doc-ma3550',
        result: { records: [] },
      },
    ]);

    const frame = await corpus.resolveAmendmentFrame('What is the latest change notice for MA-3550?');

    expect(frame.questionType).toBe('amendment');
    expect(frame.route.lane).toBe('deterministic_evidence');
    expect(frame.route.determinism_hints.latest_revision_only).toBe(true);
    expect(frame.authoritativeDocuments[0]?.id).toBe('doc-ma3550');
    expect(frame.authoritativeDocuments.every((document) => document.policyNumber === 'MA-3550')).toBe(true);
    expect(frame.primarySections[0]?.title).toBe('REVISED CHANGE NO. 04-26');
    expect(frame.supportingSections).toHaveLength(0);
    expect(frame.avoidSections).toHaveLength(0);
    expect(frame.latestRevision?.marker).toContain('04-26');
  });

  it('resolveFederalAuthorityFrame prefers federal authority and keeps NC implementation as support', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('federal_regulation'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-48480',
              sectionNumber: '484.80',
              sectionTitle: 'Condition of participation: Home health aide services',
              documentTitle: '42 CFR Part 484',
              policyNumber: '42 CFR 484',
              documentType: 'federal_regulation',
              content: 'Home health aide services are provided under the condition of participation requirements.',
              score: 0.99,
            }),
            mockRecord({
              sectionId: 'sec-44116',
              sectionNumber: '441.16',
              sectionTitle: 'Home health agency requirements for surety bonds; Prohibition on FFP',
              documentTitle: '42 CFR Part 441',
              policyNumber: '42 CFR 441',
              documentType: 'federal_regulation',
              content: 'Home health agency requirements govern surety bonds.',
              score: 0.98,
            }),
            mockRecord({
              sectionId: 'sec-44070',
              sectionNumber: '440.70',
              sectionTitle: 'Home health services',
              documentTitle: '42 CFR Part 440',
              policyNumber: '42 CFR 440',
              documentType: 'federal_regulation',
              content:
                'Home health services must be provided on the order of a physician or other licensed practitioner and are provided to a beneficiary at his or her place of residence.',
              score: 0.97,
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('state_plan_amendment'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-nc-impl',
              sectionNumber: 'Attachment 3.1-A',
              sectionTitle: 'State Plan Home Health Services',
              documentTitle: 'NC State Plan Amendment 24-0001',
              policyNumber: 'SPA 24-0001',
              documentType: 'state_plan_amendment',
              content: 'North Carolina implements home health through the approved state plan attachment.',
              score: 0.88,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-44070',
        result: {
          records: [
            mockRecord({
              id: 'sec-44070',
              title: 'Home health services',
              sectionNumber: '440.70',
              content: 'Home health services must be provided on the order of a physician or other licensed practitioner.',
              documentId: 'doc-42cfr440',
              documentTitle: '42 CFR Part 440',
              documentType: 'federal_regulation',
              policyNumber: '42 CFR 440',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/42cfr440',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-48480',
        result: {
          records: [
            mockRecord({
              id: 'sec-48480',
              title: 'Condition of participation: Home health aide services',
              sectionNumber: '484.80',
              content: 'Home health aide services are governed by conditions of participation.',
              documentId: 'doc-42cfr484',
              documentTitle: '42 CFR Part 484',
              documentType: 'federal_regulation',
              policyNumber: '42 CFR 484',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/42cfr484',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-44116',
        result: {
          records: [
            mockRecord({
              id: 'sec-44116',
              title: 'Home health agency requirements for surety bonds; Prohibition on FFP',
              sectionNumber: '441.16',
              content: 'Surety bond requirements apply to home health agencies.',
              documentId: 'doc-42cfr441',
              documentTitle: '42 CFR Part 441',
              documentType: 'federal_regulation',
              policyNumber: '42 CFR 441',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/42cfr441',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-nc-impl',
        result: {
          records: [
            mockRecord({
              id: 'sec-nc-impl',
              title: 'State Plan Home Health Services',
              sectionNumber: 'Attachment 3.1-A',
              content: 'North Carolina implements home health through the approved state plan attachment.',
              documentId: 'doc-spa',
              documentTitle: 'NC State Plan Amendment 24-0001',
              documentType: 'state_plan_amendment',
              policyNumber: 'SPA 24-0001',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/spa',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-42cfr440',
        result: {
          records: [
            mockRecord({
              id: 'doc-42cfr440',
              title: '42 CFR Part 440',
              documentType: 'federal_regulation',
              policyNumber: '42 CFR 440',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/42cfr440',
              status: 'current',
              sections: [{ id: 'sec-44070', number: '440.70', title: 'Home health services', chars: 1000 }],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-42cfr484',
        result: {
          records: [
            mockRecord({
              id: 'doc-42cfr484',
              title: '42 CFR Part 484',
              documentType: 'federal_regulation',
              policyNumber: '42 CFR 484',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/42cfr484',
              status: 'current',
              sections: [{ id: 'sec-48480', number: '484.80', title: 'Condition of participation: Home health aide services', chars: 900 }],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-42cfr441',
        result: {
          records: [
            mockRecord({
              id: 'doc-42cfr441',
              title: '42 CFR Part 441',
              documentType: 'federal_regulation',
              policyNumber: '42 CFR 441',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/42cfr441',
              status: 'current',
              sections: [{ id: 'sec-44116', number: '441.16', title: 'Home health agency requirements for surety bonds; Prohibition on FFP', chars: 900 }],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-spa',
        result: {
          records: [
            mockRecord({
              id: 'doc-spa',
              title: 'NC State Plan Amendment 24-0001',
              documentType: 'state_plan_amendment',
              policyNumber: 'SPA 24-0001',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/spa',
              status: 'current',
              sections: [{ id: 'sec-nc-impl', number: 'Attachment 3.1-A', title: 'State Plan Home Health Services', chars: 800 }],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveFederalAuthorityFrame(
      "What does federal law define as 'home health services' under Medicaid, and how does North Carolina implement it?",
    );

    expect(frame.questionType).toBe('federal_authority');
    expect(frame.primarySections[0]?.sectionNumber).toBe('440.70');
    expect(frame.primarySections.every((section) => section.documentTitle === '42 CFR Part 440')).toBe(true);
    expect(frame.supportingSections[0]?.documentType).toBe('state_plan_amendment');
  });

  it('resolveFederalAuthorityFrame keeps MLR implementation evidence scoped to the matching NC document', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('federal_regulation'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-4388',
              sectionNumber: '438.8',
              sectionTitle: 'Medical loss ratio (MLR) standards',
              documentTitle: '42 CFR Part 438',
              policyNumber: '42-CFR-438',
              documentType: 'federal_regulation',
              content: 'States must require each MCO, PIHP, and PAHP to calculate and report an MLR.',
              score: 0.99,
            }),
            mockRecord({
              sectionId: 'sec-158221',
              sectionNumber: '158.221',
              sectionTitle: 'Formula for calculating an issuer medical loss ratio',
              documentTitle: '45 CFR Part 158',
              policyNumber: '45-CFR-158',
              documentType: 'federal_regulation',
              content: 'Issuers calculate MLR using the issuer formula.',
              score: 0.97,
            }),
            mockRecord({
              sectionId: 'sec-158240',
              sectionNumber: '158.240',
              sectionTitle: 'Rebating premium if the applicable medical loss ratio standard is not met',
              documentTitle: '45 CFR Part 158',
              policyNumber: '45-CFR-158',
              documentType: 'federal_regulation',
              content: 'Issuers rebate premium when the applicable MLR standard is not met.',
              score: 0.96,
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('state_plan_amendment'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-mlr-impl',
              sectionNumber: '3.3',
              sectionTitle: '3.3 Rate Development Standards and Medical Loss Ratio',
              documentTitle: 'SPA 22-0013 Proposed Amendments CHIP-Managed Care',
              policyNumber: 'SPA 22-0013',
              documentType: 'state_plan_amendment',
              content: 'North Carolina requires a minimum MLR and describes oversight of that requirement in section 3.3.',
              score: 0.94,
            }),
            mockRecord({
              sectionId: 'sec-noisy-1',
              sectionNumber: null,
              sectionTitle: 'Payments for Medical and Remedial Care and Services: Inpatient Hospital',
              documentTitle: 'State Plan under Title XIX of the Social Security Act Medical Assistance Program',
              policyNumber: null,
              documentType: 'state_plan_amendment',
              content: 'General inpatient hospital payment language.',
              score: 0.93,
            }),
            mockRecord({
              sectionId: 'sec-noisy-2',
              sectionNumber: '4602.1',
              sectionTitle: '4602.1 Factors Frequently Indicating Need For Intermediate Care (ICF)',
              documentTitle: 'State Plan under Title XIX of the Social Security Act Medical Assistance Program',
              policyNumber: null,
              documentType: 'state_plan_amendment',
              content: 'Intermediate care factors.',
              score: 0.92,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-4388',
        result: {
          records: [
            mockRecord({
              id: 'sec-4388',
              title: 'Medical loss ratio (MLR) standards',
              sectionNumber: '438.8',
              content: 'States must require each MCO, PIHP, and PAHP to calculate and report an MLR.',
              documentId: 'doc-438',
              documentTitle: '42 CFR Part 438',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-438',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/438',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-158221',
        result: {
          records: [
            mockRecord({
              id: 'sec-158221',
              title: 'Formula for calculating an issuer medical loss ratio',
              sectionNumber: '158.221',
              content: 'Issuer formula text.',
              documentId: 'doc-158',
              documentTitle: '45 CFR Part 158',
              documentType: 'federal_regulation',
              policyNumber: '45-CFR-158',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/158',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-158240',
        result: {
          records: [
            mockRecord({
              id: 'sec-158240',
              title: 'Rebating premium if the applicable medical loss ratio standard is not met',
              sectionNumber: '158.240',
              content: 'Issuer rebate text.',
              documentId: 'doc-158',
              documentTitle: '45 CFR Part 158',
              documentType: 'federal_regulation',
              policyNumber: '45-CFR-158',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/158',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-mlr-impl',
        result: {
          records: [
            mockRecord({
              id: 'sec-mlr-impl',
              title: '3.3 Rate Development Standards and Medical Loss Ratio',
              sectionNumber: '3.3',
              content: 'North Carolina requires a minimum MLR and describes oversight of that requirement in section 3.3.',
              documentId: 'doc-spa-mlr',
              documentTitle: 'SPA 22-0013 Proposed Amendments CHIP-Managed Care',
              documentType: 'state_plan_amendment',
              policyNumber: 'SPA 22-0013',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/spa-mlr',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-noisy-1',
        result: {
          records: [
            mockRecord({
              id: 'sec-noisy-1',
              title: 'Payments for Medical and Remedial Care and Services: Inpatient Hospital',
              sectionNumber: null,
              content: 'General inpatient hospital payment language.',
              documentId: 'doc-stateplan-noisy',
              documentTitle: 'State Plan under Title XIX of the Social Security Act Medical Assistance Program',
              documentType: 'state_plan_amendment',
              policyNumber: null,
              effectiveDate: '2025-01-01',
              url: 'https://example.com/stateplan',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-noisy-2',
        result: {
          records: [
            mockRecord({
              id: 'sec-noisy-2',
              title: '4602.1 Factors Frequently Indicating Need For Intermediate Care (ICF)',
              sectionNumber: '4602.1',
              content: 'Intermediate care factors.',
              documentId: 'doc-stateplan-noisy',
              documentTitle: 'State Plan under Title XIX of the Social Security Act Medical Assistance Program',
              documentType: 'state_plan_amendment',
              policyNumber: null,
              effectiveDate: '2025-01-01',
              url: 'https://example.com/stateplan',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-438',
        result: {
          records: [
            mockRecord({
              id: 'doc-438',
              title: '42 CFR Part 438',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-438',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/438',
              status: 'current',
              sections: [{ id: 'sec-4388', number: '438.8', title: 'Medical loss ratio (MLR) standards', chars: 1000 }],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-158',
        result: {
          records: [
            mockRecord({
              id: 'doc-158',
              title: '45 CFR Part 158',
              documentType: 'federal_regulation',
              policyNumber: '45-CFR-158',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/158',
              status: 'current',
              sections: [
                { id: 'sec-158221', number: '158.221', title: 'Formula for calculating an issuer medical loss ratio', chars: 900 },
                { id: 'sec-158240', number: '158.240', title: 'Rebating premium if the applicable medical loss ratio standard is not met', chars: 900 },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-spa-mlr',
        result: {
          records: [
            mockRecord({
              id: 'doc-spa-mlr',
              title: 'SPA 22-0013 Proposed Amendments CHIP-Managed Care',
              documentType: 'state_plan_amendment',
              policyNumber: 'SPA 22-0013',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/spa-mlr',
              status: 'current',
              sections: [{ id: 'sec-mlr-impl', number: '3.3', title: '3.3 Rate Development Standards and Medical Loss Ratio', chars: 950 }],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-stateplan-noisy',
        result: {
          records: [
            mockRecord({
              id: 'doc-stateplan-noisy',
              title: 'State Plan under Title XIX of the Social Security Act Medical Assistance Program',
              documentType: 'state_plan_amendment',
              policyNumber: null,
              effectiveDate: '2025-01-01',
              url: 'https://example.com/stateplan',
              status: 'current',
              sections: [
                { id: 'sec-noisy-1', number: null, title: 'Payments for Medical and Remedial Care and Services: Inpatient Hospital', chars: 850 },
                { id: 'sec-noisy-2', number: '4602.1', title: '4602.1 Factors Frequently Indicating Need For Intermediate Care (ICF)', chars: 850 },
              ],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveFederalAuthorityFrame(
      'What medical loss ratio (MLR) must Medicaid managed care organizations meet under federal law, and how does NC implement this requirement?',
    );

    expect(frame.route.lane).toBe('graph_reasoning');
    expect(frame.primarySections[0]?.sectionNumber).toBe('438.8');
    expect(frame.primarySections.every((section) => section.documentTitle === '42 CFR Part 438')).toBe(true);
    expect(frame.supportingSections[0]?.policyNumber).toBe('SPA 22-0013');
    expect(frame.supportingSections[0]?.title).toContain('Medical Loss Ratio');
  });

  it('resolveFederalAuthorityFrame surfaces NC managed care contract MLR implementation alongside SPA support', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('federal_regulation'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-4388',
              sectionNumber: '438.8',
              sectionTitle: 'Medical loss ratio (MLR) standards',
              documentTitle: '42 CFR Part 438',
              policyNumber: '42-CFR-438',
              documentType: 'federal_regulation',
              content:
                'The State must ensure, through its contracts, that each MCO, PIHP, and PAHP calculate and report an MLR. If a State elects to mandate a minimum MLR, that minimum must be equal to or higher than 85 percent.',
              score: 0.99,
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('managed_care_contract'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-contract-mlr',
              sectionNumber: 'V.I.2',
              sectionTitle: '2. Medical Loss Ratio',
              documentTitle: 'Prepaid Health Plan Services Contract',
              policyNumber: 'CONTRACT 30-190029',
              documentType: 'managed_care_contract',
              authorityTier: 'supporting',
              answerRole: 'managed_care_contract',
              answerReady: true,
              retrievalReady: true,
              content:
                'The PHP shall calculate and report the CMS-defined MLR and Department-defined MLR. The minimum MLR threshold for the PHP shall be exactly eighty-eight percent (88%).',
              score: 0.96,
            }),
            mockRecord({
              sectionId: 'sec-spa-mlr',
              sectionNumber: '3.3',
              sectionTitle: '3.3 Rate Development Standards and Medical Loss Ratio',
              documentTitle: 'SPA 22-0013 Proposed Amendments CHIP-Managed Care',
              policyNumber: 'SPA 22-0013',
              documentType: 'state_plan_amendment',
              authorityTier: 'authoritative',
              answerRole: 'managed_care',
              answerReady: true,
              retrievalReady: true,
              content:
                'North Carolina assures that rates are designed to reasonably achieve a medical loss ratio and describes remittance handling when the minimum MLR required by the State is not met.',
              score: 0.9,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-4388',
        result: {
          records: [
            mockRecord({
              id: 'sec-4388',
              title: 'Medical loss ratio (MLR) standards',
              sectionNumber: '438.8',
              content:
                'The State must ensure, through its contracts, that each MCO, PIHP, and PAHP calculate and report an MLR. If a State elects to mandate a minimum MLR, that minimum must be equal to or higher than 85 percent.',
              documentId: 'doc-438',
              documentTitle: '42 CFR Part 438',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-438',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/438',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-contract-mlr',
        result: {
          records: [
            mockRecord({
              id: 'sec-contract-mlr',
              title: '2. Medical Loss Ratio',
              sectionNumber: 'V.I.2',
              content:
                'The PHP shall calculate and report the CMS-defined MLR and Department-defined MLR. The minimum MLR threshold for the PHP shall be exactly eighty-eight percent (88%).',
              documentId: 'doc-contract',
              documentTitle: 'Prepaid Health Plan Services Contract',
              documentType: 'managed_care_contract',
              policyNumber: 'CONTRACT 30-190029',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/contract',
              status: 'current',
              authorityTier: 'supporting',
              answerRole: 'managed_care_contract',
              answerReady: true,
              retrievalReady: true,
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-contract-report',
        result: {
          records: [
            mockRecord({
              id: 'sec-contract-report',
              title: 'MLR reports and remittances',
              sectionNumber: 'V.I.2.f',
              content:
                'The PHP must attest to the accuracy of the MLR calculations and submit the required MLR reports and remittances to the Department.',
              documentId: 'doc-contract',
              documentTitle: 'Prepaid Health Plan Services Contract',
              documentType: 'managed_care_contract',
              policyNumber: 'CONTRACT 30-190029',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/contract',
              status: 'current',
              authorityTier: 'supporting',
              answerRole: 'managed_care_contract',
              answerReady: true,
              retrievalReady: true,
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-spa-mlr',
        result: {
          records: [
            mockRecord({
              id: 'sec-spa-mlr',
              title: '3.3 Rate Development Standards and Medical Loss Ratio',
              sectionNumber: '3.3',
              content:
                'North Carolina assures that rates are designed to reasonably achieve a medical loss ratio and describes remittance handling when the minimum MLR required by the State is not met.',
              documentId: 'doc-spa-mlr',
              documentTitle: 'SPA 22-0013 Proposed Amendments CHIP-Managed Care',
              documentType: 'state_plan_amendment',
              policyNumber: 'SPA 22-0013',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/spa-mlr',
              status: 'current',
              authorityTier: 'authoritative',
              answerRole: 'managed_care',
              answerReady: true,
              retrievalReady: true,
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-438',
        result: {
          records: [
            mockRecord({
              id: 'doc-438',
              title: '42 CFR Part 438',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-438',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/438',
              status: 'current',
              sections: [{ id: 'sec-4388', number: '438.8', title: 'Medical loss ratio (MLR) standards', chars: 1000 }],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-contract',
        result: {
          records: [
            mockRecord({
              id: 'doc-contract',
              title: 'Prepaid Health Plan Services Contract',
              documentType: 'managed_care_contract',
              policyNumber: 'CONTRACT 30-190029',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/contract',
              status: 'current',
              authorityTier: 'supporting',
              answerRole: 'managed_care_contract',
              answerReady: true,
              retrievalReady: true,
              sections: [
                { id: 'sec-contract-mlr', number: 'V.I.2', title: '2. Medical Loss Ratio', chars: 1200 },
                { id: 'sec-contract-report', number: 'V.I.2.f', title: 'MLR reports and remittances', chars: 900 },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-spa-mlr',
        result: {
          records: [
            mockRecord({
              id: 'doc-spa-mlr',
              title: 'SPA 22-0013 Proposed Amendments CHIP-Managed Care',
              documentType: 'state_plan_amendment',
              policyNumber: 'SPA 22-0013',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/spa-mlr',
              status: 'current',
              authorityTier: 'authoritative',
              answerRole: 'managed_care',
              answerReady: true,
              retrievalReady: true,
              sections: [{ id: 'sec-spa-mlr', number: '3.3', title: '3.3 Rate Development Standards and Medical Loss Ratio', chars: 950 }],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveFederalAuthorityFrame(
      'What medical loss ratio (MLR) must Medicaid managed care organizations meet under federal law, and how does NC implement this requirement?',
    );

    expect(frame.primarySections[0]?.sectionNumber).toBe('438.8');
    expect(frame.supportingSections[0]?.documentType).toBe('managed_care_contract');
    expect(frame.supportingSections.map((section) => section.id)).toEqual(
      expect.arrayContaining(['sec-contract-mlr', 'sec-contract-report', 'sec-spa-mlr']),
    );
  });

  it('resolveFederalAuthorityFrame keeps MLR federal sections focused on MLR calculation and reporting', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('federal_regulation'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-4388',
              sectionNumber: '438.8',
              sectionTitle: 'Medical loss ratio (MLR) standards',
              documentTitle: '42 CFR Part 438',
              policyNumber: '42-CFR-438',
              documentType: 'federal_regulation',
              content: 'States must ensure each MCO, PIHP, and PAHP calculate and report an MLR. The MLR is the ratio of numerator to denominator.',
              score: 0.99,
            }),
            mockRecord({
              sectionId: 'sec-43874',
              sectionNumber: '438.74',
              sectionTitle: 'Medical loss ratio reports',
              documentTitle: '42 CFR Part 438',
              policyNumber: '42-CFR-438',
              documentType: 'federal_regulation',
              content: 'States submit annual summaries of MLR reports and remittances.',
              score: 0.97,
            }),
            mockRecord({
              sectionId: 'sec-438510',
              sectionNumber: '438.510',
              sectionTitle: 'Mandatory QRS measure set for Medicaid managed care quality rating system',
              documentTitle: '42 CFR Part 438',
              policyNumber: '42-CFR-438',
              documentType: 'federal_regulation',
              content: 'A noisy managed-care quality section unrelated to loss-ratio calculation or reporting.',
              score: 0.98,
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('state_plan_amendment'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-mlr-impl',
              sectionNumber: '3.3',
              sectionTitle: '3.3 Rate Development Standards and Medical Loss Ratio',
              documentTitle: 'SPA 22-0013 Proposed Amendments CHIP-Managed Care',
              policyNumber: 'SPA 22-0013',
              documentType: 'state_plan_amendment',
              content: 'North Carolina describes rate development and remittance handling for MLR.',
              score: 0.94,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-4388',
        result: {
          records: [
            mockRecord({
              id: 'sec-4388',
              title: 'Medical loss ratio (MLR) standards',
              sectionNumber: '438.8',
              content: 'States must ensure each MCO, PIHP, and PAHP calculate and report an MLR. The MLR is the ratio of numerator to denominator.',
              documentId: 'doc-438',
              documentTitle: '42 CFR Part 438',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-438',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/438',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-43874',
        result: {
          records: [
            mockRecord({
              id: 'sec-43874',
              title: 'Medical loss ratio reports',
              sectionNumber: '438.74',
              content: 'States submit annual summaries of MLR reports and remittances.',
              documentId: 'doc-438',
              documentTitle: '42 CFR Part 438',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-438',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/438',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-438510',
        result: {
          records: [
            mockRecord({
              id: 'sec-438510',
              title: 'Mandatory QRS measure set for Medicaid managed care quality rating system',
              sectionNumber: '438.510',
              content: 'A noisy managed-care quality section unrelated to loss-ratio calculation or reporting.',
              documentId: 'doc-438',
              documentTitle: '42 CFR Part 438',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-438',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/438',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-mlr-impl',
        result: {
          records: [
            mockRecord({
              id: 'sec-mlr-impl',
              title: '3.3 Rate Development Standards and Medical Loss Ratio',
              sectionNumber: '3.3',
              content: 'North Carolina describes rate development and remittance handling for MLR.',
              documentId: 'doc-spa-mlr',
              documentTitle: 'SPA 22-0013 Proposed Amendments CHIP-Managed Care',
              documentType: 'state_plan_amendment',
              policyNumber: 'SPA 22-0013',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/spa-mlr',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-438',
        result: {
          records: [
            mockRecord({
              id: 'doc-438',
              title: '42 CFR Part 438',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-438',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/438',
              status: 'current',
              sections: [
                { id: 'sec-4388', number: '438.8', title: 'Medical loss ratio (MLR) standards', chars: 1000 },
                { id: 'sec-43874', number: '438.74', title: 'Medical loss ratio reports', chars: 900 },
                { id: 'sec-438510', number: '438.510', title: 'Mandatory QRS measure set for Medicaid managed care quality rating system', chars: 900 },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-spa-mlr',
        result: {
          records: [
            mockRecord({
              id: 'doc-spa-mlr',
              title: 'SPA 22-0013 Proposed Amendments CHIP-Managed Care',
              documentType: 'state_plan_amendment',
              policyNumber: 'SPA 22-0013',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/spa-mlr',
              status: 'current',
              sections: [{ id: 'sec-mlr-impl', number: '3.3', title: '3.3 Rate Development Standards and Medical Loss Ratio', chars: 950 }],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveFederalAuthorityFrame(
      'What medical loss ratio (MLR) must Medicaid managed care organizations meet under federal law, and how does NC implement this requirement?',
    );

    expect(frame.primarySections.map((section) => section.sectionNumber)).toContain('438.8');
    expect(
      [...frame.primarySections, ...frame.supportingSections].map((section) => section.sectionNumber),
    ).toContain('438.74');
    expect(frame.primarySections.map((section) => section.sectionNumber)).not.toContain('438.510');
  });

  it('resolveFederalAuthorityFrame surfaces federal enforcement sections from the same governing regulation', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('federal_regulation'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-4388',
              sectionNumber: '438.8',
              sectionTitle: 'Medical loss ratio (MLR) standards',
              documentTitle: '42 CFR Part 438',
              policyNumber: '42-CFR-438',
              documentType: 'federal_regulation',
              content: 'If a State elects to mandate a minimum MLR, that minimum must be equal to or higher than 85 percent.',
              score: 0.99,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-4388',
        result: {
          records: [
            mockRecord({
              id: 'sec-4388',
              title: 'Medical loss ratio (MLR) standards',
              sectionNumber: '438.8',
              content: 'If a State elects to mandate a minimum MLR, that minimum must be equal to or higher than 85 percent.',
              documentId: 'doc-438',
              documentTitle: '42 CFR Part 438',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-438',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/438',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-43874',
        result: {
          records: [
            mockRecord({
              id: 'sec-43874',
              title: 'Medical loss ratio reports',
              sectionNumber: '438.74',
              content: 'The State must submit an annual summary describing MLR reports and any remittances owed.',
              documentId: 'doc-438',
              documentTitle: '42 CFR Part 438',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-438',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/438',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-438',
        result: {
          records: [
            mockRecord({
              id: 'doc-438',
              title: '42 CFR Part 438',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-438',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/438',
              status: 'current',
              sections: [
                { id: 'sec-4388', number: '438.8', title: 'Medical loss ratio (MLR) standards', chars: 1000 },
                { id: 'sec-43874', number: '438.74', title: 'Medical loss ratio reports', chars: 900 },
              ],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveFederalAuthorityFrame(
      'What medical loss ratio (MLR) must Medicaid managed care organizations meet under federal law, and how is this requirement enforced?',
    );

    expect(frame.questionType).toBe('federal_authority');
    expect(frame.primarySections.map((section) => section.sectionNumber)).toContain('438.8');
    expect(
      [...frame.primarySections, ...frame.supportingSections].map((section) => section.sectionNumber),
    ).toContain('438.74');
    expect(
      [...frame.primarySections, ...frame.supportingSections].some((section) => section.documentTitle === '42 CFR Part 438'),
    ).toBe(true);
  });

  it('resolveFederalAuthorityFrame adds aliased NC implementation policy support without displacing federal authority', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('federal_regulation'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-431408',
              sectionNumber: '431.408',
              sectionTitle: 'State public notice process',
              documentTitle: '42 CFR Part 431',
              policyNumber: '42-CFR-431',
              documentType: 'federal_regulation',
              content: 'The agency must provide public notice, a comment period, and public hearings before submission.',
              score: 1.01,
            }),
            mockRecord({
              sectionId: 'sec-4311010',
              sectionNumber: '431.1010',
              sectionTitle: 'Disallowance of Federal financial participation for erroneous State payments',
              documentTitle: '42 CFR Part 431',
              policyNumber: '42-CFR-431',
              documentType: 'federal_regulation',
              content: 'This section addresses PERM disallowance procedures for erroneous State payments.',
              score: 1.0,
            }),
            mockRecord({
              sectionId: 'sec-441300',
              sectionNumber: '441.300',
              sectionTitle: 'Basis and scope',
              documentTitle: '42 CFR Part 441',
              policyNumber: '42-CFR-441',
              documentType: 'federal_regulation',
              content: 'Section 1915(c) permits States to provide home and community-based services under a waiver.',
              score: 0.99,
            }),
            mockRecord({
              sectionId: 'sec-441303',
              sectionNumber: '441.303',
              sectionTitle: 'Supporting documentation required',
              documentTitle: '42 CFR Part 441',
              policyNumber: '42-CFR-441',
              documentType: 'federal_regulation',
              content: 'The agency must document health and welfare assurances, financial accountability, and cost estimates.',
              score: 0.97,
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          ((params.docTypes as string[]).includes('clinical_policy') ||
            (params.docTypes as string[]).includes('state_plan_amendment')),
        result: { records: [] },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '3K-2',
        result: {
          records: [
            mockRecord({
              id: 'doc-3k2',
              title: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-09-01',
              url: 'https://example.com/3k-2',
              status: 'current',
              sections: [
                { id: 'sec-3k2-31', number: '3.1', title: '3.1 General Criteria Covered by Medicaid' },
                { id: 'sec-3k2-321', number: '3.2.1', title: '3.2.1 Specific Criteria Covered by Medicaid' },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-431408',
        result: {
          records: [
            mockRecord({
              id: 'sec-431408',
              title: 'State public notice process',
              sectionNumber: '431.408',
              content: 'The agency must provide public notice, a comment period, and public hearings before submission.',
              documentId: 'doc-431',
              documentTitle: '42 CFR Part 431',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-431',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/431',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-4311010',
        result: {
          records: [
            mockRecord({
              id: 'sec-4311010',
              title: 'Disallowance of Federal financial participation for erroneous State payments',
              sectionNumber: '431.1010',
              content: 'This section addresses PERM disallowance procedures for erroneous State payments.',
              documentId: 'doc-431',
              documentTitle: '42 CFR Part 431',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-431',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/431',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-441300',
        result: {
          records: [
            mockRecord({
              id: 'sec-441300',
              title: 'Basis and scope',
              sectionNumber: '441.300',
              content: 'Section 1915(c) permits States to provide home and community-based services under a waiver.',
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
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-441303',
        result: {
          records: [
            mockRecord({
              id: 'sec-441303',
              title: 'Supporting documentation required',
              sectionNumber: '441.303',
              content: 'The agency must document health and welfare assurances, financial accountability, and cost estimates.',
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
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3k2-31',
        result: {
          records: [
            mockRecord({
              id: 'sec-3k2-31',
              title: '3.1 General Criteria Covered by Medicaid',
              sectionNumber: '3.1',
              content: 'CAP/DA services must meet NC Medicaid general criteria covered by Medicaid.',
              documentId: 'doc-3k2',
              documentTitle: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-09-01',
              url: 'https://example.com/3k-2',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3k2-321',
        result: {
          records: [
            mockRecord({
              id: 'sec-3k2-321',
              title: '3.2.1 Specific Criteria Covered by Medicaid',
              sectionNumber: '3.2.1',
              content: 'The CAP/DA waiver describes the specific services and criteria covered by NC Medicaid.',
              documentId: 'doc-3k2',
              documentTitle: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-09-01',
              url: 'https://example.com/3k-2',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-441',
        result: {
          records: [
            mockRecord({
              id: 'doc-441',
              title: '42 CFR Part 441',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-441',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/441',
              status: 'current',
              sections: [
                { id: 'sec-441300', number: '441.300', title: 'Basis and scope', chars: 900 },
                { id: 'sec-441303', number: '441.303', title: 'Supporting documentation required', chars: 900 },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-3k2',
        result: {
          records: [
            mockRecord({
              id: 'doc-3k2',
              title: 'Clinical Coverage Policy 3K-2 CAP/DA Waiver',
              documentType: 'clinical_policy',
              policyNumber: '3K-2',
              effectiveDate: '2025-09-01',
              url: 'https://example.com/3k-2',
              status: 'current',
              sections: [
                { id: 'sec-3k2-31', number: '3.1', title: '3.1 General Criteria Covered by Medicaid', chars: 850 },
                { id: 'sec-3k2-321', number: '3.2.1', title: '3.2.1 Specific Criteria Covered by Medicaid', chars: 850 },
              ],
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolveFederalAuthorityFrame(
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
  });

  it('resolveFederalAuthorityFrame keeps Part 441 authoritative when mixed federal hits elevate SSA section 1915', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('federal_regulation'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-441745',
              sectionNumber: '441.745',
              sectionTitle: 'State plan HCBS administration: State responsibilities and quality improvement',
              documentTitle: '42 CFR Part 441',
              policyNumber: '42-CFR-441',
              documentType: 'federal_regulation',
              content: 'The state must provide assurances and quality improvement information.',
              score: 1.53,
            }),
            mockRecord({
              sectionId: 'sec-441464',
              sectionNumber: '441.464',
              sectionTitle: 'State assurances',
              documentTitle: '42 CFR Part 441',
              policyNumber: '42-CFR-441',
              documentType: 'federal_regulation',
              content: 'The agency must provide state assurances for the HCBS program.',
              score: 1.53,
            }),
            mockRecord({
              sectionId: 'sec-441310',
              sectionNumber: '441.310',
              sectionTitle: 'Limits on Federal financial participation (FFP)',
              documentTitle: '42 CFR Part 441',
              policyNumber: '42-CFR-441',
              documentType: 'federal_regulation',
              content: 'The state must show cost and participation limits for waiver services.',
              score: 1.375,
            }),
            mockRecord({
              sectionId: 'sec-441300',
              sectionNumber: '441.300',
              sectionTitle: 'Basis and scope',
              documentTitle: '42 CFR Part 441',
              policyNumber: '42-CFR-441',
              documentType: 'federal_regulation',
              content: 'This subpart implements section 1915(c) waiver authority.',
              score: 1.365,
            }),
            mockRecord({
              sectionId: 'sec-440180',
              sectionNumber: '440.180',
              sectionTitle: 'Home and community-based waiver services',
              documentTitle: '42 CFR Part 440',
              policyNumber: '42-CFR-440',
              documentType: 'federal_regulation',
              content: 'This section describes HCBS waiver services under Medicaid.',
              score: 1.275,
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          (params.docTypes as string[]).includes('federal_statute'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-1915',
              sectionNumber: '1915',
              sectionTitle: 'Section 1915. Compliance with State plan and payment provisions',
              documentTitle: 'Social Security Act — Title XIX (Medicaid)',
              policyNumber: 'SSA-Title-19',
              documentType: 'federal_statute',
              content: 'Section 1915(c) authorizes home and community-based services waivers.',
              score: 1.54,
            }),
            mockRecord({
              sectionId: 'sec-1929',
              sectionNumber: '1929',
              sectionTitle: 'Section 1929. Home and community care for functionally disabled elderly individuals',
              documentTitle: 'Social Security Act — Title XIX (Medicaid)',
              policyNumber: 'SSA-Title-19',
              documentType: 'federal_statute',
              content: 'This section describes community care services for elderly individuals.',
              score: 1.19,
            }),
            mockRecord({
              sectionId: 'sec-1902',
              sectionNumber: '1902',
              sectionTitle: 'Section 1902. State plans for medical assistance',
              documentTitle: 'Social Security Act — Title XIX (Medicaid)',
              policyNumber: 'SSA-Title-19',
              documentType: 'federal_statute',
              content: 'This section governs Medicaid state plan requirements.',
              score: 1.095,
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
          Array.isArray(params.docTypes) &&
          ((params.docTypes as string[]).includes('clinical_policy') ||
            (params.docTypes as string[]).includes('state_plan_amendment')),
        result: { records: [] },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-1915',
        result: {
          records: [
            mockRecord({
              id: 'sec-1915',
              title: 'Section 1915. Compliance with State plan and payment provisions',
              sectionNumber: '1915',
              content: 'Section 1915(c) authorizes home and community-based services waivers.',
              documentId: 'doc-ssa',
              documentTitle: 'Social Security Act — Title XIX (Medicaid)',
              documentType: 'federal_statute',
              policyNumber: 'SSA-Title-19',
              effectiveDate: null,
              url: 'https://example.com/ssa-title-19',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-441310',
        result: {
          records: [
            mockRecord({
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
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-441300',
        result: {
          records: [
            mockRecord({
              id: 'sec-441300',
              title: 'Basis and scope',
              sectionNumber: '441.300',
              content: 'This subpart implements section 1915(c) waiver authority.',
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
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-440180',
        result: {
          records: [
            mockRecord({
              id: 'sec-440180',
              title: 'Home and community-based waiver services',
              sectionNumber: '440.180',
              content: 'This section describes HCBS waiver services under Medicaid.',
              documentId: 'doc-440',
              documentTitle: '42 CFR Part 440',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-440',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/440',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-441',
        result: {
          records: [
            mockRecord({
              id: 'doc-441',
              title: '42 CFR Part 441',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-441',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/441',
              status: 'current',
              sections: [
                { id: 'sec-441300', number: '441.300', title: 'Basis and scope', chars: 900 },
                { id: 'sec-441301', number: '441.301', title: 'Contents of request for a waiver', chars: 900 },
                { id: 'sec-441303', number: '441.303', title: 'Supporting documentation required', chars: 900 },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-440',
        result: {
          records: [
            mockRecord({
              id: 'doc-440',
              title: '42 CFR Part 440',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-440',
              effectiveDate: '2024-07-01',
              url: 'https://example.com/440',
              status: 'current',
              sections: [
                { id: 'sec-440180', number: '440.180', title: 'Home and community-based waiver services', chars: 900 },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) =>
          query.includes('MATCH (d:Document {id: $id})') &&
          query.includes('collect({id: s.id') &&
          params.id === 'doc-ssa',
        result: {
          records: [
            mockRecord({
              id: 'doc-ssa',
              title: 'Social Security Act — Title XIX (Medicaid)',
              documentType: 'federal_statute',
              policyNumber: 'SSA-Title-19',
              effectiveDate: null,
              url: 'https://example.com/ssa-title-19',
              status: 'current',
              sections: [
                { id: 'sec-1915', number: '1915', title: 'Section 1915. Compliance with State plan and payment provisions', chars: 900 },
                { id: 'sec-1902', number: '1902', title: 'Section 1902. State plans for medical assistance', chars: 900 },
                { id: 'sec-1929', number: '1929', title: 'Section 1929. Home and community care for functionally disabled elderly individuals', chars: 900 },
              ],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-441301',
        result: {
          records: [
            mockRecord({
              id: 'sec-441301',
              title: 'Contents of request for a waiver',
              sectionNumber: '441.301',
              content: 'A waiver request must include the required assurances and requested waivers.',
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
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-441303',
        result: {
          records: [
            mockRecord({
              id: 'sec-441303',
              title: 'Supporting documentation required',
              sectionNumber: '441.303',
              content: 'The state must document target groups, service definitions, estimates, and safeguards.',
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
    ]);

    const frame = await corpus.resolveFederalAuthorityFrame(
      "What is the federal statutory authority for NC's CAP/DA waiver, and what does the state need to demonstrate in its waiver application?",
    );

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('42-CFR-441');
    expect(frame.primarySections.map((section) => section.sectionNumber)).toEqual(
      expect.arrayContaining(['441.301', '441.303']),
    );
    expect(frame.primarySections.map((section) => section.sectionNumber)).not.toContain('1929');
  });

  it('resolvePolicyVariantFrame picks the matching sibling policy and explains why', async () => {
    const { corpus } = createCorpusWithSearchHandlers([
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '3L',
        result: {
          records: [
            mockRecord({
              id: 'doc-3l',
              title: 'State Plan PCS',
              documentType: 'clinical_policy',
              policyNumber: '3L',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3L',
              status: 'current',
              sections: [{ id: 'sec-3l-scope', number: '1.0', title: 'Scope' }],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (d:Document)') && params.pn === '3L-1',
        result: {
          records: [
            mockRecord({
              id: 'doc-3l1',
              title: 'PCS in Congregate Settings',
              documentType: 'clinical_policy',
              policyNumber: '3L-1',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3L-1',
              status: 'current',
              sections: [{ id: 'sec-3l1-scope', number: '1.0', title: 'Scope' }],
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3l-scope',
        result: {
          records: [
            mockRecord({
              id: 'sec-3l-scope',
              title: 'Scope',
              sectionNumber: '1.0',
              content: 'This policy governs state plan PCS delivered in the home.',
              documentId: 'doc-3l',
              documentTitle: 'State Plan PCS',
              documentType: 'clinical_policy',
              policyNumber: '3L',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3L',
              status: 'current',
            }),
          ],
        },
      },
      {
        match: (query, params) => query.includes('MATCH (s:Section {id: $id})') && params.id === 'sec-3l1-scope',
        result: {
          records: [
            mockRecord({
              id: 'sec-3l1-scope',
              title: 'Scope',
              sectionNumber: '1.0',
              content: 'This policy governs PCS in congregate settings, including adult care homes.',
              documentId: 'doc-3l1',
              documentTitle: 'PCS in Congregate Settings',
              documentType: 'clinical_policy',
              policyNumber: '3L-1',
              effectiveDate: '2025-01-01',
              url: 'https://example.com/3L-1',
              status: 'current',
            }),
          ],
        },
      },
    ]);

    const frame = await corpus.resolvePolicyVariantFrame(
      'For PCS in congregate settings, should I use 3L or 3L-1?',
    );

    expect(frame.questionType).toBe('policy_variant');
    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('3L-1');
    expect(frame.variantReasoning).toContain('congregate');
    expect(frame.primarySections[0]?.policyNumber).toBe('3L-1');
    expect(frame.supportingSections[0]?.policyNumber).toBe('3L');
  });
});
