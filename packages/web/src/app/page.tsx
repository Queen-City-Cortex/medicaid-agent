import type { Metadata } from 'next';
import Link from 'next/link';
import { Landmark, ArrowUpRight } from 'lucide-react';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: 'NC Medicaid Navigator — policy research, cited to the source text',
  description:
    'AI-assisted research over NC Medicaid clinical coverage policies, DHHS eligibility manuals, federal regulations, and change notices — every answer cited to the source text.',
};

// The corpus families the pipeline actually ingests (see corpus-manifest.json).
// Listed as the "record" this tool searches — not marketing abstractions.
const SOURCE_FAMILIES = [
  { label: 'Clinical coverage policies', detail: 'prior approval, covered services, program criteria' },
  { label: 'DHHS eligibility manuals', detail: 'MA-series aged, blind & disabled and family policy' },
  { label: 'State Plan Amendments & waivers', detail: 'what NC has federal authority to do' },
  { label: 'Change notices & bulletins', detail: 'what changed, and when it took effect' },
  { label: 'Managed care contracts & guidance', detail: 'what health plans are required to do' },
  { label: '42 CFR & the Social Security Act', detail: 'the federal floor under all of it' },
];

const AUDIENCES = [
  {
    persona: 'For attorneys',
    question:
      'What notice must a beneficiary receive before Medicaid coverage is reduced or terminated under 42 CFR Part 431?',
  },
  {
    persona: 'For case managers',
    question:
      'What are the level-of-care criteria for the Community Alternatives Program for Disabled Adults (CAP/DA)?',
  },
  {
    persona: 'For beneficiaries',
    question: 'What is the earned income limit for Health Coverage for Workers with Disabilities (HCWD)?',
  },
];

// A real sequence (the agent's actual answer path), so the numbering carries
// information rather than decoration.
const ANSWER_STEPS = [
  ['Search', 'Hybrid semantic + keyword search across the policy graph.'],
  ['Read', 'The agent reads full sections, follows cross-references, checks amendments.'],
  ['Cite', 'Every claim carries an inline footnote that resolves to the source text.'],
  ['Verify', 'A second model checks the answer against the sources it cites before you see it.'],
] as const;

export default async function Home() {
  // Public page: withAuth() without ensureSignedIn just reports whether a
  // session exists so the CTA can read accordingly. The /chat link itself is
  // what triggers the WorkOS sign-in round-trip via the middleware.
  const { user } = await withAuth();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Letterhead nav — same gold hairline the chat masthead carries. */}
      <header className="relative border-b border-border bg-card px-4 py-4 md:px-8 after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-accent/70 after:to-transparent">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-md bg-accent/12 text-accent ring-1 ring-accent/25"
          >
            <Landmark className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-heading text-xl font-semibold leading-none tracking-tight text-foreground">
              NC Medicaid Navigator
            </p>
            <span className="mt-1 hidden font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:block">
              Policy Research · Queen City Cortex
            </span>
          </div>
          <Link
            href="/chat"
            className="ml-auto inline-flex h-8 items-center rounded-md bg-primary px-4 font-mono text-xs uppercase tracking-wider text-primary-foreground transition-opacity hover:opacity-90"
          >
            {user ? 'Open chat' : 'Sign in'}
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero — the thesis, with the product's own citation apparatus as the
            signature move: the subhead carries a real footnote that resolves
            to the disclaimer, exactly like answers cite sources. */}
        <section className="px-4 pb-16 pt-20 text-center md:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Cited to the source text
          </p>
          <h1 className="font-heading mx-auto mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Answers from the policy record, not from memory.
          </h1>
          <div className="mx-auto mt-6 h-px w-16 bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
          <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
            Ask a question about NC Medicaid. The navigator searches the actual policies, manuals,
            and regulations, reads them, and answers with inline citations you can check — because
            in this work, an uncited answer is no answer at all.
            <sup>
              <a
                href="#disclaimer"
                className="ml-0.5 font-mono text-[11px] text-accent underline-offset-2 hover:underline"
                aria-label="See disclaimer: research tool, not legal advice"
              >
                [1]
              </a>
            </sup>
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Link
              href="/chat"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-6 font-mono text-xs uppercase tracking-wider text-primary-foreground transition-opacity hover:opacity-90"
            >
              {user ? 'Continue your research' : 'Sign in to start'}
              <ArrowUpRight className="size-3.5" />
            </Link>
            <Link
              href="/terms"
              className="inline-flex h-10 items-center rounded-md border border-input px-6 font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              Read the terms
            </Link>
          </div>
        </section>

        {/* The record it searches — a docket, not a feature grid. */}
        <section className="border-t border-border bg-card/50 px-4 py-14 md:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              <span aria-hidden="true" className="h-px w-4 bg-border" />
              The record it searches
            </h2>
            <dl className="mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-2">
              {SOURCE_FAMILIES.map(({ label, detail }) => (
                <div key={label} className="border-l-2 border-l-accent/40 pl-4">
                  <dt className="text-[15px] font-medium text-foreground">{label}</dt>
                  <dd className="mt-0.5 text-sm leading-snug text-muted-foreground">{detail}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-sm text-muted-foreground">
              The corpus is rebuilt from the agencies&rsquo; published documents; each chat shows
              when it was last updated.
            </p>
          </div>
        </section>

        {/* Who it's for — one real question per audience. */}
        <section className="px-4 py-14 md:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              <span aria-hidden="true" className="h-px w-4 bg-border" />
              Built for the people who navigate Medicaid
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {AUDIENCES.map(({ persona, question }) => (
                <div
                  key={persona}
                  className="rounded-lg border border-border border-l-2 border-l-accent/40 bg-card px-4 py-4"
                >
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {persona}
                  </p>
                  <p className="mt-2.5 font-serif text-[15px] italic leading-snug text-foreground">
                    &ldquo;{question}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How an answer is assembled — an actual sequence. */}
        <section className="border-t border-border bg-card/50 px-4 py-14 md:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              <span aria-hidden="true" className="h-px w-4 bg-border" />
              How an answer is assembled
            </h2>
            <ol className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {ANSWER_STEPS.map(([step, detail], i) => (
                <li key={step}>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
                    {i + 1} · {step}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The footnote the hero cites. */}
        <section id="disclaimer" className="scroll-mt-8 px-4 py-14 md:px-8">
          <div className="mx-auto max-w-3xl rounded-lg border border-accent/40 bg-accent/[0.04] px-6 py-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
              1 · What this tool is not
            </p>
            <p className="mt-2.5 text-[15px] leading-relaxed text-foreground">
              NC Medicaid Navigator is a research tool. It does not give legal advice, does not
              create an attorney&ndash;client relationship, and cannot look up individual cases or
              eligibility. Answers are AI-generated from published policy documents and can be
              wrong or out of date — verify critical details with NC DHHS or a qualified
              professional before acting on them.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              See the{' '}
              <Link href="/terms" className="text-accent underline-offset-2 hover:underline">
                terms of use
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-accent underline-offset-2 hover:underline">
                privacy policy
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
