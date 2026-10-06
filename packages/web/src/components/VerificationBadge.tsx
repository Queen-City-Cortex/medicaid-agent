'use client';

import { CircleCheck, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VerificationOutcome } from '@nc-medicaid/contracts';

/**
 * Plain-language verification status rendered directly under every answer.
 * This is the product's only trust signal: the server's release outcome for
 * the exact text shown. A corrected answer passed its recheck, so it is
 * verified; a withheld answer never is.
 */

export function VerificationBadge({ outcome }: { outcome?: VerificationOutcome | null }) {
  if (!outcome) return null;
  const withheld = outcome.status === 'withheld';
  const Icon = withheld ? ShieldAlert : CircleCheck;
  const text = withheld
    ? 'Answer withheld'
    : outcome.status === 'corrected'
      ? 'Corrected and verified against cited sources'
      : 'Verified against cited sources';

  return (
    <div
      data-testid="verification-badge"
      data-outcome={outcome.status}
      className={cn(
        'mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
        withheld
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'
          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <span className="font-medium">{text}</span>
        {withheld && (
          <span className="block mt-0.5 text-muted-foreground">
            The answer could not be verified against the retrieved sources.
          </span>
        )}
      </div>
    </div>
  );
}
