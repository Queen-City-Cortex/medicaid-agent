'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { GetHelp } from '@/components/GetHelp';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold text-foreground mb-2">Something went wrong</h1>
        <p className="text-muted-foreground mb-6">
          Something broke on our side. Please try again.
        </p>
        {error.digest ? (
          <p className="text-sm text-muted-foreground mb-6">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
        <button
          onClick={reset}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Try again
        </button>
        <GetHelp className="mt-8 border-t border-border pt-6" />
      </div>
    </div>
  );
}
