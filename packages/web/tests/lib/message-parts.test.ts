import { describe, it, expect } from 'vitest';
import type { UIMessage } from 'ai';
import {
  buildSourceIndex,
  extractMessageSources,
  getToolName,
  getTrailingAssistantText,
  hasRenderableAssistantPart,
  isToolPart,
  normalizeCitationUrl,
  type MessageSource,
} from '../../src/lib/message-parts';

describe('isToolPart', () => {
  it('returns true for dynamic-tool type', () => {
    expect(isToolPart({ type: 'dynamic-tool' })).toBe(true);
  });

  it('returns true for tool-<name> type', () => {
    expect(isToolPart({ type: 'tool-searchSections' })).toBe(true);
  });

  it('returns false for tool-output type', () => {
    expect(isToolPart({ type: 'tool-output' })).toBe(false);
  });

  it('returns false for text type', () => {
    expect(isToolPart({ type: 'text' })).toBe(false);
  });

  it('returns false for step-start type', () => {
    expect(isToolPart({ type: 'step-start' })).toBe(false);
  });
});

describe('getToolName', () => {
  it('returns toolName property when present', () => {
    expect(getToolName({ type: 'dynamic-tool', toolName: 'searchSections' })).toBe('searchSections');
  });

  it('extracts name from tool- prefix', () => {
    expect(getToolName({ type: 'tool-getSection' })).toBe('getSection');
  });

  it('returns unknown for non-tool types', () => {
    expect(getToolName({ type: 'text' })).toBe('unknown');
  });
});

describe('getTrailingAssistantText', () => {
  function makeMsg(parts: UIMessage['parts']): UIMessage {
    return { id: 'msg-1', role: 'assistant', parts };
  }

  it('returns all text when no tool parts exist', () => {
    const result = getTrailingAssistantText(makeMsg([
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'world' },
    ]));

    expect(result).toBe('Hello world');
  });

  it('keeps only trailing text after the last tool', () => {
    const result = getTrailingAssistantText(makeMsg([
      { type: 'text', text: 'Let me search...' },
      { type: 'tool-searchSections', toolCallId: 'tc-1', state: 'output-available' },
      { type: 'text', text: 'Final answer' },
    ]));

    expect(result).toBe('Final answer');
  });

  it('returns empty string for messages with no trailing text after tools', () => {
    const result = getTrailingAssistantText(makeMsg([
      { type: 'dynamic-tool', toolName: 'searchSections', toolCallId: 'tc-dyn', state: 'input-streaming' },
    ]));

    expect(result).toBe('');
  });
});

describe('hasRenderableAssistantPart', () => {
  it('returns true for non-empty text', () => {
    expect(hasRenderableAssistantPart([{ type: 'text', text: 'hello' }])).toBe(true);
  });

  it('returns true for tool parts', () => {
    expect(hasRenderableAssistantPart([{ type: 'dynamic-tool', toolName: 'searchSections' }])).toBe(true);
  });

  it('ignores step-start and whitespace-only text', () => {
    expect(hasRenderableAssistantPart([
      { type: 'step-start' },
      { type: 'text', text: '   ' },
    ])).toBe(false);
  });
});

describe('extractMessageSources', () => {
  function makeMsg(parts: UIMessage['parts']): UIMessage {
    return { id: 'msg-1', role: 'assistant', parts };
  }

  it('returns empty when there are no tool parts', () => {
    expect(extractMessageSources(makeMsg([
      { type: 'text', text: 'just text' },
    ]))).toEqual([]);
  });

  it('pulls a section source from getSection output', () => {
    const sources = extractMessageSources(makeMsg([
      {
        type: 'dynamic-tool',
        toolName: 'getSection',
        toolCallId: 'tc-1',
        state: 'output-available',
        output: {
          section: {
            id: 'sec:doc:clinical_policy:8C:3.2.1',
            title: 'Outpatient Behavioral Health',
            sectionNumber: '3.2.1',
            policyNumber: '8C',
            url: 'https://medicaid.ncdhhs.gov/8c/download',
          },
        },
      },
    ]));

    expect(sources).toHaveLength(1);
    expect(sources[0].label).toBe('Policy 8C § 3.2.1');
    expect(sources[0].url).toBe('https://medicaid.ncdhhs.gov/8c/download');
    expect(sources[0].originTool).toBe('getSection');
  });

  it('deduplicates the same section seen via multiple tools', () => {
    const sharedSection = {
      id: 'sec:x',
      title: 'X',
      sectionNumber: '2.1',
      policyNumber: '8C',
      url: 'https://example.com/8c',
    };
    const sources = extractMessageSources(makeMsg([
      {
        type: 'dynamic-tool',
        toolName: 'searchSections',
        toolCallId: 'tc-1',
        state: 'output-available',
        output: { sections: [sharedSection] },
      },
      {
        type: 'dynamic-tool',
        toolName: 'getSection',
        toolCallId: 'tc-2',
        state: 'output-available',
        output: { section: sharedSection },
      },
    ]));

    expect(sources).toHaveLength(1);
  });

  it('extracts from resolveAnswerFrame primary and supporting sections', () => {
    const sources = extractMessageSources(makeMsg([
      {
        type: 'dynamic-tool',
        toolName: 'resolveAnswerFrame',
        toolCallId: 'tc-1',
        state: 'output-available',
        output: {
          frame: {
            authoritativeDocuments: [
              { id: 'doc:a', policyNumber: '8C', title: 'CCP 8C', url: 'https://example.com/8c' },
            ],
            primarySections: [
              { id: 'sec:a', policyNumber: '8C', sectionNumber: '2.1.1', title: 'Scope', url: 'https://example.com/8c' },
            ],
            supportingSections: [
              { id: 'sec:b', policyNumber: '8C', sectionNumber: '4.1', title: 'Not Covered', url: 'https://example.com/8c' },
            ],
          },
        },
      },
    ]));

    // Doc + two distinct sections at the same URL = 3 entries (keys differ by section/doc dimension)
    expect(sources).toHaveLength(3);
    expect(sources.map((s) => s.label).sort()).toEqual(['Policy 8C', 'Policy 8C § 2.1.1', 'Policy 8C § 4.1']);
  });

  it('drops entries with no URL', () => {
    const sources = extractMessageSources(makeMsg([
      {
        type: 'dynamic-tool',
        toolName: 'getSection',
        toolCallId: 'tc-1',
        state: 'output-available',
        output: {
          section: { id: 'sec:x', title: 'X', sectionNumber: '1.0', policyNumber: '8C', url: null },
        },
      },
    ]));

    expect(sources).toEqual([]);
  });

  it('labels numeric section numbers with § and non-numeric handles with em-dash', () => {
    const sources = extractMessageSources(makeMsg([
      {
        type: 'dynamic-tool',
        toolName: 'searchSections',
        toolCallId: 'tc-1',
        state: 'output-available',
        output: {
          sections: [
            { id: 'sec:a', policyNumber: '8C', sectionNumber: '3.2.1', title: 'Covered', url: 'https://example.com/a' },
            { id: 'sec:b', policyNumber: '8C', sectionNumber: 'Attachment A', title: 'Claims Info', url: 'https://example.com/b' },
          ],
        },
      },
    ]));

    const labels = sources.map((s) => s.label);
    expect(labels).toContain('Policy 8C § 3.2.1');
    expect(labels).toContain('Policy 8C — Attachment A');
    // No `§ Attachment A` — that's legal-typography garbage.
    for (const l of labels) {
      expect(l).not.toMatch(/§\s+Attachment/);
    }
  });

  it('disambiguates duplicate doc-level labels using URL path', () => {
    const sources = extractMessageSources(makeMsg([
      {
        type: 'dynamic-tool',
        toolName: 'lookupPolicy',
        toolCallId: 'tc-1',
        state: 'output-available',
        output: {
          documents: [
            { id: 'doc:a', policyNumber: '8C', title: 'Outpatient BH', url: 'https://medicaid.ncdhhs.gov/8c-main/download' },
            { id: 'doc:b', policyNumber: '8C', title: 'CPT Codes Attachment', url: 'https://medicaid.ncdhhs.gov/8c-cpt-codes/download' },
          ],
        },
      },
    ]));

    const labels = sources.map((s) => s.label).sort();
    expect(labels).toEqual(['Policy 8C (8c-cpt-codes)', 'Policy 8C (8c-main)']);
  });

  it('does not disambiguate when only one source has a given label', () => {
    const sources = extractMessageSources(makeMsg([
      {
        type: 'dynamic-tool',
        toolName: 'lookupPolicy',
        toolCallId: 'tc-1',
        state: 'output-available',
        output: {
          documents: [
            { id: 'doc:a', policyNumber: '8C', title: 'Outpatient BH', url: 'https://medicaid.ncdhhs.gov/8c-main/download' },
          ],
        },
      },
    ]));
    expect(sources[0].label).toBe('Policy 8C');
  });

  it('sorts sections in natural order with document-level entries last', () => {
    const sources = extractMessageSources(makeMsg([
      {
        type: 'dynamic-tool',
        toolName: 'resolveAnswerFrame',
        toolCallId: 'tc-1',
        state: 'output-available',
        output: {
          frame: {
            authoritativeDocuments: [
              { id: 'doc:a', policyNumber: '8C', title: 'Policy 8C main', url: 'https://example.com/8c-main' },
            ],
            primarySections: [
              { id: 'sec:d', policyNumber: '8C', sectionNumber: 'Attachment A', title: 'Att', url: 'https://example.com/a' },
              { id: 'sec:c', policyNumber: '8C', sectionNumber: '4.2.1.1', title: 'D', url: 'https://example.com/c' },
              { id: 'sec:a', policyNumber: '8C', sectionNumber: '1.0', title: 'A', url: 'https://example.com/d' },
              { id: 'sec:b', policyNumber: '8C', sectionNumber: '3.1', title: 'B', url: 'https://example.com/e' },
            ],
          },
        },
      },
    ]));

    const labels = sources.map((s) => s.label);
    // Numeric sections in natural order, then non-numeric, then doc-level last.
    expect(labels).toEqual([
      'Policy 8C § 1.0',
      'Policy 8C § 3.1',
      'Policy 8C § 4.2.1.1',
      'Policy 8C — Attachment A',
      'Policy 8C',
    ]);
  });

  it('handles lookupPolicy and getAmendments document arrays', () => {
    const sources = extractMessageSources(makeMsg([
      {
        type: 'dynamic-tool',
        toolName: 'lookupPolicy',
        toolCallId: 'tc-1',
        state: 'output-available',
        output: {
          documents: [
            { id: 'doc:a', policyNumber: '3K-2', title: 'CAP/DA', url: 'https://example.com/3k2' },
          ],
        },
      },
      {
        type: 'dynamic-tool',
        toolName: 'getAmendments',
        toolCallId: 'tc-2',
        state: 'output-available',
        output: {
          authoritativeDocument: {
            id: 'doc:a',
            policyNumber: '3K-2',
            title: 'CAP/DA',
            url: 'https://example.com/3k2',
          },
          amendments: [
            { id: 'doc:a:cn1', policyNumber: '3K-2 CN', title: 'Change Notice 1', url: 'https://example.com/cn1' },
          ],
        },
      },
    ]));

    // 3K-2 doc is deduped across lookupPolicy + getAmendments; CN is separate.
    expect(sources.map((s) => s.label)).toContain('Policy 3K-2');
    expect(sources.map((s) => s.label)).toContain('Policy 3K-2 CN');
  });
});

describe('normalizeCitationUrl', () => {
  it('returns null for empty / missing', () => {
    expect(normalizeCitationUrl(null)).toBeNull();
    expect(normalizeCitationUrl(undefined)).toBeNull();
    expect(normalizeCitationUrl('')).toBeNull();
    expect(normalizeCitationUrl('   ')).toBeNull();
  });

  it('collapses trailing slash, case, and `?attachment` flag', () => {
    const a = normalizeCitationUrl('https://Medicaid.NCDHHS.gov/8c/download/');
    const b = normalizeCitationUrl('https://medicaid.ncdhhs.gov/8c/download?attachment');
    expect(a).toBe(b);
  });

  it('keeps distinct URLs distinct', () => {
    const a = normalizeCitationUrl('https://medicaid.ncdhhs.gov/8c-main/download');
    const b = normalizeCitationUrl('https://medicaid.ncdhhs.gov/8c-cpt-codes/download');
    expect(a).not.toBe(b);
  });
});

describe('buildSourceIndex', () => {
  const makeSource = (key: string, url: string): MessageSource => ({
    key,
    label: `Label ${key}`,
    title: null,
    url,
    originTool: 'getSection',
    sectionNumber: null,
  });

  it('indexes sources 1-based in array order', () => {
    const sources = [
      makeSource('a', 'https://example.com/a'),
      makeSource('b', 'https://example.com/b'),
      makeSource('c', 'https://example.com/c'),
    ];
    const index = buildSourceIndex(sources);
    expect(index.get('https://example.com/a')).toBe(1);
    expect(index.get('https://example.com/b')).toBe(2);
    expect(index.get('https://example.com/c')).toBe(3);
  });

  it('matches agent citations through normalization', () => {
    const sources = [
      makeSource('a', 'https://medicaid.ncdhhs.gov/8c/download'),
    ];
    const index = buildSourceIndex(sources);
    // Agent may emit the URL with `?attachment`; index lookup must still hit.
    const normalized = normalizeCitationUrl('https://medicaid.ncdhhs.gov/8c/download?attachment');
    expect(normalized).not.toBeNull();
    expect(index.get(normalized!)).toBe(1);
  });
});
