'use client';

import { ChevronRight, ExternalLink } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { MessageSource } from '@/lib/message-parts';

export interface SourcesPanelProps {
  sources: MessageSource[];
}

function countLabel(count: number): string {
  return `${count} source${count === 1 ? '' : 's'}`;
}

export function SourcesPanel({ sources }: SourcesPanelProps) {
  if (sources.length === 0) return null;

  return (
    <Collapsible>
      <div data-testid="sources-panel" className="mt-4">
        <CollapsibleTrigger
          data-testid="sources-panel-trigger"
          className="group flex w-full items-center justify-between rounded-xl border border-border/70 bg-muted/25 px-4 py-3 text-left transition-colors hover:bg-muted/45"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">Sources</div>
              <div className="text-xs text-muted-foreground">{countLabel(sources.length)}</div>
            </div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
        </CollapsibleTrigger>

        <CollapsibleContent
          data-testid="sources-panel-list"
          className="mt-2 rounded-xl border border-border/70 bg-muted/15 px-4 py-3"
        >
          <ul className="space-y-2">
            {sources.map((source) => (
              <li key={source.key} data-testid="source-item" className="min-w-0">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-w-0 items-start gap-2 text-sm text-foreground hover:text-accent"
                >
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium underline-offset-2 group-hover:underline">
                      {source.label}
                    </span>
                    {source.title && (
                      <span className="block text-xs text-muted-foreground">{source.title}</span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
