import { getPolicyCorpusRerankerDiagnostics } from '../../policy-corpus-reranker.js';
import { getConfig } from './config.js';
import { type SourceEntry, buildSourceText } from './evidence.js';
import { type VerificationResult, VERIFICATION_UNAVAILABLE, verifyAnswer } from './verify.js';
import {
  assessRewriteSubstance,
  renderCorrectedAnswer,
  validateAnswerQuotes,
  validateAnswerUrls,
} from './answer-validation.js';
import {
  type VerificationConfidence,
  type VerificationSeverity,
  computeVerificationConfidence,
} from './confidence.js';

const VERIFICATION_DISCLAIMER =
  '\n\n---\n*Note: This answer could not be verified against source documents. Please verify critical details with [NC DHHS](https://medicaid.ncdhhs.gov/).*';

// ── Shared verification flow ────────────────────────────────────────────────

/**
 * Telemetry emitted as a single JSON line after a `---VERIFIER---` stdout
 * marker. The snake_case field names are a stable contract: the Python eval
 * harness (`packages/pipeline/src/pipeline/eval/levels/answer.py`,
 * `extract_verifier_metadata`) parses this block and downstream reports read
 * these fields by name. Do not rename them.
 */
export interface VerifierTelemetry {
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
  reranker_fallback_count: number;
  reranker_last_error: string | null;
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
  /** Answer text after applying the verifier's rewrite (the original text
   *  when no rewrite was needed or the rewrite was unusable). */
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

/**
 * Run the full hallucination-verification flow for a finished answer:
 * build the source text, verify, render the corrected answer (with the
 * pure-marker fallback guard), and compute confidence + telemetry.
 *
 * Shared by the CLI/eval runner in `index.ts` and the streaming
 * `HallucinationVerifier` processor so the two paths can't drift.
 */
export async function runVerificationForAnswer({
  question,
  answerText,
  sources,
}: {
  question: string;
  answerText: string;
  sources: SourceEntry[];
}): Promise<VerificationRunResult> {
  const sourceText = buildSourceText(sources, answerText);
  const verification = await verifyAnswer(question, answerText, sourceText);

  const hasMajorRelevanceIssue = verification.relevanceIssues?.some(
    (issue) => issue.severity === 'major',
  ) ?? false;
  const citationsComplete = verification.citationsComplete !== false;
  const rewrote = !(
    verification.supported
    && verification.relevant
    && !hasMajorRelevanceIssue
    && citationsComplete
  );
  const verifierUnavailable = verification.unsupportedClaims?.some(
    (claim) => claim.reason === VERIFICATION_UNAVAILABLE,
  ) ?? false;

  let finalAnswer = answerText;
  let pureMarkerFallback = false;
  let substanceLossFallback = false;
  let rewriteSubstanceRatio: number | null = null;
  if (rewrote) {
    // Apply the verifier's correctedAnswer directly — no retry. Retries cause
    // the agent to over-correct and hedge everything. When the verification
    // service itself was unavailable, keep the original answer but append a
    // "could not be verified" disclaimer.
    const rawCorrected = verification.correctedAnswer
      || (verifierUnavailable ? answerText + VERIFICATION_DISCLAIMER : answerText);
    // Move [missing citation: ...] markers out of sentence flow into a footer;
    // keep [unverified: ...] / [wrong source: ...] inline (hallucination
    // signal). Pass the original text as a fallback so a rewrite that is pure
    // markers (body empty after extraction) doesn't nuke the answer.
    finalAnswer = renderCorrectedAnswer(rawCorrected, answerText);
    // Detect the pure-marker fallback so confidence reflects that the rewrite
    // was unusable (same signal as the q-006 regression guard).
    pureMarkerFallback =
      (verification.correctedAnswer ?? '').trim().length > 0
      && finalAnswer.trim() === answerText.trim();
    // Substance-loss guard: a rewrite whose non-marker content is a small
    // fraction of the original replaced the answer with meta-commentary
    // (h-005 regression guard). Keep the original; confidence is clamped.
    if (!pureMarkerFallback && (verification.correctedAnswer ?? '').trim()) {
      const substance = assessRewriteSubstance(answerText, verification.correctedAnswer);
      rewriteSubstanceRatio = substance.ratio;
      if (substance.lostSubstance) {
        finalAnswer = answerText;
        substanceLossFallback = true;
      }
    }
  }

  // Deterministic guards run on the outgoing text regardless of whether the
  // LLM checks passed — a fabricated URL in an otherwise-clean answer is
  // exactly the case the LLM misses.
  const urlValidation = validateAnswerUrls(finalAnswer, sources);
  if (urlValidation.unknownUrls.length > 0) {
    finalAnswer = urlValidation.validatedAnswer;
  }
  const quoteValidation = validateAnswerQuotes(finalAnswer, sources);
  if (quoteValidation.unknownQuotes.length > 0) {
    finalAnswer = quoteValidation.validatedAnswer;
  }
  const sanitized = urlValidation.unknownUrls.length > 0 || quoteValidation.unknownQuotes.length > 0;

  const confidence = computeVerificationConfidence(verification, {
    pureMarkerFallback,
    substanceLossFallback,
    fabricatedUrlCount: urlValidation.unknownUrls.length,
    fabricatedQuoteCount: quoteValidation.unknownQuotes.length,
  });
  const rerankerDiagnostics = getPolicyCorpusRerankerDiagnostics();

  // Deterministic sanitization counts as a rewrite: the processor keys
  // message replacement off this flag, and the modified text must land.
  const rewroteFinal = rewrote || sanitized;

  const telemetry: VerifierTelemetry = {
    rewrote: rewroteFinal,
    supported: verification.supported,
    relevant: verification.relevant,
    citations_complete: citationsComplete,
    unsupported_claim_count: verification.unsupportedClaims?.length ?? 0,
    missing_citation_count: verification.missingCitationClaims?.length ?? 0,
    relevance_issue_count: verification.relevanceIssues?.length ?? 0,
    major_relevance_issue: hasMajorRelevanceIssue,
    verifier_unavailable: verifierUnavailable,
    verifier_model: getConfig().model,
    reranker_fallback_count: rerankerDiagnostics.fallbackCount,
    reranker_last_error: rerankerDiagnostics.lastError,
    source_entry_count: sources.length,
    evidence_bytes: sources.reduce((total, source) => total + source.text.length, 0),
    confidence: confidence.confidence,
    severity: confidence.severity,
    pure_marker_fallback: pureMarkerFallback,
    substance_loss_fallback: substanceLossFallback,
    rewrite_substance_ratio: rewriteSubstanceRatio,
    fabricated_url_count: urlValidation.unknownUrls.length,
    fabricated_quote_count: quoteValidation.unknownQuotes.length,
  };

  return { finalAnswer, rewrote: rewroteFinal, telemetry, verification, confidence };
}
