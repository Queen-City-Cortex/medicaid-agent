'use server';

import { getWorkOS, withAuth } from '@workos-inc/authkit-nextjs';

export async function setThemeAction(theme: 'light' | 'dark' | 'system') {
  const { user } = await withAuth();
  if (!user) return;

  const workos = getWorkOS();
  await workos.userManagement.updateUser({
    userId: user.id,
    metadata: { ...user.metadata, theme },
  });
}

export async function getThemeAction(): Promise<string | null> {
  const { user } = await withAuth();
  if (!user) return null;
  return (user.metadata as Record<string, string>)?.theme ?? null;
}
