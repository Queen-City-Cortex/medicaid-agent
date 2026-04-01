import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractSources, buildSourceText, verifyAnswer, VerificationResult, SourceEntry, HallucinationVerifier } from '../../src/processors/hallucination-verifier.js';

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));
import { generateText } from 'ai';

import type { ProcessOutputStepArgs, ProcessInputStepArgs } from '@mastra/core/processors';

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
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify({ supported: true, unsupportedClaims: [] }),
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await verifyAnswer('The benefit cap is $500.', 'The benefit cap is $500 per month.');

    expect(result.supported).toBe(true);
    expect(result.unsupportedClaims).toHaveLength(0);
  });

  it('returns unsupported claims with reasons and correctedAnswer', async () => {
    const mockResult: VerificationResult = {
      supported: false,
      unsupportedClaims: [
        { claim: 'The visit limit is 20 visits per year.', reason: 'Source states 30 visits per year.' },
      ],
      correctedAnswer: 'The visit limit is [unverified: 20 visits per year].',
    };
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify(mockResult),
    } as Awaited<ReturnType<typeof generateText>>);

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

  it('returns supported: true on verifier LLM error (fail-open)', async () => {
    vi.mocked(generateText).mockRejectedValueOnce(new Error('Network timeout'));

    const result = await verifyAnswer('Some answer.', 'Some source.');

    expect(result.supported).toBe(true);
    expect(result.unsupportedClaims).toHaveLength(0);
  });

  it('returns supported: true on malformed JSON from verifier (fail-open)', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'This is not JSON at all.',
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await verifyAnswer('Some answer.', 'Some source.');

    expect(result.supported).toBe(true);
    expect(result.unsupportedClaims).toHaveLength(0);
  });

  it('handles response wrapped in markdown code fences', async () => {
    const mockResult: VerificationResult = {
      supported: true,
      unsupportedClaims: [],
    };
    vi.mocked(generateText).mockResolvedValueOnce({
      text: `\`\`\`json\n${JSON.stringify(mockResult)}\n\`\`\``,
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await verifyAnswer('The policy covers dental.', 'Dental services are covered under this policy.');

    expect(result.supported).toBe(true);
    expect(result.unsupportedClaims).toHaveLength(0);
  });

  it('extracts JSON when followed by trailing commentary', async () => {
    const json = JSON.stringify({ supported: false, unsupportedClaims: [{ claim: 'X', reason: 'Y' }], correctedAnswer: 'fixed' });
    vi.mocked(generateText).mockResolvedValueOnce({
      text: `${json}\n\nI hope this helps! Let me know if you need anything else.`,
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await verifyAnswer('answer', 'source');
    expect(result.supported).toBe(false);
    expect(result.unsupportedClaims).toHaveLength(1);
    expect(result.correctedAnswer).toBe('fixed');
  });

  it('extracts JSON when preceded by explanatory text', async () => {
    const json = JSON.stringify({ supported: true, unsupportedClaims: [] });
    vi.mocked(generateText).mockResolvedValueOnce({
      text: `Here is my analysis:\n\n${json}`,
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await verifyAnswer('answer', 'source');
    expect(result.supported).toBe(true);
  });

  it('extracts the first JSON object when multiple are present', async () => {
    const first = JSON.stringify({ supported: false, unsupportedClaims: [{ claim: 'A', reason: 'B' }] });
    const second = JSON.stringify({ supported: true, unsupportedClaims: [] });
    vi.mocked(generateText).mockResolvedValueOnce({
      text: `${first}\n\nAlternative:\n${second}`,
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await verifyAnswer('answer', 'source');
    expect(result.supported).toBe(false);
    expect(result.unsupportedClaims[0].claim).toBe('A');
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

function makeProcessInputStepArgs(overrides: Partial<ProcessInputStepArgs> = {}): ProcessInputStepArgs {
  return {
    messages: [],
    messageList: {} as any,
    abort: vi.fn() as any,
    retryCount: 0,
    state: {},
    systemMessages: [],
    stepNumber: 0,
    steps: [],
    model: {} as any,
    ...overrides,
  } as any;
}

describe('HallucinationVerifier.processOutputStep', () => {
  const verifier = new HallucinationVerifier();
  let savedEnv: string | undefined;

  beforeEach(() => {
    vi.mocked(generateText).mockClear();
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

  // Helper: mock generateText to make verifyAnswer return a specific result
  function mockVerification(result: VerificationResult) {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify(result),
    } as Awaited<ReturnType<typeof generateText>>);
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
    expect(generateText).not.toHaveBeenCalled();
  });

  // Test 2: Passes through when claims are all supported
  it('passes through when claims are all supported', async () => {
    mockVerification({ supported: true, unsupportedClaims: [] });

    const args = makeProcessOutputStepArgs();
    const result = await verifier.processOutputStep!(args);

    expect(result).toEqual(args.messages);
    expect(generateText).toHaveBeenCalled();
  });

  // Test 3: Calls abort with retry when unsupported claims found and retryCount < 2
  it('calls abort with retry:true when unsupported claims found and retryCount < 2', async () => {
    mockVerification({
      supported: false,
      unsupportedClaims: [{ claim: 'The limit is $500', reason: 'Source says $300' }],
      correctedAnswer: 'The limit is [unverified: $500].',
    });

    const state: Record<string, unknown> = {};
    const args = makeProcessOutputStepArgs({ retryCount: 0, state });

    try {
      await verifier.processOutputStep!(args);
      // Should not reach here because abort throws
      expect.unreachable('abort should have thrown');
    } catch (e: any) {
      expect(e.message).toBe('abort-called');
    }

    expect(args.abort).toHaveBeenCalled();
    const abortCall = vi.mocked(args.abort).mock.calls[0];
    const abortMessage = abortCall[0] as string;
    expect(abortCall[1]).toEqual(expect.objectContaining({ retry: true }));
    // Verify the message includes claim text, reason, and anti-over-correction guidance
    expect(abortMessage).toContain('The limit is $500');
    expect(abortMessage).toContain('Source says $300');
    expect(abortMessage).toContain('Do not discard your entire answer');
    expect(state.verificationRetryPending).toBe(true);
  });

  // Test 4: Rewrites assistant messages with correctedAnswer when retries exhausted
  it('rewrites assistant messages with correctedAnswer when retries exhausted', async () => {
    const corrected = 'The limit is [unverified: $500].';
    mockVerification({
      supported: false,
      unsupportedClaims: [{ claim: 'The limit is $500', reason: 'Source says $300' }],
      correctedAnswer: corrected,
    });

    const args = makeProcessOutputStepArgs({ retryCount: 2 });
    const result = await verifier.processOutputStep!(args) as any[];

    // Should NOT have called abort
    expect(args.abort).not.toHaveBeenCalled();

    // Assistant messages should have correctedAnswer text
    const assistantMsg = result.find((m: any) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    const textPart = assistantMsg!.content.parts.find((p: any) => p.type === 'text');
    expect(textPart.text).toBe(corrected);
  });

  // Test 5: Emits data-verification-rewrite via writer.custom() on final retry fallback
  it('emits data-verification-rewrite via writer.custom() on final retry fallback', async () => {
    const corrected = 'The limit is [unverified: $500].';
    mockVerification({
      supported: false,
      unsupportedClaims: [{ claim: 'The limit is $500', reason: 'Source says $300' }],
      correctedAnswer: corrected,
    });

    const writer = { custom: vi.fn() };
    const args = makeProcessOutputStepArgs({ retryCount: 2, writer: writer as any });
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
    expect(generateText).not.toHaveBeenCalled();
  });

  // Test 7: Passes through when text is empty
  it('passes through when text is empty', async () => {
    const args = makeProcessOutputStepArgs({ text: '' });
    const result = await verifier.processOutputStep!(args);

    expect(result).toEqual(args.messages);
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe('HallucinationVerifier.processInputStep', () => {
  const verifier = new HallucinationVerifier();

  // Test 8: Returns toolChoice: 'none' when verificationRetryPending is true, then clears it
  it('returns toolChoice none when verificationRetryPending is true, then clears the flag', async () => {
    const state: Record<string, unknown> = { verificationRetryPending: true };
    const args = makeProcessInputStepArgs({ state });

    const result = await verifier.processInputStep!(args);

    expect(result).toEqual(expect.objectContaining({ toolChoice: 'none' }));
    expect(state.verificationRetryPending).toBe(false);
  });

  // Test 9: Returns empty object when no retry pending
  it('returns empty object when no retry pending', async () => {
    const state: Record<string, unknown> = {};
    const args = makeProcessInputStepArgs({ state });

    const result = await verifier.processInputStep!(args);

    expect(result).toEqual({});
  });
});
