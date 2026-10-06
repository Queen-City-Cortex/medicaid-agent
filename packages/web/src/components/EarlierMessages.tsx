'use client';

import { Button } from '@/components/ui/button';
import type { ThreadHistoryStatus } from '@/lib/use-chat-thread';

/**
 * Sits above the transcript whenever a stored thread is not fully on screen,
 * so a conversation never looks complete while its start is missing. A long
 * thread opens on its newest messages; earlier ones load on request.
 */
export function EarlierMessages({ status, hasMessages, onLoad }: {
  status: ThreadHistoryStatus;
  /** False when nothing of the thread is on screen (its first load failed). */
  hasMessages: boolean;
  onLoad: () => void;
}) {
  if (status === 'complete') return null;
  if (status === 'loading') {
    // Opening a thread shows nothing until its newest messages arrive, as
    // before; the line is for earlier messages joining ones already shown.
    if (!hasMessages) return null;
    return (
      <p role="status" data-testid="earlier-messages" data-status="loading" className="text-sm text-muted-foreground print:hidden">
        Loading earlier messages…
      </p>
    );
  }
  const failed = status === 'failed';
  return (
    <div
      data-testid="earlier-messages"
      data-status={status}
      role={failed ? 'alert' : 'status'}
      className={failed
        ? 'rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground'
        : 'rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground'}
    >
      <p className="font-medium">
        {!failed
          ? 'Earlier messages in this conversation are not shown.'
          : hasMessages
            ? 'Earlier messages in this conversation could not be loaded.'
            : 'This conversation could not be loaded.'}
      </p>
      <Button variant="outline" size="sm" className="mt-3 print:hidden" onClick={onLoad}>
        {failed ? 'Try again' : 'Load earlier messages'}
      </Button>
    </div>
  );
}
