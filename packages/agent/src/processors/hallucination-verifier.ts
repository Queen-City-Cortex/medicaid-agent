import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import type { Processor, ProcessOutputStepArgs } from '@mastra/core/processors';
import type { MastraDBMessage } from '@mastra/core/memory';

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
  unsupportedClaims: z.array(z.object({
    claim: z.string().describe('The unsupported claim text from the answer'),
    reason: z.string().describe('Why the claim is not supported by the sources'),
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

const VERIFIER_PROMPT = `You are a factual verification and relevance assistant for NC Medicaid policy answers. Given a QUESTION, an ANSWER, and SOURCE DOCUMENTS, perform two checks:

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

## CORRECTION
If any claims are unsupported, wrap them in [unverified: ...] markers. If content comes from the wrong policy source, wrap it in [wrong source: ...] markers. Keep all correct content unchanged. The corrected version must be the complete answer, not a diff.`;

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
      unsupportedClaims: [{ claim: 'Full answer', reason: VERIFICATION_UNAVAILABLE }],
      relevanceIssues: [],
      correctedAnswer: '',
    };
  }
}

// ── Processor Class ─────────────────────────────────────────────────────────

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

    // Extract the user's original question from the first user message
    let question = '';
    for (const msg of messages) {
      if (msg.role === 'user') {
        const parts = (msg.content as any)?.parts ?? [];
        for (const part of parts) {
          if (part.type === 'text' && part.text) {
            question = part.text;
            break;
          }
        }
        if (question) break;
      }
    }

    const sources = extractSources(messages as any);
    const sourceText = buildSourceText(sources, text);
    const verification = await verifyAnswer(question, text, sourceText);

    const hasMajorRelevanceIssue = verification.relevanceIssues?.some(
      (issue) => issue.severity === 'major',
    );

    if (verification.supported && verification.relevant && !hasMajorRelevanceIssue) {
      return messages;
    }

    // Apply the verifier's correctedAnswer directly — no retry.
    // Retries cause the agent to over-correct and hedge everything.
    const verifierUnavailable = verification.unsupportedClaims.some(
      (c) => c.reason === VERIFICATION_UNAVAILABLE,
    );
    const corrected = verification.correctedAnswer
      || (verifierUnavailable ? text + VERIFICATION_DISCLAIMER : text);

    if (writer) {
      await writer.custom({
        type: 'data-verification-rewrite',
        data: {
          unsupportedClaims: verification.unsupportedClaims,
          relevanceIssues: verification.relevanceIssues,
          correctedAnswer: corrected,
        },
      } as any);
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
