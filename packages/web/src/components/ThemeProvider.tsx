'use client';

import { createContext, useContext, useEffect, useState, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { setThemeAction, getThemeAction } from '@/app/actions/theme';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function subscribeToSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function ThemeProvider({
  children,
  initialTheme = 'system',
}: {
  children: ReactNode;
  /** The persisted theme as read from the cookie by the server layout — keeps server and client first renders identical (no hydration mismatch). */
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  // The system preference is external state — subscribe to it directly. The
  // server snapshot is 'light' (matchMedia in a lazy useState initializer
  // caused a hydration mismatch); the pre-paint script in layout.tsx already
  // applied the correct class, so nothing flashes while this settles.
  const systemTheme = useSyncExternalStore(subscribeToSystemTheme, getSystemTheme, () => 'light' as const);
  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  // Sync from the server (cookie, falling back to WorkOS user metadata) —
  // covers a theme saved on another device that this device's cookie missed.
  useEffect(() => {
    getThemeAction().then(saved => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeState(saved);
      }
    });
  }, []);

  // Apply the resolved theme to the document whenever it changes. 'system' is
  // resolved from matchMedia directly so the first post-hydration run can't
  // briefly apply the wrong theme while the store still reports the server
  // snapshot.
  useEffect(() => {
    applyTheme(theme === 'system' ? getSystemTheme() : theme);
  }, [theme, systemTheme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    void setThemeAction(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
