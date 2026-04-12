'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { setThemeAction, getThemeAction } from '@/app/actions/theme';

type Theme = 'light' | 'dark' | 'system';

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

function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => getSystemTheme());
  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  // Load saved theme from WorkOS on mount
  useEffect(() => {
    getThemeAction().then(saved => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        if (saved === 'system') {
          setSystemTheme(getSystemTheme());
        }
        setThemeState(saved);
      }
    });
  }, []);

  // Apply the resolved theme to the document whenever it changes.
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // Listen for system theme changes only while following the system preference.
  useEffect(() => {
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    if (t === 'system') {
      setSystemTheme(getSystemTheme());
    }
    setThemeState(t);
    void setThemeAction(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
