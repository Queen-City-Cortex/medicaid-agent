'use client';

import { ArrowUpRight } from 'lucide-react';
import { useCorpusStatus } from '@/lib/use-corpus-status';

// First-run guidance, kept deliberately quiet: a scope line (what document
// families the corpus covers), a limits line (what this tool must never be
// mistaken for), a corpus-freshness line (real max(last_indexed) from the
// graph — rendered only when the value loads, never an invented date), and
// persona-grouped example questions with jargon expanded. The personas mirror
// the product's three audiences — legal-aid attorneys, case managers, and
// beneficiaries.
const EXAMPLE_GROUPS: { persona: string; questions: string[] }[] = [
  {
    persona: 'For attorneys',
    questions: [
      'What notice must a beneficiary receive before Medicaid coverage is reduced or terminated under 42 CFR Part 431?',
      'Which clinical coverage policy governs prior approval for private duty nursing?',
    ],
  },
  {
    persona: 'For case managers',
    questions: [
      'How many days of therapeutic leave are allowed for nursing facility residents?',
      'What are the level-of-care criteria for the Community Alternatives Program for Disabled Adults (CAP/DA)?',
    ],
  },
  {
    persona: 'For beneficiaries',
    questions: [
      'What is the earned income limit for Health Coverage for Workers with Disabilities (HCWD)?',
      'Does NC Medicaid cover chiropractic services?',
    ],
  },
];

interface EmptyStateProps {
  onSelectExample: (question: string) => void;
}

export function EmptyState({ onSelectExample }: EmptyStateProps) {
  const corpusStatus = useCorpusStatus();
  const corpusUpdated = corpusStatus?.lastUpdated
    ? new Date(corpusStatus.lastUpdated).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <div className="py-14 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/70">
        Cited to the source text
      </p>
      <h2
        data-testid="empty-state"
        className="font-heading mt-3 text-4xl font-semibold tracking-tight text-foreground"
      >
        What would you like to know?
      </h2>
      {/* Gold ornament rule — a small letterhead flourish under the hero. */}
      <div className="mx-auto mt-5 h-px w-16 bg-gradient-to-r from-transparent via-accent/70 to-transparent" />

      <p data-testid="empty-state-scope" className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
        Searches NC Medicaid clinical coverage policies, DHHS eligibility manuals, federal
        regulations (42 CFR), the Social Security Act, and change notices — with citations to the
        source text.
      </p>
      <p data-testid="empty-state-limits" className="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground/80">
        It can&rsquo;t give legal advice or look up individual cases or eligibility. Verify critical
        details with NC DHHS.
      </p>
      {corpusUpdated && (
        <p data-testid="empty-state-corpus-status" className="mx-auto mt-3 font-mono text-[11px] tracking-tight text-muted-foreground/70">
          {corpusStatus!.documentCount.toLocaleString('en-US')} documents · last updated {corpusUpdated}
        </p>
      )}
      <div className="mt-12 grid gap-7 max-w-xl mx-auto text-left">
        {EXAMPLE_GROUPS.map((group) => (
          <div key={group.persona}>
            <h3
              data-testid="example-persona"
              className="mb-2.5 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
            >
              <span className="h-px w-4 bg-border" aria-hidden="true" />
              {group.persona}
            </h3>
            <div className="grid gap-2">
              {group.questions.map((q) => (
                <button
                  key={q}
                  data-testid="example-card"
                  onClick={() => onSelectExample(q)}
                  className="group flex items-start gap-3 rounded-lg border border-border border-l-2 border-l-accent/40 bg-card px-4 py-3 text-left text-[15px] leading-snug text-foreground transition-all hover:border-l-accent hover:bg-accent/[0.05] hover:shadow-[0_1px_0_0_var(--border),0_8px_24px_-16px_rgba(0,0,0,0.4)]"
                >
                  <span className="flex-1">{q}</span>
                  <ArrowUpRight className="mt-px size-4 shrink-0 text-muted-foreground/35 transition-all group-hover:translate-x-px group-hover:-translate-y-px group-hover:text-accent" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
