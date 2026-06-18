import type { VerificationResult } from './verify.js';

// ── Confidence scoring ──────────────────────────────────────────────────────

export type VerificationSeverity = 'high' | 'medium' | 'low';

export interface VerificationConfidence {
  /** 0..1, where 1 = no issues detected. */
  confidence: number;
  severity: VerificationSeverity;
  counts: {
    unsupported: number;
    missingCitation: number;
    relevanceMajor: number;
    relevanceMinor: number;
    fabricatedUrl: number;
    fabricatedQuote: number;
  };
  /**
   * True when the verifier produced a rewrite that was entirely `[missing
   * citation: ...]` markers and we fell back to the original text. This is a
   * degraded state even if the verifier's per-check flags look clean — the
   * rewrite was unusable — so we clamp to `low`.
   */
  pureMarkerFallback: boolean;
  /**
   * True when the rewrite stripped most of the original answer's substance
   * (meta-commentary takeover) and we fell back to the original text. Same
   * clamp as pureMarkerFallback.
   */
  substanceLossFallback: boolean;
}

/**
 * Derive a single 0..1 confidence score from the verifier's check outputs.
 * Higher = fewer/softer issues. Deductions are additive rather than
 * normalized per-claim so that multiple unsupported claims compound: the
 * user signal we want is "how bad", not "what kind."
 */
export function computeVerificationConfidence(
  verification: VerificationResult,
  options: {
    pureMarkerFallback?: boolean;
    substanceLossFallback?: boolean;
    fabricatedUrlCount?: number;
    fabricatedQuoteCount?: number;
  } = {},
): VerificationConfidence {
  const unsupported = verification.unsupportedClaims?.length ?? 0;
  const missingCitation = verification.missingCitationClaims?.length ?? 0;
  const issues = verification.relevanceIssues ?? [];
  const relevanceMajor = issues.filter((i) => i.severity === 'major').length;
  const relevanceMinor = issues.filter((i) => i.severity === 'minor').length;
  const fabricatedUrl = options.fabricatedUrlCount ?? 0;
  const fabricatedQuote = options.fabricatedQuoteCount ?? 0;

  const deduction =
    0.30 * unsupported
    + 0.15 * missingCitation
    + 0.35 * relevanceMajor
    + 0.10 * relevanceMinor
    + 0.25 * fabricatedUrl
    + 0.20 * fabricatedQuote;
  let confidence = Math.max(0, Math.min(1, 1 - deduction));

  const pureMarkerFallback = !!options.pureMarkerFallback;
  const substanceLossFallback = !!options.substanceLossFallback;
  if (pureMarkerFallback || substanceLossFallback) {
    // Clamp: a rewrite that was unusable should never read `high` no matter
    // how clean the individual check flags looked.
    confidence = Math.min(confidence, 0.55);
  }

  let severity: VerificationSeverity;
  if (confidence >= 0.85) severity = 'high';
  else if (confidence >= 0.60) severity = 'medium';
  else severity = 'low';

  return {
    confidence,
    severity,
    counts: { unsupported, missingCitation, relevanceMajor, relevanceMinor, fabricatedUrl, fabricatedQuote },
    pureMarkerFallback,
    substanceLossFallback,
  };
}
