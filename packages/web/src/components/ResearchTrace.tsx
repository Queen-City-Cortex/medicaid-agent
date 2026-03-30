'use client';

type TimelineEntry =
  | { type: 'reasoning'; text: string }
  | { type: 'tool'; name: string; status: 'running' | 'done' };

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

interface ResearchTraceProps {
  timeline: TimelineEntry[];
  live?: boolean;
}

export { type TimelineEntry };

export function ResearchTrace({ timeline, live = false }: ResearchTraceProps) {
  if (timeline.length === 0) return null;

  return (
    <div data-testid="research-trace" className={`space-y-1 ${live ? 'animate-in fade-in duration-300' : ''}`}>
      {timeline.map((entry, i) => (
        entry.type === 'tool' ? (
          <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
            {entry.status === 'running' && live ? (
              <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>{TOOLS[entry.name]?.icon || '·'}</span>
            )}
            <span>{TOOLS[entry.name]?.label || entry.name}</span>
          </div>
        ) : (
          <p key={i} className="text-sm text-muted-foreground/70 italic">
            {entry.text}
          </p>
        )
      ))}
    </div>
  );
}
