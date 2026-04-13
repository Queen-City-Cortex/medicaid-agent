import type { Processor, ProcessInputStepArgs, ProcessInputStepResult } from '@mastra/core/processors';
import { messageParts, openAIItemId } from './message-utils.js';

type ToolInvocationState = 'partial-call' | 'call' | 'result';

type Candidate = {
  messageIndex: number;
  partIndex: number;
  rank: number;
};

function toolInvocationStateRank(state: ToolInvocationState | undefined): number {
  switch (state) {
    case 'result':
      return 3;
    case 'call':
      return 2;
    case 'partial-call':
      return 1;
    default:
      return 0;
  }
}

function candidateRank(part: unknown): number {
  if (!part || typeof part !== 'object') return 0;
  if ('type' in part && part.type === 'tool-invocation') {
    const invocation =
      'toolInvocation' in part && part.toolInvocation && typeof part.toolInvocation === 'object'
        ? (part.toolInvocation as { state?: ToolInvocationState })
        : undefined;
    const state = invocation?.state;
    return 10 + toolInvocationStateRank(state);
  }
  return 1;
}

function toolCallId(part: unknown): string | null {
  if (!part || typeof part !== 'object') return null;
  if (!('type' in part) || part.type !== 'tool-invocation') return null;
  if (!('toolInvocation' in part) || !part.toolInvocation || typeof part.toolInvocation !== 'object') return null;
  const invocation = part.toolInvocation as { toolCallId?: unknown };
  return typeof invocation.toolCallId === 'string' ? invocation.toolCallId : null;
}

function dedupeKeys(part: unknown): string[] {
  const keys: string[] = [];
  const callId = toolCallId(part);
  if (callId) keys.push(`tool:${callId}`);

  if (!callId) {
    const itemId = openAIItemId(part);
    if (itemId) keys.push(`item:${itemId}`);
  }

  return keys;
}

function isBetterCandidate(next: Candidate, current: Candidate | undefined): boolean {
  if (!current) return true;
  if (next.rank !== current.rank) return next.rank > current.rank;
  if (next.messageIndex !== current.messageIndex) return next.messageIndex > current.messageIndex;
  return next.partIndex > current.partIndex;
}

function syncMessageContent(content: Record<string, unknown>, parts: any[]) {
  const toolInvocations = parts
    .filter((part) => part?.type === 'tool-invocation' && part.toolInvocation)
    .map((part) => part.toolInvocation);

  const nextContent: Record<string, unknown> = {
    ...content,
    parts,
  };

  if (toolInvocations.length > 0) {
    nextContent.toolInvocations = toolInvocations;
  } else {
    delete nextContent.toolInvocations;
  }

  return nextContent;
}

export function dedupeOpenAIResponsesMessages<T extends { content?: unknown }>(messages: T[]): T[] {
  const bestCandidateByKey = new Map<string, Candidate>();

  messages.forEach((message, messageIndex) => {
    messageParts(message.content).forEach((part, partIndex) => {
      const keys = dedupeKeys(part);
      if (keys.length === 0) return;

      const candidate: Candidate = {
        messageIndex,
        partIndex,
        rank: candidateRank(part),
      };

      keys.forEach((key) => {
        const current = bestCandidateByKey.get(key);
        if (isBetterCandidate(candidate, current)) {
          bestCandidateByKey.set(key, candidate);
        }
      });
    });
  });

  let changed = false;

  const deduped = messages.flatMap((message, messageIndex) => {
    const parts = messageParts(message.content);
    if (parts.length === 0) return [message];

    const filteredParts = parts.filter((part, partIndex) => {
      const keys = dedupeKeys(part);
      if (keys.length === 0) return true;

      const keep = keys.every((key) => {
        const candidate = bestCandidateByKey.get(key);
        return candidate?.messageIndex === messageIndex && candidate?.partIndex === partIndex;
      });

      if (!keep) changed = true;
      return keep;
    });

    if (filteredParts.length === parts.length) return [message];
    if (filteredParts.length === 0) return [];

    const content =
      message.content && typeof message.content === 'object'
        ? syncMessageContent(message.content as Record<string, unknown>, filteredParts)
        : message.content;

    return [{ ...message, content }];
  });

  return changed ? deduped : messages;
}

export class OpenAIResponsesDedupProcessor implements Processor {
  readonly id = 'openai-responses-dedup';

  processInputStep({ messages }: ProcessInputStepArgs): ProcessInputStepResult | void {
    const dedupedMessages = dedupeOpenAIResponsesMessages(messages);
    if (dedupedMessages === messages) return;
    return { messages: dedupedMessages };
  }
}
