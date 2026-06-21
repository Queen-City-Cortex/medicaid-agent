import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@mastra/core/tools', () => ({
  createTool: (config: any) => config,
}));

vi.mock('../../src/neo4j.js', () => ({
  withSession: vi.fn(),
}));

import { getSection, getDocument, getSectionContext } from '../../src/tools/read.js';
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
            contentLength: 25,
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

  it('auto-fetches children for container headings', async () => {
    setupSession([
      {
        // First query: section with empty content
        records: [
          mockRecord({
            id: 'sec-parent',
            title: 'Parent Section',
            sectionNumber: '4',
            content: '',
            contentLength: 0,
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
        // Second query: children with content
        records: [
          mockRecord({
            parentTitle: 'Parent Section',
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

    const result = await runTool(getSection, { sectionId: 'sec-parent' });

    expect(result.section).not.toBeNull();
    expect(result.section!.content).toContain(
      '[Container heading with 2 child sections:]',
    );
    expect(result.section!.content).toContain('### Child A');
    expect(result.section!.content).toContain('Child A content');
    expect(result.section!.content).toContain('### Child B');
    expect(result.section!.content).toContain('Child B content');
  });

  it('returns empty container when no children have content', async () => {
    setupSession([
      {
        records: [
          mockRecord({
            id: 'sec-empty',
            title: 'Empty Container',
            sectionNumber: '5',
            content: '',
            contentLength: 0,
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
        // Second query: no children with content
        records: [
          mockRecord({
            parentTitle: 'Empty Container',
            children: [],
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

    const result = await runTool(getSection, { sectionId: 'sec-empty' });

    expect(result.section).not.toBeNull();
    expect(result.section!.id).toBe('sec-empty');
    // Falls through to the normal return path since children array is empty
    expect(result.section!.content).toBe('');
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
          mockRecord({ id: 'sec-child-1', title: 'Child 1', sectionNumber: '1.1.1.1' }),
          mockRecord({ id: 'sec-child-2', title: 'Child 2', sectionNumber: '1.1.1.2' }),
        ],
      },
      {
        // Siblings
        records: [
          mockRecord({ id: 'sec-sibling', title: 'Sibling', sectionNumber: '1.1.2' }),
          mockRecord({ id: 'sec-sibling-2', title: 'Sibling 2', sectionNumber: '1.1.3' }),
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
  });
});
