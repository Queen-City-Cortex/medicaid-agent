import type { UIMessage } from 'ai';

export type ToolMessagePart = {
  type: string;
  toolName?: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
};

type TextMessagePart = {
  type: 'text';
  text: string;
};

/** Check if a message part is a tool invocation (static `tool-<name>` or dynamic `dynamic-tool`). */
export function isToolPart(part: { type: string }): part is ToolMessagePart {
  return part.type === 'dynamic-tool' || (part.type.startsWith('tool-') && part.type !== 'tool-output');
}

/** Extract the tool name from a tool part's type. */
export function getToolName(part: { type: string; toolName?: string }): string {
  if (part.toolName) return part.toolName;
  // Static tool parts have type "tool-<name>"
  if (part.type.startsWith('tool-')) return part.type.slice(5);
  return 'unknown';
}

export function isTextPart(part: { type: string; text?: string }): part is TextMessagePart {
  return part.type === 'text' && typeof part.text === 'string';
}

export function hasRenderableAssistantPart(parts: UIMessage['parts']): boolean {
  return parts.some((part) => isToolPart(part) || (isTextPart(part) && part.text.trim().length > 0));
}

export function getTrailingAssistantText(msg: UIMessage): string {
  const parts = msg.parts ?? [];
  let lastToolIndex = -1;

  for (let index = parts.length - 1; index >= 0; index--) {
    if (isToolPart(parts[index])) {
      lastToolIndex = index;
      break;
    }
  }

  const trailingText: string[] = [];

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (!isTextPart(part) || part.text.trim().length === 0) continue;
    if (lastToolIndex !== -1 && index <= lastToolIndex) continue;
    trailingText.push(part.text);
  }

  return trailingText.join('');
}

// ─── Verification state extraction ──────────────────────────────────────────

export type VerificationSeverity = 'high' | 'medium' | 'low';

export interface VerificationState {
  severity: VerificationSeverity;
  /** 0..1 */
  confidence: number;
  /** True when the verifier rewrote the answer; false for the no-rewrite happy path. */
  rewrote: boolean;
  counts: {
    unsupported: number;
    missingCitation: number;
    relevanceMajor: number;
    relevanceMinor: number;
  };
  pureMarkerFallback: boolean;
}

const REWRITE_PART_TYPE = 'data-verification-rewrite';
const OK_PART_TYPE = 'data-verification-ok';

function coerceCounts(raw: unknown): VerificationState['counts'] {
  const counts = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    unsupported: n(counts.unsupported),
    missingCitation: n(counts.missingCitation),
    relevanceMajor: n(counts.relevanceMajor),
    relevanceMinor: n(counts.relevanceMinor),
  };
}

/**
 * Pull the verifier's per-message confidence state out of the streamed
 * `data-verification-*` events the agent emits. Returns null when the verifier
 * didn't run (e.g., VERIFIER_ENABLED=false, empty text).
 *
 * Prefers a `data-verification-rewrite` part over a `data-verification-ok`
 * part — both should never appear together, but if they do, rewrite wins
 * because it means the verifier found something worth surfacing.
 */
export function extractVerificationState(msg: UIMessage): VerificationState | null {
  const parts = (msg.parts ?? []) as Array<{ type?: string; data?: Record<string, unknown> }>;
  let ok: VerificationState | null = null;
  for (const part of parts) {
    const data = part.data ?? {};
    const severity = data.severity;
    const confidence = typeof data.confidence === 'number' ? data.confidence : NaN;
    if (!Number.isFinite(confidence) || (severity !== 'high' && severity !== 'medium' && severity !== 'low')) {
      continue;
    }
    if (part.type === REWRITE_PART_TYPE) {
      return {
        severity,
        confidence,
        rewrote: true,
        counts: coerceCounts(data.counts),
        pureMarkerFallback: !!data.pureMarkerFallback,
      };
    }
    if (part.type === OK_PART_TYPE) {
      ok = {
        severity,
        confidence,
        rewrote: false,
        counts: coerceCounts(data.counts),
        pureMarkerFallback: false,
      };
    }
  }
  return ok;
}

// ─── Source extraction ───────────────────────────────────────────────────────

export type MessageSource = {
  /** Stable key for dedupe + React keys. */
  key: string;
  /** User-facing primary label, e.g. "Policy 8C § 3.2.1" or "42 CFR § 441.301". */
  label: string;
  /** Secondary line: document title when different from the label. */
  title: string | null;
  /** Clickable target. Null sources are filtered out by extractMessageSources. */
  url: string;
  /** Tool that surfaced this source — drives the small origin badge in the panel. */
  originTool: string;
  /** Preserved section number (e.g. "3.2.1" or "Attachment A") when known. Null for doc-level entries. Used for natural-order sorting. */
  sectionNumber: string | null;
};

type SectionLike = {
  id?: unknown;
  title?: unknown;
  sectionNumber?: unknown;
  policyNumber?: unknown;
  url?: unknown;
};

type DocumentLike = {
  id?: unknown;
  title?: unknown;
  policyNumber?: unknown;
  url?: unknown;
};

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Canonicalize a citation URL so that "same document, different
 * surface-form" URLs collapse to one key. Used for both source
 * deduplication (via the key) and matching inline agent-emitted citation
 * links to their Sources-panel entry (footnote numbering).
 */
export function normalizeCitationUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, '');
    // DHHS policy PDFs sometimes carry `?attachment`; strip that flag so
    // links with and without it collapse together.
    let query = parsed.search;
    if (query === '?attachment' || query.toLowerCase() === '?format=pdf') query = '';
    return `${parsed.protocol}//${host}${path}${query}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

/**
 * Build a `normalizedUrl -> 1-indexed source number` map so inline
 * markdown citations in the answer body can be decorated with a footnote
 * superscript that matches the Sources-panel row.
 */
export function buildSourceIndex(sources: MessageSource[]): Map<string, number> {
  const index = new Map<string, number>();
  sources.forEach((source, i) => {
    const normalized = normalizeCitationUrl(source.url);
    if (normalized && !index.has(normalized)) {
      index.set(normalized, i + 1);
    }
  });
  return index;
}

function sectionLabel(policy: string | null, section: string | null, title: string | null): string {
  if (policy && section) {
    // `§` is the legal-typography section-sign — valid only for numeric
    // section numbers. Non-numeric section handles like "Attachment A" take
    // an em-dash instead so the label reads correctly to a policy reader.
    const numeric = /^\d/.test(section);
    return numeric ? `Policy ${policy} § ${section}` : `Policy ${policy} — ${section}`;
  }
  if (policy) return `Policy ${policy}`;
  if (section) {
    const numeric = /^\d/.test(section);
    return numeric ? `§ ${section}` : section;
  }
  return title ?? 'Policy section';
}

function documentLabel(policy: string | null, title: string | null): string {
  if (policy) return `Policy ${policy}`;
  return title ?? 'Policy document';
}

/**
 * Two documents sharing the same label (e.g. both "Policy 8C" because 8C
 * has a main PDF and a CPT-codes attachment) are legitimately distinct —
 * they have different URLs — but a user can't tell them apart at a glance.
 * Extract a short disambiguator from the URL path when labels collide.
 */
function urlDisambiguator(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    // Walk from the end, skipping generic tail segments like "download".
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (seg.toLowerCase() === 'download') continue;
      return seg;
    }
    return segments[segments.length - 1];
  } catch {
    return null;
  }
}

/**
 * Natural-ordering comparator for section numbers: "1.0" < "3.2.1" <
 * "4.2.1.1" < "Attachment A". Document-level entries (null sectionNumber)
 * sort LAST so the reader scans specific citations first.
 */
function compareSectionNumbers(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // nulls (doc-level) last
  if (b === null) return -1;

  const aSegments = a.split('.');
  const bSegments = b.split('.');
  const len = Math.max(aSegments.length, bSegments.length);
  for (let i = 0; i < len; i++) {
    const aSeg = aSegments[i];
    const bSeg = bSegments[i];
    if (aSeg === undefined) return -1; // shorter path sorts first among matching prefix
    if (bSeg === undefined) return 1;
    const aNum = Number(aSeg);
    const bNum = Number(bSeg);
    const aIsNum = Number.isFinite(aNum);
    const bIsNum = Number.isFinite(bNum);
    if (aIsNum && bIsNum) {
      if (aNum !== bNum) return aNum - bNum;
    } else if (aIsNum !== bIsNum) {
      return aIsNum ? -1 : 1; // numeric before non-numeric (so "4.1" before "Attachment A")
    } else if (aSeg !== bSeg) {
      return aSeg.localeCompare(bSeg);
    }
  }
  return 0;
}

function disambiguateLabels(sources: MessageSource[]): MessageSource[] {
  const byLabel = new Map<string, MessageSource[]>();
  for (const source of sources) {
    const bucket = byLabel.get(source.label) ?? [];
    bucket.push(source);
    byLabel.set(source.label, bucket);
  }
  return sources.map((source) => {
    const colliders = byLabel.get(source.label) ?? [];
    if (colliders.length < 2) return source;
    const disambig = urlDisambiguator(source.url);
    if (!disambig) return source;
    return { ...source, label: `${source.label} (${disambig})` };
  });
}

function addSectionSource(
  accumulator: Map<string, MessageSource>,
  section: SectionLike | null | undefined,
  originTool: string,
) {
  if (!section || typeof section !== 'object') return;
  const url = str(section.url);
  if (!url) return;
  const policy = str(section.policyNumber);
  const sectionNumber = str(section.sectionNumber);
  const title = str(section.title);
  const label = sectionLabel(policy, sectionNumber, title);
  const key = `${url}|${policy ?? ''}|${sectionNumber ?? ''}`;
  if (accumulator.has(key)) return;
  accumulator.set(key, {
    key,
    label,
    title: title && title !== label ? title : null,
    url,
    originTool,
    sectionNumber,
  });
}

function addDocumentSource(
  accumulator: Map<string, MessageSource>,
  doc: DocumentLike | null | undefined,
  originTool: string,
) {
  if (!doc || typeof doc !== 'object') return;
  const url = str(doc.url);
  if (!url) return;
  const policy = str(doc.policyNumber);
  const title = str(doc.title);
  const label = documentLabel(policy, title);
  const key = `${url}|${policy ?? ''}|doc`;
  if (accumulator.has(key)) return;
  accumulator.set(key, {
    key,
    label,
    title: title && title !== label ? title : null,
    url,
    originTool,
    sectionNumber: null,
  });
}

/**
 * Walk the tool results in an assistant message and return a deduplicated
 * list of the policy sections / documents the agent actually consulted. The
 * Sources panel renders this list so the user can click through to source
 * PDFs — a first-class requirement for legal-aid users who must verify
 * every claim against the authoritative policy text.
 */
export function extractMessageSources(msg: UIMessage): MessageSource[] {
  const parts = msg.parts ?? [];
  const sources = new Map<string, MessageSource>();

  for (const part of parts) {
    if (!isToolPart(part)) continue;
    const toolName = getToolName(part);
    const output = part.output;
    if (!output || typeof output !== 'object') continue;

    // Each tool exposes its own output shape; handle the ones that carry URLs.
    switch (toolName) {
      case 'getSection': {
        const { section } = output as { section?: SectionLike | null };
        addSectionSource(sources, section, toolName);
        break;
      }
      case 'searchSections': {
        const { sections } = output as { sections?: SectionLike[] };
        if (Array.isArray(sections)) {
          for (const section of sections) addSectionSource(sources, section, toolName);
        }
        break;
      }
      case 'findConceptSections': {
        const { sections } = output as { sections?: SectionLike[] };
        if (Array.isArray(sections)) {
          for (const section of sections) addSectionSource(sources, section, toolName);
        }
        break;
      }
      case 'getDocument': {
        const { document } = output as { document?: DocumentLike | null };
        addDocumentSource(sources, document, toolName);
        break;
      }
      case 'lookupPolicy': {
        const { documents } = output as { documents?: DocumentLike[] };
        if (Array.isArray(documents)) {
          for (const doc of documents) addDocumentSource(sources, doc, toolName);
        }
        break;
      }
      case 'getAmendments': {
        const { amendments, authoritativeDocument, baseDocument } = output as {
          amendments?: DocumentLike[];
          authoritativeDocument?: DocumentLike | null;
          baseDocument?: DocumentLike | null;
        };
        addDocumentSource(sources, authoritativeDocument, toolName);
        addDocumentSource(sources, baseDocument, toolName);
        if (Array.isArray(amendments)) {
          for (const doc of amendments) addDocumentSource(sources, doc, toolName);
        }
        break;
      }
      case 'resolveAnswerFrame': {
        const { frame } = output as {
          frame?: {
            authoritativeDocuments?: DocumentLike[];
            primarySections?: SectionLike[];
            supportingSections?: SectionLike[];
          };
        };
        if (!frame) break;
        if (Array.isArray(frame.authoritativeDocuments)) {
          for (const doc of frame.authoritativeDocuments) addDocumentSource(sources, doc, toolName);
        }
        if (Array.isArray(frame.primarySections)) {
          for (const section of frame.primarySections) addSectionSource(sources, section, toolName);
        }
        if (Array.isArray(frame.supportingSections)) {
          for (const section of frame.supportingSections) addSectionSource(sources, section, toolName);
        }
        break;
      }
      default:
        break;
    }
  }

  const sorted = Array.from(sources.values()).sort((a, b) =>
    compareSectionNumbers(a.sectionNumber, b.sectionNumber),
  );
  return disambiguateLabels(sorted);
}
