'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowDown } from 'lucide-react';

interface ScrollToBottomProps {
  /** The scroll viewport element. Passed as state (not a ref) so the scroll
   *  listener attaches when the viewport appears — with a ref object the
   *  effect ran once before the viewport existed and never re-ran, leaving
   *  the button permanently invisible. */
  viewport: HTMLElement | null;
  hasMessages?: boolean;
}

export function ScrollToBottom({ viewport, hasMessages = true }: ScrollToBottomProps) {
  const [visible, setVisible] = useState(false);

  const checkScroll = useCallback(() => {
    if (!viewport) return;
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setVisible(distanceFromBottom > 100);
  }, [viewport]);

  useEffect(() => {
    if (!viewport) return;
    viewport.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
    return () => viewport.removeEventListener('scroll', checkScroll);
  }, [viewport, checkScroll]);

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
