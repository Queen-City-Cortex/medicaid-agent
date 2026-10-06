// Primitive graph APIs: getSection / getDocument / getSectionContext /
// followReferences / lookupPolicy / findConceptSections — happy paths,
// not-found/empty cases, and session failure paths.

import { describe, expect, it } from 'vitest';
import {
  strictRecord,
  contextEntryRecord,
  createCorpus,
  createCorpusWithRuns,
  createSectionTextCorpus,
  documentRecord,
  queries,
  referenceRecord,
  sectionHit,
  sectionRecord,
} from './helpers/graph-fixtures.js';
import { CONCEPT_SECTION_LIMIT } from '../src/primitives/concepts.js';
import {
  CONTEXT_CHILD_LIMIT,
  CONTEXT_SIBLING_WALK_HOPS,
  CONTEXT_SIBLING_WINDOW,
  containerDescendants,
  type HierarchySection,
} from '../src/primitives/sections.js';
import { CONTAINER_SECTION_LIMIT, SECTION_WINDOW_CHARS, SECTION_WINDOW_MAX_CHARS } from '../src/internal/shared.js';

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
      contentOffset: 0,
      totalChars: 26,
      nextOffset: null,
      contentNote: null,
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

  // A paragraph the old 6,000-character cut could never reach.
  const remittance = '(j) Remittance to the State if specific MLR is not met.';
  const longText = `${'a'.repeat(7000)}${remittance}${'b'.repeat(11345)}`;

  it('returns the first window of a long section with its total and next offset', async () => {
    const { corpus, session } = createSectionTextCorpus([{ id: 'sec-long', sectionNumber: '438.8', text: longText }]);

    const section = await corpus.getSection('sec-long');

    expect(section?.content).toBe('a'.repeat(SECTION_WINDOW_CHARS));
    expect(section).toMatchObject({ contentOffset: 0, totalChars: 18400, nextOffset: 6000 });
    expect(section?.contentNote).toContain('Showing characters 0-6000 of 18400. Call getSection with offset=6000 to read on.');
    expect(section?.contentNote).toContain('do not conclude that something is absent');
    // The window is cut in Neo4j, with whole-number parameters made integers there.
    const [query, params] = session.run.mock.calls[0];
    expect(query).toContain('substring(s.content_text, toInteger($offset), toInteger($length))');
    expect(params).toMatchObject({ id: 'sec-long', offset: 0, length: SECTION_WINDOW_CHARS });
    expect(session.run).toHaveBeenCalledTimes(1);
  });

  it('continues past 6,000 characters from the next offset until the end', async () => {
    const { corpus } = createSectionTextCorpus([{ id: 'sec-long', sectionNumber: '438.8', text: longText }]);

    let read = '';
    let offset: number | null = 0;
    const offsets: number[] = [];
    // `!= null` and the read count stop the loop if a read ever omits the next offset.
    while (offset != null && offsets.length < 10) {
      offsets.push(offset);
      const section = await corpus.getSection('sec-long', { offset });
      read += section!.content;
      offset = section!.nextOffset;
    }

    expect(offsets).toEqual([0, 6000, 12000, 18000]);
    expect(read).toBe(longText);
    const second = await corpus.getSection('sec-long', { offset: 6000 });
    expect(second?.content).toContain(remittance);
    expect(second?.contentNote).toContain('Showing characters 6000-12000 of 18400.');
    const last = await corpus.getSection('sec-long', { offset: 18000 });
    expect(last).toMatchObject({ contentOffset: 18000, nextOffset: null });
    expect(last?.contentNote).toContain('Showing characters 18000-18400 of 18400. This is the end of the text.');
  });

  it('bounds the window length and treats an offset past the end as an empty window', async () => {
    const { corpus, session } = createSectionTextCorpus([{ id: 'sec-long', text: longText }]);

    const wide = await corpus.getSection('sec-long', { length: 50_000 });
    expect(session.run.mock.calls[0][1]).toMatchObject({ length: SECTION_WINDOW_MAX_CHARS });
    expect(wide).toMatchObject({ totalChars: 18400, nextOffset: SECTION_WINDOW_MAX_CHARS });

    const past = await corpus.getSection('sec-long', { offset: 99_999 });
    expect(past).toMatchObject({ content: '', contentOffset: 99_999, totalChars: 18400, nextOffset: null });
    expect(past?.contentNote).toBe('Offset 99999 is past the end of this text (18400 characters); nothing is shown.');
    // An empty window of a section that has text is not a container read.
    expect(session.run).toHaveBeenCalledTimes(2);

    const odd = await corpus.getSection('sec-long', { offset: -5, length: 0 });
    expect(session.run.mock.calls[2][1]).toMatchObject({ offset: 0, length: 1 });
    expect(odd).toMatchObject({ content: 'a', nextOffset: 1 });
  });

  it('lands the next offset on the character after the window when the text has astral characters', async () => {
    // Each "𝔘" is one Unicode character and two UTF-16 units; Neo4j counts the former.
    const text = `${'𝔘'.repeat(5)}abcde`;
    const { corpus } = createSectionTextCorpus([{ id: 'sec-astral', text }]);

    const first = await corpus.getSection('sec-astral', { length: 4 });
    expect(first?.content).toBe('𝔘'.repeat(4));
    expect(first?.content).toHaveLength(8);
    expect(first).toMatchObject({ totalChars: 10, nextOffset: 4 });

    const second = await corpus.getSection('sec-astral', { offset: first!.nextOffset!, length: 4 });
    expect(second?.content).toBe('𝔘abc');
    expect(second).toMatchObject({ contentOffset: 4, nextOffset: 8 });
    const third = await corpus.getSection('sec-astral', { offset: second!.nextOffset!, length: 4 });
    expect(`${first!.content}${second!.content}${third!.content}`).toBe(text);
    expect(third?.nextOffset).toBeNull();
  });

  it('reads a container heading as the text of its sub-sections', async () => {
    const { corpus } = createSectionTextCorpus([
      { id: 'sec-parent', title: 'Parent Section', sectionNumber: '4', text: '' },
      { id: 'sec-child-2', title: 'Child B', sectionNumber: '4.2', text: 'Child B content', parentId: 'sec-parent' },
      { id: 'sec-child-1', title: 'Child A', sectionNumber: '4.1', text: 'Child A content', parentId: 'sec-parent' },
      { id: 'sec-child-3', title: 'Empty child', sectionNumber: '4.3', text: '', parentId: 'sec-parent' },
    ]);

    const section = await corpus.getSection('sec-parent');

    expect(section?.content).toBe('### Child A\nChild A content\n\n### Child B\nChild B content\n\n');
    expect(section).toMatchObject({ contentOffset: 0, totalChars: 58, nextOffset: null });
    expect(section?.contentNote).toBe(
      'This heading has no text of its own. The text is that of the 2 sections under it, each below a "###" line with its title: 4.1; 4.2.',
    );
    expect(section?.citationLink).toBe('[Policy 8C](https://example.com/8C)');
  });

  it('pages a container heading whose sub-sections exceed one window', async () => {
    const bodies = { a: `${'x'.repeat(5000)}𝔘`, b: 'y'.repeat(5000), c: 'z'.repeat(5000) };
    const { corpus, session } = createSectionTextCorpus([
      { id: 'sec-parent', title: 'Parent Section', sectionNumber: '4', text: '' },
      { id: 'sec-a', title: '4.1 First', sectionNumber: '4.1', text: bodies.a, parentId: 'sec-parent' },
      { id: 'sec-b', title: '4.2 Second', sectionNumber: '4.2', text: bodies.b, parentId: 'sec-parent' },
      { id: 'sec-c', title: '4.3 Third', sectionNumber: '4.3', text: bodies.c, parentId: 'sec-parent' },
    ]);
    const whole = `### 4.1 First\n${bodies.a}\n\n### 4.2 Second\n${bodies.b}\n\n### 4.3 Third\n${bodies.c}\n\n`;

    const first = await corpus.getSection('sec-parent');
    expect(first).toMatchObject({ totalChars: Array.from(whole).length, nextOffset: 6000 });
    expect(first?.contentNote).toContain('The text is that of the 3 sections under it');
    expect(first?.contentNote).toContain('Showing characters 0-6000 of 15050. Call getSection with offset=6000 to read on.');
    // Only the slices inside the window are asked of Neo4j.
    const pieces = session.run.mock.calls[2][1].pieces;
    expect(pieces).toEqual([
      { id: 'sec-a', start: 0, length: 5001 },
      { id: 'sec-b', start: 0, length: 6000 - (14 + 5001 + 2 + 15) },
    ]);

    let read = first!.content!;
    for (let offset = first!.nextOffset, reads = 0; offset != null && reads < 10; reads += 1) {
      const next = await corpus.getSection('sec-parent', { offset });
      read += next!.content;
      offset = next!.nextOffset;
    }
    expect(read).toBe(whole);
  });

  it('says how many sections a container read leaves out', async () => {
    const children = Array.from({ length: CONTAINER_SECTION_LIMIT + 3 }, (_, index) => ({
      id: `sec-child-${index}`,
      title: `Row group ${index}`,
      text: 'row',
      parentId: 'sec-parent',
    }));
    const { corpus } = createSectionTextCorpus([{ id: 'sec-parent', title: 'Sheet', text: '' }, ...children]);

    const section = await corpus.getSection('sec-parent');

    expect(section?.contentNote).toContain(`The text is that of the ${CONTAINER_SECTION_LIMIT} sections under it`);
    expect(section?.contentNote).toContain('Row group 0; Row group 1;');
    expect(section?.contentNote).toContain(`Row group 19; and ${CONTAINER_SECTION_LIMIT - 20} more.`);
    expect(section?.contentNote).toContain('3 more sections under it are not included; getDocument lists every section of the document, to read by id.');
    expect(section?.content).toContain('### Row group 99\n');
    expect(section?.content).not.toContain('### Row group 100\n');
  });

  // Policy 1-O-1 as the graph holds it before and after the hierarchy fix.
  // Before: Docling depth made each lettered heading a root, and the last
  // one before a numbered section adopted it. After: numbers decide.
  const criteria = (links: Record<string, string | null>) => [
    { id: 'sec:4.0', title: '4.0 When Not Covered', sectionNumber: '4.0', text: '' },
    { id: 'sec:4.1', title: '4.1 General Criteria', sectionNumber: '4.1', text: 'General criteria.' },
    { id: 'sec:4.2', title: '4.2 Specific Criteria Not Covered', sectionNumber: '4.2', text: '' },
    { id: 'sec:4.2.1', title: '4.2.1 Specific Criteria', sectionNumber: '4.2.1', text: 'Not covered when:' },
    { id: 'sec:_s31', title: 'a. Cosmetic Surgery', text: 'Cosmetic criteria.' },
    { id: 'sec:_s32', title: 'b. Reconstructive Surgery', text: 'Reconstructive criteria.' },
    { id: 'sec:4.2.2', title: '4.2.2 Medicaid Additional Criteria Not Covered', sectionNumber: '4.2.2', text: 'None apply.' },
    { id: 'sec:_s34', title: 'c. Stray Heading', text: 'Stray text.' },
    { id: 'sec:5.0', title: '5.0 Requirements', sectionNumber: '5.0', text: '' },
    { id: 'sec:5.1', title: '5.1 Prior Approval', sectionNumber: '5.1', text: 'Prior approval is required.' },
  ].map((section) => ({ ...section, parentId: links[section.id] ?? null }));
  const servingLinks = {
    'sec:4.1': 'sec:4.0',
    'sec:4.2': 'sec:4.0',
    'sec:4.2.1': 'sec:4.2',
    'sec:4.2.2': 'sec:_s32',
    'sec:5.1': 'sec:_s34',
  };
  const reloadedLinks = {
    'sec:4.1': 'sec:4.0',
    'sec:4.2': 'sec:4.0',
    'sec:4.2.1': 'sec:4.2',
    'sec:_s31': 'sec:4.2.1',
    'sec:_s32': 'sec:4.2.1',
    'sec:4.2.2': 'sec:4.2',
    'sec:_s34': 'sec:4.2.2',
    'sec:5.1': 'sec:5.0',
  };

  it('returns a numbered sub-section that an unnumbered heading adopted, on the graph as it is served', async () => {
    const { corpus } = createSectionTextCorpus(criteria(servingLinks));

    const section = await corpus.getSection('sec:4.2');

    expect(section?.content).toBe(
      '### 4.2.1 Specific Criteria\nNot covered when:\n\n' +
        '### 4.2.2 Medicaid Additional Criteria Not Covered\nNone apply.\n\n',
    );
    expect(section?.contentNote).toContain('The text is that of the 2 sections under it, each below a "###" line with its title: 4.2.1; 4.2.2.');
    // The lettered criteria are roots on this graph: they cannot be placed, and the read says so.
    expect(section?.contentNote).toContain('Lettered or unnumbered headings between these sections are stored apart from them and may be missing here');
  });

  it('does not return a numbered section through the unnumbered heading that adopted it', async () => {
    const { corpus } = createSectionTextCorpus(criteria(servingLinks));

    // "c. Stray Heading" holds a PARENT_OF link to 5.1; 5.1 belongs to 5.0.
    const stray = await corpus.getSection('sec:_s34');
    expect(stray?.content).toBe('Stray text.');
    const top = await corpus.getSection('sec:4.0');
    expect(top?.content).not.toContain('Prior approval');
    expect(top?.content).not.toContain('Stray text');
    expect(top?.contentNote).toContain(': 4.1; 4.2.1; 4.2.2.');
    const next = await corpus.getSection('sec:5.0');
    expect(next?.content).toBe('### 5.1 Prior Approval\nPrior approval is required.\n\n');
  });

  it('returns the numbered sub-sections with their lettered criteria in reading order after a reload', async () => {
    const { corpus } = createSectionTextCorpus(criteria(reloadedLinks));

    const section = await corpus.getSection('sec:4.2');

    expect(section?.content).toBe(
      '### 4.2.1 Specific Criteria\nNot covered when:\n\n' +
        '### a. Cosmetic Surgery\nCosmetic criteria.\n\n' +
        '### b. Reconstructive Surgery\nReconstructive criteria.\n\n' +
        '### 4.2.2 Medicaid Additional Criteria Not Covered\nNone apply.\n\n' +
        '### c. Stray Heading\nStray text.\n\n',
    );
    expect(section?.contentNote).toContain(': 4.2.1; a. Cosmetic Surgery; b. Reconstructive Surgery; 4.2.2; c. Stray Heading.');
    expect(section?.contentNote).not.toContain('stored apart');
    expect(section?.nextOffset).toBeNull();
  });

  it('returns an empty section with no sub-sections as empty', async () => {
    const { corpus } = createSectionTextCorpus([{ id: 'sec-empty', title: 'Reserved', text: '' }]);

    const section = await corpus.getSection('sec-empty');

    expect(section).toMatchObject({ content: '', contentOffset: 0, totalChars: 0, nextOffset: null, contentNote: null });
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

describe('containerDescendants', () => {
  const node = (id: string, number: string | null, parentId: string | null = null, chars = 10): HierarchySection =>
    ({ id, number, title: number ?? id, chars, parentId });
  const ids = (containerId: string, sections: HierarchySection[]) =>
    containerDescendants(containerId, sections).shown.map((section) => section.id);

  it('keeps the stored link of a dotted section under a titled heading when no section holds a prefix of its number', () => {
    // A converted document: "Section 3. Scope" carries no number, "3.1" under it does.
    const sections = [node('h3', null, null, 0), node('3.1', '3.1', 'h3'), node('3.2', '3.2', 'h3')];
    expect(ids('h3', sections)).toEqual(['3.1', '3.2']);
    expect(containerDescendants('h3', sections).ambiguous).toBe(false);
  });

  it('reports a repeated number that leaves a section with two possible parents', () => {
    const sections = [
      node('body:1.0', '1.0', null, 0),
      node('att:1.0', '1.0', null, 0),
      node('letter', null, null, 0),
      node('1.1', '1.1', 'letter'),
    ];
    expect(containerDescendants('body:1.0', sections)).toMatchObject({ shown: [], ambiguous: true });
  });

  it('keeps the two numberings of a document apart when an attachment restarts at 1.0', () => {
    const sections = [
      node('body:1.0', '1.0', null, 0),
      node('body:1.1', '1.1', 'body:1.0'),
      node('att', 'Attachment B', null, 0),
      node('att:1.0', '1.0', 'att', 0),
      node('att:1.1', '1.1', 'att:1.0'),
      node('att:_s9', null, 'att:1.1'),
      // Adopted by an unnumbered heading: two sections are numbered 1.0, so it is placed under neither.
      node('att:_s10', null, 'att'),
      node('att:1.2', '1.2', 'att:_s10'),
    ];

    expect(ids('body:1.0', sections)).toEqual(['body:1.1']);
    expect(ids('att:1.0', sections)).toEqual(['att:1.1', 'att:_s9']);
    expect(ids('att', sections)).toEqual(['att:_s10', 'att:1.1', 'att:_s9']);
  });

  it('places a section under its nearest numbered prefix when a level is skipped or the link is to another number', () => {
    const sections = [
      node('3.2', '3.2', null, 0),
      node('3.2.1.1', '3.2.1.1', '3.2'),
      // A level-stack link to a section that is not a prefix of 4.1.1.
      node('4.0', '4.0', null, 0),
      node('4.1.1', '4.1.1', '3.2'),
    ];

    expect(ids('3.2', sections)).toEqual(['3.2.1.1']);
    expect(ids('4.0', sections)).toEqual(['4.1.1']);
  });

  it('keeps statute-style links between numbered sections and lists empty sections only through their children', () => {
    const sections = [
      node('1905', '1905', null, 0),
      node('1905-a', '1905(a)', '1905'),
      node('1905-r', '1905(r)', '1905', 0),
      node('1905-r-1', null, '1905-r'),
    ];

    expect(ids('1905', sections)).toEqual(['1905-a', '1905-r-1']);
  });

  it('stops at the depth and count bounds and counts what it leaves out', () => {
    const chain = [
      node('1.0', '1.0', null, 0),
      node('1.1', '1.1', '1.0'),
      node('1.1.1', '1.1.1', '1.1'),
      node('1.1.1.1', '1.1.1.1', '1.1.1'),
      node('1.1.1.1.1', '1.1.1.1.1', '1.1.1.1'),
    ];
    expect(containerDescendants('1.0', chain)).toMatchObject({ omitted: 1, detachedHeadings: false });
    expect(ids('1.0', chain)).toEqual(['1.1', '1.1.1', '1.1.1.1']);

    const wide = [node('sheet', null, null, 0), ...Array.from({ length: 130 }, (_, index) => node(`sheet:rows${index + 1}`, null, 'sheet'))];
    const result = containerDescendants('sheet', wide);
    expect(result.shown).toHaveLength(CONTAINER_SECTION_LIMIT);
    expect(result.omitted).toBe(30);
    // Row groups keep their order: "rows2" before "rows10".
    expect(result.shown.slice(0, 3).map((section) => section.id)).toEqual(['sheet:rows1', 'sheet:rows2', 'sheet:rows3']);
  });

  it('survives a cycle of stored links', () => {
    const sections = [node('a', null, 'b', 0), node('b', null, 'a')];
    expect(ids('a', sections)).toEqual(['b']);
  });
});
