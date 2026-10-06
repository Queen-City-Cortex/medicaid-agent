import { UNVERIFIED_HISTORY, VERIFICATION_PART, WITHHELD_ANSWER, type VerificationOutcome } from '@nc-medicaid/contracts';
export { VERIFICATION_PART };
// Owns the release outcome: reading the `data-verification-status` part the
// server writes for each answer.

import type { UIMessage } from 'ai';

export function extractReleaseState(msg: UIMessage): VerificationOutcome | { status: 'verifying' } | null {
  const parts = msg.parts as Array<{ type: string; data?: VerificationOutcome | { status: 'verifying' } }>;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === VERIFICATION_PART) return parts[i].data ?? null;
  }
  return null;
}

/**
 * The parts of an assistant message that may be shown or exported. Answer
 * text counts only when the verifier passed or corrected it; a withheld
 * message carries its notice instead, and any other message no text at all.
 * The screen and the Markdown export both read answers through here.
 */
export function releasedAnswer(msg: UIMessage): {
  release: ReturnType<typeof extractReleaseState>;
  parts: UIMessage['parts'];
} {
  const release = extractReleaseState(msg);
  const canShowAnswer = release?.status === 'passed' || release?.status === 'corrected';
  const parts = (msg.parts ?? []).filter(p => p.type !== 'text' || canShowAnswer);
  if (release?.status === 'withheld') parts.push({ type: 'text', text: release.reason === 'unverified_history' ? UNVERIFIED_HISTORY : WITHHELD_ANSWER });
  return { release, parts };
}
