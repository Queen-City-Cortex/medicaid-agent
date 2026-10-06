'use client';

import { CircleCheck } from 'lucide-react';
import type { VerificationOutcome } from '@nc-medicaid/contracts';

/**
 * Plain-language verification status rendered directly under every released
 * answer. This is the product's only trust signal: the server's release
 * outcome for the exact text shown. A corrected answer passed its recheck, so
 * it is verified. A withheld answer has no badge: the notice in MessageList
 * is all it shows.
 */

export function VerificationBadge({ outcome }: { outcome?: VerificationOutcome | null }) {
  if (!outcome || outcome.status === 'withheld') return null;

  return (
    <div
      data-testid="verification-badge"
      data-outcome={outcome.status}
      className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300"
    >
      <CircleCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 font-medium">
        {outcome.status === 'corrected' ? 'Corrected and verified against cited sources' : 'Verified against cited sources'}
      </span>
    </div>
  );
}
