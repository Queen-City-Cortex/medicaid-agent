import { describe, it, expect } from 'vitest';
import {
  partText,
  messageParts,
  contentText,
  latestUserText,
  latestToolResult,
  openAIItemId,
} from '../../src/processors/message-utils.js';

describe('partText', () => {
  it('returns the text of a text part', () => {
    expect(partText({ type: 'text', text: 'hello' })).toBe('hello');
  });

  it('returns empty string for non-text parts', () => {
    expect(partText({ type: 'tool-invocation', toolInvocation: {} })).toBe('');
  });

  it('returns empty string when text is missing or non-string', () => {
    expect(partText({ type: 'text' })).toBe('');
    expect(partText({ type: 'text', text: 123 })).toBe('');
  });

  it('returns empty string for non-object input', () => {
    expect(partText(null)).toBe('');
    expect(partText(undefined)).toBe('');
    expect(partText('text')).toBe('');
  });
});

describe('messageParts', () => {
  it('returns an array of parts unchanged', () => {
    const parts = [{ type: 'text', text: 'a' }];
    expect(messageParts(parts)).toBe(parts);
  });

  it('unwraps a { parts: [...] } container', () => {
    expect(messageParts({ parts: [1, 2, 3] })).toEqual([1, 2, 3]);
  });

  it('returns [] for falsy content', () => {
    expect(messageParts(null)).toEqual([]);
    expect(messageParts(undefined)).toEqual([]);
    expect(messageParts('')).toEqual([]);
  });

  it('returns [] for objects without a parts array (and never throws on a string)', () => {
    expect(messageParts({ foo: 'bar' })).toEqual([]);
    expect(messageParts({ parts: 'not-an-array' })).toEqual([]);
    expect(messageParts('plain string')).toEqual([]);
  });
});

describe('contentText', () => {
  it('returns a string content as-is', () => {
    expect(contentText('plain answer')).toBe('plain answer');
  });

  it('returns empty string for falsy content', () => {
    expect(contentText(null)).toBe('');
    expect(contentText(undefined)).toBe('');
  });

  it('joins text parts with newlines', () => {
    expect(
      contentText({ parts: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }),
    ).toBe('a\nb');
  });

  it('reads parts from an array content', () => {
    expect(contentText([{ type: 'text', text: 'x' }])).toBe('x');
  });

  it('renders non-text parts as empty lines (and trims the result)', () => {
    expect(
      contentText({
        parts: [
          { type: 'text', text: 'a' },
          { type: 'tool-invocation', toolInvocation: {} },
          { type: 'text', text: 'b' },
        ],
      }),
    ).toBe('a\n\nb');
    expect(contentText({ parts: [{ type: 'text', text: '  padded  ' }] })).toBe('padded');
  });
});

describe('latestUserText', () => {
  it('returns the most recent user message text', () => {
    expect(
      latestUserText([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'middle' },
        { role: 'user', content: 'second' },
      ]),
    ).toBe('second');
  });

  it('skips non-user roles', () => {
    expect(
      latestUserText([
        { role: 'user', content: 'the question' },
        { role: 'assistant', content: 'the answer' },
      ]),
    ).toBe('the question');
  });

  it('skips user messages whose text is blank', () => {
    expect(
      latestUserText([
        { role: 'user', content: 'real question' },
        { role: 'user', content: '   ' },
      ]),
    ).toBe('real question');
  });

  it('returns null when there is no user text', () => {
    expect(latestUserText([{ role: 'assistant', content: 'a' }])).toBeNull();
    expect(latestUserText([])).toBeNull();
  });
});

describe('latestToolResult', () => {
  const toolMessage = (toolName: string, state: string, result: unknown) => ({
    content: { parts: [{ type: 'tool-invocation', toolInvocation: { state, toolName, result } }] },
  });

  it('returns the result of a completed tool invocation by name', () => {
    expect(
      latestToolResult([toolMessage('getSection', 'result', { id: 's1' })], 'getSection'),
    ).toEqual({ id: 's1' });
  });

  it('returns the most recent matching result across messages', () => {
    expect(
      latestToolResult(
        [
          toolMessage('getSection', 'result', { id: 'older' }),
          toolMessage('getSection', 'result', { id: 'newer' }),
        ],
        'getSection',
      ),
    ).toEqual({ id: 'newer' });
  });

  it('ignores invocations for a different tool', () => {
    expect(
      latestToolResult([toolMessage('searchSections', 'result', { id: 'x' })], 'getSection'),
    ).toBeNull();
  });

  it('ignores invocations that are not in the result state', () => {
    expect(
      latestToolResult([toolMessage('getSection', 'call', { id: 'x' })], 'getSection'),
    ).toBeNull();
  });

  it('returns null when a matching invocation has no result', () => {
    expect(
      latestToolResult([toolMessage('getSection', 'result', undefined)], 'getSection'),
    ).toBeNull();
  });
});

describe('openAIItemId', () => {
  it('returns the OpenAI item id from provider metadata', () => {
    expect(
      openAIItemId({ providerMetadata: { openai: { itemId: 'item_abc' } } }),
    ).toBe('item_abc');
  });

  it('returns null when the item id is missing or non-string', () => {
    expect(openAIItemId({ providerMetadata: { openai: {} } })).toBeNull();
    expect(openAIItemId({ providerMetadata: { openai: { itemId: 42 } } })).toBeNull();
    expect(openAIItemId({ providerMetadata: {} })).toBeNull();
  });

  it('returns null when there is no provider metadata', () => {
    expect(openAIItemId({})).toBeNull();
    expect(openAIItemId(null)).toBeNull();
    expect(openAIItemId('part')).toBeNull();
  });
});
