'use client';

import { useSyncExternalStore } from 'react';
import { ArrowDown } from 'lucide-react';

interface ScrollToBottomProps {
  /** The scroll viewport element. Passed as state (not a ref) so the scroll
   *  subscription attaches when the viewport appears — with a ref object the
   *  effect ran once before the viewport existed and never re-ran, leaving
   *  the button permanently invisible. */
  viewport: HTMLElement | null;
  hasMessages?: boolean;
}

function subscribeToScroll(viewport: HTMLElement | null) {
  return (onStoreChange: () => void) => {
    if (!viewport) return () => {};
    viewport.addEventListener('scroll', onStoreChange, { passive: true });
    return () => viewport.removeEventListener('scroll', onStoreChange);
  };
}

function isAwayFromBottom(viewport: HTMLElement | null): boolean {
  if (!viewport) return false;
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 100;
}

export function ScrollToBottom({ viewport, hasMessages = true }: ScrollToBottomProps) {
  const visible = useSyncExternalStore(
    subscribeToScroll(viewport),
    () => isAwayFromBottom(viewport),
    () => false,
  );

  const scrollToBottom = () => {
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
  };

  if (!visible || !hasMessages) return null;

  return (
    <button
      onClick={scrollToBottom}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 h-8 w-8 flex items-center justify-center rounded-full shadow-lg animate-in fade-in zoom-in-75 duration-200 bg-foreground text-background hover:bg-foreground/90 transition-colors"
      aria-label="Scroll to bottom"
    >
      <ArrowDown className="w-4 h-4" />
    </button>
  );
}
