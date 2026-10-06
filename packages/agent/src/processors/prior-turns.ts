import type { MemoryStorage } from '@mastra/core/storage';
import { contentText } from './message-utils.js';

/** Server-owned request-context key: the thread's stored earlier turns, for
 *  the coverage boundary and the scope gate only. The chat route overwrites it
 *  on every request, so a client-supplied value never reaches a gate. */
export const CHAT_PRIOR_TURNS = 'chatPriorTurns';

const PRIOR_TURNS = 8;
// One tool-calling answer can span several stored rows without text.
const PRIOR_ROWS = 24;
const PRIOR_TURN_CHARS = 2_000;

export interface PriorTurn { id: string; role: 'user' | 'assistant'; content: string }

/** The newest stored questions and answers of a thread, oldest first, as plain
 *  text. Pass the release-gated store: it returns an assistant row as verified
 *  text or the unverified-history notice, never a draft. Call only after the
 *  thread's owner has been checked. */
export async function readPriorTurns(store: Pick<MemoryStorage, 'listMessages'>, threadId: string): Promise<PriorTurn[]> {
  const { messages } = await store.listMessages({ threadId, perPage: PRIOR_ROWS, page: 0,
    orderBy: { field: 'createdAt', direction: 'DESC' } });
  return messages.reverse().flatMap((message): PriorTurn[] => {
    const text = contentText(message.content).trim();
    return (message.role === 'user' || message.role === 'assistant') && text
      ? [{ id: message.id, role: message.role, content: text.slice(0, PRIOR_TURN_CHARS) }] : [];
  }).slice(-PRIOR_TURNS);
}

/** The conversation a gate judges: the stored prior turns, then whatever in
 *  `messages` follows them. Mastra hands input processors the recalled history
 *  only in some memory modes; dropping it up to the last stored id gives every
 *  mode the same conversation without counting a turn twice. Without the key
 *  (CLI, deep research) the result is `messages` unchanged. */
export function withPriorTurns(
  requestContext: { get(key: string): unknown } | undefined,
  messages: Array<{ id?: string; role?: string; content?: unknown }>,
): Array<{ role?: string; content?: unknown }> {
  const prior = requestContext?.get(CHAT_PRIOR_TURNS);
  if (!Array.isArray(prior) || !prior.length) return messages;
  const stored = new Set((prior as PriorTurn[]).map(turn => turn.id));
  const recalled = messages.map(message => stored.has(message.id!)).lastIndexOf(true);
  return [...(prior as PriorTurn[]), ...messages.slice(recalled + 1)];
}
