import type { Processor, ProcessInputStepArgs, ProcessInputStepResult } from '@mastra/core/processors';
import { contentText, latestUserText } from './message-utils.js';
import { withPriorTurns } from './prior-turns.js';

// The router, the coverage scope and the search terms read English only.
const IN_ENGLISH = 'translate it faithfully when it is in another language, keeping dates, form numbers and program names exactly as written';

const AFTER_THE_CALL = 'Use the result as your default evidence plan for this turn. Do not answer before that tool call completes.';

/** Both step-0 messages are fixed strings. The model already has the user's
 *  turns as user messages; copying their text into a system message would
 *  give it system authority. */
export const PREFETCH_FIRST_TURN =
  'Before taking any other action, call resolveAnswerFrame once with the latest user question as its query. ' +
  `Pass an English question verbatim; ${IN_ENGLISH}.\n${AFTER_THE_CALL}`;

export const PREFETCH_FOLLOW_UP =
  'Before taking any other action, call resolveAnswerFrame once. As its query, pass a self-contained restatement of the latest user question: ' +
  'take what it leaves unstated (program, policy number, service, population, date) from the earlier user turns of this conversation, ' +
  'and add nothing the conversation does not establish. If the latest question is already self-contained, pass it verbatim. ' +
  `Write the query in English: ${IN_ENGLISH}.\n` +
  AFTER_THE_CALL;

export class AnswerFramePrefetchProcessor implements Processor {
  readonly id = 'answer-frame-prefetch';

  processInputStep({ stepNumber, messages, systemMessages, requestContext }: ProcessInputStepArgs): ProcessInputStepResult | void {
    if (stepNumber !== 0) return;

    if (!latestUserText(messages)) return;

    // Earlier turns come from the stored thread: Mastra recalls history into
    // `messages` only in some memory modes.
    const userTurns = withPriorTurns(requestContext, messages)
      .filter(message => message.role === 'user' && contentText(message.content).trim()).length;

    return {
      activeTools: ['resolveAnswerFrame'],
      toolChoice: { type: 'tool', toolName: 'resolveAnswerFrame' },
      systemMessages: [
        ...systemMessages,
        { role: 'system', content: userTurns > 1 ? PREFETCH_FOLLOW_UP : PREFETCH_FIRST_TURN },
      ],
    };
  }
}
