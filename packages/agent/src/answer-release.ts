import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { MastraDBMessage } from '@mastra/core/memory';
import type { MemoryStorage } from '@mastra/core/storage';
import type { UIMessage, UIMessageChunk } from 'ai';
import { VERIFICATION_PART, WITHHELD_ANSWER, UNVERIFIED_HISTORY, type VerificationOutcome } from '@nc-medicaid/contracts';

// Initialized from persistent application storage before serving requests.
let secret = randomBytes(32).toString('hex');
export function configureAnswerRelease(secretKey: string): void { secret = secretKey; }
function signature(text: string, outcome: VerificationOutcome): string {
  return createHmac('sha256', secret).update(JSON.stringify([text, outcome])).digest('hex');
}
function textOf(message: MastraDBMessage): string {
  return typeof message.content === 'string' ? message.content
    : message.content.parts.filter(p => p.type === 'text').map(p => p.text).join('\n');
}
export function releaseMessage(message: MastraDBMessage, text: string, outcome: VerificationOutcome): MastraDBMessage {
  const content = typeof message.content === 'object' ? message.content : { format: 2 as const, parts: [] };
  return { ...message, content: { format: 2,
    parts: [
      ...content.parts.filter(p => p.type !== 'text' && p.type !== 'reasoning' && !p.type.startsWith('data-verification-')),
      { type: 'text', text },
      { type: VERIFICATION_PART, data: outcome },
    ],
    metadata: { ...content.metadata, answerRelease: { outcome, signature: signature(text, outcome) } },
  } };
}
export function guardMessage(message: MastraDBMessage): MastraDBMessage {
  if (message.role !== 'assistant') return message;
  const content = typeof message.content === 'object' ? message.content : null;
  const release = content?.metadata?.answerRelease as { outcome: VerificationOutcome; signature: string } | undefined;
  const text = textOf(message);
  if (release?.signature && release.outcome) {
    const expected = Buffer.from(signature(text, release.outcome));
    const actual = Buffer.from(release.signature);
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) {
      return releaseMessage(message, text, release.outcome);
    }
  }
  if (!text.trim()) {
    return { ...message, content: { format: 2, parts: content?.parts.filter(p => p.type === 'tool-invocation') ?? [] } };
  }
  return releaseMessage(message, UNVERIFIED_HISTORY, { status: 'withheld', reason: 'unverified_history', passCount: 0 });
}

/** Client payloads carry user text and a thread ID, never execution options,
 * tool evidence, assistant history, release metadata, or resource ownership. */
export function trustedChatInput(body: { messages?: UIMessage[]; memory?: { thread?: unknown } }, userId: string) {
  const input = [...(body.messages ?? [])].reverse().find(m => m.role === 'user');
  const parts = input?.parts.filter(p => p.type === 'text').map(p => ({ type: 'text' as const, text: p.text })) ?? [];
  return { messages: [{ id: crypto.randomUUID(), role: 'user' as const, parts }],
    memory: { thread: typeof body.memory?.thread === 'string' ? body.memory.thread : crypto.randomUUID(), resource: userId } };
}

/** Enforce the same boundary for memory recall, history, clones and writes. */
export function installMemoryReleaseGate(memory: MemoryStorage): void {
  // Older observations summarize pre-gate prose and cannot be trusted. New
  // observations are derived from guarded messages after the output processor.
  const observe = memory.getObservationalMemory.bind(memory);
  memory.getObservationalMemory = async (...args) => {
    const record = await observe(...args);
    return record?.config?.answerReleaseVersion === 1 ? record : null;
  };
  const observations = memory.getObservationalMemoryHistory.bind(memory);
  memory.getObservationalMemoryHistory = async (...args) => (await observations(...args))
    .filter(record => record.config?.answerReleaseVersion === 1);
  const initialize = memory.initializeObservationalMemory.bind(memory);
  memory.initializeObservationalMemory = args => initialize({ ...args, config: { ...args.config, answerReleaseVersion: 1 } });
  const save = memory.saveMessages.bind(memory);
  memory.saveMessages = args => save({ ...args, messages: args.messages.map(guardMessage) });
  for (const name of ['listMessages', 'listMessagesById', 'listMessagesByResourceId'] as const) {
    const read = memory[name].bind(memory) as (args: unknown) => Promise<{ messages: MastraDBMessage[] }>;
    // All three read methods share the message envelope; retain pagination.
    Object.assign(memory, { [name]: async (args: unknown) => {
      const result = await read(args);
      return { ...result, messages: result.messages.map(guardMessage) };
    } });
  }
  const clone = memory.cloneThread.bind(memory);
  memory.cloneThread = async args => {
    const result = await clone(args);
    const clonedMessages = result.clonedMessages.map(guardMessage);
    await save({ messages: clonedMessages });
    return { ...result, clonedMessages };
  };
  const update = memory.updateMessages.bind(memory);
  memory.updateMessages = async args => {
    const existing = await memory.listMessagesById({ messageIds: args.messages.map(m => m.id) });
    const messages = args.messages.map(patch => {
      const original = existing.messages.find(m => m.id === patch.id);
      if (!original) throw new Error('Message not found');
      return guardMessage({ ...original, ...patch, content: { ...original.content, ...patch.content } } as MastraDBMessage);
    });
    return update({ messages });
  };
}

/** Drop all model prose. Only the processor's terminal release supplies text. */
export function gateAnswerStream(stream: ReadableStream<UIMessageChunk>): ReadableStream<UIMessageChunk> {
  let released = false;
  let blocked = false;
  const id = crypto.randomUUID();
  return stream.pipeThrough(new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(part, controller) {
      if (part.type === 'data-tripwire') blocked = true;
      if (part.type === VERIFICATION_PART) {
        const data = part.data as VerificationOutcome & { answer?: string };
        const { answer, ...outcome } = data;
        controller.enqueue({ type: VERIFICATION_PART, data: outcome });
        if (answer !== undefined && !released) {
          released = true;
          controller.enqueue({ type: 'text-start', id });
          controller.enqueue({ type: 'text-delta', id, delta: answer });
          controller.enqueue({ type: 'text-end', id });
        }
        return;
      }
      if (part.type.startsWith('text-') || part.type.startsWith('reasoning-') || part.type === 'message-metadata'
          || part.type === 'data-verification-rewrite' || part.type === 'data-verification-ok') return;
      if (part.type === 'finish' && !released && !blocked) {
        released = true;
        controller.enqueue({ type: VERIFICATION_PART, data: { status: 'withheld', reason: 'unavailable', passCount: 0 } });
        controller.enqueue({ type: 'text-start', id });
        controller.enqueue({ type: 'text-delta', id, delta: WITHHELD_ANSWER });
        controller.enqueue({ type: 'text-end', id });
      }
      controller.enqueue(part.type === 'error' ? { type: 'error', errorText: 'The answer could not be completed. Please try again.' } : part);
    },
  }));
}
