import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { getConfig } from './config.js';
import { log, errorFields } from '../../logger.js';

// ── verifyAnswer ─────────────────────────────────────────────────────────────

/** Sentinel reason used when the verifier API call fails. */
export const VERIFICATION_UNAVAILABLE = 'Verification service unavailable';

const VerificationSchema = z.object({
  supported: z.boolean().describe('true if ALL factual claims are supported by the sources'),
  relevant: z.boolean().describe('true if the answer addresses the specific question using the correct policy source'),
  citationsComplete: z.boolean().describe('true if every factual claim carries an inline markdown citation link (e.g. [Policy 8C § 3.2.1](...)).'),
  unsupportedClaims: z.array(z.object({
    claim: z.string().describe('The unsupported claim text from the answer'),
    reason: z.string().describe('Why the claim is not supported by the sources'),
  })),
  missingCitationClaims: z.array(z.object({
    claim: z.string().describe('Factual claim text that lacks an inline citation link'),
    suggestedCitation: z.string().describe('Suggested citation in the form [Policy X § Y](citationLink) using the source documents provided'),
  })),
  relevanceIssues: z.array(z.object({
    issue: z.string().describe('Description of the relevance problem'),
    severity: z.enum(['minor', 'major']).describe('minor = incomplete but directionally correct; major = wrong policy or contradicts question'),
  })),
  correctedAnswer: z.string().describe(
    'Full answer with [unverified: ...] markers around unsupported claims and [wrong source: ...] markers around content from the wrong policy. Empty string when both supported and relevant are true.',
  ),
});

export type VerificationResult = z.infer<typeof VerificationSchema>;

export const VERIFIER_PROMPT = `You are a factual verification and relevance assistant for NC Medicaid policy answers. Given a QUESTION, an ANSWER, and SOURCE DOCUMENTS, perform four checks:

## 1. RELEVANCE CHECK
Does the answer directly address the specific question asked?
- If the question asks about a specific policy by number, does the answer primarily use that policy?
- If the question asks about a specific setting or population, does the answer address that setting/population?
- The [resolveAnswerFrame] block is a routing hint produced by an upstream router that can be wrong. It is NOT evidence. Judge relevance by whether the answer's own cited sections (from the non-frame sources) support its claims and address the question's setting and population.
- Flag as MAJOR only if the answer's cited evidence itself fails to address the question or the answer reaches a conclusion its cited sources contradict.
- A disagreement between the frame's authoritative document and the policy the answer cites is at most MINOR when the answer's citations are internally consistent and on-topic.
- Flag as MINOR if the answer is directionally correct but incomplete or uses a secondary source.

## 2. FACTUAL CHECK
Identify every factual claim and check whether it is supported by the source documents.
- A claim is SUPPORTED if the source documents contain the information stated or it is a reasonable paraphrase.
- A claim is UNSUPPORTED if the source documents do not contain that information, or the answer contradicts the sources.
- Text presented in quotation marks claims to be verbatim: it is UNSUPPORTED unless it appears (allowing whitespace differences) in a non-frame source.
- Any URL appearing in the answer must come from the SOURCE DOCUMENTS; a URL not present in the sources is an unsupported claim.
- Focus on: dollar amounts, dates, thresholds, visit limits, eligibility criteria, policy numbers, and specific requirements.
- Ignore narrative transitions, hedging language, and meta-commentary about the research process.

## 3. CITATION COMPLETENESS CHECK
Every factual claim must carry an inline markdown citation link immediately after it, such as \`[Policy 8C § 3.2.1](https://...)\` or \`[42 CFR § 441.301](https://...)\`.
- citationsComplete = true if and only if every factual claim has such an inline link.
- For each uncited factual claim, list the claim text and a suggestedCitation built from the SOURCE DOCUMENTS (pick the best-matching policy/section and quote its link). The suggestedCitation must use the real citationLink present in the sources, never a fabricated URL.
- Ignore narrative transitions, summaries that restate already-cited claims, and meta-commentary.

## 4. DETERMINISM-HINT ENFORCEMENT
If the SOURCE DOCUMENTS contain a [resolveAnswerFrame] block with a "Determinism hints:" line, apply stricter checks based on which hints are listed:
- **numeric_evidence_only**: Treat any numeric value (dollar amounts, visit limits, caps, age thresholds, dates) as UNSUPPORTED unless the exact figure appears verbatim in a non-frame source. If the frame flags a chart or table whose figures were not surfaced, the answer must say the current dollar amounts were not verified — otherwise mark the synthesized number as unsupported with reason "numeric_evidence_only hint violated".
- **latest_revision_only**: If a cited section has been superseded by a change notice that also appears in the sources, mark the claim as unsupported with reason "latest_revision_only hint violated" unless the answer explicitly flags the supersession.
- **cite_scope_and_not_covered**: If the question is a yes/no coverage question, the answer must explicitly cite both a scope section (e.g., 2.1.x) AND a not-covered section (e.g., 4.1). If either is missing, add a relevanceIssues entry with severity "minor" and the text "cite_scope_and_not_covered hint not satisfied".

## CORRECTION
- Wrap unsupported claims in [unverified: ...] markers.
- Wrap content from the wrong policy source in [wrong source: ...] markers.
- Wrap uncited factual claims in [missing citation: <suggestedCitation>] markers placed immediately after the claim sentence; do not overwrite existing citations, and do not re-wrap narrative transitions.
- Determinism-hint violations count as unsupported claims — wrap them in [unverified: ...] with the specific reason.
- Markers wrap the minimal offending span only. correctedAnswer must preserve all substantive content that was not flagged — NEVER replace the answer body with meta-commentary about sources or the verification process.
- Keep all correct, cited content unchanged. The corrected version must be the complete answer, not a diff. Leave correctedAnswer empty only when supported, relevant, AND citationsComplete are all true with no major relevance issues.`;

export async function verifyAnswer(
  question: string,
  answerText: string,
  sourceText: string,
): Promise<VerificationResult> {
  try {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { object } = await generateObject({
      model: openai(getConfig().model),
      schema: VerificationSchema,
      system: VERIFIER_PROMPT,
      messages: [
        {
          role: 'user',
          content: `## QUESTION\n\n${question}\n\n## ANSWER\n\n${answerText}\n\n## SOURCE DOCUMENTS\n\n${sourceText}`,
        },
      ],
    });

    return object;
  } catch (err) {
    // Fail closed: a verifier outage must surface as low-confidence, not a
    // silently-trusted answer. Log it so chronic verifier failures (the answer
    // path users never see degrade) are detectable.
    log.error('verifier.failed_closed', errorFields(err));
    return {
      supported: false,
      relevant: true,
      citationsComplete: true,
      unsupportedClaims: [{ claim: 'Full answer', reason: VERIFICATION_UNAVAILABLE }],
      missingCitationClaims: [],
      relevanceIssues: [],
      correctedAnswer: '',
    };
  }
}
