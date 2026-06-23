import { describe, it, expect } from 'vitest';
import { coalesceThreadMessages, convertThreadMessageToUIMessage, extractText } from '../../src/lib/parse-message';
import { extractVerificationState, getTrailingAssistantText, isToolPart } from '../../src/lib/message-parts';

describe('extractText', () => {
  it('returns string content as-is', () => {
    expect(extractText('hello world')).toBe('hello world');
  });

  it('joins array of strings with paragraph breaks', () => {
    expect(extractText(['hello', 'world'])).toBe('hello\n\nworld');
  });

  it('extracts text from array of objects with text property', () => {
    expect(extractText([{ text: 'foo' }, { text: 'bar' }])).toBe('foo\n\nbar');
  });

  it('handles mixed arrays of strings and objects', () => {
    expect(extractText(['prefix', { text: 'suffix' }])).toBe('prefix\n\nsuffix');
  });

  it('extracts from object with parts containing text type', () => {
    const content = {
      parts: [
        { type: 'text', text: 'hello' },
        { type: 'image', url: 'img.png' },
        { type: 'text', text: 'world' },
      ],
    };
    expect(extractText(content)).toBe('hello\n\nworld');
  });

  it('returns empty string for null/undefined/number', () => {
    expect(extractText(null)).toBe('');
    expect(extractText(undefined)).toBe('');
    expect(extractText(42)).toBe('');
  });
});

describe('convertThreadMessageToUIMessage', () => {
  it('converts user message with string content', () => {
    const result = convertThreadMessageToUIMessage({
      id: 'msg-1',
      role: 'user',
      content: 'What is EPSDT?',
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe('msg-1');
    expect(result!.role).toBe('user');
    expect(result!.parts).toEqual([{ type: 'text', text: 'What is EPSDT?' }]);
  });

  it('converts assistant message', () => {
    const result = convertThreadMessageToUIMessage({
      id: 'msg-2',
      role: 'assistant',
      content: 'EPSDT stands for...',
    });

    expect(result).not.toBeNull();
    expect(result!.role).toBe('assistant');
  });

  it('carries memory createdAt into UIMessage metadata', () => {
    const result = convertThreadMessageToUIMessage({
      id: 'msg-3',
      role: 'assistant',
      content: 'Answer text.',
      createdAt: '2026-04-09T17:50:36.141Z',
    });
    expect(result!.metadata).toEqual({ createdAt: '2026-04-09T17:50:36.141Z' });
  });

  it('omits metadata when createdAt is missing or invalid', () => {
    const noDate = convertThreadMessageToUIMessage({ id: 'a', role: 'assistant', content: 'x'.repeat(10) });
    expect(noDate!.metadata).toBeUndefined();
    const badDate = convertThreadMessageToUIMessage({
      id: 'b',
      role: 'assistant',
      content: 'x'.repeat(10),
      createdAt: 'not-a-date',
    });
    expect(badDate!.metadata).toBeUndefined();
  });

  it('returns null for non-user/non-assistant roles', () => {
    expect(convertThreadMessageToUIMessage({ role: 'system', content: 'hi' })).toBeNull();
    expect(convertThreadMessageToUIMessage({ role: 'tool', content: 'result' })).toBeNull();
  });

  it('returns null for whitespace-only content', () => {
    expect(convertThreadMessageToUIMessage({ role: 'user', content: '   ' })).toBeNull();
    expect(convertThreadMessageToUIMessage({ role: 'assistant', content: '\n\t' })).toBeNull();
  });

  it('generates UUID when id is missing', () => {
    const result = convertThreadMessageToUIMessage({
      role: 'user',
      content: 'test',
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBeTruthy();
    expect(typeof result!.id).toBe('string');
  });

  it('trims whitespace from content', () => {
    const result = convertThreadMessageToUIMessage({
      role: 'user',
      content: '  hello  ',
    });

    expect(result!.parts).toEqual([{ type: 'text', text: 'hello' }]);
  });

  describe('V2 format (MastraMessageContentV2)', () => {
    it('converts tool-invocation parts to dynamic-tool parts', () => {
      const result = convertThreadMessageToUIMessage({
        id: 'msg-v2',
        role: 'assistant',
        content: {
          format: 2,
          parts: [
            { type: 'text', text: 'Let me search for that.' },
            {
              type: 'tool-invocation',
              toolInvocation: {
                toolCallId: 'tc-1',
                toolName: 'searchSections',
                args: { query: 'chiropractic' },
                result: { sections: [] },
                state: 'result',
              },
            },
            { type: 'text', text: '## Answer\n\nChiropractic services are...' },
          ],
        },
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('msg-v2');
      expect(result!.parts).toHaveLength(3);
      expect(result!.parts[0]).toEqual({ type: 'text', text: 'Let me search for that.' });
      expect(result!.parts[1]).toEqual({
        type: 'dynamic-tool',
        toolName: 'searchSections',
        toolCallId: 'tc-1',
        state: 'output-available',
        input: { query: 'chiropractic' },
        output: { sections: [] },
      });
      expect(result!.parts[2]).toEqual({ type: 'text', text: '## Answer\n\nChiropractic services are...' });
    });

    it('preserves text-only V2 messages', () => {
      const result = convertThreadMessageToUIMessage({
        id: 'msg-text',
        role: 'assistant',
        content: {
          format: 2,
          parts: [
            { type: 'text', text: 'Hello there.' },
          ],
        },
      });

      expect(result).not.toBeNull();
      expect(result!.parts).toEqual([{ type: 'text', text: 'Hello there.' }]);
    });

    it('handles step-start parts', () => {
      const result = convertThreadMessageToUIMessage({
        id: 'msg-steps',
        role: 'assistant',
        content: {
          format: 2,
          parts: [
            { type: 'step-start' },
            { type: 'text', text: 'Searching...' },
            {
              type: 'tool-invocation',
              toolInvocation: {
                toolCallId: 'tc-2',
                toolName: 'getSection',
                args: { id: 'sec-1' },
                result: { text: 'Policy text' },
                state: 'result',
              },
            },
          ],
        },
      });

      expect(result).not.toBeNull();
      expect(result!.parts).toHaveLength(3);
      expect(result!.parts[0]).toEqual({ type: 'step-start' });
    });

    it('falls through to legacy when V2 parts array is empty', () => {
      const result = convertThreadMessageToUIMessage({
        id: 'msg-empty',
        role: 'assistant',
        content: {
          format: 2,
          parts: [],
        },
      });

      // Empty parts → falls to extractText → empty string → null
      expect(result).toBeNull();
    });

    it('maps non-result tool state to input-available', () => {
      const result = convertThreadMessageToUIMessage({
        id: 'msg-call',
        role: 'assistant',
        content: {
          format: 2,
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: {
                toolCallId: 'tc-3',
                toolName: 'lookupPolicy',
                args: { policyNumber: '1F' },
                state: 'call',
              },
            },
          ],
        },
      });

      expect(result).not.toBeNull();
      expect(result!.parts[0]).toMatchObject({
        type: 'dynamic-tool',
        toolName: 'lookupPolicy',
        state: 'input-available',
        output: undefined,
      });
    });
  });
});

describe('coalesceThreadMessages', () => {
  // Mirrors how Mastra persists one agent turn: the answer text + verifier
  // state in one message (timestamped FIRST), tool calls in another (later),
  // and observational-memory (data-om-*) noise scattered + an om-only tail.
  const v2 = (parts: unknown[]) => ({ format: 2, parts });
  const turn = [
    { id: 'u1', role: 'user', createdAt: '2026-06-22T18:08:10Z',
      content: v2([{ type: 'text', text: 'Does NC Medicaid cover chiropractic, with visit limits?' }]) },
    { id: 'a-answer', role: 'assistant', createdAt: '2026-06-22T18:08:17Z',
      content: v2([
        { type: 'data-om-activation', data: { cycleId: 'x' } },
        { type: 'text', text: 'Yes — limited to 8 visits/yr [Policy 1F § 5.6](https://medicaid.ncdhhs.gov/1f/download).' },
        { type: 'data-verification-rewrite', data: { severity: 'low', confidence: 0, counts: { unsupported: 6 }, pureMarkerFallback: false } },
      ]) },
    { id: 'a-tools', role: 'assistant', createdAt: '2026-06-22T18:08:30Z',
      content: v2([
        { type: 'tool-invocation', toolInvocation: { toolCallId: 't1', toolName: 'searchSections', state: 'result', args: {}, result: { sections: [{ id: 's1', title: 'Visit Limits', sectionNumber: '5.6', policyNumber: '1F', url: 'https://medicaid.ncdhhs.gov/1f/download' }] } } },
        { type: 'data-om-status', data: {} },
        { type: 'tool-invocation', toolInvocation: { toolCallId: 't2', toolName: 'getSection', state: 'result', args: {}, result: { section: { id: 's1' } } } },
      ]) },
    { id: 'a-om', role: 'assistant', createdAt: '2026-06-22T18:08:36Z',
      content: v2([{ type: 'data-om-activation', data: {} }]) },
  ];

  it('coalesces a split agent turn into one assistant message (not four)', () => {
    const out = coalesceThreadMessages(turn);
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('orders tools before the answer text so the Research trail + footnotes render', () => {
    const [, assistant] = coalesceThreadMessages(turn);
    const types = assistant.parts.map((p) => p.type);
    const lastTool = types.map((t, i) => (/tool/.test(t) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    const firstText = types.indexOf('text');
    expect(assistant.parts.filter(isToolPart)).toHaveLength(2);
    expect(lastTool).toBeGreaterThanOrEqual(0);
    expect(firstText).toBeGreaterThan(lastTool); // answer is trailing
    expect(getTrailingAssistantText(assistant)).toContain('8 visits/yr');
    // no observational-memory noise survives
    expect(types.some((t) => t.startsWith('data-om'))).toBe(false);
  });

  it('preserves the verifier state so the trust badge restores', () => {
    const [, assistant] = coalesceThreadMessages(turn);
    const v = extractVerificationState(assistant);
    expect(v).not.toBeNull();
    expect(v!.severity).toBe('low');
    expect(v!.rewrote).toBe(true);
    expect(v!.counts.unsupported).toBe(6);
  });

  it('anchors id + timestamp on the answer-bearing message', () => {
    const [, assistant] = coalesceThreadMessages(turn);
    expect(assistant.id).toBe('a-answer');
    expect((assistant.metadata as { createdAt?: string }).createdAt).toBe('2026-06-22T18:08:17.000Z');
  });

  it('drops an om-only assistant turn entirely (no empty bubble)', () => {
    const out = coalesceThreadMessages([
      { id: 'u1', role: 'user', content: 'hi' },
      { id: 'a-om', role: 'assistant', content: { format: 2, parts: [{ type: 'data-om-activation', data: {} }] } },
    ]);
    expect(out.map((m) => m.role)).toEqual(['user']);
  });

  it('keeps a genuinely answer-less tool turn as one message (not orphan cards)', () => {
    const out = coalesceThreadMessages([
      { id: 'u1', role: 'user', content: 'hi' },
      { id: 'a-t1', role: 'assistant', content: { format: 2, parts: [{ type: 'tool-invocation', toolInvocation: { toolCallId: 't1', toolName: 'searchSections', state: 'result', args: {}, result: {} } }] } },
      { id: 'a-t2', role: 'assistant', content: { format: 2, parts: [{ type: 'tool-invocation', toolInvocation: { toolCallId: 't2', toolName: 'getSection', state: 'result', args: {}, result: {} } }] } },
    ]);
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(out[1].parts.filter(isToolPart)).toHaveLength(2);
    expect(getTrailingAssistantText(out[1])).toBe(''); // genuinely no answer → endedWithoutAnswer path
  });
});
