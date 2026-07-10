import Link from 'next/link';
import { Landmark } from 'lucide-react';
import { SiteFooter } from '@/components/SiteFooter';
import { LEGAL_LAST_UPDATED, LEGAL_REVIEW_PENDING } from '@/lib/legal';

// Shared chrome for /terms and /privacy: letterhead header, DRAFT banner
// (single-flag removal once counsel signs off — see lib/legal.ts), prose
// article styled like answer prose, shared footer.
export function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="relative border-b border-border bg-card px-4 py-4 md:px-8 after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-accent/70 after:to-transparent">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-md bg-accent/12 text-accent ring-1 ring-accent/25"
            >
              <Landmark className="size-4" />
            </span>
            <span className="font-heading text-xl font-semibold leading-none tracking-tight text-foreground">
              NC Medicaid Navigator
            </span>
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-12 md:px-8">
        <article className="mx-auto max-w-3xl">
          {LEGAL_REVIEW_PENDING && (
            <p
              data-testid="legal-draft-banner"
              className="mb-8 rounded-lg border border-accent/40 bg-accent/[0.06] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-accent"
            >
              Draft — pending attorney review
            </p>
          )}
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {title}
          </h1>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Last updated {LEGAL_LAST_UPDATED}
          </p>
          <div className="prose dark:prose-invert mt-8 max-w-none text-[15px] prose-headings:font-heading prose-headings:tracking-tight prose-h2:text-xl prose-p:leading-[1.75] prose-li:leading-[1.7]">
            {children}
          </div>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
