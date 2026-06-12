// searchSectionsDetailed reranking and recovery paths: concept filtering,
// boilerplate demotion, keyword fallback, change-notice header expansion, and
// sibling-policy preference.

import { describe, expect, it } from 'vitest';
import { createCorpus, queries, sectionHit } from './helpers/graph-fixtures.js';

describe('searchSectionsDetailed ranking', () => {
  it('filters generic concept matches', async () => {
    const { corpus, session, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector',
        match: queries.sectionVector(),
        result: {
          records: [
            sectionHit({
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
        label: 'chunk',
        match: queries.chunkVector(),
        result: {
          records: [
            sectionHit({
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
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'home modifications cap/da',
      topK: 2,
    });

    expect(results.map((row) => row.sectionId)).toEqual(['sec:primary', 'sec:supporting']);
    // The generic-concept filter lives inside the concept backend's Cypher
    // (`s.section_number IS NOT NULL`), so a session stub cannot exercise it
    // behaviorally — Neo4j applies it, not the TypeScript layer. Pinning the
    // predicate text is the strongest available assertion here.
    const conceptQueries = session.run.mock.calls
      .map(([query]) => query as string)
      .filter((query) => query.includes('MATCH (c:PolicyConcept)'));
    expect(conceptQueries).toHaveLength(1);
    expect(conceptQueries[0]).toContain('s.section_number IS NOT NULL');
    expectAllHandlersUsed();
  });

  it('reranks specific title matches above boilerplate', async () => {
    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:history',
              sectionNumber: '1.9',
              sectionTitle: 'History:',
              documentTitle: 'Clinical Coverage Policy 10A',
              policyNumber: '10A',
              documentType: 'clinical_policy',
              content: 'Revision dates and publishing notes',
              score: 0.92,
            }),
            sectionHit({
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
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'How does the EPSDT special provision affect beneficiaries under 21?',
      topK: 2,
    });

    expect(results.map((row) => row.sectionId)).toEqual(['sec:epsdt', 'sec:history']);
    expectAllHandlersUsed();
  });

  it('boosts high-signal matches above generic requirements', async () => {
    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:generic',
              sectionNumber: '6.4.1',
              sectionTitle: 'CAP/DA Mandated Requirements',
              documentTitle: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content: 'Case management entity requirements and staffing expectations.',
              score: 0.96,
            }),
            sectionHit({
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
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'What documentation must the CAP/DA multidisciplinary team provide for a home modification?',
      topK: 2,
    });

    expect(results.map((row) => row.sectionId)).toEqual(['sec:target', 'sec:generic']);
    expectAllHandlersUsed();
  });

  it('falls back to document keyword matches', async () => {
    const { corpus, session, expectAllHandlersUsed } = createCorpus([
      {
        label: 'document keyword clinical',
        match: queries.documentKeyword('clinical_policy'),
        result: {
          records: [
            sectionHit({
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
    expectAllHandlersUsed();
  });

  it('expands change-notice revision headers from matching manuals', async () => {
    const { corpus, session, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector dhhs',
        match: queries.sectionVector('dhhs_policy'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:doc:dhhs_policy:MA-3550:_s78',
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
        label: 'change-notice headers',
        match: queries.changeNoticeHeaders(),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:doc:dhhs_policy:MA-3550:_s2',
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
    ]);

    const results = await corpus.searchSectionsDetailed({
      query: 'Which change notice is the most recent for NEMT, and what did it change?',
      topK: 2,
    });

    expect(results[0]?.sectionId).toBe('sec:doc:dhhs_policy:MA-3550:_s2');
    expect(session.run.mock.calls.some(([query]) => (query as string).includes("CONTAINS 'change no'"))).toBe(true);
    expectAllHandlersUsed();
  });

  it('prefers the newest parsed change marker for latest-change queries', async () => {
    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector dhhs',
        match: queries.sectionVector('dhhs_policy'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:doc:dhhs_policy:MA-3550:_s78',
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
        label: 'change-notice headers',
        match: queries.changeNoticeHeaders(),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:doc:dhhs_policy:MA-3550:_s2',
              sectionTitle: 'REVISED 03/16/2026 -CHANGE NO. 04-26',
              documentTitle: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
              policyNumber: 'MA-3550',
              documentType: 'dhhs_policy',
              content: '',
              score: 1.28,
            }),
            sectionHit({
              sectionId: 'sec:doc:dhhs_policy:MA-2910:_s2',
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
    expectAllHandlersUsed();
  });

  it('prefers the general PDN policy over under-21 variants when the query is not pediatric', async () => {
    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec:3g2',
              sectionNumber: '5.2.4.1',
              sectionTitle: 'Notification of Termination',
              documentTitle: '3G-2 Private Duty Nursing for Beneficiaries Under 21 Years of Age',
              policyNumber: '3G-2',
              documentType: 'clinical_policy',
              content: 'The provider must notify NC Medicaid when services terminate.',
              score: 0.95,
            }),
            sectionHit({
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
    ]);

    const results = await corpus.searchSectionsDetailed({
      query:
        'If a Private Duty Nursing provider terminates services for a Medicaid beneficiary, what notification requirements must they follow?',
      topK: 2,
    });

    expect(results.map((result) => result.policyNumber)).toEqual(['3G-1', '3G-2']);
    expectAllHandlersUsed();
  });
});
