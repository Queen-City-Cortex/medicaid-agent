'use client';

import { useSyncExternalStore } from 'react';

export function useIsMobile(breakpoint = 768) {
  const query = `(max-width: ${breakpoint - 1}px)`;

  const subscribe = (onStoreChange: () => void) => {
    if (typeof window === 'undefined') {
      return () => {};
    }
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onStoreChange);
    return () => mql.removeEventListener('change', onStoreChange);
  };

  const getSnapshot = () => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia(query).matches;
  };

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
