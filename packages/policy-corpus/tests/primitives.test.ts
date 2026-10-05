// Primitive graph APIs: getSection / getDocument / getSectionContext /
// followReferences / lookupPolicy / findConceptSections — happy paths,
// not-found/empty cases, and session failure paths.

import { describe, expect, it } from 'vitest';
import {
  strictRecord,
  containerChildrenRecord,
  contextEntryRecord,
  createCorpus,
  createCorpusWithRuns,
  documentRecord,
  queries,
  referenceRecord,
  sectionHit,
  sectionRecord,
} from './helpers/graph-fixtures.js';
import { CONCEPT_SECTION_LIMIT } from '../src/primitives/concepts.js';
import { CONTEXT_CHILD_LIMIT, CONTEXT_SIBLING_WALK_HOPS, CONTEXT_SIBLING_WINDOW } from '../src/primitives/sections.js';

describe('getSection', () => {
  it('returns citation, effective, source-modified, and retrieval metadata', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          sectionRecord({
            id: 'sec-1',
            title: 'Eligibility',
            sectionNumber: '4.1',
            content: 'Full section content here.',
            documentId: 'doc-1',
            documentTitle: 'Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2025-01-01',
            sourceModifiedDate: '2024-12-15',
            retrievedAt: '2025-02-01T12:30:00Z',
            url: 'https://example.com/8C',
            status: 'current',
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
      sourceModifiedDate: '2024-12-15',
      retrievedAt: '2025-02-01T12:30:00Z',
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

  it('aggregates child content for container headings', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          sectionRecord({
            id: 'sec-parent',
            title: 'Parent Section',
            sectionNumber: '4',
            content: '',
            documentId: 'doc-1',
            documentTitle: 'Policy 8C',
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
          containerChildrenRecord({
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
          }),
        ],
      },
    ]);

    const section = await corpus.getSection('sec-parent');

    expect(section?.content).toContain('[Container heading with 2 child sections:]');
    expect(section?.content).toContain('### Child A');
    expect(section?.citationLink).toBe('[Policy 8C](https://example.com/8C)');
  });

  it('returns null for an unknown section id', async () => {
    const { corpus, session } = createCorpusWithRuns([{ records: [] }]);

    const section = await corpus.getSection('sec-does-not-exist');

    expect(section).toBeNull();
    expect(session.run).toHaveBeenCalledTimes(1);
  });

  it('propagates session failures', async () => {
    const { corpus } = createCorpusWithRuns([{ error: new Error('neo4j unavailable') }]);

    await expect(corpus.getSection('sec-1')).rejects.toThrow('neo4j unavailable');
  });
});

describe('getDocument', () => {
  it('filters null sections and preserves citation metadata', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          documentRecord({
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

  it('returns null for an unknown document id', async () => {
    const { corpus, session } = createCorpusWithRuns([{ records: [] }]);

    const document = await corpus.getDocument('doc-does-not-exist');

    expect(document).toBeNull();
    expect(session.run).toHaveBeenCalledTimes(1);
  });
});

describe('getSectionContext', () => {
  const entry = (index: number) => ({ id: `sec-${index}`, title: `Section ${index}`, sectionNumber: `${index}` });

  it('returns ancestors, children, and siblings with their totals', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          contextEntryRecord({ id: 'sec-root', title: 'Root', sectionNumber: '1' }),
          contextEntryRecord({ id: 'sec-parent', title: 'Parent', sectionNumber: '1.1' }),
        ],
      },
      { records: [strictRecord({ entries: [entry(1), entry(2)], total: 2 })] },
      { records: [strictRecord({ entries: [entry(3), entry(4)], total: 2 })] },
    ]);

    const context = await corpus.getSectionContext('sec-1.1.1');

    expect(context.ancestors).toHaveLength(2);
    expect(context.children).toEqual([entry(1), entry(2)]);
    expect(context).toMatchObject({ childCount: 2, childrenTruncated: false });
    expect(context.siblings).toEqual([entry(3), entry(4)]);
    expect(context).toMatchObject({ siblingCount: 2, siblingsTruncated: false });
  });

  it('caps siblings and children and reports the family totals', async () => {
    const { corpus, session } = createCorpusWithRuns([
      { records: [] },
      {
        records: [
          strictRecord({
            entries: Array.from({ length: CONTEXT_CHILD_LIMIT }, (_, index) => entry(index)),
            total: 2364,
          }),
        ],
      },
      {
        records: [
          strictRecord({
            entries: Array.from({ length: 2 * CONTEXT_SIBLING_WINDOW }, (_, index) => entry(index)),
            total: 2363,
          }),
        ],
      },
    ]);

    const context = await corpus.getSectionContext('sec-wide');

    expect(context.children).toHaveLength(CONTEXT_CHILD_LIMIT);
    expect(context).toMatchObject({ childCount: 2364, childrenTruncated: true });
    expect(context.siblings).toHaveLength(2 * CONTEXT_SIBLING_WINDOW);
    expect(context).toMatchObject({ siblingCount: 2363, siblingsTruncated: true });

    // The bound lives in the queries: a window walk from the section, never
    // an unbounded expansion of the whole family.
    const [, childQuery, siblingQuery] = session.run.mock.calls.map(([query]) => query as string);
    expect(childQuery).toContain(`rows[0..${CONTEXT_CHILD_LIMIT}]`);
    expect(siblingQuery).toContain(`-[:NEXT_SIBLING*1..${CONTEXT_SIBLING_WALK_HOPS}]->(s)`);
    expect(siblingQuery).toContain(`(s)-[:NEXT_SIBLING*1..${CONTEXT_SIBLING_WALK_HOPS}]->`);
    expect(siblingQuery).not.toContain('NEXT_SIBLING*0..');
  });

  it('spends the sibling window on family members, not on hops through other levels', async () => {
    // Federal statute sections are chained through their own subsections, so
    // the family filter has to run before the window is cut.
    const { corpus, session } = createCorpusWithRuns([{ records: [] }, { records: [] }, { records: [] }]);

    await corpus.getSectionContext('sec:doc:federal_statute:SSA-Title-19:1396a');

    const siblingQuery = (session.run.mock.calls[2][0] as string).replace(/\s+/g, ' ');
    expect(CONTEXT_SIBLING_WALK_HOPS).toBeGreaterThan(CONTEXT_SIBLING_WINDOW);
    for (const node of ['before', 'after']) {
      const filter = siblingQuery.indexOf(`EXISTS { MATCH (parent)-[:PARENT_OF]->(${node}) }`);
      const cut = siblingQuery.indexOf(`WITH ${node}, length(path) AS hops ORDER BY hops LIMIT ${CONTEXT_SIBLING_WINDOW}`);
      expect(filter).toBeGreaterThan(-1);
      expect(cut).toBeGreaterThan(filter);
    }
  });

  it('returns empty windows for an unknown section id', async () => {
    const { corpus } = createCorpusWithRuns([{ records: [] }, { records: [] }, { records: [] }]);

    const context = await corpus.getSectionContext('sec-does-not-exist');

    expect(context).toEqual({
      ancestors: [],
      siblings: [],
      siblingCount: 0,
      siblingsTruncated: false,
      children: [],
      childCount: 0,
      childrenTruncated: false,
    });
  });
});

describe('followReferences', () => {
  it('maps section and document targets', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          referenceRecord({
            targetId: 'sec-target-1',
            targetType: 'Section',
            targetTitle: 'Target Section',
            targetPolicyNumber: '1A',
            relationshipType: 'REFERENCES',
            referenceText: 'see section 1A',
          }),
          referenceRecord({
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

  it('returns an empty list when the section has no outgoing references', async () => {
    const { corpus, session } = createCorpusWithRuns([{ records: [] }]);

    const references = await corpus.followReferences('sec-without-references');

    expect(references).toEqual([]);
    expect(session.run).toHaveBeenCalledTimes(1);
  });
});

describe('lookupPolicy', () => {
  it('returns documents with metadata and sections', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          documentRecord({
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
        supersession: null,
      },
    ]);
  });

  it('returns a structured supersession note when a SUPERSEDED_BY edge exists', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          strictRecord({
            id: 'doc:federal_regulation:45-CFR-74',
            title: '45 CFR Part 74',
            documentType: 'federal_regulation',
            policyNumber: '45-CFR-74',
            effectiveDate: '2025-10-01',
            sourceModifiedDate: null,
            retrievedAt: null,
            url: 'https://www.ecfr.gov/current/title-45/part-74',
            status: 'superseded',
            authorityTier: null,
            answerRole: null,
            sourceFormat: null,
            answerReady: false,
            corpusBucket: null,
            variantGroup: null,
            variantDate: null,
            retrievalReady: false,
            sections: [],
            supersessionEffective: '2025-10-01',
            supersessionReason: '45 CFR Part 74 was superseded by Part 75 in Dec 2014; both were rescinded in favor of 2 CFR Part 200.',
            supersededByPolicyNumber: '2-CFR-200',
            supersededByTitle: '2 CFR Part 200',
            supersededByUrl: 'https://www.ecfr.gov/current/title-2/part-200',
          }),
        ],
      },
    ]);

    const documents = await corpus.lookupPolicy({ policyNumber: '45 CFR 74' });

    expect(documents).toHaveLength(1);
    expect(documents[0].status).toBe('superseded');
    expect(documents[0].supersession).toEqual({
      byPolicyNumber: '2-CFR-200',
      byTitle: '2 CFR Part 200',
      citationLink: '[2 CFR Part 200](https://www.ecfr.gov/current/title-2/part-200)',
      effective: '2025-10-01',
      reason: '45 CFR Part 74 was superseded by Part 75 in Dec 2014; both were rescinded in favor of 2 CFR Part 200.',
    });
  });

  it('returns an empty list when no document matches the policy number', async () => {
    const { corpus, session } = createCorpusWithRuns([{ records: [] }]);

    const documents = await corpus.lookupPolicy({ policyNumber: 'ZZ-9999' });

    expect(documents).toEqual([]);
    expect(session.run).toHaveBeenCalledTimes(1);
  });
});

describe('findConceptSections', () => {
  const conceptRow = (index: number) => ({
    sectionId: `sec-${index}`,
    sectionTitle: `Section ${index}`,
    sectionNumber: `${index}`,
    documentId: 'doc-1',
    documentType: 'clinical_policy',
    policyNumber: '8C',
    relationshipType: 'COVERS',
  });

  it('rejects invalid relationship filters before querying', async () => {
    const { corpus, session } = createCorpusWithRuns([]);

    const result = await corpus.findConceptSections({
      conceptName: 'EPSDT',
      relationshipType: 'DEFINES}]->(x) DETACH DELETE x //',
    });

    expect(result).toEqual({ sections: [], total: 0, truncated: false });
    expect(session.run).not.toHaveBeenCalled();
  });

  it('rejects the relationship types the pipeline never writes', async () => {
    const { corpus, session } = createCorpusWithRuns([]);

    for (const relationshipType of ['GOVERNS', 'REFERENCES_CONCEPT']) {
      expect(await corpus.findConceptSections({ conceptName: 'EPSDT', relationshipType })).toEqual({
        sections: [],
        total: 0,
        truncated: false,
      });
    }
    expect(session.run).not.toHaveBeenCalled();
  });

  it('returns an empty list when no concept matches the name', async () => {
    const { corpus, session } = createCorpusWithRuns([{ records: [strictRecord({ sections: [], total: 0 })] }]);

    const result = await corpus.findConceptSections({ conceptName: 'No Such Concept' });

    expect(result).toEqual({ sections: [], total: 0, truncated: false });
    expect(session.run).toHaveBeenCalledTimes(1);
  });

  it('caps the list in the query, orders it, and reports the total', async () => {
    const { corpus, session } = createCorpusWithRuns([
      {
        records: [
          strictRecord({
            sections: Array.from({ length: CONCEPT_SECTION_LIMIT }, (_, index) => conceptRow(index)),
            // The driver returns counts as Integer objects.
            total: { toNumber: () => 2573 },
          }),
        ],
      },
    ]);

    const result = await corpus.findConceptSections({ conceptName: 'Prior Authorization' });

    expect(result.sections).toHaveLength(CONCEPT_SECTION_LIMIT);
    expect(result.sections[0]).toEqual(conceptRow(0));
    expect(result.total).toBe(2573);
    expect(result.truncated).toBe(true);

    const query = session.run.mock.calls[0][0] as string;
    expect(query).toContain('[r:COVERS|DEFINES|RESTRICTS]');
    expect(query).toContain('ORDER BY');
    expect(query).toContain(`rows[0..${CONCEPT_SECTION_LIMIT}]`);
  });

  it('normalizes the relationship filter and does not flag a complete list', async () => {
    const { corpus, session } = createCorpusWithRuns([
      { records: [strictRecord({ sections: [conceptRow(1), conceptRow(2)], total: 2 })] },
    ]);

    const result = await corpus.findConceptSections({ conceptName: 'EPSDT', relationshipType: 'defines' });

    expect(result).toMatchObject({ total: 2, truncated: false });
    expect(session.run.mock.calls[0][0]).toContain('[r:DEFINES]');
  });
});

describe('search failure paths', () => {
  it('propagates a section-vector backend failure out of searchSectionsDetailed', async () => {
    // The section-embedding scan is a required backend: a rejected
    // session.run is NOT swallowed (unlike chunk/concept/keyword backends).
    const { corpus } = createCorpus([
      {
        label: 'vector failure',
        match: queries.sectionVector(),
        error: new Error('vector index offline'),
      },
    ]);

    await expect(corpus.searchSectionsDetailed({ query: 'telehealth coverage', topK: 3 })).rejects.toThrow(
      'vector index offline',
    );
  });

  it('tolerates chunk-vector failures and still returns section-vector hits', async () => {
    // Best-effort backends (chunk vector here) swallow per-query errors, so a
    // broken chunk index degrades results instead of failing the search.
    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'chunk failure',
        match: queries.chunkVector(),
        error: new Error('chunk index offline'),
      },
      {
        label: 'vector dhhs',
        match: queries.sectionVector('dhhs_policy'),
        result: {
          records: [
            sectionHit({
              sectionId: 'sec-survivor',
              sectionNumber: '4.1',
              sectionTitle: 'Eligibility',
              documentTitle: 'DHHS Policy',
              policyNumber: '8C',
              documentType: 'dhhs_policy',
              content: 'Eligibility content',
              score: 0.9,
            }),
          ],
        },
      },
    ]);

    const results = await corpus.searchSectionsDetailed({ query: 'eligibility', topK: 3 });

    expect(results.map((hit) => hit.sectionId)).toEqual(['sec-survivor']);
    expectAllHandlersUsed();
  });
});
