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

function sectionLabel(policy: string | null, section: string | null, title: string | null): string {
  if (policy && section) return `Policy ${policy} § ${section}`;
  if (policy) return `Policy ${policy}`;
  if (section) return `§ ${section}`;
  return title ?? 'Policy section';
}

function documentLabel(policy: string | null, title: string | null): string {
  if (policy) return `Policy ${policy}`;
  return title ?? 'Policy document';
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

  return Array.from(sources.values());
}
