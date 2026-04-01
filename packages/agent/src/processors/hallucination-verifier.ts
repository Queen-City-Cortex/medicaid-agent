import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { Processor, ProcessOutputStepArgs, ProcessInputStepArgs, ProcessInputStepResult } from '@mastra/core/processors';
import type { MastraDBMessage } from '@mastra/core/memory';

// ── Config ───────────────────────────────────────────────────────────────────

function getConfig() {
  const maxTokens = parseInt(process.env.VERIFIER_MAX_SOURCE_TOKENS || '30000', 10);
  return {
    enabled: process.env.VERIFIER_ENABLED !== 'false',
    model: process.env.VERIFIER_MODEL || 'claude-haiku-4-5-20251001',
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

// Step shape (AI SDK StepResult) ──────────────────────────────────────────────
// AI SDK v5 StepResult.toolResults entries have toolName/output directly,
// NOT wrapped in a payload object.

interface ToolResultEntry {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: unknown;
}

interface StepResult {
  toolResults: ToolResultEntry[];
}

// ── Evidence tools ───────────────────────────────────────────────────────────

const EVIDENCE_TOOLS = new Set([
  'getSection',
  'getDocument',
  'getAmendments',
  'lookupPolicy',
  'followReferences',
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
  const sec = result.section;
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
  const doc = result.document;
  if (!doc) return null;

  const lines: string[] = [`[getDocument]`, formatDocMeta(doc)];
  if (doc.sections.length > 0) {
    lines.push(`\nSections (${doc.sections.length}):`);
    for (const s of doc.sections) {
      const num = s.number ? `${s.number} ` : '';
      const chars = s.chars != null ? ` (${s.chars} chars)` : '';
      lines.push(`  ${num}${s.title || '(untitled)'}${chars} [${s.id}]`);
    }
  }

  return { toolName: 'getDocument', key: doc.id, text: lines.join('\n') };
}

function extractGetAmendments(result: GetAmendmentsResult, toolCallId: string): SourceEntry | null {
  // Use authoritativeDocument id as key, fall back to a generated key
  const auth = result.authoritativeDocument;
  const key = auth ? auth.id : `amendments:${toolCallId}`;

  const lines: string[] = [`[getAmendments]`];

  if (auth) {
    lines.push(`Authoritative document:`);
    lines.push(formatDocMeta(auth));
  }

  if (result.amendments.length > 0) {
    lines.push(`\nAmendments (${result.amendments.length}):`);
    for (const a of result.amendments) {
      lines.push(`  - ${a.id} | ${a.title || '(no title)'} | ${a.effectiveDate || 'unknown date'}`);
      if (a.changeSummary) lines.push(`    Summary: ${a.changeSummary}`);
    }
  }

  if (result.baseDocument) {
    lines.push(`\nBase document:`);
    lines.push(formatDocMeta(result.baseDocument));
  }

  return { toolName: 'getAmendments', key, text: lines.join('\n') };
}

function extractLookupPolicy(result: LookupPolicyResult, toolCallId: string): SourceEntry | null {
  if (result.documents.length === 0) return null;

  // Use first document id as key; multiple docs collapse into one entry
  const key = result.documents.length === 1
    ? result.documents[0].id
    : `lookupPolicy:${toolCallId}`;

  const lines: string[] = [`[lookupPolicy]`];
  for (const doc of result.documents) {
    lines.push(formatDocMeta(doc));
    if (doc.sections.length > 0) {
      lines.push(`Sections (${doc.sections.length}):`);
      for (const s of doc.sections) {
        const num = s.number ? `${s.number} ` : '';
        lines.push(`  ${num}${s.title || '(untitled)'} [${s.id}]`);
      }
    }
    lines.push('');
  }

  return { toolName: 'lookupPolicy', key, text: lines.join('\n').trimEnd() };
}

function extractFollowReferences(result: FollowReferencesResult, toolCallId: string): SourceEntry | null {
  if (result.references.length === 0) return null;

  const key = `followReferences:${toolCallId}`;
  const lines: string[] = [`[followReferences]`];
  lines.push(`Cross-references (${result.references.length}):`);
  for (const ref of result.references) {
    const pn = ref.targetPolicyNumber ? ` [Policy: ${ref.targetPolicyNumber}]` : '';
    lines.push(`  ${ref.targetType} ${ref.targetId}: ${ref.targetTitle || '(no title)'}${pn}`);
    lines.push(`  Relationship: ${ref.relationshipType}`);
    if (ref.referenceText) lines.push(`  Reference text: "${ref.referenceText}"`);
  }

  return { toolName: 'followReferences', key, text: lines.join('\n') };
}

// ── extractSources ───────────────────────────────────────────────────────────

export function extractSources(steps: StepResult[]): SourceEntry[] {
  const sources: SourceEntry[] = [];

  for (const step of steps) {
    for (const tr of step.toolResults) {
      if (tr.type !== 'tool-result') continue;

      const { toolName, output, toolCallId } = tr;
      if (!EVIDENCE_TOOLS.has(toolName)) continue;

      let entry: SourceEntry | null = null;

      switch (toolName) {
        case 'getSection':
          entry = extractGetSection(output as GetSectionResult);
          break;
        case 'getDocument':
          entry = extractGetDocument(output as GetDocumentResult);
          break;
        case 'getAmendments':
          entry = extractGetAmendments(output as GetAmendmentsResult, toolCallId);
          break;
        case 'lookupPolicy':
          entry = extractLookupPolicy(output as LookupPolicyResult, toolCallId);
          break;
        case 'followReferences':
          entry = extractFollowReferences(output as FollowReferencesResult, toolCallId);
          break;
      }

      if (entry) sources.push(entry);
    }
  }

  return sources;
}

// ── buildSourceText ──────────────────────────────────────────────────────────

const NO_SOURCES_TEXT = '(No source documents were retrieved.)';

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

export interface VerificationResult {
  supported: boolean;
  unsupportedClaims: Array<{ claim: string; reason: string }>;
  correctedAnswer?: string;
}

const VERIFIER_PROMPT = `You are a factual verification assistant. Given an ANSWER and SOURCE DOCUMENTS, identify every factual claim in the answer and check whether it is supported by the source documents.

A claim is SUPPORTED if the source documents contain the information stated or it is a reasonable paraphrase. A claim is UNSUPPORTED if the source documents do not contain that information, or the answer states something that contradicts the sources.

Focus on: dollar amounts, dates, thresholds, visit limits, eligibility criteria, policy numbers, and specific requirements. Ignore narrative transitions, hedging language, and meta-commentary about the research process.

If any claims are unsupported, produce a CORRECTED VERSION of the full answer where each unsupported claim is wrapped in [unverified: ...] markers. Keep all supported content unchanged. The corrected version must be the complete answer, not a diff.

Respond with JSON only matching this schema:
{
  "supported": boolean,
  "unsupportedClaims": [{"claim": "string", "reason": "string"}],
  "correctedAnswer": "string or omit if supported is true"
}`;

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

export async function verifyAnswer(
  answerText: string,
  sourceText: string,
): Promise<VerificationResult> {
  const failOpen: VerificationResult = { supported: true, unsupportedClaims: [] };

  try {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { text } = await generateText({
      model: anthropic(getConfig().model),
      system: VERIFIER_PROMPT,
      messages: [
        {
          role: 'user',
          content: `## ANSWER\n\n${answerText}\n\n## SOURCE DOCUMENTS\n\n${sourceText}`,
        },
      ],
    });

    const stripped = stripCodeFences(text);
    const parsed = JSON.parse(stripped) as unknown;

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).supported !== 'boolean' ||
      !Array.isArray((parsed as Record<string, unknown>).unsupportedClaims)
    ) {
      console.error('[HallucinationVerifier] Malformed response structure, failing open');
      return failOpen;
    }

    return parsed as VerificationResult;
  } catch (err) {
    console.error('[HallucinationVerifier] Error during verification, failing open:', err);
    return failOpen;
  }
}

// ── Processor Class ─────────────────────────────────────────────────────────

export class HallucinationVerifier implements Processor {
  readonly id = 'hallucination-verifier';
  readonly name = 'Hallucination Verifier';

  async processInputStep({ state }: ProcessInputStepArgs): Promise<ProcessInputStepResult> {
    if (state.verificationRetryPending) {
      state.verificationRetryPending = false;
      return { toolChoice: 'none' };
    }
    return {};
  }

  async processOutputStep({
    text,
    finishReason,
    toolCalls,
    steps,
    messages,
    abort,
    retryCount,
    state,
    writer,
  }: ProcessOutputStepArgs): Promise<MastraDBMessage[]> {
    // 1. Skip if verifier disabled
    if (!getConfig().enabled) {
      return messages;
    }

    // 2. Skip if not final answer
    if (finishReason !== 'stop' || (toolCalls && toolCalls.length > 0) || !text) {
      return messages;
    }

    // 3. Extract sources from steps
    const sources = extractSources(steps as any);

    // 4. Build source text
    const sourceText = buildSourceText(sources, text);

    // 5. Call verifyAnswer
    const verification = await verifyAnswer(text, sourceText);

    // 6. If supported, return messages unchanged
    if (verification.supported) {
      return messages;
    }

    // 7. If unsupported and retryCount < 2: set state flag and abort with retry
    if (retryCount < 2) {
      state.verificationRetryPending = true;
      abort(
        `Unsupported claims found: ${verification.unsupportedClaims.map((c) => c.claim).join('; ')}`,
        { retry: true },
      );
      // abort() is typed `never` (always throws), but explicit return for clarity
      return messages;
    }

    // 8. If unsupported and retries exhausted: emit custom chunk and rewrite messages
    if (writer) {
      await writer.custom({
        type: 'data-verification-rewrite' as const,
        unsupportedClaims: verification.unsupportedClaims,
        correctedAnswer: verification.correctedAnswer,
      });
    }

    const corrected = verification.correctedAnswer ?? text;
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
