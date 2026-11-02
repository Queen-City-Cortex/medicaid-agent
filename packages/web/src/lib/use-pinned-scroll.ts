'use client';

import { useEffect, useRef, useState } from 'react';

export interface UsePinnedScrollOptions {
  /** Re-runs viewport discovery and the follow-scroll when this changes. */
  messages: unknown;
  /** Streaming status — new chunks re-trigger the follow-scroll. */
  status: unknown;
}

/**
 * Pinned auto-scroll for the chat timeline.
 *
 * Contract:
 * - Attach `messagesEndRef` to an element inside the ScrollArea viewport;
 *   the hook discovers the `[data-slot="scroll-area-viewport"]` ancestor
 *   once it exists.
 * - The viewport is exposed as STATE (not a ref) so consumers like
 *   ScrollToBottom re-attach their listeners when it appears.
 * - New content scrolls the viewport down only while the user is pinned to
 *   the bottom (within 100px); scrolling up to read suspends following.
 */
export function usePinnedScroll({ messages, status }: UsePinnedScrollOptions) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // The scroll viewport is rendered by ScrollArea, so it is discovered after
  // mount. It lives in STATE (not a ref) so consumers like ScrollToBottom
  // re-attach their listeners when it appears — a ref left them attached to
  // nothing, permanently.
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  // Whether the user is reading at the bottom. Auto-scroll only when pinned —
  // unconditional scrolling yanked the viewport down on every stream chunk
  // while the user was reading earlier content.
  const pinnedRef = useRef(true);

  // Discover the ScrollArea viewport once it exists.
  useEffect(() => {
    if (viewport) return;
    const el = messagesEndRef.current?.closest('[data-slot="scroll-area-viewport"]');
    // Intentional DOM discovery: the viewport only exists after ScrollArea
    // mounts, and it must live in state (not a ref) so consumers re-subscribe
    // when it appears.
    if (el) setViewport(el as HTMLElement);
  }, [messages, viewport]);

  // Track whether the user is pinned to the bottom.
  useEffect(() => {
    if (!viewport) return;
    const onScroll = () => {
      pinnedRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => viewport.removeEventListener('scroll', onScroll);
  }, [viewport]);

  // Follow new content only while pinned ('auto' so the follow doesn't fight
  // user scrolling with a competing smooth animation on every chunk).
  useEffect(() => {
    if (!viewport || !pinnedRef.current) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'auto' });
  }, [messages, status, viewport]);

  return { viewport, messagesEndRef };
}
