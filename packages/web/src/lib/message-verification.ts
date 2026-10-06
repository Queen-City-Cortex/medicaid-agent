import { VERIFICATION_PART, type VerificationOutcome } from '@nc-medicaid/contracts';
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

type WithheldReason = NonNullable<VerificationOutcome['reason']>;

/** What a withheld turn says in place of an answer, on screen and in the export. */
export interface WithheldNotice {
  lead: string;
  detail?: string;
  /** Whether asking the same question again can produce a different result. */
  canRetry: boolean;
}

// The owner approved this wording on issue #247. It names the three contacts
// only; their numbers and links belong to the Get help block.
const NOT_GROUNDED: WithheldNotice = {
  lead: "We couldn't verify an answer to this question against NC Medicaid policy, so we haven't shown one.",
  detail: 'Try asking about one specific service, program or policy number. For a decision about your own case, contact your county DSS, the NC Medicaid Ombudsman, or Legal Aid of NC.',
  canRetry: true,
};

const WITHHELD_NOTICES: Record<WithheldReason, WithheldNotice> = {
  // The check could not run, so nothing is known about the draft.
  unavailable: { lead: "We couldn't check this answer right now. Please try again in a few minutes.", canRetry: true },
  // A draft was written and failed the check against the retrieved policy text.
  unsupported: NOT_GROUNDED,
  invalid_citation: NOT_GROUNDED,
  unusable_correction: NOT_GROUNDED,
  // A stored row from before answers were checked, or one whose signature does
  // not verify. Trying again cannot change the stored row, so no retry button.
  unverified_history: {
    lead: "This stored answer can't be shown because its verification could not be confirmed.",
    detail: 'To get a checked answer, ask the question again as a new message.',
    canRetry: false,
  },
};

/** The notice for a withheld outcome. One with no reason reads as not grounded,
 *  which claims the least: no outage, and nothing about the stored row. */
export function withheldNotice(reason: VerificationOutcome['reason']): WithheldNotice {
  return reason ? WITHHELD_NOTICES[reason] : NOT_GROUNDED;
}

export function withheldNoticeText(notice: WithheldNotice): string {
  return notice.detail ? `${notice.lead}\n\n${notice.detail}` : notice.lead;
}

/**
 * The parts of an assistant message that may be shown or exported. Answer
 * text counts only when the verifier passed or corrected it; a withheld
 * message carries the text of its notice instead (the stored text is the
 * server's fixed sentence and is not read), and any other message no text at
 * all. The screen and the Markdown export both read answers through here; the
 * screen renders a withheld turn as a notice, not as this text.
 */
export function releasedAnswer(msg: UIMessage): {
  release: ReturnType<typeof extractReleaseState>;
  parts: UIMessage['parts'];
} {
  const release = extractReleaseState(msg);
  const canShowAnswer = release?.status === 'passed' || release?.status === 'corrected';
  const parts = (msg.parts ?? []).filter(p => p.type !== 'text' || canShowAnswer);
  if (release?.status === 'withheld') parts.push({ type: 'text', text: withheldNoticeText(withheldNotice(release.reason)) });
  return { release, parts };
}
