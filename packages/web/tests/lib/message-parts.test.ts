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

  it('puts all text in answerText when no tool parts exist', () => {
    const result = extractMessageParts(makeMsg([
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'world' },
    ]));

    expect(result.answerText).toBe('Hello world');
    expect(result.traceEntries).toEqual([]);
  });

  it('splits text before last tool into reasoning, text after into answer', () => {
    const result = extractMessageParts(makeMsg([
      { type: 'text', text: 'Let me search...' } as any,
      { type: 'tool-searchSections', toolCallId: 'tc-1', state: 'output-available' } as any,
      { type: 'text', text: 'Based on the results...' } as any,
    ]));

    expect(result.traceEntries).toHaveLength(2);
    expect(result.traceEntries[0]).toEqual({ type: 'reasoning', text: 'Let me search...' });
    expect(result.traceEntries[1]).toEqual({
      type: 'tool',
      toolName: 'searchSections',
      toolCallId: 'tc-1',
      state: 'output-available',
    });
    expect(result.answerText).toBe('Based on the results...');
  });

  it('handles multiple tool parts', () => {
    const result = extractMessageParts(makeMsg([
      { type: 'tool-searchSections', toolCallId: 'tc-1', state: 'output-available' } as any,
      { type: 'text', text: 'Intermediate thought' } as any,
      { type: 'tool-getSection', toolCallId: 'tc-2', state: 'output-available' } as any,
      { type: 'text', text: 'Final answer' } as any,
    ]));

    const toolEntries = result.traceEntries.filter(e => e.type === 'tool');
    expect(toolEntries).toHaveLength(2);
    expect(result.traceEntries.find(e => e.type === 'reasoning')).toEqual({
      type: 'reasoning',
      text: 'Intermediate thought',
    });
    expect(result.answerText).toBe('Final answer');
  });

  it('skips whitespace-only text before tools', () => {
    const result = extractMessageParts(makeMsg([
      { type: 'text', text: '   ' } as any,
      { type: 'tool-searchSections', toolCallId: 'tc-1', state: 'output-available' } as any,
      { type: 'text', text: 'Answer' } as any,
    ]));

    // Whitespace-only text should not produce a reasoning entry
    const reasoning = result.traceEntries.filter(e => e.type === 'reasoning');
    expect(reasoning).toHaveLength(0);
  });

  it('uses dynamic-tool parts', () => {
    const result = extractMessageParts(makeMsg([
      { type: 'dynamic-tool', toolName: 'searchSections', toolCallId: 'tc-dyn', state: 'input-streaming' } as any,
      { type: 'text', text: 'Done' } as any,
    ]));

    expect(result.traceEntries[0]).toEqual({
      type: 'tool',
      toolName: 'searchSections',
      toolCallId: 'tc-dyn',
      state: 'input-streaming',
    });
  });

  it('handles empty parts', () => {
    const result = extractMessageParts(makeMsg([]));
    expect(result.traceEntries).toEqual([]);
    expect(result.answerText).toBe('');
  });
});
