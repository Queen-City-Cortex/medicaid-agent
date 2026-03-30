'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowDown } from 'lucide-react';

interface ScrollToBottomProps {
  viewportRef: React.RefObject<HTMLElement | null>;
}

export function ScrollToBottom({ viewportRef }: ScrollToBottomProps) {
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

  if (!visible) return null;

  return (
    <button
      onClick={scrollToBottom}
      className="absolute bottom-20 left-1/2 -translate-x-1/2 p-2 rounded-full border border-border bg-background shadow-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all animate-in fade-in zoom-in-75 duration-200"
      aria-label="Scroll to bottom"
    >
      <ArrowDown className="w-4 h-4" />
    </button>
  );
}
