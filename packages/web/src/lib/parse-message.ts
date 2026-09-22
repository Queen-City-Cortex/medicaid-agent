import { VERIFICATION_PART, UNVERIFIED_HISTORY } from '@nc-medicaid/contracts';
import type { UIMessage } from 'ai';
import { OK_PART_TYPE, REWRITE_PART_TYPE } from './message-parts';
import { generateUUID } from './utils';

/**
 * Convert V4 message parts (tool-invocation) to V5 format (dynamic-tool)
 * that the chat timeline renderer expects.
 */
function convertV4PartsToV5(v4Parts: Array<Record<string, unknown>>): UIMessage['parts'] {
  const result: Array<Record<string, unknown>> = [];
  for (const part of v4Parts) {
    const type = part.type as string;
    if (type === 'text' && typeof part.text === 'string') {
      result.push({ type: 'text', text: part.text });
    } else if (type === 'tool-invocation' && part.toolInvocation) {
      const inv = part.toolInvocation as {
        toolCallId: string; toolName: string;
        args?: unknown; result?: unknown; state: string;
      };
      result.push({
        type: 'dynamic-tool',
        toolName: inv.toolName,
        toolCallId: inv.toolCallId,
        state: inv.state === 'result' ? 'output-available' : 'input-available',
        input: inv.args,
        output: inv.state === 'result' ? inv.result : undefined,
      });
    } else if (type === REWRITE_PART_TYPE || type === OK_PART_TYPE || type === VERIFICATION_PART) {
      // Preserve the verifier's confidence state so the trust badge restores
      // on reload (extractVerificationState reads these parts). Other data-*
      // parts — notably observational-memory `data-om-*` — stay dropped as
      // internal noise.
      result.push({ type, data: part.data });
    } else if (type === 'step-start') {
      result.push({ type: 'step-start' });
    }
  }
  return result as UIMessage['parts'];
}

/** Metadata carried on restored thread messages. Streaming messages have none. */
export interface ThreadMessageMetadata {
  /** ISO timestamp of when the message was persisted to memory. */
  createdAt?: string;
}

export function getMessageCreatedAt(msg: UIMessage): string | null {
  const metadata = msg.metadata as ThreadMessageMetadata | undefined;
  return metadata?.createdAt ?? null;
}

export interface RawThreadMessage {
  id?: string;
  role: string;
  content: unknown;
  createdAt?: string | Date;
}

/** Memory timestamps answer "when was this generated?" on restored threads.
 *  Invalid/absent dates yield no metadata rather than a bogus timestamp. */
function createdAtMetadata(createdAt?: string | Date): ThreadMessageMetadata | undefined {
  const d = createdAt ? new Date(createdAt) : null;
  return d && !Number.isNaN(d.getTime()) ? { createdAt: d.toISOString() } : undefined;
}

function resolveMessageId(id?: string): string {
  if (id) return id;
  const fallback = generateUUID();
  console.warn(`[feedback] Message missing ID, generated fallback: ${fallback}. Feedback for this message won't survive reload.`);
  return fallback;
}

/** Raw V2 parts for a message; a single synthesized text part for legacy
 *  string/array/`{parts}` content. */
function getRawParts(content: unknown): Array<Record<string, unknown>> {
  if (content && typeof content === 'object' && !Array.isArray(content) &&
      'format' in content && 'parts' in content) {
    const v2 = content as { format: number; parts: Array<Record<string, unknown>> };
    if (v2.format === 2 && Array.isArray(v2.parts)) return v2.parts;
  }
  const text = extractText(content);
  return text.trim() ? [{ type: 'text', text: text.trim() }] : [];
}

export function convertThreadMessageToUIMessage(msg: RawThreadMessage): UIMessage | null {
  const role = msg.role;
  if (role !== 'user' && role !== 'assistant') return null;
  const parts = convertV4PartsToV5(safeRawParts(msg));
  if (parts.length === 0) return null;
  return { id: resolveMessageId(msg.id), role, parts, metadata: createdAtMetadata(msg.createdAt) };
}

/**
 * Rebuild a thread's UI messages from persisted memory.
 *
 * Mastra persists a single agent turn as SEVERAL assistant messages — the
 * final answer text + verifier state in one, tool calls in others, and
 * observational-memory bookkeeping (`data-om-*`) scattered throughout, often
 * with the answer message timestamped *before* the tool messages. Rendered
 * naively (one UIMessage per persisted message) a reloaded thread shows orphan
 * tool-only cards (each firing the "finished without a final answer" notice),
 * an answer detached from its sources/footnotes, and no verification badge.
 *
 * Coalesce each assistant turn (the run of assistant messages following a user
 * message) into ONE assistant UIMessage, deterministically ordered
 * tools → answer text → verification so the live-stream rendering contract
 * holds (collapsible Research trail, inline citation footnotes, trust badge).
 * `data-om-*` and other internal parts are dropped.
 */
export function coalesceThreadMessages(rawMessages: RawThreadMessage[]): UIMessage[] {
  const out: UIMessage[] = [];
  let turn: RawThreadMessage[] = [];

  const flush = () => {
    if (turn.length === 0) return;
    const merged = mergeAssistantTurn(turn);
    if (merged) out.push(merged);
    turn = [];
  };

  for (const msg of rawMessages) {
    if (msg.role === 'assistant') {
      turn.push(msg);
      continue;
    }
    flush(); // a non-assistant message ends the current assistant turn
    if (msg.role === 'user') {
      const u = convertThreadMessageToUIMessage(msg);
      if (u) out.push(u);
    }
  }
  flush();
  return out;
}

function mergeAssistantTurn(turn: RawThreadMessage[]): UIMessage | null {
  const tools: Array<Record<string, unknown>> = [];
  const texts: Array<Record<string, unknown>> = [];
  const verifications: Array<Record<string, unknown>> = [];
  let anchor: RawThreadMessage | null = null; // the answer-text-bearing message

  for (const msg of turn) {
    for (const part of safeRawParts(msg)) {
      const type = part.type as string;
      if (type === 'tool-invocation') {
        tools.push(part);
      } else if (type === 'text' && typeof part.text === 'string' && part.text.trim()) {
        texts.push(part);
        anchor = msg;
      } else if (type === REWRITE_PART_TYPE || type === OK_PART_TYPE || type === VERIFICATION_PART) {
        verifications.push(part);
      }
      // Drop data-om-*, step-start, and anything else — internal/structural
      // noise, not user-facing. Step boundaries are meaningless once a turn's
      // messages are merged (and MessageList ignores step-start anyway), so
      // excluding them avoids a stray step-start leading the merged tool run.
    }
  }

  const parts = convertV4PartsToV5([...tools, ...texts, ...verifications]);
  if (parts.length === 0) return null;

  // Anchor id + timestamp on the answer-bearing message (what feedback and the
  // "Generated {date}" line refer to); fall back to the turn's last message.
  const idSource = anchor ?? turn[turn.length - 1];
  return {
    id: resolveMessageId(idSource.id),
    role: 'assistant',
    parts,
    metadata: createdAtMetadata(idSource.createdAt),
  };
}

export function extractText(content: unknown): string {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part)
          return (part as { text: string }).text;
        return '';
      })
      .join('\n\n');
  }

  if (content && typeof content === 'object' && 'parts' in content) {
    const parts = (content as { parts: Array<{ type: string; text?: string }> }).parts;
    return parts
      .filter(p => p.type === 'text' && p.text)
      .map(p => p.text!)
      .join('\n\n');
  }

  return '';
}

function safeRawParts(msg: RawThreadMessage): Array<Record<string, unknown>> {
  const parts = getRawParts(msg.content);
  if (msg.role !== 'assistant' || parts.some(p => p.type === VERIFICATION_PART)) return parts;
  if (!parts.some(p => p.type === 'text')) return parts;
  return [...parts.filter(p => p.type !== 'text' && p.type !== 'reasoning'),
    { type: 'text', text: UNVERIFIED_HISTORY },
    { type: VERIFICATION_PART, data: { status: 'withheld', reason: 'unverified_history', passCount: 0 } }];
}
