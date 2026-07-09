import type { Processor, ProcessInputArgs, ProcessInputResult } from '@mastra/core/processors';
import { intEnv } from '../env.js';
import { latestUserText } from './message-utils.js';

export interface GateTripwireMetadata {
  code: string;
  userMessage: string;
}

/**
 * Server-side counterpart of the browser's `maxLength` on the chat textarea
 * (ChatInput.tsx). The browser cap is trivially bypassed by calling the chat
 * API directly with a bearer token, so the same limit is enforced here where
 * it can't be skipped. Chars, not bytes — matching the client semantics.
 */
export class MessageLengthGuard implements Processor {
  readonly id = 'message-length-guard';
  readonly name = 'Message Length Guard';

  processInput({ messages, abort }: ProcessInputArgs<GateTripwireMetadata>): ProcessInputResult {
    const maxChars = intEnv('MAX_MESSAGE_CHARS', 10_000);
    const text = latestUserText(messages);
    if (text && maxChars > 0 && text.length > maxChars) {
      abort(`user message exceeds ${maxChars} characters`, {
        metadata: {
          code: 'message-too-long',
          userMessage: `That message is too long — please shorten it to under ${maxChars.toLocaleString('en-US')} characters or split it into smaller questions.`,
        },
      });
    }
    return messages;
  }
}
