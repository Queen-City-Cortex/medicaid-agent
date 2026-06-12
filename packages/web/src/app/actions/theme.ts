'use server';

import { cookies } from 'next/headers';
import { getWorkOS, withAuth } from '@workos-inc/authkit-nextjs';
import type { Theme } from '@/components/ThemeProvider';

const THEMES = ['light', 'dark', 'system'] as const;

// 'use server' modules may only export async functions, so the cookie name is
// duplicated in layout.tsx (which reads it server-side for the pre-paint class).
const THEME_COOKIE = 'theme';

const THEME_COOKIE_OPTIONS = {
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax',
} as const;

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export async function setThemeAction(theme: Theme) {
  // Server actions are network endpoints — never trust the caller-supplied
  // value, even though the client types it as Theme.
  if (!isTheme(theme)) return;

  // The cookie is the fast path: layout.tsx reads it server-side (and a
  // pre-paint inline script reads it client-side) so the correct theme is
  // applied before first paint, with no FOUC.
  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, theme, THEME_COOKIE_OPTIONS);

  const { user } = await withAuth();
  if (!user) return;

  const workos = getWorkOS();
  await workos.userManagement.updateUser({
    userId: user.id,
    metadata: { ...user.metadata, theme },
  });
}

export async function getThemeAction(): Promise<Theme | null> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(THEME_COOKIE)?.value;
  if (isTheme(fromCookie)) return fromCookie;

  const { user } = await withAuth();
  if (!user) return null;

  const fromUser = (user.metadata as Record<string, string>)?.theme;
  if (isTheme(fromUser)) {
    // Backfill the cookie (themes saved on another device, or saved before
    // the cookie existed) so the next load paints correctly from the start.
    cookieStore.set(THEME_COOKIE, fromUser, THEME_COOKIE_OPTIONS);
    return fromUser;
  }
  return null;
}
