import type { AnswerFrame, AnswerFrameSection } from '@nc-medicaid/policy-corpus';
import { getConfig } from './config.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SourceEntry {
  /** Server-assigned role; web context cannot establish governing policy. */
  evidenceRole?: 'supplementary';
  toolName: string;
  key: string;   // section or document ID
  text: string;  // serialized evidence text
  /** Citation URL for this source (citationLink or url), when available.
   *  Used to match sources against the answer's inline markdown citations —
   *  raw IDs never appear in answers, so the key alone can't identify
   *  "cited" sources. */
  link?: string | null;
}

// Tool result types ──────────────────────────────────────────────────────────

interface GetSectionResult {
  section: {
    id: string;
    title: string | null;
    sectionNumber: string | null;
    content: string | null;
    effectiveDate: string | null;
    sourceModifiedDate?: string | null;
    retrievedAt?: string | null;
    lastRevised: string | null;
    federalRegisterCite: string | null;
    documentId: string | null;
    documentType: string | null;
    policyNumber: string | null;
    url: string | null;
    citationLink: string | null;
  } | null;
}

interface DocumentMetadata {
  id: string;
  title: string | null;
  documentType: string | null;
  policyNumber: string | null;
  effectiveDate: string | null;
  sourceModifiedDate?: string | null;
  retrievedAt?: string | null;
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

interface ResolveAnswerFrameResult {
  frame: AnswerFrame;
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
  if (doc.sourceModifiedDate) parts.push(`Source modified: ${doc.sourceModifiedDate}`);
  if (doc.retrievedAt) parts.push(`Retrieved: ${doc.retrievedAt}`);
  if (doc.status) parts.push(`Status: ${doc.status}`);
  if (doc.url) parts.push(`URL: ${doc.url}`);
  return parts.join('\n');
}

/** Pull the bare URL out of a `[title](url)` markdown citation link. */
function urlFromCitationLink(citationLink: string | null | undefined): string | null {
  if (!citationLink) return null;
  const match = citationLink.match(/\]\((.+)\)\s*$/);
  return match ? match[1] : null;
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
  if (sec.sourceModifiedDate) lines.push(`Source modified: ${sec.sourceModifiedDate}`);
  if (sec.retrievedAt) lines.push(`Retrieved: ${sec.retrievedAt}`);
  if (sec.lastRevised) lines.push(`Last revised: ${sec.lastRevised}`);
  if (sec.federalRegisterCite) lines.push(`Federal Register cite: ${sec.federalRegisterCite}`);
  if (sec.citationLink) lines.push(`Citation link: ${sec.citationLink}`);
  else if (sec.url) lines.push(`URL: ${sec.url}`);
  if (sec.content) lines.push(`\nContent:\n${sec.content}`);

  return {
    toolName: 'getSection',
    key: sec.id,
    text: lines.join('\n'),
    link: sec.url ?? urlFromCitationLink(sec.citationLink),
  };
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

  return { toolName: 'getDocument', key: doc.id, text: lines.join('\n'), link: doc.url };
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

  return { toolName: 'getAmendments', key, text: lines.join('\n'), link: auth?.url ?? null };
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

  return { toolName: 'lookupPolicy', key, text: lines.join('\n').trimEnd(), link: docs[0]?.url ?? null };
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
  if (section.lastRevised) lines.push(`Last revised: ${section.lastRevised}`);
  if (section.federalRegisterCite) lines.push(`Federal Register cite: ${section.federalRegisterCite}`);
  if (section.citationLink) lines.push(`Citation link: ${section.citationLink}`);
  else if (section.url) lines.push(`URL: ${section.url}`);
  if (section.reason) lines.push(`Reason: ${section.reason}`);
  // Routing advice is separate from the original corpus text below.
  return lines.join('\n');
}

function extractResolveAnswerFrame(result: ResolveAnswerFrameResult, toolCallId: string): SourceEntry | null {
  const frame = result?.frame;
  if (!frame) return null;

  const key = frame.primarySections[0]?.id ?? frame.authoritativeDocuments[0]?.id ?? `resolveAnswerFrame:${toolCallId}`;
  const link = frame.primarySections[0]?.url
    ?? urlFromCitationLink(frame.primarySections[0]?.citationLink)
    ?? frame.authoritativeDocuments[0]?.url
    ?? null;
  const lines: string[] = [
    `[resolveAnswerFrame]`,
    `(Routing hint from an upstream router — NOT ground-truth evidence; the router can be wrong.)`,
    `Question type: ${frame.questionType}`,
  ];
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

  return { toolName: 'resolveAnswerFrame', key, text: lines.join('\n').trimEnd(), link };
}

/** The planner's source bodies come directly from the corpus, while its
 * routing reasons are advisory. Keep those two kinds of information separate. */
function extractFrameCorpusSections(result: ResolveAnswerFrameResult): SourceEntry[] {
  const frame = result?.frame;
  if (!frame) return [];
  const seen = new Set<string>();
  return [...frame.primarySections, ...frame.supportingSections,
    ...(frame.latestRevision?.section ? [frame.latestRevision.section] : [])]
    .flatMap(section => {
      if (!section.content?.trim() || seen.has(section.id)) return [];
      seen.add(section.id);
      const entry = extractGetSection({ section })!;
      return [{ ...entry, toolName: 'resolveAnswerFrame:section',
        text: entry.text.replace('[getSection]', '[corpusSection]') }];
    });
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
    if (tr.toolName === 'resolveAnswerFrame') sources.push(...extractFrameCorpusSections(tr.result as ResolveAnswerFrameResult));
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
      if (toolName === 'resolveAnswerFrame') sources.push(...extractFrameCorpusSections(result as ResolveAnswerFrameResult));
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

  // Split into cited vs uncited so budget truncation drops uncited sources
  // first. Answers cite via markdown links (raw section IDs are forbidden by
  // the system prompt), so match on the source's citation URL; the raw-key
  // check is kept as a fallback for ID-bearing answers (e.g. CLI debugging).
  const cited: SourceEntry[] = [];
  const uncited: SourceEntry[] = [];
  for (const s of sources) {
    const citedByLink = !!s.link && answerText.includes(s.link);
    if (citedByLink || answerText.includes(s.key)) {
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
    const evidence = s.evidenceRole === 'supplementary'
      ? JSON.stringify({ evidenceRole: 'supplementary', url: s.link, excerpt: s.text })
      : s.text;
    const block = evidence + '\n\n---\n\n';
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
