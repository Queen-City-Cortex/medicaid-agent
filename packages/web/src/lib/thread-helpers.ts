import type { StorageThreadType } from '@mastra/core/memory';

export function formatDate(date: string | Date | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  } else {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

export function getThreadTitle(thread: StorageThreadType): string {
  if (thread.title && thread.title.trim()) {
    return thread.title.length > 50 ? thread.title.slice(0, 50) + '...' : thread.title;
  }
  return 'New conversation';
}
