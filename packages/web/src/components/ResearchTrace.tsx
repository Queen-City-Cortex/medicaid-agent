'use client';

import { Search, FileText, ClipboardList, Link, ArrowUpRight, FilePen, Tag, BookOpen, type LucideIcon } from 'lucide-react';

const TOOLS: Record<string, { label: string; Icon: LucideIcon }> = {
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

export type TraceEntry = {
  type: 'tool';
  toolName: string;
  toolCallId: string;
  state: string;
  count?: number;
};

interface ResearchTraceProps {
  entries: TraceEntry[];
  live?: boolean;
}

function deriveStatus(entries: TraceEntry[]): string | null {
  const inFlight = entries.filter(
    (e) => e.state === 'input-streaming' || e.state === 'input-available',
  );

  if (inFlight.length > 0) {
    // Group by tool name and pick the most common active tool
    const counts = new Map<string, number>();
    for (const t of inFlight) {
      counts.set(t.toolName, (counts.get(t.toolName) || 0) + (t.count ?? 1));
    }
    // Show the first active tool with count
    const [toolName, count] = [...counts.entries()][0];
    const label = getToolDescriptor(toolName).label;
    return count > 1 ? `${label} (${count})...` : `${label}...`;
  }

  // All tools done — agent is composing its answer
  if (entries.length > 0) {
    return 'Composing answer...';
  }

  return null;
}

function getToolDescriptor(toolName: string): { label: string; Icon: LucideIcon } {
  return TOOLS[toolName] ?? { label: FALLBACK_TOOL_LABEL, Icon: FALLBACK_TOOL_ICON };
}

export function ResearchTrace({ entries, live = false }: ResearchTraceProps) {
  if (entries.length === 0) return null;

  const status = live ? deriveStatus(entries) : null;

  return (
    <div data-testid="research-trace" className="space-y-1">
      {status && (
        <div className="flex items-center gap-2 text-xs font-medium text-accent mb-1.5">
          <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          {status}
        </div>
      )}
      {entries.map((entry, i) => {
        const isRunning = entry.state === 'input-streaming' || entry.state === 'input-available';
        const { label, Icon: ToolIcon } = getToolDescriptor(entry.toolName);
        const displayLabel = entry.count && entry.count > 1 ? `${label} (${entry.count})` : label;

        return (
          <div key={entry.toolCallId ?? i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isRunning && live ? (
              <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            ) : (
              <ToolIcon className="w-3 h-3" />
            )}
            <span>{displayLabel}</span>
          </div>
        );
      })}
    </div>
  );
}
