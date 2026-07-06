import { describe, it, expect } from 'vitest';
import type { UIMessage } from 'ai';
import {
  buildCitationResolver,
  extractMessageSources,
  extractVerificationState,
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
      { type: 'tool-searchSections', toolCallId: 'tc-1', state: 'output-available', input: {}, output: {} },
      { type: 'text', text: 'Final answer' },
    ]));

    expect(result).toBe('Final answer');
  });

  it('returns empty string for messages with no trailing text after tools', () => {
    const result = getTrailingAssistantText(makeMsg([
      { type: 'dynamic-tool', toolName: 'searchSections', toolCallId: 'tc-dyn', state: 'input-streaming', input: {} },
    ]));

    expect(result).toBe('');
  });
});

describe('hasRenderableAssistantPart', () => {
  it('returns true for non-empty text', () => {
    expect(hasRenderableAssistantPart([{ type: 'text', text: 'hello' }])).toBe(true);
  });

  it('returns true for tool parts', () => {
    expect(hasRenderableAssistantPart([{ type: 'dynamic-tool', toolName: 'searchSections', toolCallId: 'tc-1', state: 'input-streaming', input: {} }])).toBe(true);
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
        input: {},
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
        input: {},
        output: { sections: [sharedSection] },
      },
      {
        type: 'dynamic-tool',
        toolName: 'getSection',
        toolCallId: 'tc-2',
        state: 'output-available',
        input: {},
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
        input: {},
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
        input: {},
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
        input: {},
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
        input: {},
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
        input: {},
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
        input: {},
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
        input: {},
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
        input: {},
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

describe('buildCitationResolver', () => {
  // All sections of one policy PDF share a single download URL.
  const SHARED_URL = 'https://medicaid.ncdhhs.gov/1f-chiropractic-services/download?attachment';
  const sectionSource = (section: string): MessageSource => ({
    key: `1F|${section}`,
    label: `Policy 1F § ${section}`,
    title: null,
    url: SHARED_URL,
    originTool: 'getSection',
    sectionNumber: section,
    snippet: null,
  });

  it('maps each section of one shared-URL policy to its own row (not a single collapsed number)', () => {
    const sources = [
      sectionSource('2.2.1'), // row 1
      sectionSource('3.2.1'), // row 2
      sectionSource('5.6'),   // row 5-equivalent (here row 3)
    ];
    const resolve = buildCitationResolver(sources);
    // The agent emits the section label as the link text; each must resolve to
    // its OWN row, even though all three share one URL.
    expect(resolve('Policy 1F § 2.2.1', SHARED_URL)).toBe(1);
    expect(resolve('Policy 1F § 3.2.1', SHARED_URL)).toBe(2);
    expect(resolve('Policy 1F § 5.6', SHARED_URL)).toBe(3);
    // Regression guard: a URL-only resolver would return 1 for all three.
    expect(new Set([
      resolve('Policy 1F § 2.2.1', SHARED_URL),
      resolve('Policy 1F § 3.2.1', SHARED_URL),
      resolve('Policy 1F § 5.6', SHARED_URL),
    ]).size).toBe(3);
  });

  it('maps a cited subsection to its deepest retrieved ancestor in the same policy', () => {
    const sources = [
      sectionSource('3.2'), // row 1
      sectionSource('5.2'), // row 2
      sectionSource('5.1'), // row 3
    ];
    const resolve = buildCitationResolver(sources);
    // § 5.2.1 / § 5.2.3 weren't retrieved as their own rows; resolve to the
    // ancestor § 5.2 (row 2), NOT the unrelated first row of the same PDF.
    expect(resolve('Policy 1F § 5.2.1', SHARED_URL)).toBe(2);
    expect(resolve('Policy 1F § 5.2.3', SHARED_URL)).toBe(2);
    // An exact section row still wins over the ancestor heuristic.
    expect(resolve('Policy 1F § 5.1', SHARED_URL)).toBe(3);
  });

  it('falls back to URL match when the link label is not a source label', () => {
    const sources = [sectionSource('2.2.1'), sectionSource('5.6')];
    const resolve = buildCitationResolver(sources);
    // A prose-phrase link (label not a row label) still resolves via URL to the
    // first row sharing that URL.
    expect(resolve('see the chiropractic policy', SHARED_URL)).toBe(1);
    // An unknown URL with an unknown label resolves to nothing.
    expect(resolve('whatever', 'https://example.com/unknown')).toBeUndefined();
  });
});

// ── extractVerificationState ─────────────────────────────────────────────────

function msgWith(parts: unknown[]): UIMessage {
  return { id: 'm', role: 'assistant', parts } as unknown as UIMessage;
}

describe('extractVerificationState', () => {
  it('returns null when no verification parts are present', () => {
    expect(extractVerificationState(msgWith([]))).toBeNull();
    expect(
      extractVerificationState(msgWith([{ type: 'text', text: 'hi' }])),
    ).toBeNull();
  });

  it('extracts rewrite state with counts and severity', () => {
    const state = extractVerificationState(
      msgWith([
        { type: 'text', text: 'answer' },
        {
          type: 'data-verification-rewrite',
          data: {
            severity: 'medium',
            confidence: 0.7,
            counts: { unsupported: 1, missingCitation: 0, relevanceMajor: 0, relevanceMinor: 0 },
            pureMarkerFallback: false,
          },
        },
      ]),
    );
    expect(state).toEqual({
      severity: 'medium',
      confidence: 0.7,
      rewrote: true,
      counts: { unsupported: 1, missingCitation: 0, relevanceMajor: 0, relevanceMinor: 0 },
      pureMarkerFallback: false,
    });
  });

  it('extracts the no-rewrite happy path from data-verification-ok', () => {
    const state = extractVerificationState(
      msgWith([
        {
          type: 'data-verification-ok',
          data: { severity: 'high', confidence: 1, counts: {} },
        },
      ]),
    );
    expect(state?.rewrote).toBe(false);
    expect(state?.severity).toBe('high');
    expect(state?.confidence).toBe(1);
  });

  it('prefers rewrite over ok when both are present', () => {
    const state = extractVerificationState(
      msgWith([
        { type: 'data-verification-ok', data: { severity: 'high', confidence: 1 } },
        {
          type: 'data-verification-rewrite',
          data: { severity: 'low', confidence: 0.2, counts: { unsupported: 3 } },
        },
      ]),
    );
    expect(state?.rewrote).toBe(true);
    expect(state?.severity).toBe('low');
  });

  it('surfaces pureMarkerFallback when the rewrite was unusable', () => {
    const state = extractVerificationState(
      msgWith([
        {
          type: 'data-verification-rewrite',
          data: {
            severity: 'low',
            confidence: 0.4,
            counts: {},
            pureMarkerFallback: true,
          },
        },
      ]),
    );
    expect(state?.pureMarkerFallback).toBe(true);
  });

  it('rejects malformed parts without throwing', () => {
    const state = extractVerificationState(
      msgWith([
        { type: 'data-verification-rewrite', data: { severity: 'bogus', confidence: 0.5 } },
        { type: 'data-verification-ok', data: { severity: 'high', confidence: 'not-a-number' } },
      ]),
    );
    expect(state).toBeNull();
  });
});
