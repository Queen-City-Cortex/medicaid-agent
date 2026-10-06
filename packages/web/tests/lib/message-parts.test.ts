import { describe, it, expect } from 'vitest';
import type { UIMessage } from 'ai';
import {
  buildCitationResolver,
  extractMessageSources,
  getToolName,
  getTrailingAssistantText,
  hasRenderableAssistantPart,
  isToolPart,
  normalizeCitationUrl,
  resolveCitedSources,
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

// Federal rows: one URL per CFR part or SSA title, labels built by
// sectionLabel as "Policy <policyNumber> § <section>".
const CFR_URL = 'https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-C/part-441';
const SSA_URL = 'https://www.ssa.gov/OP_Home/ssact/title19/1900.htm';
const federalSource = (policy: string, section: string, url: string): MessageSource => ({
  key: `${policy}|${section}`,
  label: `Policy ${policy} § ${section}`,
  title: null,
  url,
  originTool: 'getSection',
  sectionNumber: section,
  snippet: null,
});
const documentSource = (policy: string, url: string): MessageSource => ({
  key: `${policy}|doc`,
  label: `Policy ${policy}`,
  title: null,
  url,
  originTool: 'getDocument',
  sectionNumber: null,
  snippet: null,
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

  it('resolves a link with no section label only when the URL names one row', () => {
    const sources = [sectionSource('2.2.1'), sectionSource('5.6')];
    const resolve = buildCitationResolver(sources);
    // A prose-phrase link names no section and two rows share its URL: there
    // is no telling which was meant, so it gets no footnote, not the first row.
    expect(resolve('see the chiropractic policy', SHARED_URL)).toBeUndefined();
    // With a single row for that URL the link can only mean that row.
    expect(buildCitationResolver([sectionSource('5.6')])('see the chiropractic policy', SHARED_URL)).toBe(1);
    // An unknown URL with an unknown label resolves to nothing.
    expect(resolve('whatever', 'https://example.com/unknown')).toBeUndefined();
  });

  it('prefers the document-level row over section rows when the link names no section', () => {
    const sources = [sectionSource('2.2.1'), sectionSource('5.6'), documentSource('1F', SHARED_URL)];
    const resolve = buildCitationResolver(sources);
    expect(resolve('see the chiropractic policy', SHARED_URL)).toBe(3);
  });

  it('gives a never-retrieved section no footnote, or the document-level row when one exists', () => {
    const sections = [sectionSource('2.2.1'), sectionSource('5.6')];
    // § 7.3 was never retrieved and has no ancestor row; "5.60" is not "5.6".
    expect(buildCitationResolver(sections)('Policy 1F § 7.3', SHARED_URL)).toBeUndefined();
    expect(buildCitationResolver(sections)('Policy 1F § 5.60', SHARED_URL)).toBeUndefined();
    const withDocument = [...sections, documentSource('1F', SHARED_URL)];
    expect(buildCitationResolver(withDocument)('Policy 1F § 7.3', SHARED_URL)).toBe(3);
  });

  it('resolves two CFR sections sharing one part URL to their own rows', () => {
    const sources = ['441.301', '441.302', '441.303'].map((section) => federalSource('42-CFR-441', section, CFR_URL));
    const resolve = buildCitationResolver(sources);
    // The prompt-mandated label never equals the row label
    // "Policy 42-CFR-441 § 441.302"; the section within the URL decides.
    expect(resolve('42 CFR § 441.302', CFR_URL)).toBe(2);
    expect(resolve('42 CFR § 441.303', CFR_URL)).toBe(3);
    // A paragraph citation lands on the section row that carries it.
    expect(resolve('42 CFR § 441.301(c)(2)', CFR_URL)).toBe(1);
    // A part section that was not retrieved gets no footnote.
    expect(resolve('42 CFR § 441.310', CFR_URL)).toBeUndefined();
  });

  it('resolves SSA § 1915(c) to its own row, or to the retrieved § 1915 row', () => {
    const exactRows = ['1902', '1915(c)', '1916A'].map((section) => federalSource('SSA-Title-19', section, SSA_URL));
    expect(buildCitationResolver(exactRows)('SSA § 1915(c)', SSA_URL)).toBe(2);
    expect(buildCitationResolver(exactRows)('SSA § 1916A', SSA_URL)).toBe(3);
    const parentRows = ['1902', '1905', '1915'].map((section) => federalSource('SSA-Title-19', section, SSA_URL));
    expect(buildCitationResolver(parentRows)('SSA § 1915(c)', SSA_URL)).toBe(3);
    expect(buildCitationResolver(parentRows)('SSA § 1902(a)(10)', SSA_URL)).toBe(1);
  });

  it('ignores a "(last revised ...)" suffix on the label', () => {
    const sources = ['441.301', '441.303'].map((section) => federalSource('42-CFR-441', section, CFR_URL));
    const resolve = buildCitationResolver(sources);
    expect(resolve('42 CFR § 441.303 (last revised 2024-05-10)', CFR_URL)).toBe(2);
  });

  it('treats an N.0 row as the parent of N.x: Policy 3L-1 § 5.6 resolves to § 5.0', () => {
    const url = 'https://medicaid.ncdhhs.gov/3l-1-state-plan-personal-care-services/download';
    const sources = ['3.2.1', '4.1', '5.0', '5.2'].map((section): MessageSource => ({
      ...sectionSource(section),
      key: `3L-1|${section}`,
      label: `Policy 3L-1 § ${section}`,
      url,
    }));
    const resolve = buildCitationResolver(sources);
    expect(resolve('Policy 3L-1 § 5.6', url)).toBe(3);
    // A deeper retrieved ancestor still wins over the N.0 row.
    expect(resolve('Policy 3L-1 § 5.2.1', url)).toBe(4);
    expect(resolve('Policy 3L-1 § 5.0', url)).toBe(3);
  });

  it('matches Policy 1-H § 3.2.1 to the Policy 1H rows sharing its URL', () => {
    const url = 'https://medicaid.ncdhhs.gov/1h-telehealth-virtual-communications/download';
    const sources = ['2.1.2', '3.2.1', '4.1'].map((section): MessageSource => ({
      ...sectionSource(section),
      key: `1H|${section}`,
      label: `Policy 1H § ${section}`,
      url,
    }));
    const resolve = buildCitationResolver(sources);
    expect(resolve('Policy 1-H § 3.2.1', url)).toBe(2);
  });
});

describe('resolveCitedSources', () => {
  const message = (text: string): UIMessage =>
    ({ id: 'm', role: 'assistant', parts: [{ type: 'text', text }] }) as unknown as UIMessage;

  it('counts only the rows the answer cites, not every row of a cited document', () => {
    const sources = [
      ...['441.301', '441.302', '441.303'].map((section) => federalSource('42-CFR-441', section, CFR_URL)),
      ...['1902', '1905', '1915'].map((section) => federalSource('SSA-Title-19', section, SSA_URL)),
    ];
    const { ordered, citedCount, resolveCitation } = resolveCitedSources(
      message(
        `Assurances [42 CFR § 441.302](${CFR_URL}) and [42 CFR § 441.303](${CFR_URL}); ` +
          `waivers [SSA § 1915(c)](${SSA_URL}); again [42 CFR § 441.302](${CFR_URL}).`,
      ),
      sources,
    );
    expect(citedCount).toBe(3);
    expect(ordered.map((s) => s.sectionNumber)).toEqual(['441.302', '441.303', '1915', '441.301', '1902', '1905']);
    // Footnote numbers follow the cited-first order.
    expect(resolveCitation('42 CFR § 441.302', CFR_URL)).toBe(1);
    expect(resolveCitation('42 CFR § 441.303', CFR_URL)).toBe(2);
    expect(resolveCitation('SSA § 1915(c)', SSA_URL)).toBe(3);
  });

  it('leaves a document consulted when the only citation of it names a section that was not retrieved', () => {
    const sources = ['441.301', '441.303'].map((section) => federalSource('42-CFR-441', section, CFR_URL));
    const { ordered, citedCount, resolveCitation } = resolveCitedSources(
      message(`See [42 CFR § 441.310](${CFR_URL}).`),
      sources,
    );
    expect(citedCount).toBe(0);
    expect(ordered).toEqual(sources);
    expect(resolveCitation('42 CFR § 441.310', CFR_URL)).toBeUndefined();
  });
});
