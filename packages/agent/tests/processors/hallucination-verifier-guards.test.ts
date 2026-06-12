import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VERIFIER_PROMPT,
  assessRewriteSubstance,
  normalizeUrl,
  validateAnswerUrls,
  validateAnswerQuotes,
  computeVerificationConfidence,
  runVerificationForAnswer,
  type SourceEntry,
  type VerificationResult,
} from '../../src/processors/hallucination-verifier.js';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));
import { generateObject } from 'ai';

function makeVerification(overrides: Partial<VerificationResult> = {}): VerificationResult {
  return {
    supported: true,
    relevant: true,
    citationsComplete: true,
    unsupportedClaims: [],
    missingCitationClaims: [],
    relevanceIssues: [],
    correctedAnswer: '',
    ...overrides,
  };
}

function makeSource(overrides: Partial<SourceEntry> = {}): SourceEntry {
  return {
    toolName: 'searchSections',
    key: 'sec:doc:clinical_policy:3L-1:3.2.1',
    text: '[searchSections]\nSection 3.2.1 content about congregate PCS criteria.',
    link: 'https://medicaid.ncdhhs.gov/3l-1-pcs',
    ...overrides,
  };
}

// The exact URL the agent fabricated in the 2026-06-12 held-out eval (h-043).
const FABRICATED_URL =
  'https://medicaid.ncdhhs.gov/8c-outpatient-behavioral-health-services-provided-direct-enrolled-providers/download?attachment';

describe('VERIFIER_PROMPT content', () => {
  it('does not name real policy pairs as wrong-source examples', () => {
    // "3L-1 instead of 3L" primed the model to flag correct 3L-1 answers as
    // wrong-source (h-005 regression).
    expect(VERIFIER_PROMPT).not.toMatch(/3L-1|MA-3540|CCP 10A/);
  });

  it('instructs that the answer frame is a routing hint, not ground truth', () => {
    expect(VERIFIER_PROMPT).toContain('routing hint');
    expect(VERIFIER_PROMPT).toContain('NOT evidence');
    expect(VERIFIER_PROMPT).toMatch(/at most MINOR/);
  });

  it('forbids replacing the answer body with meta-commentary', () => {
    expect(VERIFIER_PROMPT).toMatch(/NEVER replace the answer body with meta-commentary/);
  });
});

describe('normalizeUrl', () => {
  it('treats host case and trailing slash as equivalent', () => {
    expect(normalizeUrl('HTTPS://Medicaid.NCDHHS.gov/8c/')).toBe(normalizeUrl('https://medicaid.ncdhhs.gov/8c'));
  });

  it('keeps query strings significant', () => {
    expect(normalizeUrl('https://x.gov/download?attachment')).not.toBe(normalizeUrl('https://x.gov/download'));
  });

  it('drops fragments', () => {
    expect(normalizeUrl('https://x.gov/page#section-3')).toBe(normalizeUrl('https://x.gov/page'));
  });
});

describe('validateAnswerUrls', () => {
  it('passes through answers whose markdown URLs all match source links', () => {
    const answer = 'PCS is covered [Policy 3L-1 § 3.2.1](https://medicaid.ncdhhs.gov/3l-1-pcs).';
    const result = validateAnswerUrls(answer, [makeSource()]);
    expect(result.validatedAnswer).toBe(answer);
    expect(result.unknownUrls).toEqual([]);
    expect(result.checkedUrlCount).toBe(1);
  });

  it('demotes a fabricated link to plain text and reports it', () => {
    const answer = `The change notice is at [Policy 8C change notice](${FABRICATED_URL}).`;
    const result = validateAnswerUrls(answer, [makeSource()]);
    expect(result.unknownUrls).toEqual([FABRICATED_URL]);
    expect(result.validatedAnswer).toBe('The change notice is at Policy 8C change notice.');
    expect(result.validatedAnswer).not.toContain('](http');
  });

  it('accepts URLs present only in a source entry text', () => {
    const source = makeSource({
      link: null,
      text: '[getDocument]\nURL: https://medicaid.ncdhhs.gov/8c-policy-page\nContent: ...',
    });
    const answer = 'See [Policy 8C](https://medicaid.ncdhhs.gov/8c-policy-page).';
    const result = validateAnswerUrls(answer, [source]);
    expect(result.unknownUrls).toEqual([]);
    expect(result.validatedAnswer).toBe(answer);
  });

  it('matches after normalization (trailing slash and host case)', () => {
    const source = makeSource({ link: 'https://MEDICAID.ncdhhs.gov/3l-1-pcs/' });
    const answer = 'Covered [3L-1](https://medicaid.ncdhhs.gov/3l-1-pcs).';
    expect(validateAnswerUrls(answer, [source]).unknownUrls).toEqual([]);
  });

  it('allows the NC DHHS portal root used by the verification disclaimer', () => {
    const answer = 'Verify with [NC DHHS](https://medicaid.ncdhhs.gov/).';
    expect(validateAnswerUrls(answer, []).unknownUrls).toEqual([]);
  });

  it('does not touch verifier markers or non-link brackets', () => {
    const answer = '[unverified: claim about limits] and [missing citation: [X § 1](https://medicaid.ncdhhs.gov/3l-1-pcs)]';
    const result = validateAnswerUrls(answer, [makeSource()]);
    expect(result.validatedAnswer).toBe(answer);
    expect(result.unknownUrls).toEqual([]);
  });
});

describe('validateAnswerQuotes', () => {
  const source = makeSource({
    text: '[getSection]\nContent: Therapeutic leave is limited to sixty days per calendar year for nursing facility residents under this subsection.',
  });

  it('flags a long quote absent from sources', () => {
    const answer = 'The notice says "this change was subsequently carried over to the CAP/DA services manual revision" exactly.';
    const result = validateAnswerQuotes(answer, [source]);
    expect(result.unknownQuotes).toHaveLength(1);
    expect(result.validatedAnswer).toContain('[unverified quote — not found in retrieved sources]');
  });

  it('accepts a quote present modulo whitespace and curly quotes', () => {
    const answer = 'Per the policy, “Therapeutic leave is limited to sixty days per calendar year for nursing facility residents” applies.';
    const result = validateAnswerQuotes(answer, [source]);
    expect(result.unknownQuotes).toEqual([]);
    expect(result.validatedAnswer).toBe(answer);
  });

  it('ignores short quoted phrases', () => {
    const answer = 'The section labels this "not covered" explicitly.';
    const result = validateAnswerQuotes(answer, [source]);
    expect(result.checkedQuoteCount).toBe(0);
    expect(result.validatedAnswer).toBe(answer);
  });
});

describe('assessRewriteSubstance', () => {
  const original =
    'Yes. NC Medicaid covers Personal Care Services in adult care homes under Policy 3L-1. ' +
    'Section 3.2.1 requires the beneficiary to meet functional eligibility criteria, and section 3.3 ' +
    'sets the assessment process. Room and board remain excluded.';

  it('flags a rewrite that is entirely wrong-source/unverified meta-commentary', () => {
    // Replica of the h-005 failure: the whole answer became two markers.
    const corrected =
      '[wrong source: I am not able to verify this answer from the preferred source for this question. ' +
      'The authoritative document indicated in the source frame is Policy 3K-2 (CAP/DA), not Policy 3L-1.] ' +
      '[unverified: The eligibility rules, covered services, and exclusions are drawn from Policy 3L-1 ' +
      'rather than the authoritative source indicated for this question.]';
    const check = assessRewriteSubstance(original, corrected);
    expect(check.ratio).toBeLessThan(0.05);
    expect(check.lostSubstance).toBe(true);
  });

  it('does not flag a normal rewrite that wraps a single claim', () => {
    const corrected = original.replace(
      'Room and board remain excluded.',
      '[unverified: Room and board remain excluded.]',
    );
    const check = assessRewriteSubstance(original, corrected);
    expect(check.ratio).toBeGreaterThan(0.8);
    expect(check.lostSubstance).toBe(false);
  });
});

describe('computeVerificationConfidence guard options', () => {
  it('clamps to low when substanceLossFallback is true with clean counts', () => {
    const result = computeVerificationConfidence(makeVerification(), { substanceLossFallback: true });
    expect(result.confidence).toBeLessThanOrEqual(0.55);
    expect(result.severity).toBe('low');
    expect(result.substanceLossFallback).toBe(true);
  });

  it('deducts per fabricated URL and quote', () => {
    const result = computeVerificationConfidence(makeVerification(), {
      fabricatedUrlCount: 1,
      fabricatedQuoteCount: 1,
    });
    expect(result.confidence).toBeCloseTo(0.55, 5);
    expect(result.counts.fabricatedUrl).toBe(1);
    expect(result.counts.fabricatedQuote).toBe(1);
  });
});

describe('runVerificationForAnswer guards', () => {
  beforeEach(() => {
    vi.mocked(generateObject).mockReset();
  });

  const original =
    'Yes. NC Medicaid covers Personal Care Services in adult care homes under ' +
    '[Policy 3L-1 § 3.2.1](https://medicaid.ncdhhs.gov/3l-1-pcs). The beneficiary must meet functional ' +
    'eligibility criteria, and section 3.3 sets the assessment process.';

  it('falls back to the original answer when the rewrite loses its substance', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: makeVerification({
        supported: false,
        relevant: false,
        unsupportedClaims: [{ claim: 'all of it', reason: 'wrong source' }],
        relevanceIssues: [{ issue: 'frame says 3K-2', severity: 'major' }],
        correctedAnswer:
          '[wrong source: Unable to verify from the preferred source; the frame indicates a different policy.] ' +
          '[unverified: The answer is drawn from a non-authoritative policy.]',
      }),
    } as any);

    const result = await runVerificationForAnswer({
      question: 'Can my mother get PCS in an adult care home?',
      answerText: original,
      sources: [makeSource()],
    });

    expect(result.finalAnswer).toBe(original);
    expect(result.telemetry.substance_loss_fallback).toBe(true);
    expect(result.telemetry.rewrite_substance_ratio).not.toBeNull();
    expect(result.telemetry.confidence).toBeLessThanOrEqual(0.55);
    expect(result.telemetry.severity).toBe('low');
  });

  it('strips fabricated URLs even when all LLM checks pass', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({ object: makeVerification() } as any);

    const answer = `${original} The notice is at [Change notice](${FABRICATED_URL}).`;
    const result = await runVerificationForAnswer({
      question: 'q?',
      answerText: answer,
      sources: [makeSource()],
    });

    expect(result.rewrote).toBe(true);
    expect(result.finalAnswer).not.toContain(FABRICATED_URL);
    expect(result.finalAnswer).toContain('Change notice');
    expect(result.telemetry.fabricated_url_count).toBe(1);
    expect(result.telemetry.confidence).toBeLessThan(1);
  });

  it('marks a fabricated quote even when all LLM checks pass', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({ object: makeVerification() } as any);

    const answer = `${original} The notice states "this revision was subsequently carried over into the service manual for the next plan year".`;
    const result = await runVerificationForAnswer({
      question: 'q?',
      answerText: answer,
      sources: [makeSource()],
    });

    expect(result.rewrote).toBe(true);
    expect(result.finalAnswer).toContain('[unverified quote — not found in retrieved sources]');
    expect(result.telemetry.fabricated_quote_count).toBe(1);
  });

  it('keeps the happy path byte-identical with the full telemetry contract', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({ object: makeVerification() } as any);

    const result = await runVerificationForAnswer({
      question: 'q?',
      answerText: original,
      sources: [makeSource()],
    });

    expect(result.rewrote).toBe(false);
    expect(result.finalAnswer).toBe(original);
    expect(result.telemetry.fabricated_url_count).toBe(0);
    expect(result.telemetry.fabricated_quote_count).toBe(0);
    expect(result.telemetry.substance_loss_fallback).toBe(false);
    expect(result.telemetry.confidence).toBe(1);
    // The eval harness reads these by name — the do-not-rename contract.
    for (const field of [
      'rewrote', 'supported', 'relevant', 'citations_complete', 'unsupported_claim_count',
      'missing_citation_count', 'relevance_issue_count', 'major_relevance_issue',
      'verifier_unavailable', 'verifier_model', 'reranker_fallback_count', 'reranker_last_error',
      'source_entry_count', 'evidence_bytes', 'confidence', 'severity', 'pure_marker_fallback',
    ]) {
      expect(result.telemetry).toHaveProperty(field);
    }
  });
});
