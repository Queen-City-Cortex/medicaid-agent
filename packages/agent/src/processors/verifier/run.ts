import { createPrivateVerificationCapture, type PrivateVerificationCapture } from './diagnostics.js';
import { getConfig } from './config.js';
import { type SourceEntry, buildSourceText, isCorpusEvidence } from './evidence.js';
import { type VerificationResult, VERIFICATION_UNAVAILABLE, verifyAnswer } from './verify.js';
import {
  type UnknownSection,
  assessRewriteSubstance,
  validateAnswerQuotes,
  validateAnswerSections,
  validateAnswerUrls,
} from './answer-validation.js';
import {
  type VerificationConfidence,
  type VerificationSeverity,
  computeVerificationConfidence,
} from './confidence.js';

import { WITHHELD_ANSWER, type VerificationOutcome } from '@nc-medicaid/contracts';
import { log } from '../../logger.js';
import { resolveCoverageScope, coverageEvidenceIssue } from '@nc-medicaid/policy-corpus';

/** Withholding reason when cited section text or a research finding did not fit the evidence budget. */
export const EVIDENCE_OVER_BUDGET = 'Cited source text or a research finding exceeded the verifier evidence budget';

/** Withholding reason when the answer cites a link or quotation and the turn retrieved no evidence. */
export const NO_EVIDENCE_FOR_CITATION = 'The answer cites a link or quotation but no evidence was retrieved';
/** Withholding reason when the turn produced no source entry at all. */
export const NO_SOURCES_RETRIEVED = 'No sources were retrieved';

/** Bounds on the `verifier.unknown_sections` log line. */
const MAX_LOGGED_LABEL_CHARS = 80;
const MAX_LOGGED_URL_CHARS = 200;
const MAX_LOGGED_LABELS = 20;

// ── Shared verification flow ────────────────────────────────────────────────

/**
 * Telemetry emitted as a single JSON line after a `---VERIFIER---` stdout
 * marker. The snake_case field names are a stable contract: the Python eval
 * harness (`packages/pipeline/src/pipeline/eval/levels/answer.py`,
 * `extract_verifier_metadata`) parses this block and downstream reports read
 * these fields by name. Do not rename them.
 */
export interface VerifierTelemetry {
  coverage_policy_id?: string | null;
  coverage_issue?: string | null;
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
  /** Characters of evidence text in the most recent model call; 0 when none was made. */
  evidence_chars_sent: number;
  /** Source entries the evidence budget left out of the last evidence text. */
  evidence_entries_dropped: number;
  /** Citation labels in the last text checked that name a numbered section
   *  the turn did not retrieve. Measured only: it decides no outcome. */
  unknown_section_count: number;
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
export async function runVerificationForAnswer({ question, coverageQuery, answerText, sources, verifierSources = sources, onUsage, signal, verify = verifyAnswer, capture = createPrivateVerificationCapture() }: {
  question: string;
  coverageQuery?: string;
  answerText: string;
  sources: SourceEntry[];
  /** Evidence text for the model call only. The coverage, URL, quotation and
   *  section-label checks always read the raw `sources`. */
  verifierSources?: SourceEntry[];
  onUsage?: (usage: unknown) => void;
  signal?: AbortSignal;
  verify?: typeof verifyAnswer;
  capture?: PrivateVerificationCapture;
}): Promise<VerificationRunResult> {
  const started = Date.now();
  capture?.({ stage: 'input', question, sources, ...(verifierSources !== sources ? { verifierSources } : {}), answerText });
  let candidate = answerText;
  let verification!: VerificationResult;
  let outcome: VerificationOutcome = { status: 'withheld', reason: 'unsupported', passCount: 0 };
  let fabricatedUrlCount = 0;
  let fabricatedQuoteCount = 0;
  const substanceLoss = false;
  let substanceRatio: number | null = null;
  let unavailable = false;
  let evidenceCharsSent = 0;
  let evidenceEntriesDropped = 0;
  let unknownSections: UnknownSection[] = [];
  const scope = resolveCoverageScope(coverageQuery ?? question);
  const scopeIssue = coverageEvidenceIssue(scope, sources);
  const hasEvidence = sources.some(isCorpusEvidence);
  for (let pass = 1; pass <= 2; pass++) {
    if (scopeIssue) {
      verification = { supported: false, relevant: true, citationsComplete: false, unsupportedClaims: [{ claim: 'Full answer', reason: scopeIssue }], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };
      outcome.reason = 'unsupported';
      break;
    }
    const urls = validateAnswerUrls(candidate, sources);
    const quotes = validateAnswerQuotes(candidate, sources);
    // Measured only (issue #269): kept out of `clean`, the withholding reason
    // and the model's findings until the unmatched rate is known.
    const sections = validateAnswerSections(candidate, sources);
    unknownSections = sections.unknownSections;
    const evidence = buildSourceText(verifierSources, candidate);
    const evidenceText = evidence.text;
    evidenceEntriesDropped = evidence.dropped.length;
    if (evidence.dropped.length) {
      log.warn('verifier.evidence_dropped', { pass, entriesDropped: evidence.dropped.length, citedBodyDropped: evidence.citedBodyDropped, findingDropped: evidence.findingDropped });
    }
    // The routing hint is on every chat turn and is not evidence. With nothing
    // else retrieved, a link or long quotation can only come from the hint or
    // the model's memory, so withhold without a model call. An answer that
    // cites nothing (an abstention, with or without an always-allowed link)
    // still goes to the model, unless the turn retrieved no text at all.
    const cites = urls.checkedUrlCount - urls.allowedUrlCount + quotes.checkedQuoteCount > 0;
    if (!hasEvidence && (cites || !sources.some(source => source.text.trim()))) {
      const uncitable = urls.unknownUrls.length + quotes.unknownQuotes.length > 0;
      verification = { supported: false, relevant: true, citationsComplete: false, unsupportedClaims: [{ claim: 'Full answer', reason: cites ? NO_EVIDENCE_FOR_CITATION : NO_SOURCES_RETRIEVED }], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };
      outcome.reason = uncitable ? 'invalid_citation' : 'unsupported';
      fabricatedUrlCount += urls.unknownUrls.length;
      fabricatedQuoteCount += quotes.unknownQuotes.length;
      capture?.({ stage: 'pass', pass, candidate, evidenceText, dropped: evidence.dropped.map(source => source.key), deterministic: { urls, quotes, sections }, verification });
      break;
    }
    if (evidence.citedBodyDropped || evidence.findingDropped) {
      // The model would be judging claims whose cited text, or a report whose
      // finding, it was never shown. Withhold instead of spending a call on a
      // blind check.
      verification = { supported: false, relevant: true, citationsComplete: false, unsupportedClaims: [{ claim: 'Full answer', reason: EVIDENCE_OVER_BUDGET }], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };
      outcome.reason = 'unsupported';
      capture?.({ stage: 'pass', pass, candidate, evidenceText, dropped: evidence.dropped.map(source => source.key), deterministic: { urls, quotes, sections }, verification });
      break;
    }
    evidenceCharsSent = evidenceText.length;
    verification = await verify(question, candidate, evidenceText, onUsage, signal,
      { unknownUrls: urls.unknownUrls, unknownQuotes: quotes.unknownQuotes,
        coverageRequirements: scope?.requirements,
        ...(sources.some(source => source.evidenceRole === 'supplementary') ? { hasSupplementaryEvidence: true } : {}),
      });
    capture?.({ stage: 'pass', pass, candidate, evidenceText, dropped: evidence.dropped.map(source => source.key), deterministic: { urls, quotes, sections }, verification });
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
    if (clean && candidate.trim()) {
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
    coverage_policy_id: scope?.policyId ?? null, coverage_issue: scopeIssue,
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
    evidence_chars_sent: evidenceCharsSent, evidence_entries_dropped: evidenceEntriesDropped,
    unknown_section_count: unknownSections.length,
  };
  if (unknownSections.length) {
    // Labels are model-written citation text; cap them so a malformed link
    // cannot carry a paragraph of the answer into the log.
    const labels = [...new Map(unknownSections.map(({ label, url }) => [`${label}\n${url}`, { label: label.slice(0, MAX_LOGGED_LABEL_CHARS), url: url.slice(0, MAX_LOGGED_URL_CHARS) }])).values()];
    log.warn('verifier.unknown_sections', { status: outcome.status, count: unknownSections.length, labels: labels.slice(0, MAX_LOGGED_LABELS) });
  }
  capture?.({ stage: 'outcome', outcome, telemetry });
  log.info('verification.release', { ...outcome, latencyMs: Date.now()-started });
  return { retryable: unavailable && verification.failureRetryable === true, finalAnswer: withheld ? WITHHELD_ANSWER : candidate, outcome, rewrote, telemetry, verification, confidence };
}
