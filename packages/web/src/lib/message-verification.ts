import { UNVERIFIED_HISTORY, VERIFICATION_PART, WITHHELD_ANSWER, type VerificationOutcome } from '@nc-medicaid/contracts';
export { VERIFICATION_PART };
// Owns verifier-confidence state: extracting the streamed `data-verification-*`
// parts into a per-message VerificationState.

import type { UIMessage } from 'ai';

export type VerificationSeverity = 'high' | 'medium' | 'low';

export interface VerificationState {
  outcome?: VerificationOutcome;
  severity: VerificationSeverity;
  /** 0..1 */
  confidence: number;
  /** True when the verifier rewrote the answer; false for the no-rewrite happy path. */
  rewrote: boolean;
  counts: {
    unsupported: number;
    missingCitation: number;
    relevanceMajor: number;
    relevanceMinor: number;
  };
  pureMarkerFallback: boolean;
}

export const REWRITE_PART_TYPE = 'data-verification-rewrite';
export const OK_PART_TYPE = 'data-verification-ok';

function coerceCounts(raw: unknown): VerificationState['counts'] {
  const counts = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    unsupported: n(counts.unsupported),
    missingCitation: n(counts.missingCitation),
    relevanceMajor: n(counts.relevanceMajor),
    relevanceMinor: n(counts.relevanceMinor),
  };
}

/**
 * Pull the verifier's per-message confidence state out of the streamed
 * `data-verification-*` events the agent emits. Returns null when the verifier
 * didn't run (e.g., VERIFIER_ENABLED=false, empty text).
 *
 * Prefers a `data-verification-rewrite` part over a `data-verification-ok`
 * part — both should never appear together, but if they do, rewrite wins
 * because it means the verifier found something worth surfacing.
 */
export function extractVerificationState(msg: UIMessage): VerificationState | null {
  const parts = (msg.parts ?? []) as Array<{ type?: string; data?: Record<string, unknown> }>;
  let ok: VerificationState | null = null;
  for (const part of parts) {
    const data = part.data ?? {};
    const severity = data.severity;
    const confidence = typeof data.confidence === 'number' ? data.confidence : NaN;
    if (!Number.isFinite(confidence) || (severity !== 'high' && severity !== 'medium' && severity !== 'low')) {
      continue;
    }
    if (part.type === VERIFICATION_PART && ['passed', 'corrected', 'withheld'].includes(String(data.status))) {
      return { outcome: data as unknown as VerificationOutcome, severity, confidence,
        rewrote: data.status === 'corrected', counts: coerceCounts(data.counts), pureMarkerFallback: false };
    }
    if (part.type === REWRITE_PART_TYPE) {
      return {
        severity,
        confidence,
        rewrote: true,
        counts: coerceCounts(data.counts),
        pureMarkerFallback: !!data.pureMarkerFallback,
      };
    }
    if (part.type === OK_PART_TYPE) {
      ok = {
        severity,
        confidence,
        rewrote: false,
        counts: coerceCounts(data.counts),
        pureMarkerFallback: false,
      };
    }
  }
  return ok;
}

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
