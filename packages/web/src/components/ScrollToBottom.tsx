'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowDown } from 'lucide-react';

interface ScrollToBottomProps {
  viewportRef: React.RefObject<HTMLElement | null>;
  hasMessages?: boolean;
}

export function ScrollToBottom({ viewportRef, hasMessages = true }: ScrollToBottomProps) {
  const [visible, setVisible] = useState(false);

  const checkScroll = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const distanceFromBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight;
    setVisible(distanceFromBottom > 100);
  }, [viewportRef]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    vp.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
    return () => vp.removeEventListener('scroll', checkScroll);
  }, [viewportRef, checkScroll]);

  const scrollToBottom = () => {
    const vp = viewportRef.current;
    if (vp) {
      vp.scrollTo({ top: vp.scrollHeight, behavior: 'smooth' });
    }
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
