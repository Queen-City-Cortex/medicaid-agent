import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { MastraDBMessage } from '@mastra/core/memory';
import type { MemoryStorage } from '@mastra/core/storage';
import type { UIMessage, UIMessageChunk } from 'ai';
import { VERIFICATION_PART, WITHHELD_ANSWER, UNVERIFIED_HISTORY, VerificationOutcomeSchema,
  type VerificationOutcome, type VerificationProgress } from '@nc-medicaid/contracts';
import { log, errorFields } from './logger.js';

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
/** Shown in place of a failed tool call's own error, which can name internal hosts. */
const TOOL_ERROR_TEXT = 'This step could not be completed.';
/** Bookkeeping kept on a stored observer marker. The framework matches markers
 * by type and `cycleId`; the observer's own text is never among these. */
const OBSERVER_MARKER_FIELDS = ['cycleId', 'operationType', 'recordId', 'threadId', 'startedAt', 'completedAt',
  'durationMs', 'tokensToObserve', 'tokensObserved', 'observationTokens'];
type Part = MastraDBMessage['content']['parts'][number];
/** A stored part without text the verifier never saw: observer notes ride in
 * `data-om-*` markers and a failed tool call keeps its raw error. */
function redactedPart(part: Part): Part {
  if (part.type.startsWith('data-om-')) {
    const data = ((part as { data?: unknown }).data ?? {}) as Record<string, unknown>;
    // The framework reads `sealedAt` to find where a sealed message ends.
    const { createdAt, metadata } = part as { createdAt?: unknown; metadata?: { mastra?: { sealedAt?: unknown } } };
    const sealedAt = metadata?.mastra?.sealedAt;
    return { type: part.type, data: Object.fromEntries(OBSERVER_MARKER_FIELDS
      .filter(name => typeof data[name] === 'string' || typeof data[name] === 'number').map(name => [name, data[name]])),
      ...(typeof createdAt === 'number' ? { createdAt } : {}),
      ...(typeof sealedAt === 'number' ? { metadata: { mastra: { sealedAt } } } : {}) } as Part;
  }
  if (part.type === 'tool-invocation' && 'errorText' in part.toolInvocation) {
    return { ...part, toolInvocation: { ...part.toolInvocation, errorText: TOOL_ERROR_TEXT } } as Part;
  }
  return part;
}
export function releaseMessage(message: MastraDBMessage, text: string, outcome: VerificationOutcome): MastraDBMessage {
  const content = typeof message.content === 'object' ? message.content : { format: 2 as const, parts: [] };
  return { ...message, content: { format: 2,
    parts: [
      ...content.parts.filter(p => p.type !== 'text' && p.type !== 'reasoning' && !p.type.startsWith('data-verification-')).map(redactedPart),
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
    return { ...message, content: { format: 2, parts: content?.parts.filter(p => p.type === 'tool-invocation').map(redactedPart) ?? [] } };
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

/** Store methods `installMemoryReleaseGate` replaces on the instance. */
export const GUARDED_MEMORY_METHODS = [
  'saveThread', 'getObservationalMemory', 'getObservationalMemoryHistory', 'initializeObservationalMemory',
  'saveMessages', 'listMessages', 'listMessagesById', 'listMessagesByResourceId', 'cloneThread', 'updateMessages',
  'deleteThread',
] as const;

const PLUMBING = 'Class or framework plumbing; touches no stored row.';
const MAINTENANCE = 'Creates the schema or deletes rows; returns none.';
const HELPER = 'Internal helper; the rows it shapes leave the store only through the guarded readers.';
const THREAD_READ = 'Returns thread rows (owner, title, metadata), never message text.';
const THREAD_UPDATE = 'Writes title and metadata only; cannot change the owner.';
const WORKING_MEMORY = 'Resource working memory, which chat-memory.ts disables; review again before enabling it.';
const OBSERVATION_STATE = 'Writes observation state derived from guarded messages; returns no record and leaves the release marker alone.';
const OBSERVATION_RECORD = 'Returns a new record that copies the config, and so the release marker, of one read through the guarded reader.';
const OBSERVATION_CONFIG = 'Can write the release marker, but only framework code reaches it and it starts from a record read through the guarded reader; no gateway route exposes it.';

/** Store methods reviewed and left unwrapped, each with the reason. A name in
 * neither list stops start-up: decide whether it can return or persist
 * assistant prose, or change a thread's owner, then classify it here. */
export const PASS_THROUGH_MEMORY_METHODS: Readonly<Record<string, string>> = {
  constructor: PLUMBING, toRawConfig: PLUMBING, __setRawConfig: PLUMBING, __setLogger: PLUMBING,
  init: MAINTENANCE, prune: MAINTENANCE, dangerouslyClearAll: MAINTENANCE, deleteMessages: MAINTENANCE,
  clearObservationalMemory: MAINTENANCE,
  parseRow: HELPER, _sortMessages: HELPER, _getIncludedMessages: HELPER, getOMKey: HELPER, parseOMRow: HELPER,
  parseOrderBy: HELPER, deepMergeConfig: HELPER, validateMetadataKeys: HELPER, validatePagination: HELPER,
  validatePaginationInput: HELPER,
  getThreadById: THREAD_READ, listThreads: THREAD_READ,
  updateThread: THREAD_UPDATE, patchThread: THREAD_UPDATE,
  getResourceById: WORKING_MEMORY, saveResource: WORKING_MEMORY, updateResource: WORKING_MEMORY,
  updateActiveObservations: OBSERVATION_STATE, updateBufferedObservations: OBSERVATION_STATE,
  updateBufferedReflection: OBSERVATION_STATE, setReflectingFlag: OBSERVATION_STATE,
  setObservingFlag: OBSERVATION_STATE, setBufferingObservationFlag: OBSERVATION_STATE,
  setBufferingReflectionFlag: OBSERVATION_STATE, setPendingMessageTokens: OBSERVATION_STATE,
  swapBufferedToActive: 'Moves buffered observations into the active record; returns counts and ids only.',
  createReflectionGeneration: OBSERVATION_RECORD, swapBufferedReflectionToActive: OBSERVATION_RECORD,
  insertObservationalMemoryRecord: OBSERVATION_CONFIG, updateObservationalMemoryConfig: OBSERVATION_CONFIG,
};

/** Every function on the store and its whole prototype chain. */
function storeMethodNames(memory: object): Set<string> {
  const names = new Set<string>();
  for (let level: object | null = memory; level && level !== Object.prototype; level = Object.getPrototypeOf(level)) {
    for (const [name, property] of Object.entries(Object.getOwnPropertyDescriptors(level))) {
      if (typeof property.value === 'function') names.add(name);
    }
  }
  return names;
}

/** Enforce the same boundary for memory recall, history, clones and writes.
 * Default-deny: an adapter method this file has not classified fails start-up
 * rather than running unguarded. */
export function installMemoryReleaseGate(
  memory: MemoryStorage,
  /** Deletes what the application stores about a thread outside the memory store. */
  onThreadDeleted?: (threadId: string) => Promise<void>,
): void {
  const guarded: readonly string[] = GUARDED_MEMORY_METHODS;
  const unclassified = [...storeMethodNames(memory)]
    .filter(name => !guarded.includes(name) && !Object.hasOwn(PASS_THROUGH_MEMORY_METHODS, name));
  if (unclassified.length > 0) {
    throw new Error(`Memory store has unclassified methods: ${unclassified.join(', ')}. `
      + 'Classify each in answer-release.ts as guarded or reviewed pass-through before starting the server.');
  }
  // The adapter writes threads with INSERT OR REPLACE and the framework's
  // create route never looks up an existing id, so ownership is fixed here.
  // Saves of one id run one at a time, so two users creating the same new id
  // cannot both pass the lookup: the store is one process on one SQLite file.
  const saveThread = memory.saveThread.bind(memory);
  const savesInFlight = new Map<string, Promise<unknown>>();
  memory.saveThread = async args => {
    const id = args.thread.id;
    const previous = savesInFlight.get(id) ?? Promise.resolve();
    const save = previous.catch(() => {}).then(async () => {
      const existing = await memory.getThreadById({ threadId: id });
      if (existing && existing.resourceId !== args.thread.resourceId) {
        throw Object.assign(new Error('Conversation not found'), { status: 404 });
      }
      return saveThread(args);
    });
    savesInFlight.set(id, save);
    try {
      return await save;
    } finally {
      if (savesInFlight.get(id) === save) savesInFlight.delete(id);
    }
  };
  // A deleted thread takes its verification records and feedback with it. The
  // daily retention sweep removes any row this misses.
  const deleteThread = memory.deleteThread.bind(memory);
  memory.deleteThread = async args => {
    await deleteThread(args);
    await onThreadDeleted?.(args.threadId).catch(err => log.warn('thread.delete_records_failed', errorFields(err)));
  };
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
  const unwrapped = guarded.filter(name => !Object.hasOwn(memory, name));
  if (unwrapped.length > 0) throw new Error(`Memory release gate did not wrap: ${unwrapped.join(', ')}`);
}

/** The failure's own message for the server log. The framework serializes the
 * whole error, including the tool's arguments, which can restate the user's
 * question; those stay out of the log. */
function toolErrorMessage(errorText: unknown): string {
  let message = String(errorText);
  try {
    const error = JSON.parse(message) as { message?: unknown; cause?: { message?: unknown }; details?: { errorMessage?: unknown } };
    message = [error.details?.errorMessage, error.cause?.message, error.message].find(value => typeof value === 'string') as string | undefined
      ?? 'Tool failed without a message';
  } catch { /* A plain-text error has no arguments attached. */ }
  return message.slice(0, 500);
}

const STREAM_ERROR_TEXT = 'The answer could not be completed. Please try again.';
const asText = (value: unknown) => typeof value === 'string' ? value : undefined;
const defined = <T extends object>(fields: T) =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as T;

/** The verifier's progress and terminal decision (status, reason and pass
 * count), without the answer text or anything else the processor wrote. */
function verificationProgress(data: unknown): VerificationProgress | null {
  if ((data as { status?: unknown } | null)?.status === 'verifying') return { status: 'verifying' };
  const outcome = VerificationOutcomeSchema.safeParse(data);
  return outcome.success ? defined(outcome.data) : null;
}

/** Every chunk the client receives is built here from named fields. A type
 * this function does not name is dropped, so text another model wrote
 * (observer notes in `data-om-*`, a classifier's abort reason, a tool's raw
 * error) and whatever a framework upgrade adds cannot ride through. Tool
 * inputs and outputs cross whole: the tool steps and the Sources panel render them. */
function rebuiltChunk(part: UIMessageChunk): UIMessageChunk | null {
  switch (part.type) {
    case 'start': return defined({ type: part.type, messageId: asText(part.messageId) });
    case 'start-step': case 'finish-step': case 'finish': case 'abort': return { type: part.type };
    case 'tool-input-start':
      return defined({ type: part.type, toolCallId: part.toolCallId, toolName: part.toolName, dynamic: part.dynamic });
    case 'tool-input-available':
      return defined({ type: part.type, toolCallId: part.toolCallId, toolName: part.toolName, input: part.input, dynamic: part.dynamic });
    case 'tool-output-available':
      return defined({ type: part.type, toolCallId: part.toolCallId, output: part.output, dynamic: part.dynamic });
    case 'tool-output-error':
      return defined({ type: part.type, toolCallId: part.toolCallId, errorText: TOOL_ERROR_TEXT, dynamic: part.dynamic });
    case 'error': return { type: part.type, errorText: STREAM_ERROR_TEXT };
    case 'data-tripwire': {
      // Application guards write `code` and `userMessage`; `reason` can quote a classifier.
      const data = (part.data ?? {}) as { processorId?: unknown; metadata?: { code?: unknown; userMessage?: unknown } };
      return { type: part.type, data: defined({ processorId: asText(data.processorId),
        metadata: defined({ code: asText(data.metadata?.code), userMessage: asText(data.metadata?.userMessage) }) }) };
    }
    default: return null;
  }
}

/** Allow-list the stream. Only the processor's terminal release supplies text. */
export function gateAnswerStream(stream: ReadableStream<UIMessageChunk>): ReadableStream<UIMessageChunk> {
  let released = false;
  let blocked = false;
  const id = crypto.randomUUID();
  return stream.pipeThrough(new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(part, controller) {
      if (part.type === 'data-tripwire') blocked = true;
      if (part.type === VERIFICATION_PART) {
        const progress = verificationProgress(part.data);
        if (!progress) return;
        controller.enqueue({ type: VERIFICATION_PART, data: progress });
        const { answer } = part.data as { answer?: unknown };
        if (progress.status !== 'verifying' && typeof answer === 'string' && !released) {
          released = true;
          controller.enqueue({ type: 'text-start', id });
          controller.enqueue({ type: 'text-delta', id, delta: answer });
          controller.enqueue({ type: 'text-end', id });
        }
        return;
      }
      // The framework writes a failed tool call's error nowhere else.
      if (part.type === 'tool-output-error') {
        log.warn('chat.tool_error', { toolCallId: part.toolCallId, error: toolErrorMessage(part.errorText) });
      }
      const rebuilt = rebuiltChunk(part);
      if (!rebuilt) return;
      if (part.type === 'finish' && !released && !blocked) {
        released = true;
        controller.enqueue({ type: VERIFICATION_PART, data: { status: 'withheld', reason: 'unavailable', passCount: 0 } });
        controller.enqueue({ type: 'text-start', id });
        controller.enqueue({ type: 'text-delta', id, delta: WITHHELD_ANSWER });
        controller.enqueue({ type: 'text-end', id });
      }
      controller.enqueue(rebuilt);
    },
  }));
}
