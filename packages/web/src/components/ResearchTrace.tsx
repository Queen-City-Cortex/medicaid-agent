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

export function ResearchTrace({ entries, live = false }: ResearchTraceProps) {
  if (entries.length === 0) return null;

  return (
    <div data-testid="research-trace" className="space-y-1">
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
