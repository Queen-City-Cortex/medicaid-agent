import { describe, expect, it } from 'vitest';
import {
  dedupeOpenAIResponsesMessages,
  OpenAIResponsesDedupProcessor,
} from '../../src/processors/openai-responses-dedup.js';

function assistantMessage(id: string, parts: any[]) {
  return {
    id,
    role: 'assistant',
    createdAt: new Date(),
    content: {
      format: 2,
      parts,
    },
  };
}

function toolResultPart(toolCallId: string, toolName = 'resolveAnswerFrame', itemId = `fc_${toolCallId}`) {
  return {
    type: 'tool-invocation' as const,
    toolInvocation: {
      toolCallId,
      toolName,
      args: { query: 'What is EPSDT?' },
      state: 'result' as const,
      result: { ok: true, toolCallId },
    },
    providerMetadata: {
      openai: {
        itemId,
      },
    },
  };
}

function toolCallPart(toolCallId: string, toolName = 'resolveAnswerFrame', itemId = `fc_${toolCallId}`) {
  return {
    type: 'tool-invocation' as const,
    toolInvocation: {
      toolCallId,
      toolName,
      args: { query: 'What is EPSDT?' },
      state: 'call' as const,
    },
    providerMetadata: {
      openai: {
        itemId,
      },
    },
  };
}

function textPart(text: string, itemId: string) {
  return {
    type: 'text' as const,
    text,
    providerMetadata: {
      openai: {
        itemId,
      },
    },
  };
}

describe('dedupeOpenAIResponsesMessages', () => {
  it('drops duplicate tool result history for the same tool call id', () => {
    const earlier = assistantMessage('assistant-1', [toolResultPart('call-1')]);
    const later = assistantMessage('assistant-2', [toolResultPart('call-1')]);

    const deduped = dedupeOpenAIResponsesMessages([earlier, later]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('assistant-2');
    expect(deduped[0].content.parts).toHaveLength(1);
    expect(deduped[0].content.parts[0].toolInvocation).toEqual({
      toolCallId: 'call-1',
      toolName: 'resolveAnswerFrame',
      args: { query: 'What is EPSDT?' },
      state: 'result',
      result: { ok: true, toolCallId: 'call-1' },
    });
  });

  it('prefers a result over an earlier call for the same tool call id', () => {
    const callOnly = assistantMessage('assistant-1', [toolCallPart('call-1')]);
    const withResult = assistantMessage('assistant-2', [toolResultPart('call-1')]);

    const deduped = dedupeOpenAIResponsesMessages([callOnly, withResult]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('assistant-2');
    expect(deduped[0].content.parts[0].toolInvocation.state).toBe('result');
  });

  it('drops duplicate stored text items by OpenAI item id', () => {
    const earlier = assistantMessage('assistant-1', [textPart('Draft answer', 'msg_1')]);
    const later = assistantMessage('assistant-2', [textPart('Draft answer', 'msg_1')]);

    const deduped = dedupeOpenAIResponsesMessages([earlier, later]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('assistant-2');
    expect(deduped[0].content.parts).toEqual([textPart('Draft answer', 'msg_1')]);
  });

  it('returns the original array when there is nothing to dedupe', () => {
    const messages = [assistantMessage('assistant-1', [toolResultPart('call-1')])];

    const deduped = dedupeOpenAIResponsesMessages(messages);

    expect(deduped).toBe(messages);
  });
});

describe('OpenAIResponsesDedupProcessor', () => {
  it('returns updated messages only when duplicates are removed', () => {
    const processor = new OpenAIResponsesDedupProcessor();
    const messages = [
      assistantMessage('assistant-1', [toolResultPart('call-1')]),
      assistantMessage('assistant-2', [toolResultPart('call-1')]),
    ];

    const result = processor.processInputStep({
      stepNumber: 2,
      messages,
      systemMessages: [],
      messageList: {} as any,
      abort: (() => {
        throw new Error('abort');
      }) as any,
      retryCount: 0,
      state: {},
      steps: [],
      model: 'openai/gpt-5.4' as any,
    } as any);

    expect(result?.messages).toHaveLength(1);
    expect(result?.messages?.[0]?.id).toBe('assistant-2');
  });
});
