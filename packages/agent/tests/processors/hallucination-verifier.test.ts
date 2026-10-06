import { describe, it, expect, vi } from 'vitest';
import { extractSources, buildSourceText, verifyAnswer, SourceEntry, VERIFICATION_UNAVAILABLE } from '../../src/processors/hallucination-verifier.js';

vi.mock('ai', async original => ({ ...await original<typeof import('ai')>(), generateObject: vi.fn() }));
import { generateObject } from 'ai';
import { sourceUrlSet } from '../../src/processors/verifier/answer-validation.js';

import { makeDocument, makeFrame, makeSection } from '../helpers/answer-frame-fixtures.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

interface ToolResultInput {
  toolCallId: string;
  toolName: string;
  output: unknown;
}

/** Create a message with tool-invocation parts (Mastra's runtime format) */
function makeToolMessage(toolResults: ToolResultInput[]) {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role: 'assistant' as const,
    content: {
      parts: toolResults.map((tr) => ({
        type: 'tool-invocation' as const,
        toolInvocation: {
          state: 'result' as const,
          toolCallId: tr.toolCallId,
          toolName: tr.toolName,
          result: tr.output,
        },
      })),
    },
  };
}

// ── extractSources ───────────────────────────────────────────────────────────

describe('extractSources', () => {
  // Test 1: getSection
  it('extracts getSection content keyed by section ID', () => {
    const msgs = [
      makeToolMessage([
        {
          toolCallId: 'call-1',
          toolName: 'getSection',
          output: {
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

    const sources = extractSources(msgs);

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
  it('extracts the queried document, its latest amendment and the change summaries from getAmendments', () => {
    const notice = {
      id: 'amend-2',
      title: 'Change Notice 2025-03',
      documentType: 'change_notice',
      policyNumber: '8C-CN-03',
      effectiveDate: '2025-08-01',
      url: 'https://example.com/cn-03',
      status: 'amendment',
      changeSummary: 'Revises eligibility criteria for adult day care.',
    };
    const msgs = [
      makeToolMessage([
        {
          toolCallId: 'call-amend',
          toolName: 'getAmendments',
          output: {
            document: {
              id: 'doc-8c',
              title: 'Policy 8C',
              documentType: 'dhhs_policy',
              policyNumber: '8C',
              effectiveDate: null,
              url: 'https://example.com/8C',
              status: 'current',
            },
            amends: [],
            amendments: [notice],
            latestAmendment: notice,
            truncated: false,
          },
        },
      ]),
    ];

    const sources = extractSources(msgs);

    expect(sources).toHaveLength(1);
    expect(sources[0].toolName).toBe('getAmendments');
    // Keyed apart from a getDocument entry for the same document.
    expect(sources[0].key).toBe('amendments:doc-8c');
    expect(sources[0].link).toBe('https://example.com/8C');
    const text = sources[0].text;
    expect(text).toContain('[getAmendments]');
    expect(text).not.toContain('Authoritative document');
    expect(text.indexOf('Queried document:\nID: doc-8c')).toBeGreaterThan(-1);
    expect(text.indexOf('Latest amendment:\nID: amend-2')).toBeGreaterThan(text.indexOf('Queried document:'));
    expect(text).toContain('Amendments (1):');
    expect(text).toContain('Revises eligibility criteria for adult day care.');
  });

  // A DHHS change notice's date is the one printed in its header: when the
  // notice was issued, not when a policy took effect.
  const dateLabelSources = (output: Record<string, unknown>, toolName = 'getAmendments') =>
    extractSources([makeToolMessage([{ toolCallId: 'call-date', toolName, output }])]);
  const manualMeta = {
    id: 'doc-ma3550',
    title: 'MA-3550 NEMT',
    documentType: 'dhhs_policy',
    policyNumber: 'MA-3550',
    effectiveDate: null,
    url: 'https://example.com/ma3550',
    status: 'current',
  };

  it('labels a DHHS change notice date as Dated, never Effective', () => {
    const notice = {
      id: 'doc-cn-04-26',
      title: 'CHANGE NOTICE FOR MANUAL NO. 04-26, NEMT',
      documentType: 'dhhs_policy',
      policyNumber: null,
      effectiveDate: '2026-03-04',
      url: 'https://example.com/cn-04-26',
      status: 'amendment',
      changeSummary: 'Notice 04-26 revises MA-3550.',
    };

    const [trail] = dateLabelSources({ document: manualMeta, amends: [], amendments: [notice], latestAmendment: notice, truncated: false });
    expect(trail.text).toContain('Latest amendment:\nID: doc-cn-04-26');
    expect(trail.text).toContain('\nDated: 2026-03-04\n');
    expect(trail.text).toContain('  - doc-cn-04-26 | CHANGE NOTICE FOR MANUAL NO. 04-26, NEMT | Dated: 2026-03-04');
    expect(trail.text).not.toContain('Effective:');

    const [queried] = dateLabelSources({ document: notice, amends: [manualMeta], amendments: [], latestAmendment: null, truncated: false });
    expect(queried.text).toContain('Dated: 2026-03-04');
    expect(queried.text).not.toContain('Effective:');

    const [doc] = dateLabelSources({ document: { ...notice, sections: [] } }, 'getDocument');
    expect(doc.text).toContain('Dated: 2026-03-04');
    expect(doc.text).not.toContain('Effective:');

    const section = { id: 'doc-cn-04-26:sec-1', title: 'Background', sectionNumber: '1', content: 'This notice revises MA-3550.', effectiveDate: '2026-03-04', documentId: 'doc-cn-04-26', documentType: 'dhhs_policy', policyNumber: null };
    const [read] = dateLabelSources({ section: { ...section, status: 'amendment' } }, 'getSection');
    expect(read.text).toContain('Dated: 2026-03-04');
    expect(read.text).not.toContain('Effective:');

    // An undated notice still reads "unknown date", with no label.
    const [undated] = dateLabelSources({ document: manualMeta, amends: [], amendments: [{ ...notice, effectiveDate: null }], latestAmendment: null, truncated: false });
    expect(undated.text).toContain('| unknown date');
    expect(undated.text).not.toContain('Dated:');
  });

  it('keeps Effective for a clinical policy document and its sections', () => {
    const policy = {
      id: 'doc-8c',
      title: 'Clinical Coverage Policy 8C',
      documentType: 'clinical_policy',
      policyNumber: '8C',
      effectiveDate: '2025-08-01',
      url: 'https://example.com/8C',
      status: 'current',
    };

    const [doc] = dateLabelSources({ document: { ...policy, sections: [] } }, 'getDocument');
    expect(doc.text).toContain('Effective: 2025-08-01');
    expect(doc.text).not.toContain('Dated:');

    const [read] = dateLabelSources({
      section: { id: 'doc-8c:sec-3', title: 'Coverage', sectionNumber: '3', content: 'Covered when medically necessary.', effectiveDate: '2025-08-01', documentId: 'doc-8c', documentType: 'clinical_policy', policyNumber: '8C', status: 'current' },
    }, 'getSection');
    expect(read.text).toContain('Effective: 2025-08-01');
    expect(read.text).not.toContain('Dated:');

    // A current DHHS manual is not a notice either: the status decides.
    const [manual] = dateLabelSources({ document: { ...manualMeta, effectiveDate: '2024-07-01', sections: [] } }, 'getDocument');
    expect(manual.text).toContain('Effective: 2024-07-01');
  });

  it('labels the date of a DHHS section read that does not say its status neutrally', () => {
    // Without a status the section could belong to a change notice, whose
    // header date must never be called effective.
    const [read] = dateLabelSources({
      section: { id: 'doc-cn:sec-1', title: 'I. BACKGROUND', sectionNumber: null, content: 'MA-2250 is revised.', effectiveDate: '2025-03-11', documentId: 'doc-cn', documentType: 'dhhs_policy', policyNumber: null },
    }, 'getSection');
    expect(read.text).toContain('\nDate: 2025-03-11');
    expect(read.text).not.toContain('Effective:');
    expect(read.text).not.toContain('Dated:');
  });

  it('leaves a clinical revision entry as it was: Effective in its metadata, a bare date in the trail', () => {
    const revision = {
      id: 'doc-8c:rev-2025-08-01',
      title: 'Policy 8C Revision 2025-08-01',
      documentType: 'clinical_policy',
      policyNumber: '8C',
      effectiveDate: '2025-08-01',
      url: null,
      status: 'amendment',
      changeSummary: 'Revises eligibility criteria.',
    };

    const [trail] = dateLabelSources({ document: { ...manualMeta, id: 'doc-8c' }, amends: [], amendments: [revision], latestAmendment: revision, truncated: false });
    expect(trail.text).toContain('Latest amendment:\nID: doc-8c:rev-2025-08-01');
    expect(trail.text).toContain('\nEffective: 2025-08-01\n');
    expect(trail.text).toContain('  - doc-8c:rev-2025-08-01 | Policy 8C Revision 2025-08-01 | 2025-08-01\n');
    expect(trail.text).not.toContain('Dated:');
  });

  it('lists every manual a change notice amends in getAmendments evidence', () => {
    const manual = (id: string, policyNumber: string) => ({
      id,
      title: `${policyNumber} manual`,
      documentType: 'dhhs_policy',
      policyNumber,
      effectiveDate: null,
      url: `https://example.com/${policyNumber}`,
      status: 'current',
    });
    const sources = extractSources([
      makeToolMessage([
        {
          toolCallId: 'call-amend',
          toolName: 'getAmendments',
          output: {
            document: { ...manual('doc-cn', 'CN'), title: 'CHANGE NOTICE FOR MANUAL NO. 04-26', policyNumber: null, status: 'amendment' },
            amends: [manual('doc-abd', 'MA-2910'), manual('doc-nemt', 'MA-3550')],
            amendments: [],
            latestAmendment: null,
            truncated: false,
          },
        },
      ]),
    ]);

    expect(sources[0].key).toBe('amendments:doc-cn');
    expect(sources[0].text).toContain('Queried document:\nID: doc-cn');
    expect(sources[0].text).toContain(
      'Amends (2):\n' +
        '  - doc-abd | MA-2910 manual | MA-2910\n' +
        '  - doc-nemt | MA-3550 manual | MA-3550',
    );
    // The entry holds none of a manual's text, so it vouches for no manual's URL.
    expect([...sourceUrlSet(sources[0])]).not.toEqual(
      expect.arrayContaining(['https://example.com/MA-2910']),
    );
    expect([...sourceUrlSet(sources[0])]).not.toEqual(
      expect.arrayContaining(['https://example.com/MA-3550']),
    );
    expect(sources[0].text).not.toContain('Latest amendment');
    expect(sources[0].text).not.toContain('Base document');
  });

  // Test 3: lookupPolicy
  it('extracts lookupPolicy document metadata', () => {
    const msgs = [
      makeToolMessage([
        {
          toolCallId: 'call-lookup',
          toolName: 'lookupPolicy',
          output: {
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

    const sources = extractSources(msgs);

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
    const msgs = [
      makeToolMessage([
        {
          toolCallId: 'call-doc',
          toolName: 'getDocument',
          output: {
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

    const sources = extractSources(msgs);

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
    const msgs = [
      makeToolMessage([
        {
          toolCallId: 'call-refs',
          toolName: 'followReferences',
          output: {
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

    const sources = extractSources(msgs);

    expect(sources).toHaveLength(1);
    expect(sources[0].toolName).toBe('followReferences');
    expect(sources[0].key).toBe('followReferences:call-refs');
    expect(sources[0].text).toContain('[followReferences]');
    expect(sources[0].text).toContain('doc-42cfr440:sec-440.1');
    expect(sources[0].text).toContain('Definitions');
    expect(sources[0].text).toContain('as defined in 42 CFR 440.1');
    expect(sources[0].text).toContain('REFERENCES_DOCUMENT');
  });

  it('extracts resolveAnswerFrame structured evidence', () => {
    const msgs = [
      makeToolMessage([
        {
          toolCallId: 'call-frame',
          toolName: 'resolveAnswerFrame',
          output: {
            frame: makeFrame({
              questionType: 'coverage',
              authoritativeDocuments: [
                makeDocument({
                  id: 'doc-10a',
                  title: 'Clinical Coverage Policy 10A',
                  policyNumber: '10A',
                  effectiveDate: '2025-01-01',
                  url: 'https://example.com/10A',
                  reason: 'Preferred service-specific policy.',
                }),
              ],
              primarySections: [
                makeSection({
                  id: 'sec-10a-coverage',
                  title: 'Coverage Criteria',
                  sectionNumber: '3.1',
                  content: 'Speech therapy is covered when medically necessary.',
                  effectiveDate: '2025-01-01',
                  documentId: 'doc-10a',
                  documentTitle: 'Clinical Coverage Policy 10A',
                  policyNumber: '10A',
                  reason: 'Primary coverage evidence.',
                }),
              ],
            }),
          },
        },
      ]),
    ];

    const sources = extractSources(msgs);

    expect(sources).toHaveLength(2);
    expect(sources[0].toolName).toBe('resolveAnswerFrame');
    expect(sources[0].key).toBe('sec-10a-coverage');
    expect(sources[0].text).toContain('Question type: coverage');
    expect(sources[0].text).toContain('Route lane: baseline_hybrid');
    expect(sources[0].text).toContain('Clinical Coverage Policy 10A');
    expect(sources[0].text).not.toContain('Speech therapy is covered when medically necessary.');
    expect(sources[1].toolName).toBe('resolveAnswerFrame:section');
    expect(sources[1].text).toContain('Speech therapy is covered when medically necessary.');
  });

  // Test 6: ignored tools
  it('ignores searchSections, getSectionContext, and findConceptSections', () => {
    const msgs = [
      makeToolMessage([
        {
          toolCallId: 'call-search',
          toolName: 'searchSections',
          output: {
            sections: [{ id: 'sec-1', title: 'Found Section', score: 0.9 }],
          },
        },
        {
          toolCallId: 'call-ctx',
          toolName: 'getSectionContext',
          output: {
            ancestors: [],
            siblings: [],
            children: [{ id: 'sec-child', title: 'Child', sectionNumber: '1.1' }],
          },
        },
        {
          toolCallId: 'call-concept',
          toolName: 'findConceptSections',
          output: {
            sections: [{ id: 'sec-concept', title: 'Concept Section', score: 0.85 }],
          },
        },
      ]),
    ];

    const sources = extractSources(msgs);

    expect(sources).toHaveLength(0);
  });

  // Test 7: multiple steps
  it('collects sources across multiple steps', () => {
    const msgs = [
      makeToolMessage([
        {
          toolCallId: 'call-s1',
          toolName: 'getSection',
          output: {
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
      makeToolMessage([
        {
          toolCallId: 'call-s2',
          toolName: 'getSection',
          output: {
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
          output: {
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

    const sources = extractSources(msgs);

    expect(sources).toHaveLength(3);
    expect(sources[0].key).toBe('doc-8c:sec-1');
    expect(sources[1].key).toBe('doc-8c:sec-2');
    expect(sources[2].key).toBe('doc-8c');
  });

  // Test 8: no retrieval tools called
  it('returns empty array when no retrieval tools were called', () => {
    const msgs = [
      makeToolMessage([]),
      makeToolMessage([
        {
          toolCallId: 'call-search',
          toolName: 'searchSections',
          output: { sections: [] },
        },
      ]),
    ];

    const sources = extractSources(msgs);

    expect(sources).toHaveLength(0);
  });

  // getSection with null section
  it('skips getSection result when section is null', () => {
    const msgs = [
      makeToolMessage([
        {
          toolCallId: 'call-null',
          toolName: 'getSection',
          output: { section: null },
        },
      ]),
    ];

    const sources = extractSources(msgs);

    expect(sources).toHaveLength(0);
  });

  // lookupPolicy with empty documents
  it('skips lookupPolicy result when no documents found', () => {
    const msgs = [
      makeToolMessage([
        {
          toolCallId: 'call-empty',
          toolName: 'lookupPolicy',
          output: { documents: [] },
        },
      ]),
    ];

    const sources = extractSources(msgs);

    expect(sources).toHaveLength(0);
  });
});

// ── buildSourceText ──────────────────────────────────────────────────────────

describe('buildSourceText', () => {
  // Test 9: empty sources
  it('returns "(No source documents were retrieved.)" for empty sources', () => {
    const result = buildSourceText([], 'some answer text').text;
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
    const result = buildSourceText(sources, answerText).text;

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
    const result = buildSourceText(sources, '', maxChars).text;

    // Should contain the first source's text
    expect(result).toContain('sec-1');
    // Should contain an omission notice
    expect(result).toContain('2 source(s) omitted for length');
    // Total length should not wildly exceed the limit
    expect(result.length).toBeLessThan(maxChars + 200);
  });

  it('includes all sources when under char limit', () => {
    const sources: SourceEntry[] = [
      { toolName: 'getSection', key: 'sec-a', text: '[getSection]\nShort A' },
      { toolName: 'getSection', key: 'sec-b', text: '[getSection]\nShort B' },
    ];

    const result = buildSourceText(sources, '', 10000).text;

    expect(result).toContain('Short A');
    expect(result).toContain('Short B');
    expect(result).not.toContain('omitted');
  });
});

// ── verifyAnswer ──────────────────────────────────────────────────────────────

describe('verifyAnswer', () => {
  it('returns supported: true when all claims are supported', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: { supported: true, unsupportedClaims: [] },
    } as any);

    const result = await verifyAnswer('What is the benefit cap?', 'The benefit cap is $500.', 'The benefit cap is $500 per month.');

    expect(result.supported).toBe(true);
    expect(result.unsupportedClaims).toHaveLength(0);
  });

  it('returns unsupported claims with reasons and correctedAnswer', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        supported: false,
        unsupportedClaims: [
          { claim: 'The visit limit is 20 visits per year.', reason: 'Source states 30 visits per year.' },
        ],
        correctedAnswer: 'The visit limit is [unverified: 20 visits per year].',
      },
    } as any);

    const result = await verifyAnswer(
      'What is the physical therapy visit limit?',
      'The visit limit is 20 visits per year.',
      'Physical therapy is covered for up to 30 visits per year.',
    );

    expect(result.supported).toBe(false);
    expect(result.unsupportedClaims).toHaveLength(1);
    expect(result.unsupportedClaims[0].claim).toBe('The visit limit is 20 visits per year.');
    expect(result.unsupportedClaims[0].reason).toContain('30 visits');
    expect(result.correctedAnswer).toContain('[unverified:');
  });

  it('returns supported: false on verifier LLM error (fail-closed)', async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(new Error('Network timeout'));

    const result = await verifyAnswer('Some question?', 'Some answer.', 'Some source.');

    expect(result.supported).toBe(false);
    expect(result.unsupportedClaims).toHaveLength(1);
    expect(result.unsupportedClaims[0].reason).toBe(VERIFICATION_UNAVAILABLE);
  });
});

// ── cited-first ordering via citation links ─────────────────────────────────

describe('buildSourceText cited-first ordering', () => {
  it('orders link-cited sources first so truncation drops uncited ones', () => {
    const sources: SourceEntry[] = [
      { toolName: 'getSection', key: 'sec:doc-a:1', text: 'UNCITED-' + 'x'.repeat(80), link: 'https://example.com/other' },
      { toolName: 'getSection', key: 'sec:doc-b:2', text: 'CITED-' + 'y'.repeat(80), link: 'https://example.com/8c' },
    ];
    // Answer cites via markdown link URL — raw section IDs never appear.
    const answer = 'Coverage applies [Policy 8C § 3.2.1](https://example.com/8c).';

    // Budget fits only one source block: the cited one must survive.
    const text = buildSourceText(sources, answer, 120).text;
    expect(text).toContain('CITED-');
    expect(text).not.toContain('UNCITED-');
  });

  it('still honors raw-key matches as a fallback', () => {
    const sources: SourceEntry[] = [
      { toolName: 'getSection', key: 'sec:doc-a:1', text: 'A'.repeat(80) },
      { toolName: 'getSection', key: 'sec:doc-b:2', text: 'B'.repeat(80) },
    ];
    const answer = 'Debug answer referencing sec:doc-b:2 directly.';
    const text = buildSourceText(sources, answer, 120).text;
    expect(text).toContain('B');
    expect(text).not.toContain('A'.repeat(10));
  });
});

// ── evidence includes citation metadata ──────────────────────────────────────

describe('verifier evidence citation fields', () => {
  it('serializes citationLink and revision metadata from getSection', () => {
    const msgs = [
      makeToolMessage([
        {
          toolCallId: 'call-1',
          toolName: 'getSection',
          output: {
            section: {
              id: 'sec:42-cfr-441:301',
              title: 'Contents of request for a waiver',
              sectionNumber: '441.301',
              content: 'A request for a waiver…',
              effectiveDate: null,
              lastRevised: '2024-05-10',
              federalRegisterCite: '[89 FR 40863, May 10, 2024]',
              documentId: 'doc:42-cfr-441',
              documentType: 'federal_regulation',
              policyNumber: '42-CFR-441',
              url: 'https://ecfr.gov/42/441.301',
              citationLink: '[42 CFR § 441.301](https://ecfr.gov/42/441.301)',
            },
          },
        },
      ]),
    ];

    const sources = extractSources(msgs as any);
    expect(sources).toHaveLength(1);
    expect(sources[0].link).toBe('https://ecfr.gov/42/441.301');
    expect(sources[0].text).toContain('Citation link: [42 CFR § 441.301](https://ecfr.gov/42/441.301)');
    expect(sources[0].text).toContain('Last revised: 2024-05-10');
    expect(sources[0].text).toContain('Federal Register cite: [89 FR 40863, May 10, 2024]');
  });
});
