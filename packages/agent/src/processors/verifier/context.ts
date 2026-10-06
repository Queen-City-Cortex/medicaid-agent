import { CHAT_PRIOR_TURNS, type PriorTurn } from '../prior-turns.js';

/** Authenticated server request context; client execution options are ignored. */
export const CHAT_DIAGNOSTIC_CONTEXT = 'chatDiagnostic';
export const CHAT_VERIFICATION_QUESTION = 'chatVerificationQuestion';

/** Bounds on the earlier user turns the verifier is shown: 900 characters of
 *  user text at most. They are not part of the evidence text, so they take
 *  nothing from the evidence budget. */
export const VERIFIER_CONTEXT_TURNS = 3;
export const VERIFIER_CONTEXT_TURN_CHARS = 300;

/**
 * The user's own earlier messages in this thread, oldest first, for the
 * verifier's relevance check only. They come from the stored thread the chat
 * route read for the verified owner, never from the request. Stored answers
 * are left out: an earlier answer is not evidence for this one. Empty without
 * the key (CLI, deep research).
 */
export function earlierUserTurns(requestContext: { get(key: string): unknown } | undefined): string[] {
  const prior = requestContext?.get(CHAT_PRIOR_TURNS);
  if (!Array.isArray(prior)) return [];
  return (prior as PriorTurn[])
    .filter(turn => turn?.role === 'user' && typeof turn.content === 'string' && turn.content.trim())
    .slice(-VERIFIER_CONTEXT_TURNS)
    .map(turn => turn.content.trim().slice(0, VERIFIER_CONTEXT_TURN_CHARS));
}
