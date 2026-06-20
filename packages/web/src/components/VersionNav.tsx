'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface VersionNavProps {
  /** 1-based index of the currently displayed version. */
  current: number;
  /** Total number of versions available (including the live one). */
  total: number;
  onSelect: (version: number) => void;
  className?: string;
}

/**
 * `< Answer N of M >` pager rendered above a re-run-able assistant message
 * when the user has earlier versions archived. Rendered only when `total > 1`;
 * otherwise there's nothing to navigate.
 */
export function VersionNav({ current, total, onSelect, className }: VersionNavProps) {
  if (total <= 1) return null;
  const canPrev = current > 1;
  const canNext = current < total;

  return (
    <div
      data-testid="version-nav"
      // Earlier answers live only in client state — say so on hover rather
      // than leaving the pager's lifetime a mystery.
      title="Earlier answers are kept only for this session"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground',
        className,
      )}
    >
      <button
        type="button"
        data-testid="version-prev"
        aria-label="Previous answer"
        disabled={!canPrev}
        onClick={() => canPrev && onSelect(current - 1)}
        className="inline-flex size-5 items-center justify-center rounded-full transition-colors hover:bg-foreground/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronLeft className="size-3.5" />
      </button>
      <span
        data-testid="version-indicator"
        aria-live="polite"
        className="font-mono text-[11px] uppercase tracking-wide tabular-nums text-foreground/75"
      >
        Answer {current} of {total}
      </span>
      <button
        type="button"
        data-testid="version-next"
        aria-label="Next answer"
        disabled={!canNext}
        onClick={() => canNext && onSelect(current + 1)}
        className="inline-flex size-5 items-center justify-center rounded-full transition-colors hover:bg-foreground/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );
}
