import Link from 'next/link';
import { CRISIS_LINE, GET_HELP_PATH, WHO_DECIDES } from '@/lib/get-help';

// Shared footer for the public pages (landing, terms, privacy, get help). The chat
// screen carries its own condensed version inside ChatInput's helper row.
export function SiteFooter() {
  return (
    <footer className="border-t border-border px-4 py-8 md:px-8">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
        <nav className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          <Link href="/terms" className="transition-colors hover:text-foreground">
            Terms of use
          </Link>
          <span aria-hidden="true" className="h-px w-4 bg-border" />
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            Privacy
          </Link>
          <span aria-hidden="true" className="h-px w-4 bg-border" />
          <Link href={GET_HELP_PATH} className="transition-colors hover:text-foreground">
            Get help
          </Link>
        </nav>
        <p data-testid="footer-crisis-line" className="text-xs leading-relaxed text-foreground">
          {CRISIS_LINE}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          AI-generated research, not legal advice. {WHO_DECIDES}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          © {new Date().getFullYear()} Queen City Cortex LLC
        </p>
      </div>
    </footer>
  );
}
