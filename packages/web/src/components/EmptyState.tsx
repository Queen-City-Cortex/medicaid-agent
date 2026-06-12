'use client';

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
    <div className="py-12 text-center">
      <h2 data-testid="empty-state" className="font-heading text-3xl font-semibold tracking-tight text-foreground mb-3">
        What would you like to know?
      </h2>
      <p data-testid="empty-state-scope" className="max-w-xl mx-auto text-sm text-muted-foreground">
        Searches NC Medicaid clinical coverage policies, DHHS eligibility manuals, federal
        regulations (42 CFR), the Social Security Act, and change notices — with citations to the
        source text.
      </p>
      <p data-testid="empty-state-limits" className="max-w-xl mx-auto mt-2 text-xs text-muted-foreground/80">
        It can&rsquo;t give legal advice or look up individual cases or eligibility. Verify critical
        details with NC DHHS.
      </p>
      {corpusUpdated && (
        <p data-testid="empty-state-corpus-status" className="max-w-xl mx-auto mt-2 text-xs text-muted-foreground/80">
          Corpus of {corpusStatus!.documentCount.toLocaleString('en-US')} documents, last updated{' '}
          {corpusUpdated}.
        </p>
      )}
      <div className="mt-10 grid gap-6 max-w-lg mx-auto text-left">
        {EXAMPLE_GROUPS.map((group) => (
          <div key={group.persona}>
            <h3
              data-testid="example-persona"
              className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {group.persona}
            </h3>
            <div className="grid gap-2">
              {group.questions.map((q) => (
                <button
                  key={q}
                  data-testid="example-card"
                  onClick={() => onSelectExample(q)}
                  className="text-left px-4 py-3 rounded-lg border border-border border-l-2 border-l-accent/40 bg-card text-sm text-foreground hover:border-accent hover:bg-muted transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
