'use client';

import ReactMarkdown from 'react-markdown';
import { ShieldCheck, ShieldAlert, Globe, FileText } from 'lucide-react';
import type { DeepResearchReport } from '@/lib/use-deep-research';

const PROSE =
  'prose dark:prose-invert max-w-none text-[16px] prose-headings:font-heading prose-headings:tracking-tight prose-h2:text-xl prose-h3:text-lg prose-p:leading-[1.75] prose-li:leading-[1.7] prose-li:my-1 prose-strong:text-foreground prose-strong:font-semibold';

function VerificationLine({ v }: { v: DeepResearchReport['citationProvenance'] }) {
  if (!v) return null;
  // "0/0 verified" is not a clean bill of health — with nothing checked, a
  // green badge would overstate the guarantee. Show a neutral note instead.
  if (v.checkedCitations === 0) {
    return (
      <div
        data-testid="deep-research-verification"
        className="mt-1 inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
      >
        <ShieldAlert className="size-3.5" />
        <span>No citations to verify in this report</span>
      </div>
    );
  }
  const clean = v.unknownCitations === 0;
  const Icon = clean ? ShieldCheck : ShieldAlert;
  return (
    <div
      data-testid="deep-research-verification"
      className={`mt-1 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
        clean
          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-400'
          : 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-400'
      }`}
    >
      <Icon className="size-3.5" />
      <span>
        {clean
          ? `Citations verified: ${v.retrievedCitations}/${v.checkedCitations} resolve to retrieved sources${v.allowedCitations ? `; ${v.allowedCitations} allowed reference link(s)` : ''}`
          : `${v.unknownCitations} of ${v.checkedCitations} citation(s) did not match a retrieved source `}
      </span>
    </div>
  );
}

export function DeepResearchReportView({ report }: { report: DeepResearchReport }) {
  return (
    <div data-testid="deep-research-report" className="space-y-6">
      <VerificationLine v={report.citationProvenance} />

      {/* Gaps are listed from the plan's own sub-question text under fixed
          wording; the stored failure message is never rendered. */}
      {report.workerFailures.length > 0 && (
        <div role="alert" data-testid="deep-research-gaps" className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <p>
            {report.workerFailures.length} of {report.stats.subQuestionCount} sub-questions could not be answered from verified sources. This report does not cover:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {report.workerFailures.map((failure, i) => (
              <li key={i}>{failure.subQuestion}</li>
            ))}
          </ul>
        </div>
      )}

      <article className={PROSE}>
        <ReactMarkdown
          components={{
            // The report markdown is model-generated: only render real
            // http(s) links as anchors; anything else (javascript:, data:,
            // relative fabrications) degrades to plain text.
            a: ({ children, href }) =>
              href && /^https?:\/\//i.test(href) ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline decoration-muted-foreground/30 underline-offset-2 transition-colors hover:text-accent hover:decoration-accent/60"
                >
                  {children}
                </a>
              ) : (
                <span>{children}</span>
              ),
          }}
        >
          {report.reportMarkdown}
        </ReactMarkdown>
      </article>

      {(report.corpusSources.length > 0 || report.webSources.length > 0) && (
        <details className="rounded-lg border border-border bg-card/50 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">
            Sources consulted ({report.corpusSources.length + report.webSources.length})
          </summary>
          <div className="mt-3 space-y-3">
            {report.corpusSources.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <FileText className="size-3.5" /> Authoritative — NC Medicaid corpus
                </p>
                <ul className="space-y-1">
                  {report.corpusSources.map((s) => (
                    <li key={s.key} className="truncate text-muted-foreground">
                      {s.link ? (
                        <a href={s.link} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">
                          {s.label}
                        </a>
                      ) : (
                        s.label
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.webSources.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Globe className="size-3.5" /> Supplementary — web
                </p>
                <ul className="space-y-1">
                  {report.webSources.map((s) => (
                    <li key={s.url} className="truncate text-muted-foreground">
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      <p className="text-xs text-muted-foreground">
        {report.stats.subQuestionCount} sub-questions · {report.stats.reflectionRounds} reflection round
        {report.stats.reflectionRounds === 1 ? '' : 's'} · {report.stats.corpusSourceCount} corpus sources
        {report.stats.webSourceCount > 0 && ` · ${report.stats.webSourceCount} web sources`}
      </p>
    </div>
  );
}
