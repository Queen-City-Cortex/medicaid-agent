import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractSources, buildSourceText, verifyAnswer, VerificationResult, SourceEntry, HallucinationVerifier, VERIFICATION_UNAVAILABLE, computeVerificationConfidence, replaceFinalAnswerText } from '../../src/processors/hallucination-verifier.js';

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
  function mockVerification(
    result: Partial<VerificationResult> & Pick<VerificationResult, 'supported' | 'unsupportedClaims'>,
  ) {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        relevant: true,
        citationsComplete: true,
        missingCitationClaims: [],
        relevanceIssues: [],
        correctedAnswer: '',
        ...result,
      },
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

  it('verifies multi-turn answers against the latest user question', async () => {
    mockVerification({ supported: true, unsupportedClaims: [] });

    const args = makeProcessOutputStepArgs({
      text: 'Follow-up answer',
      messages: [
        {
          id: 'user-1',
          role: 'user' as const,
          content: { parts: [{ type: 'text' as const, text: 'What is the first question?' }] },
        },
        {
          id: 'assistant-1',
          role: 'assistant' as const,
          content: { parts: [{ type: 'text' as const, text: 'First answer' }] },
        },
        {
          id: 'user-2',
          role: 'user' as const,
          content: { parts: [{ type: 'text' as const, text: 'What about the follow-up?' }] },
        },
        {
          id: 'assistant-2',
          role: 'assistant' as const,
          content: { parts: [{ type: 'text' as const, text: 'Follow-up answer' }] },
        },
      ] as any,
    });

    await verifier.processOutputStep!(args);

    const verifierPrompt = vi.mocked(generateObject).mock.calls[0]?.[0] as any;
    expect(verifierPrompt.messages[0].content).toContain('## QUESTION\n\nWhat about the follow-up?');
    expect(verifierPrompt.messages[0].content).not.toContain('What is the first question?');
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

  // Test 8 (plan 6c): Pure-marker fallback — if the verifier's rewrite is
  // entirely `[missing citation: ...]` markers, renderCorrectedAnswer strips
  // them and the body is empty. We fall back to the original text so the user
  // doesn't see a blank answer, and the emitted confidence should reflect
  // that the rewrite was unusable (severity=low, pureMarkerFallback=true).
  it('preserves the original text when the rewrite is purely citation markers, and flags pureMarkerFallback', async () => {
    const originalText = 'Physical therapy is covered for up to 30 visits per year.';
    // All-markers correctedAnswer → renderCorrectedAnswer will strip them
    // (body becomes empty) and return the original text via fallback.
    const allMarkers = '[missing citation: [Policy 10A § 3.2.1](https://example.com)] [missing citation: [Policy 10A § 4.1](https://example.com)]';
    mockVerification({
      supported: true,
      relevant: true,
      citationsComplete: false,
      unsupportedClaims: [],
      missingCitationClaims: [
        { claim: 'Physical therapy is covered.', suggestedCitation: '[Policy 10A § 3.2.1](https://example.com)' },
        { claim: 'Up to 30 visits.', suggestedCitation: '[Policy 10A § 4.1](https://example.com)' },
      ],
      relevanceIssues: [],
      correctedAnswer: allMarkers,
    });

    const writer = { custom: vi.fn() };
    const args = makeProcessOutputStepArgs({ text: originalText, writer: writer as any });
    const result = await verifier.processOutputStep!(args) as any[];

    // 1. Final assistant text must be the original, NOT the empty/marker-only rewrite.
    const assistantMsg = result.find((m: any) => m.role === 'assistant');
    const textPart = assistantMsg!.content.parts.find((p: any) => p.type === 'text');
    expect(textPart.text).toBe(originalText);

    // 2. The emitted confidence event carries pureMarkerFallback=true + low severity.
    const rewriteCall = writer.custom.mock.calls.find(
      ([arg]) => arg?.type === 'data-verification-rewrite',
    );
    expect(rewriteCall).toBeDefined();
    const payload = rewriteCall![0];
    expect(payload.data.pureMarkerFallback).toBe(true);
    expect(payload.data.severity).toBe('low');
    expect(payload.data.confidence).toBeLessThanOrEqual(0.55);
  });

  // Test 9 (plan 6c): Happy-path rewrite — final assistant text matches the
  // verifier's correctedAnswer, not the draft, and the streamed event carries
  // the corrected text so non-persistent consumers stay in sync.
  it('replaces assistant text with correctedAnswer AND forwards it via data-verification-rewrite', async () => {
    const draft = 'The limit is $500.';
    const corrected = 'The limit is [unverified: $500].';
    mockVerification({
      supported: false,
      relevant: true,
      citationsComplete: true,
      unsupportedClaims: [{ claim: 'The limit is $500.', reason: 'Source says $300.' }],
      missingCitationClaims: [],
      relevanceIssues: [],
      correctedAnswer: corrected,
    });

    const writer = { custom: vi.fn() };
    const args = makeProcessOutputStepArgs({ text: draft, writer: writer as any });
    const result = await verifier.processOutputStep!(args) as any[];

    const assistantMsg = result.find((m: any) => m.role === 'assistant');
    const textPart = assistantMsg!.content.parts.find((p: any) => p.type === 'text');
    expect(textPart.text).toBe(corrected);

    const rewriteCall = writer.custom.mock.calls.find(
      ([arg]) => arg?.type === 'data-verification-rewrite',
    );
    expect(rewriteCall![0].data.correctedAnswer).toBe(corrected);
    expect(rewriteCall![0].data.pureMarkerFallback).toBe(false);
  });
});


// ── renderCorrectedAnswer ────────────────────────────────────────────────────

import { renderCorrectedAnswer } from '../../src/processors/hallucination-verifier.js';

describe('renderCorrectedAnswer', () => {
  it('returns the input unchanged when there are no markers', () => {
    const input = 'Regular answer with a [Policy 8C § 3.2.1](https://example.com) inline citation.';
    expect(renderCorrectedAnswer(input)).toBe(input);
  });

  it('leaves [unverified: ...] markers inline', () => {
    const input = 'The visit limit is [unverified: 20 visits per year].';
    expect(renderCorrectedAnswer(input)).toContain('[unverified:');
  });

  it('leaves [wrong source: ...] markers inline', () => {
    const input = 'The agent cited [wrong source: 42 CFR § 457.65] instead of § 430.12.';
    expect(renderCorrectedAnswer(input)).toContain('[wrong source:');
  });

  it('moves [missing citation: simple-label] to a footer', () => {
    const input = 'Benefits include X. [missing citation: Policy 1A-2 § 4.1]\nMore content.';
    const output = renderCorrectedAnswer(input);
    expect(output).not.toContain('[missing citation:');
    expect(output).toContain('Benefits include X.');
    expect(output).toContain('*Suggested citations for uncited claims above:*');
    expect(output).toContain('- Policy 1A-2 § 4.1');
  });

  it('handles nested brackets in the suggested citation (markdown link form)', () => {
    const input = 'Enrollment is 12,000 slots. [missing citation: [Policy 3K-2 § 2.1](https://medicaid.ncdhhs.gov/3k-2)]';
    const output = renderCorrectedAnswer(input);
    expect(output).not.toContain('[missing citation:');
    expect(output).toContain('[Policy 3K-2 § 2.1](https://medicaid.ncdhhs.gov/3k-2)');
    expect(output).toMatch(/Enrollment is 12,000 slots\./);
  });

  it('deduplicates repeated citations in the footer', () => {
    const input = 'A. [missing citation: [Policy 9 § 4.1](u)] B. [missing citation: [Policy 9 § 4.1](u)] C.';
    const output = renderCorrectedAnswer(input);
    const matches = output.match(/\[Policy 9 § 4\.1\]\(u\)/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('preserves both inline [unverified] and footer for [missing citation] in the same answer', () => {
    const input = 'The cap is [unverified: $500]. Eligibility requires age 18+. [missing citation: [Policy 3K-2 § 2.1.1](https://x)]';
    const output = renderCorrectedAnswer(input);
    expect(output).toContain('[unverified: $500]');
    expect(output).not.toContain('[missing citation:');
    expect(output).toContain('*Suggested citations for uncited claims above:*');
  });

  it('returns empty string unchanged when input is empty', () => {
    expect(renderCorrectedAnswer('')).toBe('');
  });

  it('leaves an unmatched marker untouched rather than dropping content', () => {
    const input = 'Statement. [missing citation: unclosed content';
    const output = renderCorrectedAnswer(input);
    expect(output).toContain('unclosed content');
  });

  it('falls back to the original text when rewrite is pure [missing citation] markers', () => {
    // Regression: verifier's rewrite occasionally returns only marker text with
    // no body, producing a user-visible "answer" that is just a footer (q-006 in
    // the 2026-04-21 eval). Prefer the untouched original.
    const rewrite = '[missing citation: [Policy 5B § 3.2.1](https://example.com)] [missing citation: [Policy 5B § 1.0](https://example.com)]';
    const originalText = 'Chiropractic care is not covered under Policy 5B.';
    const output = renderCorrectedAnswer(rewrite, originalText);
    expect(output).toBe(originalText);
  });

  it('keeps the rewrite markers inline when body empty and no fallback given', () => {
    const rewrite = '[missing citation: Policy 5B]';
    const output = renderCorrectedAnswer(rewrite);
    // Without a fallback we still avoid the bare-footer output; preserve markers.
    expect(output).toContain('[missing citation:');
    expect(output).not.toContain('*Suggested citations for uncited claims above:*');
  });
});


// ── computeVerificationConfidence ────────────────────────────────────────────

function makeVerification(partial: Partial<VerificationResult>): VerificationResult {
  return {
    supported: true,
    relevant: true,
    citationsComplete: true,
    unsupportedClaims: [],
    missingCitationClaims: [],
    relevanceIssues: [],
    correctedAnswer: '',
    ...partial,
  };
}

describe('computeVerificationConfidence', () => {
  it('returns 1.0 high when no issues', () => {
    const result = computeVerificationConfidence(makeVerification({}));
    expect(result.confidence).toBe(1);
    expect(result.severity).toBe('high');
    expect(result.counts).toEqual({
      unsupported: 0,
      missingCitation: 0,
      relevanceMajor: 0,
      relevanceMinor: 0,
    });
    expect(result.pureMarkerFallback).toBe(false);
  });

  it('deducts 0.30 per unsupported claim', () => {
    const one = computeVerificationConfidence(makeVerification({
      supported: false,
      unsupportedClaims: [{ claim: 'x', reason: 'y' }],
    }));
    expect(one.confidence).toBeCloseTo(0.70, 5);
    expect(one.severity).toBe('medium');

    const three = computeVerificationConfidence(makeVerification({
      supported: false,
      unsupportedClaims: [
        { claim: 'x', reason: 'y' },
        { claim: 'y', reason: 'z' },
        { claim: 'z', reason: 'w' },
      ],
    }));
    expect(three.confidence).toBeCloseTo(0.10, 5);
    expect(three.severity).toBe('low');
  });

  it('deducts 0.15 per missing-citation claim — stays in high band for one', () => {
    const one = computeVerificationConfidence(makeVerification({
      citationsComplete: false,
      missingCitationClaims: [{ claim: 'x', suggestedCitation: '[Policy X](url)' }],
    }));
    expect(one.confidence).toBeCloseTo(0.85, 5);
    expect(one.severity).toBe('high');
  });

  it('treats major relevance issues more severely than minor ones', () => {
    const major = computeVerificationConfidence(makeVerification({
      relevant: false,
      relevanceIssues: [{ issue: 'wrong policy', severity: 'major' }],
    }));
    expect(major.confidence).toBeCloseTo(0.65, 5);
    expect(major.severity).toBe('medium');

    const minor = computeVerificationConfidence(makeVerification({
      relevanceIssues: [{ issue: 'incomplete', severity: 'minor' }],
    }));
    expect(minor.confidence).toBeCloseTo(0.90, 5);
    expect(minor.severity).toBe('high');
  });

  it('clamps at 0 when deductions exceed 1.0', () => {
    const result = computeVerificationConfidence(makeVerification({
      supported: false,
      unsupportedClaims: Array.from({ length: 5 }, (_, i) => ({ claim: `c${i}`, reason: 'r' })),
    }));
    expect(result.confidence).toBe(0);
    expect(result.severity).toBe('low');
  });

  it('clamps to low/0.55 when pureMarkerFallback is true even if counts look clean', () => {
    const result = computeVerificationConfidence(
      makeVerification({}),
      { pureMarkerFallback: true },
    );
    expect(result.confidence).toBeLessThanOrEqual(0.55);
    expect(result.severity).toBe('low');
    expect(result.pureMarkerFallback).toBe(true);
  });

  it('compounds major relevance + unsupported into low severity', () => {
    const result = computeVerificationConfidence(makeVerification({
      supported: false,
      relevant: false,
      unsupportedClaims: [{ claim: 'x', reason: 'y' }],
      relevanceIssues: [{ issue: 'wrong policy', severity: 'major' }],
    }));
    expect(result.confidence).toBeCloseTo(0.35, 5);
    expect(result.severity).toBe('low');
  });
});


// ── Streaming event emission ────────────────────────────────────────────────

describe('HallucinationVerifier streaming events', () => {
  it('emits data-verification-ok when all checks pass', async () => {
    // Inline test harness mirroring the one used in the "writer.custom"
    // block elsewhere in this file.
    const { HallucinationVerifier } = await import('../../src/processors/hallucination-verifier.js');
    const verifier = new HallucinationVerifier();

    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        supported: true,
        relevant: true,
        citationsComplete: true,
        unsupportedClaims: [],
        missingCitationClaims: [],
        relevanceIssues: [],
        correctedAnswer: '',
      },
    } as any);

    const writer = { custom: vi.fn() };
    const args: ProcessOutputStepArgs = {
      text: 'answer',
      finishReason: 'stop',
      toolCalls: [],
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: { parts: [{ type: 'text', text: 'question?' }] },
        } as any,
      ],
      writer: writer as any,
      abort: vi.fn(),
    } as any;

    await verifier.processOutputStep!(args);

    expect(writer.custom).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'data-verification-ok',
        data: expect.objectContaining({ severity: 'high', confidence: 1 }),
      }),
    );
  });

  it('includes confidence + severity in data-verification-rewrite payload', async () => {
    const { HallucinationVerifier } = await import('../../src/processors/hallucination-verifier.js');
    const verifier = new HallucinationVerifier();

    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        supported: false,
        relevant: true,
        citationsComplete: true,
        unsupportedClaims: [{ claim: 'x', reason: 'y' }],
        missingCitationClaims: [],
        relevanceIssues: [],
        correctedAnswer: 'x [unverified: y]',
      },
    } as any);

    const writer = { custom: vi.fn() };
    const args: ProcessOutputStepArgs = {
      text: 'answer',
      finishReason: 'stop',
      toolCalls: [],
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: { parts: [{ type: 'text', text: 'q?' }] },
        } as any,
        {
          id: 'a1',
          role: 'assistant',
          content: { parts: [{ type: 'text', text: 'answer' }] },
        } as any,
      ],
      writer: writer as any,
      abort: vi.fn(),
    } as any;

    await verifier.processOutputStep!(args);

    const call = writer.custom.mock.calls.find(
      ([arg]) => arg?.type === 'data-verification-rewrite',
    );
    expect(call).toBeDefined();
    const payload = call![0];
    expect(payload.data.confidence).toBeCloseTo(0.70, 5);
    expect(payload.data.severity).toBe('medium');
    expect(payload.data.counts.unsupported).toBe(1);
    expect(payload.data.pureMarkerFallback).toBe(false);
  });
});

// ── replaceFinalAnswerText / rewrite scope ───────────────────────────────────

describe('rewrite scope (replaceFinalAnswerText)', () => {
  it('rewrites only the last text part of the last assistant message', () => {
    const messages = [
      {
        id: 'a-1',
        role: 'assistant',
        content: { parts: [{ type: 'text', text: 'Prior turn answer' }] },
      },
      {
        id: 'u-2',
        role: 'user',
        content: { parts: [{ type: 'text', text: 'Follow-up question' }] },
      },
      {
        id: 'a-2',
        role: 'assistant',
        content: {
          parts: [
            { type: 'text', text: 'Checking the clinical policies…' },
            { type: 'tool-invocation', toolInvocation: { state: 'result', toolName: 'getSection', toolCallId: 'c1', result: {} } },
            { type: 'text', text: 'Original final answer' },
          ],
        },
      },
    ] as any[];

    const result = replaceFinalAnswerText(messages as any, 'CORRECTED') as any[];

    // Prior assistant turn untouched
    expect(result[0].content.parts[0].text).toBe('Prior turn answer');
    // User message untouched
    expect(result[1].content.parts[0].text).toBe('Follow-up question');
    // Interim progress text untouched
    expect(result[2].content.parts[0].text).toBe('Checking the clinical policies…');
    // Tool part untouched
    expect(result[2].content.parts[1].type).toBe('tool-invocation');
    // Only the final text part rewritten
    expect(result[2].content.parts[2].text).toBe('CORRECTED');
  });

  it('does not crash on string-content assistant messages', () => {
    const messages = [
      { id: 'a-1', role: 'assistant', content: 'plain string answer' },
    ] as any[];

    const result = replaceFinalAnswerText(messages as any, 'CORRECTED') as any[];
    expect(result[0].content).toBe('CORRECTED');
  });

  it('returns messages unchanged when there is no assistant message', () => {
    const messages = [
      { id: 'u-1', role: 'user', content: { parts: [{ type: 'text', text: 'q' }] } },
    ] as any[];
    expect(replaceFinalAnswerText(messages as any, 'X')).toEqual(messages);
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
    const text = buildSourceText(sources, answer, 120);
    expect(text).toContain('CITED-');
    expect(text).not.toContain('UNCITED-');
  });

  it('still honors raw-key matches as a fallback', () => {
    const sources: SourceEntry[] = [
      { toolName: 'getSection', key: 'sec:doc-a:1', text: 'A'.repeat(80) },
      { toolName: 'getSection', key: 'sec:doc-b:2', text: 'B'.repeat(80) },
    ];
    const answer = 'Debug answer referencing sec:doc-b:2 directly.';
    const text = buildSourceText(sources, answer, 120);
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
