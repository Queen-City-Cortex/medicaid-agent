'use client';

import { ChevronRight, ExternalLink } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { MessageSource, VerificationState } from '@/lib/message-parts';

export interface SourcesPanelProps {
  /** Sources in display order: cited entries first, then merely-consulted. */
  sources: MessageSource[];
  /** How many leading entries in `sources` are cited inline in the answer.
   *  Drives the "Cited in this answer" / "Also consulted" group split —
   *  presenting every search hit as a flat "12 sources" list undermines
   *  verifiability when only 3 back the answer. */
  citedCount?: number;
  /** Optional stable id for linking from inline citation footnotes. Scopes the DOM ids below so multiple panels on one page don't collide. */
  messageId?: string;
  /** Controlled open state. Lifted to the parent so inline footnotes can force the panel open when clicked. When omitted, falls back to uncontrolled behaviour. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Key of a source to highlight briefly (after a footnote click). */
  highlightedKey?: string | null;
  /** Verifier confidence state for the assistant message. When present, renders a small dot next to the Sources label with a tooltip explaining the score. */
  verification?: VerificationState | null;
}

function countLabel(count: number, citedCount: number | undefined): string {
  const total = `${count} source${count === 1 ? '' : 's'}`;
  if (citedCount === undefined || citedCount === 0 || citedCount === count) return total;
  return `${citedCount} cited · ${count - citedCount} consulted`;
}

/** Human label for how the agent surfaced a source. */
const ORIGIN_LABELS: Record<string, string> = {
  getSection: 'read',
  resolveAnswerFrame: 'evidence plan',
  searchSections: 'search result',
  findConceptSections: 'concept match',
  getDocument: 'looked up',
  lookupPolicy: 'looked up',
  getAmendments: 'amendment check',
};

// Dot color matches the project's existing feedback + alert tokens: emerald
// for positive signals (MessageActions), amber for warnings (endedWithoutAnswer
// notice), red for destructive / failure signals.
const DOT_CLASSES: Record<VerificationState['severity'], string> = {
  high: 'bg-emerald-500 dark:bg-emerald-400 ring-emerald-500/20 dark:ring-emerald-400/20',
  medium: 'bg-amber-500 dark:bg-amber-400 ring-amber-500/25 dark:ring-amber-400/25',
  low: 'bg-red-500 dark:bg-red-400 ring-red-500/25 dark:ring-red-400/25',
};

const DOT_SR_LABEL: Record<VerificationState['severity'], string> = {
  high: 'Verifier confidence: high',
  medium: 'Verifier confidence: medium',
  low: 'Verifier confidence: low',
};

function verificationTooltipLines(v: VerificationState): string[] {
  const pct = Math.round(v.confidence * 100);
  const header = `Verifier confidence: ${v.severity} (${pct}%)`;
  if (v.pureMarkerFallback) {
    return [header, 'Rewrite was empty — falling back to the original answer.'];
  }
  if (!v.rewrote) {
    return [header, 'All checks passed without rewrite.'];
  }
  const bits: string[] = [];
  if (v.counts.unsupported) bits.push(`${v.counts.unsupported} unsupported claim${v.counts.unsupported === 1 ? '' : 's'}`);
  if (v.counts.missingCitation) bits.push(`${v.counts.missingCitation} uncited claim${v.counts.missingCitation === 1 ? '' : 's'}`);
  if (v.counts.relevanceMajor) bits.push(`${v.counts.relevanceMajor} major relevance issue${v.counts.relevanceMajor === 1 ? '' : 's'}`);
  if (v.counts.relevanceMinor) bits.push(`${v.counts.relevanceMinor} minor relevance issue${v.counts.relevanceMinor === 1 ? '' : 's'}`);
  return bits.length ? [header, bits.join(' · ')] : [header, 'Verifier rewrote the answer.'];
}

interface ConfidenceDotProps {
  verification: VerificationState;
}

function ConfidenceDot({ verification }: ConfidenceDotProps) {
  const lines = verificationTooltipLines(verification);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          // Render as a span rather than the default button — SourcesPanel's
          // CollapsibleTrigger is itself a <button>, and nesting buttons is
          // invalid HTML. The dot is purely presentational (aria-hidden, not
          // focusable): a focusable element nested inside the trigger button
          // would be invalid interactive nesting. Its meaning is exposed via
          // the sr-only text inside the trigger instead; the tooltip remains
          // as a pointer-hover affordance.
          render={<span />}
          aria-hidden="true"
          data-testid="verification-dot"
          data-severity={verification.severity}
          // Stop the dot from toggling the Collapsible when the user
          // clicks it — otherwise opening the panel would flicker the
          // tooltip off.
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'inline-flex size-2.5 shrink-0 rounded-full ring-2 transition-colors',
            DOT_CLASSES[verification.severity],
          )}
        />
        <TooltipContent>
          <div className="flex flex-col gap-0.5">
            {lines.map((line, i) => (
              <span key={i} className={i === 0 ? 'font-medium' : 'text-background/75'}>
                {line}
              </span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** DOM id for a source row, scoped by the owning message. Stable across renders so footnote clicks can target it. */
export function sourceRowId(messageId: string | undefined, sourceKey: string): string {
  return `source-${messageId ?? 'msg'}-${sourceKey}`;
}

function SourceRow({
  source,
  index,
  messageId,
  highlighted,
}: {
  source: MessageSource;
  index: number;
  messageId?: string;
  highlighted: boolean;
}) {
  return (
    <li
      key={source.key}
      id={sourceRowId(messageId, source.key)}
      data-testid="source-item"
      data-highlighted={highlighted || undefined}
      className={cn(
        'min-w-0 rounded-md px-1 py-0.5 transition-colors duration-500',
        highlighted && 'bg-accent/15',
      )}
    >
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-w-0 items-start gap-2 text-sm text-foreground hover:text-accent"
      >
        <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-xs font-medium tabular-nums text-muted-foreground group-hover:text-accent">
          {index + 1}.
        </span>
        <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-accent" />
        <span className="min-w-0 flex-1">
          <span className="font-medium underline-offset-2 group-hover:underline">
            {source.label}
          </span>
          {ORIGIN_LABELS[source.originTool] && (
            <span className="ml-2 inline-block rounded border border-border bg-muted px-1.5 py-px align-middle font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {ORIGIN_LABELS[source.originTool]}
            </span>
          )}
          {source.title && (
            <span className="block text-xs text-muted-foreground">{source.title}</span>
          )}
        </span>
      </a>
      {source.snippet && (
        // Native <details> keeps the excerpt one keyboard-accessible click
        // away without nesting more interactive machinery inside the panel.
        <details data-testid="source-excerpt" className="ml-8 mt-1">
          <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-accent">
            Show policy text
          </summary>
          <blockquote className="mt-1 border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
            {source.snippet}
          </blockquote>
        </details>
      )}
    </li>
  );
}

export function SourcesPanel({ sources, citedCount, messageId, open, onOpenChange, highlightedKey, verification }: SourcesPanelProps) {
  if (sources.length === 0) return null;

  const cited = citedCount === undefined ? sources : sources.slice(0, citedCount);
  const consulted = citedCount === undefined ? [] : sources.slice(citedCount);
  const showGroups = cited.length > 0 && consulted.length > 0;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div data-testid="sources-panel" className="mt-4">
        <CollapsibleTrigger
          data-testid="sources-panel-trigger"
          className="group flex w-full items-center justify-between rounded-xl border border-border/70 bg-muted/25 px-4 py-3 text-left transition-colors hover:bg-muted/45"
        >
          <div className="flex min-w-0 items-center gap-3">
            {verification && <ConfidenceDot verification={verification} />}
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">
                Sources
                {/* The confidence dot above is presentational; expose its
                    meaning in the trigger's accessible name instead. */}
                {verification && (
                  <span className="sr-only">
                    {' — '}
                    {DOT_SR_LABEL[verification.severity]}.{' '}
                    {verificationTooltipLines(verification).slice(1).join(' ')}
                  </span>
                )}
              </div>
              <div className="font-mono text-[11px] tracking-tight text-muted-foreground">{countLabel(sources.length, citedCount)}</div>
            </div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
        </CollapsibleTrigger>

        <CollapsibleContent
          data-testid="sources-panel-list"
          className="mt-2 rounded-xl border border-border/70 bg-muted/15 px-4 py-3"
        >
          {showGroups && (
            <div className="mb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Cited in this answer
            </div>
          )}
          <ul className="space-y-2">
            {(showGroups ? cited : sources).map((source, index) => (
              <SourceRow
                key={source.key}
                source={source}
                index={index}
                messageId={messageId}
                highlighted={highlightedKey === source.key}
              />
            ))}
          </ul>
          {showGroups && (
            <>
              <div className="mb-1.5 mt-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Also consulted
              </div>
              <ul className="space-y-2">
                {consulted.map((source, index) => (
                  <SourceRow
                    key={source.key}
                    source={source}
                    index={cited.length + index}
                    messageId={messageId}
                    highlighted={highlightedKey === source.key}
                  />
                ))}
              </ul>
            </>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
