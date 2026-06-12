'use client';

import { CircleCheck, TriangleAlert, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VerificationState } from '@/lib/message-parts';

/**
 * Plain-language verification status rendered directly under every answer.
 * This is the product's core trust signal — the server-side hallucination
 * verifier checks each answer against the policy text it retrieved, and a
 * low-confidence answer must not look identical to a verified one. (It
 * previously surfaced only as a 10px hover-only dot inside the collapsed
 * Sources trigger, and was dropped entirely when no sources parsed.)
 */

interface BadgePresentation {
  icon: typeof CircleCheck;
  text: string;
  detail: string | null;
  className: string;
}

function describe(v: VerificationState): BadgePresentation {
  const unmatched = v.counts.unsupported + v.counts.missingCitation;

  if (v.severity === 'low' || v.pureMarkerFallback) {
    return {
      icon: ShieldAlert,
      text: v.pureMarkerFallback
        ? 'Automatic verification was inconclusive'
        : 'Low confidence — verify before relying on this answer',
      detail: 'Check the cited policy text directly, or confirm with NC DHHS.',
      className: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
    };
  }

  if (v.rewrote || v.severity === 'medium') {
    const detailBits: string[] = [];
    if (unmatched > 0) {
      detailBits.push(
        `${unmatched} claim${unmatched === 1 ? '' : 's'} could not be matched to the cited sources and ${unmatched === 1 ? 'is' : 'are'} marked in the answer.`,
      );
    }
    if (v.counts.relevanceMajor > 0) {
      detailBits.push('Parts of the answer may draw on a different policy than the one asked about.');
    }
    return {
      icon: TriangleAlert,
      text: 'Partially verified',
      detail: detailBits.join(' ') || 'Some checks could not be completed.',
      className: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    };
  }

  return {
    icon: CircleCheck,
    text: 'Verified against cited sources',
    detail: null,
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  };
}

export function VerificationBadge({ verification }: { verification: VerificationState }) {
  const { icon: Icon, text, detail, className } = describe(verification);

  return (
    <div
      data-testid="verification-badge"
      data-severity={verification.severity}
      className={cn(
        'mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
        className,
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <span className="font-medium">{text}</span>
        {detail && <span className="block mt-0.5 text-muted-foreground">{detail}</span>}
      </div>
    </div>
  );
}
