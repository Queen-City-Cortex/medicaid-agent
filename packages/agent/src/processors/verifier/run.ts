import { createPrivateVerificationCapture, type PrivateVerificationCapture } from './diagnostics.js';
import { getConfig } from './config.js';
import { type SourceEntry, buildSourceText } from './evidence.js';
import { type VerificationResult, VERIFICATION_UNAVAILABLE, verifyAnswer } from './verify.js';
import {
  assessRewriteSubstance,
  validateAnswerQuotes,
  validateAnswerUrls,
} from './answer-validation.js';
import {
  type VerificationConfidence,
  type VerificationSeverity,
  computeVerificationConfidence,
} from './confidence.js';

import { WITHHELD_ANSWER, type VerificationOutcome } from '@nc-medicaid/contracts';
import { log } from '../../logger.js';

// ── Shared verification flow ────────────────────────────────────────────────

/**
 * Telemetry emitted as a single JSON line after a `---VERIFIER---` stdout
 * marker. The snake_case field names are a stable contract: the Python eval
 * harness (`packages/pipeline/src/pipeline/eval/levels/answer.py`,
 * `extract_verifier_metadata`) parses this block and downstream reports read
 * these fields by name. Do not rename them.
 */
export interface VerifierTelemetry {
  latency_ms: number;
  pass_count: number;
  withholding_reason: string | null;
  outcome: VerificationOutcome;
  rewrote: boolean;
  supported: boolean;
  relevant: boolean;
  citations_complete: boolean;
  unsupported_claim_count: number;
  missing_citation_count: number;
  relevance_issue_count: number;
  major_relevance_issue: boolean;
  verifier_unavailable: boolean;
  verifier_model: string;
  source_entry_count: number;
  evidence_bytes: number;
  confidence: number;
  severity: VerificationSeverity;
  pure_marker_fallback: boolean;
  substance_loss_fallback: boolean;
  /** Non-marker substance ratio of the LLM rewrite vs the original answer;
   *  null when no LLM rewrite was produced. */
  rewrite_substance_ratio: number | null;
  fabricated_url_count: number;
  fabricated_quote_count: number;
}

export interface VerificationRunResult {
  retryable: boolean;
  outcome: VerificationOutcome;
  /** Verified outgoing text, or the fixed withholding explanation. */
  finalAnswer: string;
  /** True when any check failed and a rewrite was attempted. */
  rewrote: boolean;
  telemetry: VerifierTelemetry;
  verification: VerificationResult;
  confidence: VerificationConfidence;
}

/** Print a `---VERIFIER---` telemetry block in the format the eval harness
 *  parses (marker line, then a single JSON object line). */
export function emitVerifierTelemetry(telemetry: object): void {
  console.log('\n---VERIFIER---\n');
  console.log(JSON.stringify(telemetry));
}

/** Verify the exact outgoing text. A failed candidate is never a fallback. */
export async function runVerificationForAnswer({ question, answerText, sources, onUsage, signal, verify = verifyAnswer, capture = createPrivateVerificationCapture() }: {
  question: string;
  answerText: string;
  sources: SourceEntry[];
  onUsage?: (usage: unknown) => void;
  signal?: AbortSignal;
  verify?: typeof verifyAnswer;
  capture?: PrivateVerificationCapture;
}): Promise<VerificationRunResult> {
  const started = Date.now();
  capture?.({ stage: 'input', question, sources, answerText });
  let candidate = answerText;
  let verification!: VerificationResult;
  let outcome: VerificationOutcome = { status: 'withheld', reason: 'unsupported', passCount: 0 };
  let fabricatedUrlCount = 0;
  let fabricatedQuoteCount = 0;
  const substanceLoss = false;
  let substanceRatio: number | null = null;
  let unavailable = false;
  for (let pass = 1; pass <= 2; pass++) {
    const urls = validateAnswerUrls(candidate, sources);
    const quotes = validateAnswerQuotes(candidate, sources);
    verification = await verify(question, candidate, buildSourceText(sources, candidate), onUsage, signal,
      { unknownUrls: urls.unknownUrls, unknownQuotes: quotes.unknownQuotes,
        ...(sources.some(source => source.evidenceRole === 'supplementary') ? { hasSupplementaryEvidence: true } : {}),
      });
    capture?.({ stage: 'pass', pass, candidate, evidenceText: buildSourceText(sources, candidate), deterministic: { urls, quotes }, verification });
    outcome.passCount = pass;
    unavailable = verification.unsupportedClaims.some(c => c.reason === VERIFICATION_UNAVAILABLE);
    if (unavailable) { outcome.reason = 'unavailable'; break; }
    fabricatedUrlCount += urls.unknownUrls.length;
    fabricatedQuoteCount += quotes.unknownQuotes.length;
    const majorRelevance = verification.relevanceIssues?.some(i => i.severity === 'major')
      || (!verification.relevant && !verification.relevanceIssues?.some(i => i.severity === 'minor'));
    const clean = verification.supported && !majorRelevance && verification.citationsComplete
      && verification.unsupportedClaims.length === 0 && (verification.missingCitationClaims?.length ?? 0) === 0
      && urls.unknownUrls.length === 0 && quotes.unknownQuotes.length === 0
      && !/\[(?:unverified|wrong source|missing citation):/i.test(candidate);
    if (clean && candidate.trim() && sources.some(s => s.text.trim())) {
      outcome = { status: pass === 1 ? 'passed' : 'corrected', passCount: pass };
      break;
    }
    outcome.reason = urls.unknownUrls.length || quotes.unknownQuotes.length ? 'invalid_citation' : 'unsupported';
    if (pass === 2) break;
    const correction = verification.correctedAnswer?.trim();
    if (!correction || correction === candidate || /\[(?:unverified|wrong source|missing citation):/i.test(correction)) {
      outcome.reason = 'unusable_correction'; break;
    }
    const substance = assessRewriteSubstance(answerText, correction);
    substanceRatio = substance.ratio;
    // Removing unsupported claims may substantially shorten an answer. The
    // exact correction must pass the recheck; length alone is not grounding.
    candidate = correction;
  }
  const withheld = outcome.status === 'withheld';
  const confidence = computeVerificationConfidence(verification, {
    pureMarkerFallback: false, substanceLossFallback: substanceLoss,
    fabricatedUrlCount, fabricatedQuoteCount,
  });
  if (withheld) { confidence.confidence = 0; confidence.severity = 'low'; }
  const rewrote = outcome.status !== 'passed';
  const telemetry: VerifierTelemetry = {
    latency_ms: Date.now() - started, pass_count: outcome.passCount, withholding_reason: outcome.reason ?? null,
    outcome, rewrote, supported: !withheld && verification.supported,
    relevant: verification.relevant, citations_complete: verification.citationsComplete,
    unsupported_claim_count: verification.unsupportedClaims.length,
    missing_citation_count: verification.missingCitationClaims?.length ?? 0,
    relevance_issue_count: verification.relevanceIssues?.length ?? 0,
    major_relevance_issue: verification.relevanceIssues?.some(i => i.severity === 'major') ?? false,
    verifier_unavailable: unavailable, verifier_model: getConfig().model,
    source_entry_count: sources.length, evidence_bytes: sources.reduce((n,s) => n+s.text.length,0),
    confidence: confidence.confidence, severity: confidence.severity,
    pure_marker_fallback: false, substance_loss_fallback: substanceLoss,
    rewrite_substance_ratio: substanceRatio, fabricated_url_count: fabricatedUrlCount,
    fabricated_quote_count: fabricatedQuoteCount,
  };
  capture?.({ stage: 'outcome', outcome, telemetry });
  log.info('verification.release', { ...outcome, latencyMs: Date.now()-started });
  return { retryable: unavailable && verification.failureRetryable === true, finalAnswer: withheld ? WITHHELD_ANSWER : candidate, outcome, rewrote, telemetry, verification, confidence };
}
