import type { StorageThreadType } from '@mastra/core/memory';
import { extractText } from '@/lib/parse-message';

const FALLBACK_THREAD_TITLE = 'New conversation';
const THREAD_TITLE_MAX_LENGTH = 60;

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
    return thread.title;
  }
  return FALLBACK_THREAD_TITLE;
}

export function getThreadDisplayTitle(thread: StorageThreadType, derivedTitle?: string | null): string {
  if (thread.title && thread.title.trim()) {
    return thread.title;
  }

  if (derivedTitle && derivedTitle.trim()) {
    return derivedTitle;
  }

  return FALLBACK_THREAD_TITLE;
}

export function deriveThreadTitleFromText(text: string | null | undefined): string | null {
  if (!text) return null;

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  return normalized.slice(0, THREAD_TITLE_MAX_LENGTH);
}

export function deriveThreadTitleFromMessages(
  messages: Array<{ role?: string; content?: unknown }>,
): string | null {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  if (!firstUserMessage) return null;

  return deriveThreadTitleFromText(extractText(firstUserMessage.content));
}
