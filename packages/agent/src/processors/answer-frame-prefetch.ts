import type { Processor, ProcessInputStepArgs, ProcessInputStepResult } from '@mastra/core/processors';
import { latestUserText } from './message-utils.js';

export class AnswerFramePrefetchProcessor implements Processor {
  readonly id = 'answer-frame-prefetch';

  processInputStep({ stepNumber, messages, systemMessages }: ProcessInputStepArgs): ProcessInputStepResult | void {
    if (stepNumber !== 0) return;

    const question = latestUserText(messages);
    if (!question) return;

    return {
      activeTools: ['resolveAnswerFrame'],
      toolChoice: { type: 'tool', toolName: 'resolveAnswerFrame' },
      systemMessages: [
        ...systemMessages,
        {
          role: 'system',
          content:
            `Before taking any other action, call resolveAnswerFrame once with the latest user question verbatim.\n` +
            `Use the result as your default evidence plan for this turn. Do not answer before that tool call completes.\n` +
            `Latest user question: ${question}`,
        },
      ],
    };
  }
}
