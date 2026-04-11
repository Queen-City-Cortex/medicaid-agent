import { describe, expect, it } from 'vitest';
import { AnswerFramePrefetchProcessor } from '../../src/processors/answer-frame-prefetch.js';

function makeArgs(overrides: Record<string, unknown> = {}) {
  return {
    stepNumber: 0,
    messages: [
      {
        role: 'user',
        content: {
          parts: [{ type: 'text', text: 'Does Policy 10A cover telehealth speech therapy?' }],
        },
      },
    ],
    systemMessages: [],
    messageList: {} as any,
    abort: (() => {
      throw new Error('abort');
    }) as any,
    retryCount: 0,
    state: {},
    ...overrides,
  } as any;
}

describe('AnswerFramePrefetchProcessor', () => {
  it('forces resolveAnswerFrame on the first step using the latest user question', () => {
    const processor = new AnswerFramePrefetchProcessor();

    const result = processor.processInputStep!(makeArgs());

    expect(result).toMatchObject({
      activeTools: ['resolveAnswerFrame'],
      toolChoice: { type: 'tool', toolName: 'resolveAnswerFrame' },
    });
    expect(result?.systemMessages).toHaveLength(1);
    expect(result?.systemMessages?.[0]?.content).toContain('call resolveAnswerFrame once');
    expect(result?.systemMessages?.[0]?.content).toContain('Does Policy 10A cover telehealth speech therapy?');
  });

  it('does nothing after step 0', () => {
    const processor = new AnswerFramePrefetchProcessor();

    const result = processor.processInputStep!(makeArgs({ stepNumber: 1 }));

    expect(result).toBeUndefined();
  });

  it('does nothing when there is no user text to prefetch', () => {
    const processor = new AnswerFramePrefetchProcessor();

    const result = processor.processInputStep!(
      makeArgs({
        messages: [{ role: 'assistant', content: { parts: [{ type: 'text', text: 'Hi' }] } }],
      }),
    );

    expect(result).toBeUndefined();
  });
});
