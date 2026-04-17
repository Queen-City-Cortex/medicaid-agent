import { describe, it, expect } from 'vitest';
import type { UIMessage } from 'ai';
import { isToolPart, getToolName, getTrailingAssistantText, hasRenderableAssistantPart } from '../../src/lib/message-parts';

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

describe('getTrailingAssistantText', () => {
  function makeMsg(parts: UIMessage['parts']): UIMessage {
    return { id: 'msg-1', role: 'assistant', parts };
  }

  it('returns all text when no tool parts exist', () => {
    const result = getTrailingAssistantText(makeMsg([
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'world' },
    ]));

    expect(result).toBe('Hello world');
  });

  it('keeps only trailing text after the last tool', () => {
    const result = getTrailingAssistantText(makeMsg([
      { type: 'text', text: 'Let me search...' },
      { type: 'tool-searchSections', toolCallId: 'tc-1', state: 'output-available' },
      { type: 'text', text: 'Final answer' },
    ]));

    expect(result).toBe('Final answer');
  });

  it('returns empty string for messages with no trailing text after tools', () => {
    const result = getTrailingAssistantText(makeMsg([
      { type: 'dynamic-tool', toolName: 'searchSections', toolCallId: 'tc-dyn', state: 'input-streaming' },
    ]));

    expect(result).toBe('');
  });
});

describe('hasRenderableAssistantPart', () => {
  it('returns true for non-empty text', () => {
    expect(hasRenderableAssistantPart([{ type: 'text', text: 'hello' }])).toBe(true);
  });

  it('returns true for tool parts', () => {
    expect(hasRenderableAssistantPart([{ type: 'dynamic-tool', toolName: 'searchSections' }])).toBe(true);
  });

  it('ignores step-start and whitespace-only text', () => {
    expect(hasRenderableAssistantPart([
      { type: 'step-start' },
      { type: 'text', text: '   ' },
    ])).toBe(false);
  });
});
