'use client';

const EXAMPLES = [
  'Does NC Medicaid cover chiropractic services?',
  'What is the earned income limit for HCWD?',
  'How many days of therapeutic leave are allowed for nursing facility residents?',
];

interface EmptyStateProps {
  onSelectExample: (question: string) => void;
}

export function EmptyState({ onSelectExample }: EmptyStateProps) {
  return (
    <div className="py-12 text-center">
      <h2 data-testid="empty-state" className="font-heading text-3xl font-semibold tracking-tight text-foreground mb-2">
        What would you like to know?
      </h2>
      <p className="text-muted-foreground mb-10">
        Research NC Medicaid policy across 2,000+ documents
      </p>
      <div className="grid gap-3 max-w-lg mx-auto">
        {EXAMPLES.map((q, i) => (
          <button
            key={i}
            data-testid="example-card"
            onClick={() => onSelectExample(q)}
            className="text-left px-4 py-3 rounded-lg border border-border border-l-2 border-l-accent/40 bg-card text-sm text-foreground hover:border-accent hover:bg-muted transition-colors"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
