import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { z } from 'zod';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@mastra/core/tools', () => ({
  createTool: (config: any) => config,
}));

vi.mock('../../src/neo4j.js', () => ({
  withSession: vi.fn(),
}));

import { getSection, getDocument, getSectionContext, DOCUMENT_SECTION_LIMIT } from '../../src/tools/read.js';
import { runTool } from '../helpers/run-tool.js';
import { mockRecord, setupSession } from '../helpers/neo4j-session.js';

// ── getSection ───────────────────────────────────────────────────────────────

describe('getSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns section with content', async () => {
    setupSession([
      {
        records: [
          mockRecord({
            id: 'sec-1',
            title: 'Eligibility',
            sectionNumber: '4.1',
            content: 'Full section content here.',
            totalChars: 26,
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

    const result = await runTool(getSection, { sectionId: 'sec-1' });

    expect(result.section).toEqual({
      id: 'sec-1',
      title: 'Eligibility',
      sectionNumber: '4.1',
      content: 'Full section content here.',
      contentOffset: 0,
      totalChars: 26,
      nextOffset: null,
      contentNote: null,
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

  it('returns null when section not found', async () => {
    setupSession([{ records: [] }]);

    const result = await runTool(getSection, { sectionId: 'nonexistent' });

    expect(result.section).toBeNull();
  });

  const parentRecord = (id: string, title: string) =>
    mockRecord({
      id,
      title,
      sectionNumber: '4',
      content: '',
      totalChars: 0,
      documentId: 'doc-1',
      documentTitle: 'Policy 8C',
      documentType: 'dhhs_policy',
      policyNumber: '8C',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/8C',
      status: 'current',
    });

  it('reads a container heading as the text of the sections under it', async () => {
    const session = setupSession([
      { records: [parentRecord('sec-parent', 'Parent Section')] },
      {
        // Second query: the document's sections with sizes and links, no text
        records: [
          mockRecord({ id: 'sec-parent', title: 'Parent Section', sectionNumber: '4', chars: 0, parentId: null }),
          mockRecord({ id: 'sec-child-2', title: 'Child B', sectionNumber: '4.2', chars: 15, parentId: 'sec-parent' }),
          mockRecord({ id: 'sec-child-1', title: 'Child A', sectionNumber: '4.1', chars: 15, parentId: 'sec-parent' }),
          mockRecord({ id: 'sec-other', title: 'Elsewhere', sectionNumber: '5.1', chars: 20, parentId: null }),
        ],
      },
      {
        // Third query: the slices of their text inside the window
        records: [
          mockRecord({ id: 'sec-child-1', text: 'Child A content' }),
          mockRecord({ id: 'sec-child-2', text: 'Child B content' }),
        ],
      },
    ]);

    const result = await runTool(getSection, { sectionId: 'sec-parent' });

    expect(result.section!.content).toBe('### Child A\nChild A content\n\n### Child B\nChild B content\n\n');
    expect(result.section).toMatchObject({ contentOffset: 0, totalChars: 58, nextOffset: null });
    expect(result.section!.contentNote).toContain('The text is that of the 2 sections under it');
    expect(session.run.mock.calls[2][1]).toEqual({
      pieces: [
        { id: 'sec-child-1', start: 0, length: 15 },
        { id: 'sec-child-2', start: 0, length: 15 },
      ],
    });
  });

  it('returns an empty container when no section under it has text', async () => {
    setupSession([{ records: [parentRecord('sec-empty', 'Empty Container')] }, { records: [] }]);

    const result = await runTool(getSection, { sectionId: 'sec-empty' });

    expect(result.section).toMatchObject({ content: '', totalChars: 0, nextOffset: null, contentNote: null });
  });

  it('passes the offset and length to the read and returns where to continue', async () => {
    const session = setupSession([
      {
        records: [
          mockRecord({
            id: 'sec-long',
            title: 'Medical loss ratio',
            sectionNumber: '438.8',
            content: 'r'.repeat(6000),
            totalChars: 18400,
            documentId: 'doc-1',
            documentTitle: '42 CFR Part 438',
            documentType: 'federal_regulation',
            url: 'https://example.com/438',
          }),
        ],
      },
    ]);

    const result = await runTool(getSection, { sectionId: 'sec-long', offset: 6000, length: 6000 });

    expect(session.run.mock.calls[0][1]).toMatchObject({ id: 'sec-long', offset: 6000, length: 6000 });
    expect(result.section).toMatchObject({ contentOffset: 6000, totalChars: 18400, nextOffset: 12000 });
    expect(result.section!.contentNote).toContain('Showing characters 6000-12000 of 18400. Call getSection with offset=12000 to read on.');
    // The window fields must be in the output schema, which strips what it does not name.
    expect((getSection.outputSchema as unknown as z.ZodTypeAny).parse(result).section).toMatchObject({ nextOffset: 12000, totalChars: 18400 });
  });

  it('accepts only whole, non-negative offsets and lengths within the ceiling', () => {
    const accepts = (input: Record<string, unknown>) => (getSection.inputSchema as unknown as z.ZodTypeAny).safeParse({ sectionId: 's', ...input }).success;
    expect(accepts({})).toBe(true);
    expect(accepts({ offset: 0, length: 1 })).toBe(true);
    expect(accepts({ offset: 5_000_000, length: 12000 })).toBe(true);
    expect(accepts({ offset: -1 })).toBe(false);
    expect(accepts({ offset: 1.5 })).toBe(false);
    expect(accepts({ offset: 2 ** 31 })).toBe(false);
    expect(accepts({ length: 0 })).toBe(false);
    expect(accepts({ length: 12001 })).toBe(false);
    expect(accepts({ length: 100.5 })).toBe(false);
  });

  it('does not describe one call as the complete text', () => {
    expect(getSection.description).not.toMatch(/full content|complete text/i);
    expect(getSection.description).toContain('nextOffset');
  });
});

// ── getDocument ──────────────────────────────────────────────────────────────

describe('getDocument', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns document with filtered sections', async () => {
    setupSession([
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
              { id: null, number: null, title: null, chars: null }, // null entry from empty OPTIONAL MATCH
              { id: 'sec-2', number: '2', title: 'Coverage', chars: 200 },
            ],
          }),
        ],
      },
    ]);

    const result = await runTool(getDocument, { documentId: 'doc-1' });

    expect(result.document).not.toBeNull();
    expect(result.document!.sections).toHaveLength(2);
    expect(result.document!.sections[0].id).toBe('sec-1');
    expect(result.document!.sections[1].id).toBe('sec-2');
    expect(result.document!.id).toBe('doc-1');
    expect(result.document!.title).toBe('Policy 8C');
    expect(result.document!.sectionCount).toBe(2);
    expect(result.document!.sectionsTruncated).toBe(false);
  });

  it('caps the section list, reports the total, and pages by offset', async () => {
    const sections = Array.from({ length: DOCUMENT_SECTION_LIMIT + 30 }, (_, index) => ({
      id: `sec-${index}`,
      number: `${index}`,
      title: `Section ${index}`,
      chars: 10,
    }));
    const run = {
      records: [
        mockRecord({
          id: 'doc-waiver',
          title: 'Waiver',
          documentType: 'waiver',
          policyNumber: null,
          effectiveDate: null,
          url: null,
          status: 'current',
          sections,
        }),
      ],
    };
    setupSession([run, run]);

    const first = await runTool(getDocument, { documentId: 'doc-waiver' });

    expect(first.document!.sections).toHaveLength(DOCUMENT_SECTION_LIMIT);
    expect(first.document!.sections[0].id).toBe('sec-0');
    expect(first.document!.sectionCount).toBe(DOCUMENT_SECTION_LIMIT + 30);
    expect(first.document!.sectionsTruncated).toBe(true);

    const second = await runTool(getDocument, { documentId: 'doc-waiver', sectionOffset: DOCUMENT_SECTION_LIMIT });

    expect(second.document!.sections).toHaveLength(30);
    expect(second.document!.sections[0].id).toBe(`sec-${DOCUMENT_SECTION_LIMIT}`);
    expect(second.document!.sectionCount).toBe(DOCUMENT_SECTION_LIMIT + 30);
    expect(second.document!.sectionsTruncated).toBe(false);
  });

  it('pages the same order however the graph returns the sections', async () => {
    const total = DOCUMENT_SECTION_LIMIT + 30;
    const sections = Array.from({ length: total }, (_, index) => ({
      id: `sec-${index}`,
      // Numbered and unnumbered sections, neither in lexical order.
      number: index % 2 === 0 ? `${index}.1` : null,
      title: `Section ${index}`,
      chars: 10,
    }));
    const record = (list: typeof sections) => ({
      records: [
        mockRecord({
          id: 'doc-waiver',
          title: 'Waiver',
          documentType: 'waiver',
          policyNumber: null,
          effectiveDate: null,
          url: null,
          status: 'current',
          sections: list,
        }),
      ],
    });
    // The second call sees the collection in the opposite order.
    setupSession([record(sections), record([...sections].reverse())]);

    const first = await runTool(getDocument, { documentId: 'doc-waiver' });
    const second = await runTool(getDocument, { documentId: 'doc-waiver', sectionOffset: DOCUMENT_SECTION_LIMIT });

    const ids = [...first.document!.sections, ...second.document!.sections].map((section) => section.id);
    expect(new Set(ids).size).toBe(total);
    // Unnumbered sections first in parse order, then numbers in natural order.
    expect(ids.slice(0, 3)).toEqual(['sec-1', 'sec-3', 'sec-5']);
    expect(ids.slice(-3)).toEqual([`sec-${total - 6}`, `sec-${total - 4}`, `sec-${total - 2}`]);
  });

  it('returns null when document not found', async () => {
    setupSession([{ records: [] }]);

    const result = await runTool(getDocument, { documentId: 'nonexistent' });

    expect(result.document).toBeNull();
  });
});

// ── getSectionContext ────────────────────────────────────────────────────────

describe('getSectionContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ancestors, children, and siblings', async () => {
    setupSession([
      {
        // Ancestors
        records: [
          mockRecord({ id: 'sec-root', title: 'Root', sectionNumber: '1' }),
          mockRecord({ id: 'sec-parent', title: 'Parent', sectionNumber: '1.1' }),
        ],
      },
      {
        // Children
        records: [
          mockRecord({
            entries: [
              { id: 'sec-child-1', title: 'Child 1', sectionNumber: '1.1.1.1' },
              { id: 'sec-child-2', title: 'Child 2', sectionNumber: '1.1.1.2' },
            ],
            total: 2,
          }),
        ],
      },
      {
        // Siblings
        records: [
          mockRecord({
            entries: [
              { id: 'sec-sibling', title: 'Sibling', sectionNumber: '1.1.2' },
              { id: 'sec-sibling-2', title: 'Sibling 2', sectionNumber: '1.1.3' },
            ],
            total: 2,
          }),
        ],
      },
    ]);

    const result = await runTool(getSectionContext, { sectionId: 'sec-1.1.1' });

    expect(result.ancestors).toEqual([
      { id: 'sec-root', title: 'Root', sectionNumber: '1' },
      { id: 'sec-parent', title: 'Parent', sectionNumber: '1.1' },
    ]);
    expect(result.children).toEqual([
      { id: 'sec-child-1', title: 'Child 1', sectionNumber: '1.1.1.1' },
      { id: 'sec-child-2', title: 'Child 2', sectionNumber: '1.1.1.2' },
    ]);
    expect(result.siblings).toEqual([
      { id: 'sec-sibling', title: 'Sibling', sectionNumber: '1.1.2' },
      { id: 'sec-sibling-2', title: 'Sibling 2', sectionNumber: '1.1.3' },
    ]);
    expect(result).toMatchObject({
      siblingCount: 2,
      siblingsTruncated: false,
      childCount: 2,
      childrenTruncated: false,
    });
  });

  it('reports family totals when the windows are cut', async () => {
    const entries = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ id: `sec-${index}`, title: null, sectionNumber: `${index}` }));
    setupSession([
      { records: [] },
      { records: [mockRecord({ entries: entries(50), total: 2364 })] },
      { records: [mockRecord({ entries: entries(20), total: 2363 })] },
    ]);

    const result = await runTool(getSectionContext, { sectionId: 'sec-wide' });

    expect(result.children).toHaveLength(50);
    expect(result).toMatchObject({ childCount: 2364, childrenTruncated: true });
    expect(result.siblings).toHaveLength(20);
    expect(result).toMatchObject({ siblingCount: 2363, siblingsTruncated: true });
  });
});
