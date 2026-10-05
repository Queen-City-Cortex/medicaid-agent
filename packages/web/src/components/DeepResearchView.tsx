'use client';

import { useState } from 'react';
import { Telescope, Loader2, Check, X, AlertTriangle, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeepResearchReportView } from '@/components/DeepResearchReport';
import type { DeepResearchController } from '@/lib/use-deep-research';

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function Phase({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-4">
      <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-accent" />
      <div className="min-w-0">
        <p className="font-medium text-foreground">{label}</p>
        {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

/** The deep-research surface: plan-approval gate, phase progress, and report. */
export function DeepResearchView({ controller }: { controller: DeepResearchController }) {
  const { status, plan, report, error, question, elapsedMs } = controller;
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  if (status === 'idle') {
    return (
      <div
        data-testid="deep-research-empty"
        className="mx-auto mt-16 max-w-xl rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center"
      >
        <Telescope className="mx-auto mb-3 size-8 text-accent" />
        <h2 className="font-heading text-lg font-semibold text-foreground">Deep Research</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask a broad policy question. The system proposes a research plan for your approval, then
          investigates across the NC Medicaid corpus and produces a long, cited report.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="deep-research-view" className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Telescope className="size-4 text-accent" />
        <span className="font-medium text-foreground">Deep Research</span>
        {question && <span className="truncate">· {question}</span>}
      </div>

      {controller.notice && (
        <p data-testid="deep-research-notice" className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {controller.notice}
        </p>
      )}

      {status === 'planning' && <Phase label="Planning the research…" sub={`Elapsed ${fmtElapsed(elapsedMs)}`} />}

      {status === 'awaiting-approval' && plan && (
        <div data-testid="deep-research-plan" className="rounded-xl border border-accent/30 bg-accent/[0.04] p-5">
          <h3 className="font-heading text-base font-semibold text-foreground">Proposed research plan</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{plan.brief}</p>

          <ol className="mt-4 space-y-2">
            {plan.subQuestions.map((sq, i) => {
              const off = excluded.has(i);
              return (
                <li
                  key={i}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    off ? 'border-border bg-muted/40 opacity-50' : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`font-medium text-foreground ${off ? 'line-through' : ''}`}>{sq.question}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{sq.rationale}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {sq.channels.map((c) => (
                          <span key={c} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                            {c}
                          </span>
                        ))}
                        {sq.useWeb && (
                          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                            <Globe className="size-2.5" /> web
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setExcluded((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={off ? 'Include sub-question' : 'Exclude sub-question'}
                    >
                      {off ? <Check className="size-4" /> : <X className="size-4" />}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-5 flex items-center gap-3">
            <Button
              data-testid="approve-plan"
              onClick={() => {
                const kept = plan.subQuestions.filter((_, i) => !excluded.has(i));
                // Only pass edits when the user actually pruned the plan.
                controller.approve(kept.length === plan.subQuestions.length ? undefined : kept);
              }}
              disabled={excluded.size === plan.subQuestions.length}
              size="sm"
              className="font-mono text-xs uppercase tracking-wider"
            >
              Approve & research
            </Button>
            <Button
              data-testid="decline-plan"
              onClick={() => controller.decline()}
              variant="outline"
              size="sm"
              className="font-mono text-xs uppercase tracking-wider"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {['researching', 'recovering', 'verifying'].includes(status) && (
        <div className="space-y-3">
          <Phase
            label={status === 'recovering' ? `Recovering completed work (${controller.recoveryCount}/2 retries used)…` : status === 'verifying' ? 'Checking the report against sources…' : 'Researching…'}
            sub={status === 'recovering' ? `${controller.recoveryProgress?.completedQuestions ?? 0} completed questions saved. Your approved plan and original limits are preserved.` : `Investigating ${plan?.subQuestions.length ?? ''} sub-questions, reading sections, and verifying citations · ${fmtElapsed(elapsedMs)}`}
          />
          {plan && (
            <ul className="space-y-1 pl-1 text-sm text-muted-foreground">
              {plan.subQuestions.map((sq, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin text-accent/60" />
                  <span className="truncate">{sq.question}</span>
                </li>
              ))}
            </ul>
          )}
          <Button
            data-testid="cancel-research"
            onClick={() => controller.cancel()}
            variant="outline"
            size="sm"
            className="font-mono text-xs uppercase tracking-wider"
          >
            Cancel research
          </Button>
        </div>
      )}

      {status === 'cancelled' && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Research was cancelled.
          <Button variant="link" size="sm" onClick={controller.reset} className="ml-1 h-auto p-0 text-accent">
            Start over
          </Button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p>The research report could not be released.</p>
            {controller.sources?.length > 0 && <ul className="mt-2">{controller.sources.map(source => <li key={source.key}>{source.link && /^https?:\/\//.test(source.link) ? <a href={source.link} target="_blank" rel="noopener noreferrer">{source.label}</a> : source.label}</li>)}</ul>}
            {error && <p className="mt-1 font-mono text-xs opacity-80">{error}</p>}
            <Button variant="link" size="sm" onClick={controller.reset} className="mt-1 h-auto p-0 text-accent">
              Try again
            </Button>
          </div>
        </div>
      )}

      {status === 'done' && report && <DeepResearchReportView report={report} />}
    </div>
  );
}
