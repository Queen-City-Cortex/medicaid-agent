import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractSources, buildSourceText, verifyAnswer, VerificationResult, SourceEntry, HallucinationVerifier, VERIFICATION_UNAVAILABLE } from '../../src/processors/hallucination-verifier.js';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));
import { generateObject } from 'ai';

import type { ProcessOutputStepArgs } from '@mastra/core/processors';

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
  it('extracts getAmendments authoritative document and change summaries', () => {
    const msgs = [
      makeToolMessage([
        {
          toolCallId: 'call-amend',
          toolName: 'getAmendments',
          output: {
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

    const sources = extractSources(msgs);

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
            frame: {
              questionType: 'coverage',
              route: {
                lane: 'baseline_hybrid',
                rationale: 'single_document_coverage',
                widening_policy: 'one_step',
                determinism_hints: {
                  numeric_evidence_only: false,
                  latest_revision_only: false,
                  cite_scope_and_not_covered: false,
                },
              },
              authoritativeDocuments: [
                {
                  id: 'doc-10a',
                  title: 'Clinical Coverage Policy 10A',
                  documentType: 'clinical_policy',
                  policyNumber: '10A',
                  effectiveDate: '2025-01-01',
                  url: 'https://example.com/10A',
                  status: 'current',
                  reason: 'Preferred service-specific policy.',
                },
              ],
              primarySections: [
                {
                  id: 'sec-10a-coverage',
                  title: 'Coverage Criteria',
                  sectionNumber: '3.1',
                  content: 'Speech therapy is covered when medically necessary.',
                  effectiveDate: '2025-01-01',
                  documentId: 'doc-10a',
                  documentTitle: 'Clinical Coverage Policy 10A',
                  documentType: 'clinical_policy',
                  policyNumber: '10A',
                  reason: 'Primary coverage evidence.',
                },
              ],
              supportingSections: [],
              avoidSections: [],
              latestRevision: null,
              variantReasoning: null,
            },
          },
        },
      ]),
    ];

    const sources = extractSources(msgs);

    expect(sources).toHaveLength(1);
    expect(sources[0].toolName).toBe('resolveAnswerFrame');
    expect(sources[0].key).toBe('sec-10a-coverage');
    expect(sources[0].text).toContain('Question type: coverage');
    expect(sources[0].text).toContain('Route lane: baseline_hybrid');
    expect(sources[0].text).toContain('Clinical Coverage Policy 10A');
    expect(sources[0].text).toContain('Speech therapy is covered when medically necessary.');
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

// ── verifyAnswer ──────────────────────────────────────────────────────────────

describe('verifyAnswer', () => {
  it('returns supported: true when all claims are supported', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: { supported: true, unsupportedClaims: [] },
    } as any);

    const result = await verifyAnswer('The benefit cap is $500.', 'The benefit cap is $500 per month.');

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

    const result = await verifyAnswer('Some answer.', 'Some source.');

    expect(result.supported).toBe(false);
    expect(result.unsupportedClaims).toHaveLength(1);
    expect(result.unsupportedClaims[0].reason).toBe(VERIFICATION_UNAVAILABLE);
  });
});

// ── HallucinationVerifier class ──────────────────────────────────────────────

function makeProcessOutputStepArgs(overrides: Partial<ProcessOutputStepArgs> = {}): ProcessOutputStepArgs {
  return {
    text: 'Some answer text',
    finishReason: 'stop',
    toolCalls: [],
    steps: [],
    messages: [{
      id: 'msg-1',
      role: 'assistant' as const,
      content: { parts: [{ type: 'text' as const, text: 'Some answer text' }] },
    }],
    messageList: {} as any,
    abort: vi.fn(() => { throw new Error('abort-called'); }) as any,
    retryCount: 0,
    state: {},
    writer: { custom: vi.fn() } as any,
    systemMessages: [],
    stepNumber: 0,
    ...overrides,
  } as any;
}


describe('HallucinationVerifier.processOutputStep', () => {
  const verifier = new HallucinationVerifier();
  let savedEnv: string | undefined;

  beforeEach(() => {
    vi.mocked(generateObject).mockClear();
    savedEnv = process.env.VERIFIER_ENABLED;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore VERIFIER_ENABLED env var
    if (savedEnv === undefined) {
      delete process.env.VERIFIER_ENABLED;
    } else {
      process.env.VERIFIER_ENABLED = savedEnv;
    }
  });

  // Helper: mock generateObject to make verifyAnswer return a specific result
  function mockVerification(result: VerificationResult) {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: result,
    } as any);
  }

  // Test 1: Passes through when finishReason is 'tool-calls'
  it('passes through when finishReason is tool-calls (not final answer)', async () => {
    const args = makeProcessOutputStepArgs({
      finishReason: 'tool-calls',
      toolCalls: [{ toolName: 'searchSections', toolCallId: 'call-1', args: {} }],
    });

    const result = await verifier.processOutputStep!(args);

    expect(result).toEqual(args.messages);
    // generateText should not have been called since verifier skips non-final answers
    expect(generateObject).not.toHaveBeenCalled();
  });

  // Test 2: Passes through when claims are all supported
  it('passes through when claims are all supported', async () => {
    mockVerification({ supported: true, unsupportedClaims: [] });

    const args = makeProcessOutputStepArgs();
    const result = await verifier.processOutputStep!(args);

    expect(result).toEqual(args.messages);
    expect(generateObject).toHaveBeenCalled();
  });

  // Test 3: Rewrites assistant messages with correctedAnswer when unsupported
  it('rewrites assistant messages with correctedAnswer when unsupported claims found', async () => {
    const corrected = 'The limit is [unverified: $500].';
    mockVerification({
      supported: false,
      unsupportedClaims: [{ claim: 'The limit is $500', reason: 'Source says $300' }],
      correctedAnswer: corrected,
    });

    const args = makeProcessOutputStepArgs();
    const result = await verifier.processOutputStep!(args) as any[];

    // Should NOT call abort — no retry, direct rewrite
    expect(args.abort).not.toHaveBeenCalled();

    const assistantMsg = result.find((m: any) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    const textPart = assistantMsg!.content.parts.find((p: any) => p.type === 'text');
    expect(textPart.text).toBe(corrected);
  });

  // Test 4: Emits data-verification-rewrite via writer.custom()
  it('emits data-verification-rewrite via writer.custom() when unsupported', async () => {
    const corrected = 'The limit is [unverified: $500].';
    mockVerification({
      supported: false,
      unsupportedClaims: [{ claim: 'The limit is $500', reason: 'Source says $300' }],
      correctedAnswer: corrected,
    });

    const writer = { custom: vi.fn() };
    const args = makeProcessOutputStepArgs({ writer: writer as any });
    await verifier.processOutputStep!(args);

    expect(writer.custom).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'data-verification-rewrite' }),
    );
  });

  // Test 6: Passes through when VERIFIER_ENABLED is 'false'
  it('passes through when VERIFIER_ENABLED is false', async () => {
    savedEnv = process.env.VERIFIER_ENABLED;
    process.env.VERIFIER_ENABLED = 'false';

    const args = makeProcessOutputStepArgs();
    const result = await verifier.processOutputStep!(args);

    expect(result).toEqual(args.messages);
    expect(generateObject).not.toHaveBeenCalled();
  });

  // Test: Appends disclaimer when verification service is unavailable
  it('appends disclaimer when verification service is unavailable', async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(new Error('API timeout'));

    const args = makeProcessOutputStepArgs();
    const result = await verifier.processOutputStep!(args) as any[];

    const assistantMsg = result.find((m: any) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    const textPart = assistantMsg!.content.parts.find((p: any) => p.type === 'text');
    expect(textPart.text).toContain('could not be verified');
    expect(textPart.text).toContain('NC DHHS');
  });

  // Test 7: Passes through when text is empty
  it('passes through when text is empty', async () => {
    const args = makeProcessOutputStepArgs({ text: '' });
    const result = await verifier.processOutputStep!(args);

    expect(result).toEqual(args.messages);
    expect(generateObject).not.toHaveBeenCalled();
  });
});
