'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Search, FileText, ClipboardList, Link, ArrowUpRight, FilePen, Tag, BookOpen, Scale, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getToolName, type ToolMessagePart } from '@/lib/message-parts';
import { cn } from '@/lib/utils';

const TOOL_DESCRIPTORS: Record<string, { label: string; Icon: LucideIcon }> = {
  resolveAnswerFrame: { label: 'Planning evidence', Icon: Scale },
  searchSections: { label: 'Searching policies', Icon: Search },
  getSection: { label: 'Reading section', Icon: FileText },
  getDocument: { label: 'Loading document', Icon: ClipboardList },
  getSectionContext: { label: 'Checking hierarchy', Icon: Link },
  followReferences: { label: 'Following references', Icon: ArrowUpRight },
  getAmendments: { label: 'Checking amendments', Icon: FilePen },
  findConceptSections: { label: 'Finding concepts', Icon: Tag },
  lookupPolicy: { label: 'Looking up policy', Icon: BookOpen },
};

const FALLBACK_TOOL_LABEL = 'Researching sources';
const FALLBACK_TOOL_ICON = Search;

/** Exported for the live progress narration in MessageList. */
export function getToolDescriptor(toolName: string): { label: string; Icon: LucideIcon } {
  return TOOL_DESCRIPTORS[toolName] ?? { label: FALLBACK_TOOL_LABEL, Icon: FALLBACK_TOOL_ICON };
}

function isRunningState(state: string | undefined): boolean {
  return state === 'input-streaming' || state === 'input-available';
}

function isCompletedState(state: string | undefined): boolean {
  return state === 'output-available';
}

function isErrorState(state: string | undefined): boolean {
  return state === 'output-error';
}

function truncate(text: string, max = 120): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** A capped or paged listing: "100 of 2,164 sections" when only part was returned. */
function partialCountLabel(shown: number, total: number | undefined, singular: string): string {
  if (total === undefined || total === shown) return countLabel(shown, singular);
  return `${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} ${singular}s`;
}

/** Exported for the live progress narration in MessageList. */
export function summarizeToolInput(toolName: string, input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;

  switch (toolName) {
    case 'resolveAnswerFrame': {
      const { query, questionType } = input as { query?: unknown; questionType?: unknown };
      if (typeof query !== 'string') return null;
      if (typeof questionType === 'string' && questionType.length > 0) {
        return `Question type: ${questionType}; query: "${truncate(query)}"`;
      }
      return `Query: "${truncate(query)}"`;
    }
    case 'searchSections': {
      const { query, documentTypes, topK } = input as {
        query?: unknown;
        documentTypes?: unknown;
        topK?: unknown;
      };
      const parts: string[] = [];
      if (typeof query === 'string') parts.push(`Query: "${truncate(query)}"`);
      if (Array.isArray(documentTypes) && documentTypes.length > 0) {
        parts.push(`Types: ${documentTypes.join(', ')}`);
      }
      if (typeof topK === 'number') parts.push(`Top K: ${topK}`);
      return parts.join(' | ') || null;
    }
    case 'getSection':
    case 'getSectionContext':
    case 'followReferences': {
      const { sectionId } = input as { sectionId?: unknown };
      return typeof sectionId === 'string' ? `Section: ${sectionId}` : null;
    }
    case 'getDocument':
    case 'getAmendments': {
      const { documentId } = input as { documentId?: unknown };
      return typeof documentId === 'string' ? `Document: ${documentId}` : null;
    }
    case 'findConceptSections': {
      const { conceptName, relationshipType } = input as {
        conceptName?: unknown;
        relationshipType?: unknown;
      };
      if (typeof conceptName !== 'string') return null;
      if (typeof relationshipType === 'string' && relationshipType.length > 0) {
        return `Concept: ${conceptName} (${relationshipType})`;
      }
      return `Concept: ${conceptName}`;
    }
    case 'lookupPolicy': {
      const { policyNumber } = input as { policyNumber?: unknown };
      return typeof policyNumber === 'string' ? `Policy: ${policyNumber}` : null;
    }
    default:
      return null;
  }
}

function summarizeToolOutput(toolName: string, output: unknown): string | null {
  if (!output || typeof output !== 'object') return null;

  switch (toolName) {
    case 'resolveAnswerFrame': {
      const { frame } = output as {
        frame?: {
          route?: { lane?: string | null };
          authoritativeDocuments?: unknown[];
          primarySections?: unknown[];
          supportingSections?: unknown[];
        };
      };
      if (!frame) return null;
      const parts: string[] = [];
      if (typeof frame.route?.lane === 'string') parts.push(`Route: ${frame.route.lane}`);
      if (Array.isArray(frame.authoritativeDocuments)) {
        parts.push(countLabel(frame.authoritativeDocuments.length, 'authoritative document'));
      }
      if (Array.isArray(frame.primarySections)) {
        parts.push(countLabel(frame.primarySections.length, 'primary section'));
      }
      if (Array.isArray(frame.supportingSections)) {
        parts.push(countLabel(frame.supportingSections.length, 'supporting section'));
      }
      return parts.join(' | ') || null;
    }
    case 'searchSections': {
      const { sections } = output as { sections?: Array<{ title?: string | null; policyNumber?: string | null }> };
      if (!Array.isArray(sections)) return null;
      const first = sections[0];
      const headline = first?.title ? truncate(first.title) : null;
      const policy = first?.policyNumber ? ` (${first.policyNumber})` : '';
      return headline
        ? `${countLabel(sections.length, 'matching section')}; first hit: ${headline}${policy}`
        : countLabel(sections.length, 'matching section');
    }
    case 'getSection': {
      const { section } = output as { section?: { title?: string | null; sectionNumber?: string | null; policyNumber?: string | null } | null };
      if (!section) return 'No section found.';
      const label = [section.sectionNumber, section.title].filter(Boolean).join(' ').trim();
      if (label) {
        return section.policyNumber ? `${label} (${section.policyNumber})` : label;
      }
      return 'Loaded section details.';
    }
    case 'getDocument': {
      const { document } = output as { document?: { title?: string | null; policyNumber?: string | null; sections?: unknown[]; sectionCount?: number } | null };
      if (!document) return 'No document found.';
      const title = document.title ?? document.policyNumber ?? 'Loaded document';
      const sectionCount = Array.isArray(document.sections) ? ` | ${partialCountLabel(document.sections.length, document.sectionCount, 'section')}` : '';
      return `${title}${sectionCount}`;
    }
    case 'getSectionContext': {
      const { ancestors, siblings, children } = output as {
        ancestors?: unknown[];
        siblings?: unknown[];
        children?: unknown[];
      };
      const parts: string[] = [];
      if (Array.isArray(ancestors)) parts.push(countLabel(ancestors.length, 'ancestor'));
      if (Array.isArray(siblings)) parts.push(countLabel(siblings.length, 'sibling'));
      if (Array.isArray(children)) parts.push(countLabel(children.length, 'child', 'children'));
      return parts.join(' | ') || null;
    }
    case 'followReferences': {
      const { references } = output as { references?: unknown[] };
      return Array.isArray(references) ? countLabel(references.length, 'cross-reference') : null;
    }
    case 'getAmendments': {
      const { amendments, authoritativeDocument } = output as {
        amendments?: unknown[];
        authoritativeDocument?: { title?: string | null; policyNumber?: string | null } | null;
      };
      const parts: string[] = [];
      if (Array.isArray(amendments)) parts.push(countLabel(amendments.length, 'amendment'));
      const authoritativeLabel = authoritativeDocument?.title ?? authoritativeDocument?.policyNumber;
      if (authoritativeLabel) parts.push(`Current document: ${authoritativeLabel}`);
      return parts.join(' | ') || null;
    }
    case 'findConceptSections': {
      const { sections, total } = output as { sections?: unknown[]; total?: number };
      return Array.isArray(sections) ? partialCountLabel(sections.length, total, 'linked section') : null;
    }
    case 'lookupPolicy': {
      const { documents } = output as { documents?: Array<{ title?: string | null; policyNumber?: string | null }> };
      if (!Array.isArray(documents)) return null;
      const first = documents[0];
      const headline = first?.policyNumber ?? first?.title;
      return headline
        ? `${countLabel(documents.length, 'matching document')}; first hit: ${truncate(headline)}`
        : countLabel(documents.length, 'matching document');
    }
    default:
      return null;
  }
}

function formatJson(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function PayloadSection({ title, body }: { title: string; body: string }) {
  if (!body) return null;

  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <pre className="overflow-x-auto rounded-md bg-background px-3 py-2 text-[11px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
        {body}
      </pre>
    </div>
  );
}

export interface ToolStepProps {
  part: ToolMessagePart;
}

export function ToolStep({ part }: ToolStepProps) {
  const toolName = getToolName(part);
  const { label, Icon } = getToolDescriptor(toolName);
  const input = part.input;
  const output = part.output;
  const inputSummary = summarizeToolInput(toolName, input);
  const outputSummary = summarizeToolOutput(toolName, output);
  const running = isRunningState(part.state);
  const completed = isCompletedState(part.state);
  const failed = isErrorState(part.state);
  const statusLabel = running ? 'Running' : completed ? 'Done' : failed ? 'Failed' : 'Pending';

  // Track open state so the (potentially large) raw payloads are only
  // stringified while the panel is actually open — formatJson on every render
  // of a closed panel was wasted work on every stream chunk.
  const [open, setOpen] = useState(false);
  const inputJson = useMemo(
    () => (open && input !== undefined ? formatJson(input) : ''),
    [open, input],
  );
  const outputJson = useMemo(
    () => (open && output !== undefined ? formatJson(output) : ''),
    [open, output],
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div data-testid="tool-step" className="my-3">
        <CollapsibleTrigger
          data-testid="tool-step-trigger"
          className={cn(
            'group flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors',
            failed
              ? 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10'
              : 'border-border/70 bg-muted/35 hover:bg-muted/55',
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            {running ? (
              <span className="inline-block size-4 shrink-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            ) : failed ? (
              <TriangleAlert className="size-4 shrink-0 text-destructive" />
            ) : (
              <Icon className="size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{label}</div>
              <div className={cn('font-mono text-[10px] uppercase tracking-[0.14em]', failed ? 'text-destructive' : 'text-muted-foreground')}>{statusLabel}</div>
            </div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
        </CollapsibleTrigger>

        <CollapsibleContent
          data-testid="tool-step-details"
          className="mt-2 space-y-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3"
        >
          <div className="space-y-2 text-sm text-foreground">
            {inputSummary && (
              <div data-testid="tool-step-input-summary" className="leading-relaxed">
                <span className="font-medium">Input:</span> {inputSummary}
              </div>
            )}
            {outputSummary && (
              <div data-testid="tool-step-output-summary" className="leading-relaxed">
                <span className="font-medium">Result:</span> {outputSummary}
              </div>
            )}
            {!inputSummary && !outputSummary && !failed && (
              <div className="text-sm text-muted-foreground">
                {toolName === 'unknown'
                  ? 'Showing raw tool details.'
                  : `Showing raw details for ${label.toLowerCase()}.`}
              </div>
            )}
          </div>

          {failed && (
            <div
              data-testid="tool-step-error"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive whitespace-pre-wrap break-words"
            >
              <span className="font-medium">Error:</span>{' '}
              {part.errorText?.trim() || 'The tool call failed without an error message.'}
            </div>
          )}

          {inputJson && <PayloadSection title="Raw input" body={inputJson} />}
          {outputJson && <PayloadSection title="Raw result" body={outputJson} />}
          {output === undefined && running && (
            <div className="text-xs text-muted-foreground">Waiting for the tool result.</div>
          )}
          {toolName === 'unknown' && (
            <div className={cn('text-xs text-muted-foreground', output !== undefined && 'pt-1')}>
              Tool name: {getToolName(part)}
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
