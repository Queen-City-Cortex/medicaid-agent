import { describe, it, expect } from 'vitest';
import { convertThreadMessageToUIMessage, extractText } from '../../src/lib/parse-message';

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
