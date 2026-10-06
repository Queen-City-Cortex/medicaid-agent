import type { AnswerFrame, AnswerFrameSection } from '@nc-medicaid/policy-corpus';
import { getConfig } from './config.js';
import { answerUrlSet, sourceUrlSet } from './answer-validation.js';

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
  /** Set only on an entry that is one section's text (`getSection` and the
   *  frame's corpus sections), from the tool's structured output. A listing
   *  names sections without their text, so it sets neither field and cannot
   *  vouch for a section label (`validateAnswerSections`). */
  policyNumber?: string | null;
  sectionNumber?: string | null;
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
    sectionCount?: number;
    sectionsTruncated?: boolean;
  }) | null;
}

type AmendmentMetadata = DocumentMetadata & { changeSummary: string | null };

interface GetAmendmentsResult {
  document: DocumentMetadata | null;
  amends: DocumentMetadata[];
  amendments: AmendmentMetadata[];
  latestAmendment: AmendmentMetadata | null;
  truncated: boolean;
}

interface LookupPolicyResult {
  documents: Array<DocumentMetadata & {
    sections: Array<{ id: string; number: string | null; title: string | null }>;
    sectionCount?: number;
    sectionsTruncated?: boolean;
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
    policyNumber: sec.policyNumber,
    sectionNumber: sec.sectionNumber,
  };
}

/**
 * The tools page long section lists, so a listing may be partial: say so.
 * Keyed on the count, not `sectionsTruncated`, which is false on a last page.
 */
function sectionTally(doc: { sectionCount?: number; sectionsTruncated?: boolean }, shown: number): string {
  return doc.sectionCount !== undefined && doc.sectionCount > shown
    ? `showing ${shown} of ${doc.sectionCount}`
    : String(shown);
}

function extractGetDocument(result: GetDocumentResult): SourceEntry | null {
  const doc = result?.document;
  if (!doc) return null;

  const sections = doc.sections ?? [];
  const lines: string[] = [`[getDocument]`, formatDocMeta(doc)];
  if (sections.length > 0) {
    lines.push(`\nSections (${sectionTally(doc, sections.length)}):`);
    for (const s of sections) {
      const num = s.number ? `${s.number} ` : '';
      const chars = s.chars != null ? ` (${s.chars} chars)` : '';
      lines.push(`  ${num}${s.title || '(untitled)'}${chars} [${s.id}]`);
    }
  }

  return { toolName: 'getDocument', key: doc.id, text: lines.join('\n'), link: doc.url };
}

function extractGetAmendments(result: GetAmendmentsResult, toolCallId: string): SourceEntry | null {
  const document = result?.document;
  const amendments = result?.amendments ?? [];
  const amends = result?.amends ?? [];
  if (!document && amends.length === 0 && amendments.length === 0) return null;
  // Not the bare document id: a getDocument entry for the same document
  // carries that key, and entries are merged by key.
  const key = `amendments:${document?.id ?? toolCallId}`;

  const lines: string[] = [`[getAmendments]`];

  if (document) {
    lines.push(`Queried document:`);
    lines.push(formatDocMeta(document));
  }

  if (result?.latestAmendment) {
    lines.push(`\nLatest amendment:`);
    lines.push(formatDocMeta(result.latestAmendment));
  }

  if (amendments.length > 0) {
    lines.push(`\nAmendments (${amendments.length}${result?.truncated ? ', older ones omitted' : ''}):`);
    for (const a of amendments) {
      lines.push(`  - ${a.id} | ${a.title || '(no title)'} | ${a.effectiveDate || 'unknown date'}`);
      if (a.changeSummary) lines.push(`    Summary: ${a.changeSummary}`);
    }
  }

  // One line each: a notice can amend twenty or more manuals, and the entry
  // shares the evidence budget with section text.
  // No URL: this entry holds none of a manual's text, so it must not vouch
  // for a link to one. Reading the manual does.
  if (amends.length > 0) {
    lines.push(`\nAmends (${amends.length}):`);
    for (const d of amends) {
      lines.push(`  - ${d.id} | ${d.title || '(no title)'} | ${d.policyNumber || 'no policy number'}`);
    }
  }

  return { toolName: 'getAmendments', key, text: lines.join('\n'), link: document?.url ?? null };
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
      lines.push(`Sections (${sectionTally(doc, sections.length)}):`);
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

/** Tools whose entry is one corpus section's text. Mirrors `SECTION_TOOLS`
 *  in the evaluation judge (`packages/pipeline/src/pipeline/eval/evidence.py`). */
const SECTION_BODY_TOOLS = new Set(['getSection', 'resolveAnswerFrame:section']);

/** A research worker's verified summary. The report restates all of them, so
 *  each one is required evidence for the report-level check. */
export const RESEARCH_FINDING_TOOL = 'researchFinding';

/** The frame's routing entry: advice from the router, with no source text. */
const ROUTING_HINT_TOOL = 'resolveAnswerFrame';

/** True for an entry that can support a claim. The routing hint cannot, and
 *  it is present on every chat turn, so "some source has text" proves nothing. */
export function isCorpusEvidence(source: SourceEntry): boolean {
  return source.toolName !== ROUTING_HINT_TOOL && source.text.trim().length > 0;
}

export interface VerifierEvidence {
  text: string;
  /** Entries left out because they did not fit the budget. */
  dropped: SourceEntry[];
  /** A dropped entry held section text the answer cites: the model cannot
   *  check those claims, so the caller must withhold. */
  citedBodyDropped: boolean;
  /** A research finding was dropped: a report must never be checked against
   *  part of its own findings, so the caller must withhold. */
  findingDropped: boolean;
}

export function buildSourceText(
  sources: SourceEntry[],
  answerText: string,
  maxChars?: number,
): VerifierEvidence {
  if (sources.length === 0) return { text: NO_SOURCES_TEXT, dropped: [], citedBodyDropped: false, findingDropped: false };

  const limit = maxChars ?? getConfig().maxSourceChars;

  // Answers cite via markdown links (raw section IDs are forbidden by the
  // system prompt). "Cited" must agree with validateAnswerUrls: a source is
  // cited when the answer uses any URL that source vouches for there, compared
  // after the same normalization. A raw substring test missed a link that
  // differed by host case, trailing slash or percent-encoding, and the body
  // was then dropped as uncited. The raw link and raw key checks stay as
  // fallbacks (ID-bearing CLI answers); every imprecision errs towards cited.
  // The link is the document's, so a cited document's listings count as cited
  // too: section text must claim the budget before them.
  const answerUrls = answerUrlSet(answerText);
  const isCited = (s: SourceEntry) => [...sourceUrlSet(s)].some(url => answerUrls.has(url))
    || (!!s.link && answerText.includes(s.link)) || answerText.includes(s.key);
  const isBody = (s: SourceEntry) => SECTION_BODY_TOOLS.has(s.toolName);
  // Research findings first, then cited section bodies, cited other entries,
  // uncited bodies, the rest, and the routing hint last; tool-call order
  // within each group. The hint lists the URL of every section the router
  // chose, so it would otherwise count as cited on nearly every answer and
  // take budget ahead of real evidence.
  const tier = (s: SourceEntry) => s.toolName === RESEARCH_FINDING_TOOL ? 0
    : s.toolName === ROUTING_HINT_TOOL ? 5
    : 1 + (isCited(s) ? 0 : 2) + (isBody(s) ? 0 : 1);
  const ordered = sources.map((source, index) => ({ source, index, tier: tier(source) }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index);

  const parts: string[] = [];
  const dropped: SourceEntry[] = [];
  let citedBodyDropped = false;
  let findingDropped = false;
  let total = 0;

  for (const { source: s, tier: sourceTier } of ordered) {
    const evidence = s.evidenceRole === 'supplementary'
      ? JSON.stringify({ evidenceRole: 'supplementary', url: s.link, excerpt: s.text })
      : s.text;
    const block = evidence + '\n\n---\n\n';
    // Skip an entry that does not fit and keep going: a later, smaller entry may.
    if (total + block.length > limit) {
      dropped.push(s);
      if (sourceTier === 0) findingDropped = true;
      if (sourceTier === 1) citedBodyDropped = true;
      continue;
    }
    parts.push(block);
    total += block.length;
  }
  if (dropped.length > 0) {
    parts.push(`[${dropped.length} source(s) omitted for length; claims that depend on omitted sources are unsupported.]`);
  }

  return { text: parts.join('').trimEnd(), dropped, citedBodyDropped, findingDropped };
}
