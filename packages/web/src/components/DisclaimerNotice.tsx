'use client';

import { useState } from 'react';
import { GET_HELP_PATH, WHO_DECIDES } from '@/lib/get-help';

// The EmptyState's "not legal advice" text disappears after the first
// message, so first-time users get one persistent, dismissable notice above
// the composer. Acknowledgment is a per-browser localStorage flag (same
// persistence pattern as use-sidebar-state) — no server state, and it never
// comes back once dismissed.
const STORAGE_KEY = 'disclaimer-acknowledged-v1';

export function DisclaimerNotice() {
  const [acknowledged, setAcknowledged] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true; // never flash during SSR
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      // Storage disabled (e.g. Safari private mode) — show the notice; the
      // dismiss below still works for the session.
      return false;
    }
  });

  if (acknowledged) return null;

  return (
    <div className="border-t border-border bg-card px-4 md:px-8 pt-3 print:hidden">
      <div
        data-testid="disclaimer-notice"
        role="note"
        className="mx-auto flex max-w-3xl flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-lg border border-accent/40 bg-accent/[0.06] px-4 py-2.5"
      >
        <p className="text-xs leading-relaxed text-foreground">
          This is a research tool, not legal advice — answers are AI-generated and can be wrong.
          {WHO_DECIDES}{' '}
          <a href="/terms" className="underline underline-offset-2 hover:text-accent">
            Terms of use
          </a>
          {' · '}
          <a href={GET_HELP_PATH} className="underline underline-offset-2 hover:text-accent">
            Get help
          </a>
        </p>
        <button
          type="button"
          data-testid="disclaimer-dismiss"
          onClick={() => {
            // Storage can throw (disabled/full); the dismissal must still
            // work for this session even when it can't persist.
            try {
              localStorage.setItem(STORAGE_KEY, 'true');
            } catch {
              // non-persistent dismissal is fine
            }
            setAcknowledged(true);
          }}
          className="shrink-0 rounded-md border border-accent/40 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-accent transition-colors hover:bg-accent/10"
        >
          I understand
        </button>
      </div>
    </div>
  );
}
