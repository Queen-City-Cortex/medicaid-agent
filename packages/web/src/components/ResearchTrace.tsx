'use client';

import { Wrench } from 'lucide-react';

const TOOLS: Record<string, { label: string; icon: string }> = {
  searchSections: { label: 'Searching policies', icon: '🔍' },
  getSection: { label: 'Reading section', icon: '📄' },
  getDocument: { label: 'Loading document', icon: '📋' },
  getSectionContext: { label: 'Checking hierarchy', icon: '🔗' },
  followReferences: { label: 'Following references', icon: '↗' },
  getAmendments: { label: 'Checking amendments', icon: '📝' },
  findConceptSections: { label: 'Finding concepts', icon: '🏷' },
  lookupPolicy: { label: 'Looking up policy', icon: '📖' },
};

export type TraceEntry =
  | { type: 'tool'; toolName: string; toolCallId: string; state: string }
  | { type: 'reasoning'; text: string };

interface ResearchTraceProps {
  entries: TraceEntry[];
  live?: boolean;
}

function deriveStatus(entries: TraceEntry[]): string | null {
  const inFlight = entries.filter(
    (e): e is TraceEntry & { type: 'tool' } =>
      e.type === 'tool' && (e.state === 'input-streaming' || e.state === 'input-available'),
  );

  if (inFlight.length > 0) {
    // Group by tool name and pick the most common active tool
    const counts = new Map<string, number>();
    for (const t of inFlight) {
      counts.set(t.toolName, (counts.get(t.toolName) || 0) + 1);
    }
    // Show the first active tool with count
    const [toolName, count] = [...counts.entries()][0];
    const label = TOOLS[toolName]?.label || toolName;
    return count > 1 ? `${label} (${count})...` : `${label}...`;
  }

  // All tools done — agent is composing its answer
  if (entries.some((e) => e.type === 'tool')) {
    return 'Composing answer...';
  }

  return null;
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
        if (entry.type === 'tool') {
          const isRunning = entry.state === 'input-streaming' || entry.state === 'input-available';
          return (
            <div key={entry.toolCallId ?? i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {isRunning && live ? (
                <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : TOOLS[entry.toolName]?.icon ? (
                <span>{TOOLS[entry.toolName].icon}</span>
              ) : (
                <Wrench className="w-3 h-3 text-muted-foreground" />
              )}
              <span>{TOOLS[entry.toolName]?.label || entry.toolName}</span>
            </div>
          );
        }

        return (
          <p key={i} className="text-sm text-muted-foreground italic">
            {entry.text}
          </p>
        );
      })}
    </div>
  );
}
