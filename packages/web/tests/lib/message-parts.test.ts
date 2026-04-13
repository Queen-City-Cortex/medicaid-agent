import { describe, it, expect } from 'vitest';
import type { UIMessage } from 'ai';
import { isToolPart, getToolName, extractMessageParts } from '../../src/lib/message-parts';

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

describe('extractMessageParts', () => {
  function makeMsg(parts: UIMessage['parts']): UIMessage {
    return { id: 'msg-1', role: 'assistant', parts };
  }

  function asPart(part: UIMessage['parts'][number]): UIMessage['parts'][number] {
    return part;
  }

  it('puts all text in answerText when no tool parts exist', () => {
    const result = extractMessageParts(makeMsg([
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'world' },
    ]));

    expect(result.answerText).toBe('Hello world');
    expect(result.traceEntries).toEqual([]);
  });

  it('suppresses internal text before the last tool and keeps trailing text as the answer', () => {
    const result = extractMessageParts(makeMsg([
      asPart({ type: 'text', text: 'Let me search...' }),
      asPart({ type: 'tool-searchSections', toolCallId: 'tc-1', state: 'output-available' }),
      asPart({ type: 'text', text: 'Based on the results...' }),
    ]));

    expect(result.traceEntries).toEqual([{
      type: 'tool',
      toolName: 'searchSections',
      toolCallId: 'tc-1',
      state: 'output-available',
      count: 1,
    }]);
    expect(result.answerText).toBe('Based on the results...');
  });

  it('collapses repeated consecutive tool parts', () => {
    const result = extractMessageParts(makeMsg([
      asPart({ type: 'tool-searchSections', toolCallId: 'tc-1', state: 'output-available' }),
      asPart({ type: 'text', text: 'Intermediate thought' }),
      asPart({ type: 'tool-searchSections', toolCallId: 'tc-2', state: 'output-available' }),
      asPart({ type: 'text', text: 'Final answer' }),
    ]));

    expect(result.traceEntries).toEqual([{
      type: 'tool',
      toolName: 'searchSections',
      toolCallId: 'tc-1',
      state: 'output-available',
      count: 2,
    }]);
    expect(result.answerText).toBe('Final answer');
  });

  it('ignores whitespace-only internal text before tools', () => {
    const result = extractMessageParts(makeMsg([
      asPart({ type: 'text', text: '   ' }),
      asPart({ type: 'tool-searchSections', toolCallId: 'tc-1', state: 'output-available' }),
      asPart({ type: 'text', text: 'Answer' }),
    ]));

    expect(result.traceEntries).toEqual([{
      type: 'tool',
      toolName: 'searchSections',
      toolCallId: 'tc-1',
      state: 'output-available',
      count: 1,
    }]);
  });

  it('uses dynamic-tool parts', () => {
    const result = extractMessageParts(makeMsg([
      asPart({ type: 'dynamic-tool', toolName: 'searchSections', toolCallId: 'tc-dyn', state: 'input-streaming' }),
      asPart({ type: 'text', text: 'Done' }),
    ]));

    expect(result.traceEntries[0]).toEqual({
      type: 'tool',
      toolName: 'searchSections',
      toolCallId: 'tc-dyn',
      state: 'input-streaming',
      count: 1,
    });
  });

  it('handles empty parts', () => {
    const result = extractMessageParts(makeMsg([]));
    expect(result.traceEntries).toEqual([]);
    expect(result.answerText).toBe('');
  });
});
