import { describe, it, expect, beforeEach } from 'vitest';
import { extractSources, buildSourceText, SourceEntry } from '../../src/processors/hallucination-verifier.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

interface ToolResultPayload {
  toolCallId: string;
  toolName: string;
  result: unknown;
}

function makeStep(toolResults: ToolResultPayload[]) {
  return {
    toolResults: toolResults.map((p) => ({
      type: 'tool-result' as const,
      payload: p,
    })),
  };
}

// ── extractSources ───────────────────────────────────────────────────────────

describe('extractSources', () => {
  // Test 1: getSection
  it('extracts getSection content keyed by section ID', () => {
    const steps = [
      makeStep([
        {
          toolCallId: 'call-1',
          toolName: 'getSection',
          result: {
            section: {
              id: 'doc-8c:sec-4.1',
              title: 'Eligibility Requirements',
              sectionNumber: '4.1',
              content: 'To be eligible, a person must meet the following criteria...',
              effectiveDate: '2025-01-01',
              documentId: 'doc-8c',
              documentType: 'dhhs_policy',
              policyNumber: '8C',
            },
          },
        },
      ]),
    ];

    const sources = extractSources(steps);

    expect(sources).toHaveLength(1);
    expect(sources[0].toolName).toBe('getSection');
    expect(sources[0].key).toBe('doc-8c:sec-4.1');
    expect(sources[0].text).toContain('[getSection]');
    expect(sources[0].text).toContain('doc-8c:sec-4.1');
    expect(sources[0].text).toContain('Eligibility Requirements');
    expect(sources[0].text).toContain('To be eligible, a person must meet the following criteria...');
    expect(sources[0].text).toContain('Policy: 8C');
  });

  // Test 2: getAmendments
  it('extracts getAmendments authoritative document and change summaries', () => {
    const steps = [
      makeStep([
        {
          toolCallId: 'call-amend',
          toolName: 'getAmendments',
          result: {
            amendments: [
              {
                id: 'amend-2',
                title: 'Change Notice 2025-03',
                documentType: 'change_notice',
                policyNumber: '8C-CN-03',
                effectiveDate: '2025-08-01',
                url: 'https://example.com/cn-03',
                status: 'amendment',
                changeSummary: 'Revises eligibility criteria for adult day care.',
              },
            ],
            baseDocument: {
              id: 'doc-base',
              title: 'Original Policy 8C',
              documentType: 'dhhs_policy',
              policyNumber: '8C',
              effectiveDate: '2024-01-01',
              url: 'https://example.com/8C',
              status: 'superseded',
            },
            authoritativeDocument: {
              id: 'amend-2',
              title: 'Change Notice 2025-03',
              documentType: 'change_notice',
              policyNumber: '8C-CN-03',
              effectiveDate: '2025-08-01',
              url: 'https://example.com/cn-03',
              status: 'amendment',
            },
          },
        },
      ]),
    ];

    const sources = extractSources(steps);

    expect(sources).toHaveLength(1);
    expect(sources[0].toolName).toBe('getAmendments');
    expect(sources[0].key).toBe('amend-2');
    expect(sources[0].text).toContain('[getAmendments]');
    expect(sources[0].text).toContain('Authoritative document');
    expect(sources[0].text).toContain('amend-2');
    expect(sources[0].text).toContain('Revises eligibility criteria for adult day care.');
    expect(sources[0].text).toContain('doc-base');
    expect(sources[0].text).toContain('Base document');
  });

  // Test 3: lookupPolicy
  it('extracts lookupPolicy document metadata', () => {
    const steps = [
      makeStep([
        {
          toolCallId: 'call-lookup',
          toolName: 'lookupPolicy',
          result: {
            documents: [
              {
                id: 'doc-8c',
                title: 'Policy 8C: Community Alternatives',
                documentType: 'dhhs_policy',
                policyNumber: '8C',
                effectiveDate: '2025-01-01',
                url: 'https://example.com/8C',
                status: 'current',
                sections: [
                  { id: 'doc-8c:sec-1', number: '1', title: 'Introduction' },
                  { id: 'doc-8c:sec-2', number: '2', title: 'Eligibility' },
                ],
              },
            ],
          },
        },
      ]),
    ];

    const sources = extractSources(steps);

    expect(sources).toHaveLength(1);
    expect(sources[0].toolName).toBe('lookupPolicy');
    expect(sources[0].key).toBe('doc-8c');
    expect(sources[0].text).toContain('[lookupPolicy]');
    expect(sources[0].text).toContain('Policy 8C: Community Alternatives');
    expect(sources[0].text).toContain('doc-8c');
    expect(sources[0].text).toContain('Introduction');
    expect(sources[0].text).toContain('Eligibility');
  });

  // Test 4: getDocument
  it('extracts getDocument metadata', () => {
    const steps = [
      makeStep([
        {
          toolCallId: 'call-doc',
          toolName: 'getDocument',
          result: {
            document: {
              id: 'doc-42cfr440',
              title: '42 CFR Part 440',
              documentType: 'federal_regulation',
              policyNumber: '42 CFR 440',
              effectiveDate: '2024-07-01',
              url: 'https://ecfr.gov/440',
              status: 'current',
              sections: [
                { id: 'doc-42cfr440:sec-440.1', number: '440.1', title: 'Definitions', chars: 2000 },
                { id: 'doc-42cfr440:sec-440.10', number: '440.10', title: 'Inpatient hospital services', chars: 3500 },
              ],
            },
          },
        },
      ]),
    ];

    const sources = extractSources(steps);

    expect(sources).toHaveLength(1);
    expect(sources[0].toolName).toBe('getDocument');
    expect(sources[0].key).toBe('doc-42cfr440');
    expect(sources[0].text).toContain('[getDocument]');
    expect(sources[0].text).toContain('42 CFR Part 440');
    expect(sources[0].text).toContain('doc-42cfr440');
    expect(sources[0].text).toContain('Definitions');
    expect(sources[0].text).toContain('Inpatient hospital services');
  });

  // Test 5: followReferences
  it('extracts followReferences cross-reference data', () => {
    const steps = [
      makeStep([
        {
          toolCallId: 'call-refs',
          toolName: 'followReferences',
          result: {
            references: [
              {
                targetId: 'doc-42cfr440:sec-440.1',
                targetType: 'Section',
                targetTitle: 'Definitions',
                targetPolicyNumber: '42 CFR 440',
                relationshipType: 'REFERENCES',
                referenceText: 'as defined in 42 CFR 440.1',
              },
              {
                targetId: 'doc-42cfr',
                targetType: 'Document',
                targetTitle: '42 CFR Part 440',
                targetPolicyNumber: '42 CFR 440',
                relationshipType: 'REFERENCES_DOCUMENT',
                referenceText: 'pursuant to 42 CFR 440',
              },
            ],
          },
        },
      ]),
    ];

    const sources = extractSources(steps);

    expect(sources).toHaveLength(1);
    expect(sources[0].toolName).toBe('followReferences');
    expect(sources[0].key).toBe('followReferences:call-refs');
    expect(sources[0].text).toContain('[followReferences]');
    expect(sources[0].text).toContain('doc-42cfr440:sec-440.1');
    expect(sources[0].text).toContain('Definitions');
    expect(sources[0].text).toContain('as defined in 42 CFR 440.1');
    expect(sources[0].text).toContain('REFERENCES_DOCUMENT');
  });

  // Test 6: ignored tools
  it('ignores searchSections, getSectionContext, and findConceptSections', () => {
    const steps = [
      makeStep([
        {
          toolCallId: 'call-search',
          toolName: 'searchSections',
          result: {
            sections: [{ id: 'sec-1', title: 'Found Section', score: 0.9 }],
          },
        },
        {
          toolCallId: 'call-ctx',
          toolName: 'getSectionContext',
          result: {
            ancestors: [],
            siblings: [],
            children: [{ id: 'sec-child', title: 'Child', sectionNumber: '1.1' }],
          },
        },
        {
          toolCallId: 'call-concept',
          toolName: 'findConceptSections',
          result: {
            sections: [{ id: 'sec-concept', title: 'Concept Section', score: 0.85 }],
          },
        },
      ]),
    ];

    const sources = extractSources(steps);

    expect(sources).toHaveLength(0);
  });

  // Test 7: multiple steps
  it('collects sources across multiple steps', () => {
    const steps = [
      makeStep([
        {
          toolCallId: 'call-s1',
          toolName: 'getSection',
          result: {
            section: {
              id: 'doc-8c:sec-1',
              title: 'Introduction',
              sectionNumber: '1',
              content: 'This policy covers...',
              effectiveDate: null,
              documentId: 'doc-8c',
              documentType: 'dhhs_policy',
              policyNumber: '8C',
            },
          },
        },
      ]),
      makeStep([
        {
          toolCallId: 'call-s2',
          toolName: 'getSection',
          result: {
            section: {
              id: 'doc-8c:sec-2',
              title: 'Eligibility',
              sectionNumber: '2',
              content: 'Eligibility requires...',
              effectiveDate: null,
              documentId: 'doc-8c',
              documentType: 'dhhs_policy',
              policyNumber: '8C',
            },
          },
        },
        {
          toolCallId: 'call-lookup',
          toolName: 'lookupPolicy',
          result: {
            documents: [
              {
                id: 'doc-8c',
                title: 'Policy 8C',
                documentType: 'dhhs_policy',
                policyNumber: '8C',
                effectiveDate: '2025-01-01',
                url: null,
                status: 'current',
                sections: [],
              },
            ],
          },
        },
      ]),
    ];

    const sources = extractSources(steps);

    expect(sources).toHaveLength(3);
    expect(sources[0].key).toBe('doc-8c:sec-1');
    expect(sources[1].key).toBe('doc-8c:sec-2');
    expect(sources[2].key).toBe('doc-8c');
  });

  // Test 8: no retrieval tools called
  it('returns empty array when no retrieval tools were called', () => {
    const steps = [
      makeStep([]),
      makeStep([
        {
          toolCallId: 'call-search',
          toolName: 'searchSections',
          result: { sections: [] },
        },
      ]),
    ];

    const sources = extractSources(steps);

    expect(sources).toHaveLength(0);
  });

  // getSection with null section
  it('skips getSection result when section is null', () => {
    const steps = [
      makeStep([
        {
          toolCallId: 'call-null',
          toolName: 'getSection',
          result: { section: null },
        },
      ]),
    ];

    const sources = extractSources(steps);

    expect(sources).toHaveLength(0);
  });

  // lookupPolicy with empty documents
  it('skips lookupPolicy result when no documents found', () => {
    const steps = [
      makeStep([
        {
          toolCallId: 'call-empty',
          toolName: 'lookupPolicy',
          result: { documents: [] },
        },
      ]),
    ];

    const sources = extractSources(steps);

    expect(sources).toHaveLength(0);
  });
});

// ── buildSourceText ──────────────────────────────────────────────────────────

describe('buildSourceText', () => {
  // Test 9: empty sources
  it('returns "(No source documents were retrieved.)" for empty sources', () => {
    const result = buildSourceText([], 'some answer text');
    expect(result).toBe('(No source documents were retrieved.)');
  });

  // Test 10: prioritizes cited sources first
  it('prioritizes cited sources first', () => {
    const sources: SourceEntry[] = [
      { toolName: 'getSection', key: 'sec-uncited', text: '[getSection]\nUncited section content' },
      { toolName: 'getSection', key: 'sec-cited', text: '[getSection]\nCited section content' },
    ];

    // Answer text mentions sec-cited but not sec-uncited
    const answerText = 'According to sec-cited, the policy states...';
    const result = buildSourceText(sources, answerText);

    // sec-cited should appear before sec-uncited
    const citedPos = result.indexOf('Cited section content');
    const uncitedPos = result.indexOf('Uncited section content');
    expect(citedPos).toBeLessThan(uncitedPos);
    expect(citedPos).toBeGreaterThanOrEqual(0);
    expect(uncitedPos).toBeGreaterThanOrEqual(0);
  });

  // Test 11: truncates when over char limit
  it('truncates when over char limit', () => {
    const longText = 'x'.repeat(500);
    const sources: SourceEntry[] = [
      { toolName: 'getSection', key: 'sec-1', text: `[getSection] sec-1\n${longText}` },
      { toolName: 'getSection', key: 'sec-2', text: `[getSection] sec-2\n${longText}` },
      { toolName: 'getSection', key: 'sec-3', text: `[getSection] sec-3\n${longText}` },
    ];

    // Set a tight limit that fits only ~1 source
    const maxChars = 600;
    const result = buildSourceText(sources, '', maxChars);

    // Should contain the first source's text
    expect(result).toContain('sec-1');
    // Should contain a truncation notice
    expect(result).toContain('truncated');
    // Total length should not wildly exceed the limit
    expect(result.length).toBeLessThan(maxChars + 200);
  });

  it('includes all sources when under char limit', () => {
    const sources: SourceEntry[] = [
      { toolName: 'getSection', key: 'sec-a', text: '[getSection]\nShort A' },
      { toolName: 'getSection', key: 'sec-b', text: '[getSection]\nShort B' },
    ];

    const result = buildSourceText(sources, '', 10000);

    expect(result).toContain('Short A');
    expect(result).toContain('Short B');
    expect(result).not.toContain('truncated');
  });
});
