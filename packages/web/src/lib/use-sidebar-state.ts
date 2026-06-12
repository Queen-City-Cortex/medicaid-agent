'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'sidebar-collapsed';

/**
 * Sidebar collapse state with persistence and mobile a11y management.
 *
 * Contract:
 * - Collapse state persists to localStorage, but only for explicit user
 *   choices (toggle button, Escape) — `closeMobileSidebar` (auto-close after
 *   picking a thread) intentionally does not persist.
 * - Starts collapsed on small windows regardless of the persisted value.
 * - On mobile, Escape closes the overlay; opening moves focus to the first
 *   focusable sidebar element and closing returns it to the toggle button
 *   (attach `sidebarRef`/`sidebarToggleRef` for this to work).
 * - The caller wires `inert`/`aria-hidden` on the sidebar and main content
 *   from `sidebarCollapsed` + `isMobile`.
 */
export function useSidebarState({ isMobile }: { isMobile: boolean }) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const previousSidebarCollapsedRef = useRef<boolean | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    if (window.innerWidth < 768) return true;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  /** Collapse the overlay sidebar on mobile (no-op on desktop, not persisted). */
  const closeMobileSidebar = useCallback(() => {
    if (isMobile) setSidebarCollapsed(true);
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || sidebarCollapsed) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarCollapsed(true);
        localStorage.setItem(STORAGE_KEY, 'true');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile, sidebarCollapsed]);

  useEffect(() => {
    if (!isMobile) {
      previousSidebarCollapsedRef.current = sidebarCollapsed;
      return;
    }

    const previousValue = previousSidebarCollapsedRef.current;
    previousSidebarCollapsedRef.current = sidebarCollapsed;

    if (previousValue === null || previousValue === sidebarCollapsed) return;

    if (!sidebarCollapsed) {
      const firstFocusable = sidebarRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
      return;
    }

    sidebarToggleRef.current?.focus();
  }, [isMobile, sidebarCollapsed]);

  return {
    sidebarCollapsed,
    toggleSidebar,
    closeMobileSidebar,
    sidebarRef,
    sidebarToggleRef,
  };
}
