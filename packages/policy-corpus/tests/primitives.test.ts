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

describe('getSection', () => {
  it('returns document metadata, citationLink, and effectiveDate', async () => {
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
  it('returns ancestors, children, and siblings', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          contextEntryRecord({ id: 'sec-root', title: 'Root', sectionNumber: '1' }),
          contextEntryRecord({ id: 'sec-parent', title: 'Parent', sectionNumber: '1.1' }),
        ],
      },
      {
        records: [
          contextEntryRecord({ id: 'sec-child-1', title: 'Child 1', sectionNumber: '1.1.1.1' }),
          contextEntryRecord({ id: 'sec-child-2', title: 'Child 2', sectionNumber: '1.1.1.2' }),
        ],
      },
      {
        records: [
          contextEntryRecord({ id: 'sec-sibling', title: 'Sibling', sectionNumber: '1.1.2' }),
          contextEntryRecord({ id: 'sec-sibling-2', title: 'Sibling 2', sectionNumber: '1.1.3' }),
        ],
      },
    ]);

    const context = await corpus.getSectionContext('sec-1.1.1');

    expect(context.ancestors).toHaveLength(2);
    expect(context.children).toHaveLength(2);
    expect(context.siblings).toHaveLength(2);
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
  it('rejects invalid relationship filters before querying', async () => {
    const { corpus, session } = createCorpusWithRuns([]);

    const sections = await corpus.findConceptSections({
      conceptName: 'EPSDT',
      relationshipType: 'DEFINES}]->(x) DETACH DELETE x //',
    });

    expect(sections).toEqual([]);
    expect(session.run).not.toHaveBeenCalled();
  });

  it('returns an empty list when no concept matches the name', async () => {
    const { corpus, session } = createCorpusWithRuns([{ records: [] }]);

    const sections = await corpus.findConceptSections({ conceptName: 'No Such Concept' });

    expect(sections).toEqual([]);
    expect(session.run).toHaveBeenCalledTimes(1);
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
