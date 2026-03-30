import { describe, it, expect } from 'vitest';
import { convertThreadMessageToUIMessage, extractText } from '../../src/lib/parse-message';

describe('extractText', () => {
  it('returns string content as-is', () => {
    expect(extractText('hello world')).toBe('hello world');
  });

  it('joins array of strings', () => {
    expect(extractText(['hello', ' ', 'world'])).toBe('hello world');
  });

  it('extracts text from array of objects with text property', () => {
    expect(extractText([{ text: 'foo' }, { text: 'bar' }])).toBe('foobar');
  });

  it('handles mixed arrays of strings and objects', () => {
    expect(extractText(['prefix ', { text: 'suffix' }])).toBe('prefix suffix');
  });

  it('extracts from object with parts containing text type', () => {
    const content = {
      parts: [
        { type: 'text', text: 'hello' },
        { type: 'image', url: 'img.png' },
        { type: 'text', text: ' world' },
      ],
    };
    expect(extractText(content)).toBe('hello world');
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
});
