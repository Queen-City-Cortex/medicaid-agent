import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import type { Processor, ProcessOutputStepArgs } from '@mastra/core/processors';
import type { MastraDBMessage } from '@mastra/core/memory';
import { getPolicyCorpusRerankerDiagnostics } from '../policy-corpus-reranker.js';

// ── Config ───────────────────────────────────────────────────────────────────

function getConfig() {
  const maxTokens = parseInt(process.env.VERIFIER_MAX_SOURCE_TOKENS || '30000', 10);
  return {
    enabled: process.env.VERIFIER_ENABLED !== 'false',
    model: process.env.VERIFIER_MODEL || 'gpt-5.4-mini',
    maxSourceChars: maxTokens * 4,
  };
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface SourceEntry {
  toolName: string;
  key: string;   // section or document ID
  text: string;  // serialized evidence text
}

// Tool result types ──────────────────────────────────────────────────────────

interface GetSectionResult {
  section: {
    id: string;
    title: string | null;
    sectionNumber: string | null;
    content: string | null;
    effectiveDate: string | null;
    documentId: string | null;
    documentType: string | null;
    policyNumber: string | null;
  } | null;
}

interface DocumentMetadata {
  id: string;
  title: string | null;
  documentType: string | null;
  policyNumber: string | null;
  effectiveDate: string | null;
  url: string | null;
  status: string | null;
}

interface GetDocumentResult {
  document: (DocumentMetadata & {
    sections: Array<{
      id: string;
      number: string | null;
      title: string | null;
      chars: number | null;
    }>;
  }) | null;
}

interface GetAmendmentsResult {
  amendments: Array<DocumentMetadata & { changeSummary: string | null }>;
  baseDocument: DocumentMetadata | null;
  authoritativeDocument: DocumentMetadata | null;
}

interface LookupPolicyResult {
  documents: Array<DocumentMetadata & {
    sections: Array<{ id: string; number: string | null; title: string | null }>;
  }>;
}

interface FollowReferencesResult {
  references: Array<{
    targetId: string;
    targetType: 'Section' | 'Document';
    targetTitle: string | null;
    targetPolicyNumber: string | null;
    relationshipType: string;
    referenceText: string | null;
  }>;
}

interface AnswerFrameSection {
  id: string;
  title: string | null;
  sectionNumber: string | null;
  content: string | null;
  effectiveDate: string | null;
  documentId: string | null;
  documentTitle: string | null;
  documentType: string | null;
  policyNumber: string | null;
  reason: string | null;
}

interface ResolveAnswerFrameResult {
  frame: {
    questionType: string;
    route: {
      lane: string;
      rationale: string;
      widening_policy: string;
      determinism_hints: {
        numeric_evidence_only: boolean;
        latest_revision_only: boolean;
        cite_scope_and_not_covered: boolean;
      };
    };
    authoritativeDocuments: Array<DocumentMetadata & { reason: string | null }>;
    primarySections: AnswerFrameSection[];
    supportingSections: AnswerFrameSection[];
    avoidSections: AnswerFrameSection[];
    latestRevision: {
      marker: string | null;
      document: (DocumentMetadata & { reason: string | null }) | null;
      section: AnswerFrameSection | null;
    } | null;
    variantReasoning: string | null;
  };
}

// ── Evidence tools ───────────────────────────────────────────────────────────

const EVIDENCE_TOOLS = new Set([
  'getSection',
  'getDocument',
  'getAmendments',
  'lookupPolicy',
  'followReferences',
  'resolveAnswerFrame',
]);

// ── Formatters ───────────────────────────────────────────────────────────────

function formatDocMeta(doc: DocumentMetadata): string {
  const parts: string[] = [`ID: ${doc.id}`];
  if (doc.title) parts.push(`Title: ${doc.title}`);
  if (doc.policyNumber) parts.push(`Policy: ${doc.policyNumber}`);
  if (doc.documentType) parts.push(`Type: ${doc.documentType}`);
  if (doc.effectiveDate) parts.push(`Effective: ${doc.effectiveDate}`);
  if (doc.status) parts.push(`Status: ${doc.status}`);
  if (doc.url) parts.push(`URL: ${doc.url}`);
  return parts.join('\n');
}

function extractGetSection(result: GetSectionResult): SourceEntry | null {
  const sec = result?.section;
  if (!sec) return null;

  const lines: string[] = [`[getSection]`];
  lines.push(`ID: ${sec.id}`);
  if (sec.title) lines.push(`Title: ${sec.title}`);
  if (sec.sectionNumber) lines.push(`Section: ${sec.sectionNumber}`);
  if (sec.policyNumber) lines.push(`Policy: ${sec.policyNumber}`);
  if (sec.documentType) lines.push(`Type: ${sec.documentType}`);
  if (sec.effectiveDate) lines.push(`Effective: ${sec.effectiveDate}`);
  if (sec.content) lines.push(`\nContent:\n${sec.content}`);

  return { toolName: 'getSection', key: sec.id, text: lines.join('\n') };
}

function extractGetDocument(result: GetDocumentResult): SourceEntry | null {
  const doc = result?.document;
  if (!doc) return null;

  const sections = doc.sections ?? [];
  const lines: string[] = [`[getDocument]`, formatDocMeta(doc)];
  if (sections.length > 0) {
    lines.push(`\nSections (${sections.length}):`);
    for (const s of sections) {
      const num = s.number ? `${s.number} ` : '';
      const chars = s.chars != null ? ` (${s.chars} chars)` : '';
      lines.push(`  ${num}${s.title || '(untitled)'}${chars} [${s.id}]`);
    }
  }

  return { toolName: 'getDocument', key: doc.id, text: lines.join('\n') };
}

function extractGetAmendments(result: GetAmendmentsResult, toolCallId: string): SourceEntry | null {
  // Use authoritativeDocument id as key, fall back to a generated key
  const auth = result?.authoritativeDocument;
  const key = auth ? auth.id : `amendments:${toolCallId}`;

  const lines: string[] = [`[getAmendments]`];

  if (auth) {
    lines.push(`Authoritative document:`);
    lines.push(formatDocMeta(auth));
  }

  const amendments = result?.amendments ?? [];
  if (amendments.length > 0) {
    lines.push(`\nAmendments (${amendments.length}):`);
    for (const a of amendments) {
      lines.push(`  - ${a.id} | ${a.title || '(no title)'} | ${a.effectiveDate || 'unknown date'}`);
      if (a.changeSummary) lines.push(`    Summary: ${a.changeSummary}`);
    }
  }

  if (result?.baseDocument) {
    lines.push(`\nBase document:`);
    lines.push(formatDocMeta(result.baseDocument));
  }

  return { toolName: 'getAmendments', key, text: lines.join('\n') };
}

function extractLookupPolicy(result: LookupPolicyResult, toolCallId: string): SourceEntry | null {
  const docs = result?.documents ?? [];
  if (docs.length === 0) return null;

  // Use first document id as key; multiple docs collapse into one entry
  const key = docs.length === 1
    ? docs[0].id
    : `lookupPolicy:${toolCallId}`;

  const lines: string[] = [`[lookupPolicy]`];
  for (const doc of docs) {
    lines.push(formatDocMeta(doc));
    const sections = doc.sections ?? [];
    if (sections.length > 0) {
      lines.push(`Sections (${sections.length}):`);
      for (const s of sections) {
        const num = s.number ? `${s.number} ` : '';
        lines.push(`  ${num}${s.title || '(untitled)'} [${s.id}]`);
      }
    }
    lines.push('');
  }

  return { toolName: 'lookupPolicy', key, text: lines.join('\n').trimEnd() };
}

function extractFollowReferences(result: FollowReferencesResult, toolCallId: string): SourceEntry | null {
  const refs = result?.references ?? [];
  if (refs.length === 0) return null;

  const key = `followReferences:${toolCallId}`;
  const lines: string[] = [`[followReferences]`];
  lines.push(`Cross-references (${refs.length}):`);
  for (const ref of refs) {
    const pn = ref.targetPolicyNumber ? ` [Policy: ${ref.targetPolicyNumber}]` : '';
    lines.push(`  ${ref.targetType} ${ref.targetId}: ${ref.targetTitle || '(no title)'}${pn}`);
    lines.push(`  Relationship: ${ref.relationshipType}`);
    if (ref.referenceText) lines.push(`  Reference text: "${ref.referenceText}"`);
  }

  return { toolName: 'followReferences', key, text: lines.join('\n') };
}

function formatFrameSection(section: AnswerFrameSection): string {
  const lines: string[] = [`ID: ${section.id}`];
  if (section.title) lines.push(`Title: ${section.title}`);
  if (section.sectionNumber) lines.push(`Section: ${section.sectionNumber}`);
  if (section.policyNumber) lines.push(`Policy: ${section.policyNumber}`);
  if (section.documentType) lines.push(`Type: ${section.documentType}`);
  if (section.reason) lines.push(`Reason: ${section.reason}`);
  if (section.content) lines.push(`Content:\n${section.content}`);
  return lines.join('\n');
}

function extractResolveAnswerFrame(result: ResolveAnswerFrameResult, toolCallId: string): SourceEntry | null {
  const frame = result?.frame;
  if (!frame) return null;

  const key = frame.primarySections[0]?.id ?? frame.authoritativeDocuments[0]?.id ?? `resolveAnswerFrame:${toolCallId}`;
  const lines: string[] = [`[resolveAnswerFrame]`, `Question type: ${frame.questionType}`];
  lines.push(`Route lane: ${frame.route.lane}`);
  lines.push(`Route rationale: ${frame.route.rationale}`);
  lines.push(`Widening policy: ${frame.route.widening_policy}`);

  const trueHints = Object.entries(frame.route.determinism_hints)
    .filter(([, value]) => value)
    .map(([key]) => key);
  if (trueHints.length > 0) {
    lines.push(`Determinism hints: ${trueHints.join(', ')}`);
  }

  if (frame.variantReasoning) {
    lines.push(`Variant reasoning: ${frame.variantReasoning}`);
  }

  if (frame.authoritativeDocuments.length > 0) {
    lines.push('\nAuthoritative documents:');
    for (const document of frame.authoritativeDocuments) {
      lines.push(formatDocMeta(document));
      if (document.reason) lines.push(`Reason: ${document.reason}`);
      lines.push('');
    }
  }

  if (frame.latestRevision) {
    lines.push(`Latest revision marker: ${frame.latestRevision.marker ?? '(unknown)'}`);
  }

  if (frame.primarySections.length > 0) {
    lines.push('\nPrimary sections:');
    for (const section of frame.primarySections) {
      lines.push(formatFrameSection(section));
      lines.push('');
    }
  }

  if (frame.supportingSections.length > 0) {
    lines.push('Supporting sections:');
    for (const section of frame.supportingSections) {
      lines.push(formatFrameSection(section));
      lines.push('');
    }
  }

  if (frame.avoidSections.length > 0) {
    lines.push('Avoid sections:');
    for (const section of frame.avoidSections) {
      lines.push(formatFrameSection(section));
      lines.push('');
    }
  }

  return { toolName: 'resolveAnswerFrame', key, text: lines.join('\n').trimEnd() };
}

// ── extractSources ───────────────────────────────────────────────────────────

export interface ToolResultRecord {
  toolName: string;
  toolCallId?: string;
  result: unknown;
}

/**
 * Convert a flat list of tool-call records into SourceEntry rows.
 * Used by the CLI runner, which can only collect raw {toolName, result}
 * from `onStepFinish` — the Mastra DB message shape isn't available there.
 */
export function extractSourcesFromToolResults(
  toolResults: Array<ToolResultRecord>,
): SourceEntry[] {
  const sources: SourceEntry[] = [];
  for (const tr of toolResults) {
    if (!EVIDENCE_TOOLS.has(tr.toolName)) continue;
    const toolCallId = tr.toolCallId ?? '';
    let entry: SourceEntry | null = null;
    switch (tr.toolName) {
      case 'getSection':
        entry = extractGetSection(tr.result as GetSectionResult);
        break;
      case 'getDocument':
        entry = extractGetDocument(tr.result as GetDocumentResult);
        break;
      case 'getAmendments':
        entry = extractGetAmendments(tr.result as GetAmendmentsResult, toolCallId);
        break;
      case 'lookupPolicy':
        entry = extractLookupPolicy(tr.result as LookupPolicyResult, toolCallId);
        break;
      case 'followReferences':
        entry = extractFollowReferences(tr.result as FollowReferencesResult, toolCallId);
        break;
      case 'resolveAnswerFrame':
        entry = extractResolveAnswerFrame(tr.result as ResolveAnswerFrameResult, toolCallId);
        break;
    }
    if (entry) sources.push(entry);
  }
  return sources;
}

/**
 * Extract evidence sources from conversation messages.
 * Tool results in Mastra messages live in `tool-invocation` parts with
 * `state: 'result'` and a `result` field containing the tool output.
 */
export function extractSources(messages: Array<{ content?: { parts?: any[] } }>): SourceEntry[] {
  const sources: SourceEntry[] = [];

  for (const msg of messages) {
    for (const part of msg.content?.parts ?? []) {
      if (part.type !== 'tool-invocation') continue;
      const inv = part.toolInvocation;
      if (!inv || inv.state !== 'result') continue;

      const toolName: string = inv.toolName;
      const result: unknown = inv.result;
      const toolCallId: string = inv.toolCallId ?? '';
      if (!EVIDENCE_TOOLS.has(toolName)) continue;

      let entry: SourceEntry | null = null;

      switch (toolName) {
        case 'getSection':
          entry = extractGetSection(result as GetSectionResult);
          break;
        case 'getDocument':
          entry = extractGetDocument(result as GetDocumentResult);
          break;
        case 'getAmendments':
          entry = extractGetAmendments(result as GetAmendmentsResult, toolCallId);
          break;
        case 'lookupPolicy':
          entry = extractLookupPolicy(result as LookupPolicyResult, toolCallId);
          break;
        case 'followReferences':
          entry = extractFollowReferences(result as FollowReferencesResult, toolCallId);
          break;
        case 'resolveAnswerFrame':
          entry = extractResolveAnswerFrame(result as ResolveAnswerFrameResult, toolCallId);
          break;
      }

      if (entry) sources.push(entry);
    }
  }

  return sources;
}

// ── buildSourceText ──────────────────────────────────────────────────────────

const NO_SOURCES_TEXT = '(No source documents were retrieved.)';

/** Sentinel reason used when the verifier API call fails. */
export const VERIFICATION_UNAVAILABLE = 'Verification service unavailable';

const VERIFICATION_DISCLAIMER =
  '\n\n---\n*Note: This answer could not be verified against source documents. Please verify critical details with [NC DHHS](https://medicaid.ncdhhs.gov/).*';

export function buildSourceText(
  sources: SourceEntry[],
  answerText: string,
  maxChars?: number,
): string {
  if (sources.length === 0) return NO_SOURCES_TEXT;

  const limit = maxChars ?? getConfig().maxSourceChars;

  // Split into cited (key appears in answer) vs uncited
  const cited: SourceEntry[] = [];
  const uncited: SourceEntry[] = [];
  for (const s of sources) {
    if (answerText.includes(s.key)) {
      cited.push(s);
    } else {
      uncited.push(s);
    }
  }

  // Concatenate cited first, then uncited, respecting char limit
  const ordered = [...cited, ...uncited];
  const parts: string[] = [];
  let total = 0;

  for (const s of ordered) {
    const block = s.text + '\n\n---\n\n';
    if (total + block.length > limit) {
      // Try to fit a truncation notice instead
      const notice = `[${ordered.length - parts.length} additional source(s) truncated due to length limit.]`;
      parts.push(notice);
      break;
    }
    parts.push(block);
    total += block.length;
  }

  return parts.join('').trimEnd();
}

// ── verifyAnswer ─────────────────────────────────────────────────────────────

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

const VERIFIER_PROMPT = `You are a factual verification and relevance assistant for NC Medicaid policy answers. Given a QUESTION, an ANSWER, and SOURCE DOCUMENTS, perform four checks:

## 1. RELEVANCE CHECK
Does the answer directly address the specific question asked?
- If the question asks about a specific policy (e.g., "Policy 3L"), does the answer primarily use that policy?
- If the question asks about a specific setting or population, does the answer address that setting/population?
- Flag as MAJOR if the answer discusses a related-but-different policy (e.g., 3L-1 instead of 3L, MA-3540 instead of CCP 10A) or reaches the wrong conclusion by using the wrong source.
- Flag as MINOR if the answer is directionally correct but incomplete or uses a secondary source.

## 2. FACTUAL CHECK
Identify every factual claim and check whether it is supported by the source documents.
- A claim is SUPPORTED if the source documents contain the information stated or it is a reasonable paraphrase.
- A claim is UNSUPPORTED if the source documents do not contain that information, or the answer contradicts the sources.
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
    console.error('[HallucinationVerifier] Error during verification, failing closed:', err);
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
  };
  /**
   * True when the verifier produced a rewrite that was entirely `[missing
   * citation: ...]` markers and we fell back to the original text. This is a
   * degraded state even if the verifier's per-check flags look clean — the
   * rewrite was unusable — so we clamp to `low`.
   */
  pureMarkerFallback: boolean;
}

/**
 * Derive a single 0..1 confidence score from the verifier's check outputs.
 * Higher = fewer/softer issues. Deductions are additive rather than
 * normalized per-claim so that multiple unsupported claims compound: the
 * user signal we want is "how bad", not "what kind."
 */
export function computeVerificationConfidence(
  verification: VerificationResult,
  options: { pureMarkerFallback?: boolean } = {},
): VerificationConfidence {
  const unsupported = verification.unsupportedClaims?.length ?? 0;
  const missingCitation = verification.missingCitationClaims?.length ?? 0;
  const issues = verification.relevanceIssues ?? [];
  const relevanceMajor = issues.filter((i) => i.severity === 'major').length;
  const relevanceMinor = issues.filter((i) => i.severity === 'minor').length;

  const deduction =
    0.30 * unsupported
    + 0.15 * missingCitation
    + 0.35 * relevanceMajor
    + 0.10 * relevanceMinor;
  let confidence = Math.max(0, Math.min(1, 1 - deduction));

  const pureMarkerFallback = !!options.pureMarkerFallback;
  if (pureMarkerFallback) {
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
    counts: { unsupported, missingCitation, relevanceMajor, relevanceMinor },
    pureMarkerFallback,
  };
}

// ── Rendering helpers ───────────────────────────────────────────────────────

const MISSING_CITATION_MARKER = '[missing citation:';

/**
 * Parse `[missing citation: <content>]` markers out of the verifier's corrected
 * answer, tracking bracket depth so the common payload shape
 * `[missing citation: [Policy 8C § 3.2.1](https://...)]` doesn't stop at the
 * inner `]`. Returns the body with markers stripped and the list of suggested
 * citations in the order they appeared.
 */
function extractMissingCitations(text: string): { body: string; citations: string[] } {
  const citations: string[] = [];
  const segments: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const idx = text.indexOf(MISSING_CITATION_MARKER, cursor);
    if (idx === -1) {
      segments.push(text.slice(cursor));
      break;
    }
    segments.push(text.slice(cursor, idx));

    // Find the marker's matching `]` while honoring nested brackets.
    let depth = 1;
    let j = idx + MISSING_CITATION_MARKER.length;
    while (j < text.length) {
      const ch = text[j];
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) break;
      }
      j++;
    }
    if (j >= text.length) {
      // Unmatched marker — keep the original substring so we don't silently
      // drop content.
      segments.push(text.slice(idx));
      break;
    }
    const content = text.slice(idx + MISSING_CITATION_MARKER.length, j).trim();
    if (content) citations.push(content);
    cursor = j + 1;
  }

  let body = segments.join('');
  // Clean up whitespace that the marker left behind (e.g., `sentence. <gap> `).
  body = body.replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim();
  return { body, citations };
}

/**
 * Render the verifier's corrected answer for the user. `[unverified: ...]` and
 * `[wrong source: ...]` markers stay inline because they carry factual
 * uncertainty signal; `[missing citation: ...]` markers are moved to a short
 * footer because they're grammatical annotations, not content claims, and they
 * read poorly mid-sentence.
 */
export function renderCorrectedAnswer(corrected: string, fallback?: string): string {
  if (!corrected) return corrected;
  const { body, citations } = extractMissingCitations(corrected);
  if (citations.length === 0) return body;

  // If the verifier's rewrite is ENTIRELY [missing citation: ...] markers,
  // extraction leaves the body empty. Returning just the citation footer
  // produces a user-visible "answer" with no substance (observed with q-006
  // in the 2026-04-21 eval, scored 0/3). Prefer the untouched original
  // answer text when available; otherwise keep the markers inline.
  if (!body.trim()) {
    return (fallback ?? corrected).trim();
  }

  const uniqueCitations: string[] = [];
  const seen = new Set<string>();
  for (const citation of citations) {
    if (!seen.has(citation)) {
      seen.add(citation);
      uniqueCitations.push(citation);
    }
  }
  const footer = uniqueCitations.map((citation) => `- ${citation}`).join('\n');
  return `${body}\n\n---\n\n*Suggested citations for uncited claims above:*\n${footer}`;
}

// ── Processor Class ─────────────────────────────────────────────────────────

function extractTextFromMessage(message: MastraDBMessage): string {
  const content = (message as any).content;
  if (typeof content === 'string') return content.trim();

  const parts = content?.parts ?? [];
  if (!Array.isArray(parts)) return '';

  return parts
    .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
    .map((part: any) => part.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractLatestUserQuestion(messages: MastraDBMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== 'user') continue;

    const text = extractTextFromMessage(message);
    if (text) return text;
  }
  return '';
}

export class HallucinationVerifier implements Processor {
  readonly id = 'hallucination-verifier';
  readonly name = 'Hallucination Verifier';

  async processOutputStep({
    text,
    finishReason,
    toolCalls,
    messages,
    writer,
  }: ProcessOutputStepArgs): Promise<MastraDBMessage[]> {
    if (!getConfig().enabled) return messages;

    // Only verify the final answer (model stopped, no pending tool calls, has text)
    if (finishReason !== 'stop' || (toolCalls && toolCalls.length > 0) || !text) {
      return messages;
    }

    const question = extractLatestUserQuestion(messages);

    const sources = extractSources(messages as any);
    const sourceText = buildSourceText(sources, text);
    const verification = await verifyAnswer(question, text, sourceText);

    const hasMajorRelevanceIssue = verification.relevanceIssues?.some(
      (issue) => issue.severity === 'major',
    );

    const rerankerDiagnostics = getPolicyCorpusRerankerDiagnostics();
    const citationsComplete = verification.citationsComplete !== false;
    const missingCitationCount = verification.missingCitationClaims?.length ?? 0;

    if (
      verification.supported
      && verification.relevant
      && !hasMajorRelevanceIssue
      && citationsComplete
    ) {
      const okConfidence = computeVerificationConfidence(verification);
      if (writer) {
        // Emit a positive-path event so the UI can render a green confidence
        // indicator even when nothing needed correcting.
        await writer.custom({
          type: 'data-verification-ok',
          data: {
            confidence: okConfidence.confidence,
            severity: okConfidence.severity,
            counts: okConfidence.counts,
          },
        } as any);
      } else {
        console.log('\n---VERIFIER---\n');
        console.log(JSON.stringify({
          rewrote: false,
          supported: true,
          relevant: true,
          citations_complete: true,
          unsupported_claim_count: 0,
          missing_citation_count: 0,
          relevance_issue_count: verification.relevanceIssues?.length ?? 0,
          major_relevance_issue: false,
          verifier_unavailable: false,
          verifier_model: getConfig().model,
          reranker_fallback_count: rerankerDiagnostics.fallbackCount,
          reranker_last_error: rerankerDiagnostics.lastError,
          confidence: okConfidence.confidence,
          severity: okConfidence.severity,
        }));
      }
      return messages;
    }

    // Apply the verifier's correctedAnswer directly — no retry.
    // Retries cause the agent to over-correct and hedge everything.
    const verifierUnavailable = verification.unsupportedClaims.some(
      (c) => c.reason === VERIFICATION_UNAVAILABLE,
    );
    const rawCorrected = verification.correctedAnswer
      || (verifierUnavailable ? text + VERIFICATION_DISCLAIMER : text);
    // Move [missing citation: ...] markers out of sentence flow into a footer;
    // keep [unverified: ...] / [wrong source: ...] inline (hallucination signal).
    // Pass the original text as a fallback so a rewrite that is pure markers
    // (body empty after extraction) doesn't nuke the answer.
    const corrected = renderCorrectedAnswer(rawCorrected, text);
    // Detect the pure-marker fallback so the confidence badge reflects that
    // the rewrite was unusable (same signal as the q-006 regression guard).
    const pureMarkerFallback =
      (verification.correctedAnswer ?? '').trim().length > 0 && corrected.trim() === text.trim();
    const confidence = computeVerificationConfidence(verification, { pureMarkerFallback });

    if (writer) {
      await writer.custom({
        type: 'data-verification-rewrite',
        data: {
          unsupportedClaims: verification.unsupportedClaims,
          missingCitationClaims: verification.missingCitationClaims,
          relevanceIssues: verification.relevanceIssues,
          correctedAnswer: corrected,
          confidence: confidence.confidence,
          severity: confidence.severity,
          counts: confidence.counts,
          pureMarkerFallback,
        },
      } as any);
    } else {
      // CLI / non-streaming path — emit telemetry marker so the eval harness can capture it.
      const telemetry = {
        rewrote: true,
        supported: verification.supported,
        relevant: verification.relevant,
        citations_complete: citationsComplete,
        unsupported_claim_count: verification.unsupportedClaims?.length ?? 0,
        missing_citation_count: missingCitationCount,
        relevance_issue_count: verification.relevanceIssues?.length ?? 0,
        major_relevance_issue: hasMajorRelevanceIssue,
        verifier_unavailable: verifierUnavailable,
        verifier_model: getConfig().model,
        reranker_fallback_count: rerankerDiagnostics.fallbackCount,
        reranker_last_error: rerankerDiagnostics.lastError,
        confidence: confidence.confidence,
        severity: confidence.severity,
        pure_marker_fallback: pureMarkerFallback,
      };
      console.log('\n---VERIFIER---\n');
      console.log(JSON.stringify(telemetry));
    }

    return messages.map((msg) => {
      if (msg.role !== 'assistant') return msg;
      return {
        ...msg,
        content: {
          ...msg.content,
          parts: (msg.content as any).parts.map((part: any) => {
            if (part.type === 'text') {
              return { ...part, text: corrected };
            }
            return part;
          }),
        },
      };
    });
  }
}
