'use client';

type TimelineEntry =
  | { type: 'reasoning'; text: string }
  | { type: 'tool'; name: string; status: 'running' | 'done' };

const TOOL_LABELS: Record<string, string> = {
  searchSections: 'Searching policies',
  getSection: 'Reading section',
  getDocument: 'Loading document',
  getSectionContext: 'Checking hierarchy',
  followReferences: 'Following references',
  getAmendments: 'Checking amendments',
  findConceptSections: 'Finding concepts',
  lookupPolicy: 'Looking up policy',
};

const TOOL_ICONS: Record<string, string> = {
  searchSections: '🔍',
  getSection: '📄',
  getDocument: '📋',
  getSectionContext: '🔗',
  followReferences: '↗',
  getAmendments: '📝',
  findConceptSections: '🏷',
  lookupPolicy: '📖',
};

interface ResearchTraceProps {
  timeline: TimelineEntry[];
  live?: boolean;
}

export { type TimelineEntry, TOOL_LABELS, TOOL_ICONS };

export function ResearchTrace({ timeline, live = false }: ResearchTraceProps) {
  if (timeline.length === 0) return null;

  return (
    <div className={`border-l-2 ${live ? 'border-accent/40' : 'border-border'} pl-4 py-1 space-y-1 ${live ? 'animate-in fade-in duration-300' : ''}`}>
      {timeline.map((entry, i) => (
        entry.type === 'tool' ? (
          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
            {entry.status === 'running' && live ? (
              <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="opacity-50">{TOOL_ICONS[entry.name] || '·'}</span>
            )}
            <span>{TOOL_LABELS[entry.name] || entry.name}</span>
          </div>
        ) : (
          <p key={i} className="text-xs text-muted-foreground/60 italic">
            {entry.text}
          </p>
        )
      ))}
    </div>
  );
}
