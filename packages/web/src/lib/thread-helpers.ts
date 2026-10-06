import type { ListMemoryThreadsResponse } from '@mastra/client-js';
import { WHO_DECIDES } from '@/lib/get-help';
import { extractText } from '@/lib/parse-message';

// The element type actually returned by `client.listMemoryThreads`. Unlike
// `StorageThreadType` (whose createdAt/updatedAt are `Date`), the client
// serializes timestamps to ISO strings over the wire, so the local thread
// shape uses strings. Derived from the client response to stay in sync.
export type Thread = NonNullable<ListMemoryThreadsResponse['threads']>[number];

const FALLBACK_THREAD_TITLE = 'New conversation';
const THREAD_TITLE_MAX_LENGTH = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatDate(date: string | Date | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  // Bucket by calendar day, not 24-hour windows — a thread from yesterday
  // evening must say "Yesterday", not render as a bare time implying today.
  const diffDays = Math.round((startOfLocalDay(now) - startOfLocalDay(d)) / MS_PER_DAY);

  if (diffDays <= 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  } else {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

export function getThreadTitle(thread: Thread): string {
  if (thread.title && thread.title.trim()) {
    return thread.title;
  }
  return FALLBACK_THREAD_TITLE;
}

export function getThreadDisplayTitle(thread: Thread, derivedTitle?: string | null): string {
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

/**
 * When the sidebar contains several threads that derive the same title
 * (e.g. three "What is EPSDT?"), append a date suffix to disambiguate.
 * Threads with explicit user-set titles are never rewritten — only the
 * auto-derived collisions. Returns a Map keyed by thread id so the
 * caller can render each thread's final display title in one lookup.
 */
export function buildThreadDisplayTitles(
  threads: Thread[],
  derivedTitles: Record<string, string | null | undefined> = {},
): Map<string, string> {
  const titles = new Map<string, string>();
  const rawByThread = new Map<string, string>();
  const colliders = new Map<string, string[]>(); // rawTitle -> threadIds sharing it (derived-only)

  for (const thread of threads) {
    const raw = getThreadDisplayTitle(thread, derivedTitles[thread.id]);
    rawByThread.set(thread.id, raw);
    // Only treat as a collision if the title was auto-derived. An
    // explicit user-chosen title means the user accepted the clash.
    const userTitled = Boolean(thread.title && thread.title.trim());
    if (!userTitled && raw !== FALLBACK_THREAD_TITLE) {
      const bucket = colliders.get(raw) ?? [];
      bucket.push(thread.id);
      colliders.set(raw, bucket);
    }
  }

  for (const thread of threads) {
    const raw = rawByThread.get(thread.id) ?? FALLBACK_THREAD_TITLE;
    const bucket = colliders.get(raw);
    if (!bucket || bucket.length < 2) {
      titles.set(thread.id, raw);
      continue;
    }
    const suffix = formatDate(thread.updatedAt ?? thread.createdAt);
    titles.set(thread.id, suffix ? `${raw} (${suffix})` : raw);
  }
  return titles;
}

// ─── Thread export ───────────────────────────────────────────────────────────

import type { UIMessage } from 'ai';
import { getMessageCreatedAt } from '@/lib/parse-message';
import {
  extractMessageSources,
  getTrailingAssistantText,
  isTextPart,
  isToolPart,
  mapCitationLinks,
  releasedAnswer,
  resolveCitedSources,
  type MessageSource,
} from '@/lib/message-parts';

function sourceLines(sources: MessageSource[], firstNumber: number): string[] {
  return sources.map((source, i) => `${firstNumber + i}. [${source.label}](${source.url})`);
}

/** How the answer was checked, and when it was written when that is known. */
function statusLine(status: string, msg: UIMessage): string {
  const createdAt = getMessageCreatedAt(msg);
  const date = createdAt
    ? new Date(createdAt).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    : null;
  return `*${date ? `${status} · ${date}` : status}*`;
}

/**
 * One assistant turn, as the screen shows it: a released answer with its
 * citation links, footnote numbers and source list; a withheld one as its
 * notice alone; a turn that never produced an answer as a line saying so.
 */
function answerMarkdown(msg: UIMessage): string[] {
  const { release, parts } = releasedAnswer(msg);
  const text = getTrailingAssistantText({ ...msg, parts }).trim();

  if (release?.status === 'withheld') {
    return ['## Answer withheld', '', text, '', statusLine('Withheld: not verified', msg), ''];
  }
  if (!text) {
    return parts.some(isToolPart) ? ['## No answer', '', 'This answer ended before it was finished.', ''] : [];
  }

  const { ordered, citedCount } = resolveCitedSources(msg, extractMessageSources(msg));
  const lines = [
    '## Answer',
    '',
    mapCitationLinks(text, ordered, (label, url, sourceNumber) =>
      sourceNumber !== undefined ? `[${label}](${url}) [${sourceNumber}]` : `[${label}](${url})`),
    '',
  ];
  if (ordered.length > 0) {
    // Cited rows first, then the rows that were only consulted, numbered
    // straight through like the Sources panel.
    const split = citedCount > 0 && citedCount < ordered.length ? citedCount : ordered.length;
    lines.push('**Sources**', '', ...sourceLines(ordered.slice(0, split), 1), '');
    if (split < ordered.length) {
      lines.push('Also consulted, not cited in the answer:', '', ...sourceLines(ordered.slice(split), split + 1), '');
    }
  }
  lines.push(
    statusLine(release?.status === 'corrected'
      ? 'Corrected and verified against cited sources'
      : 'Verified against cited sources', msg),
    '',
  );
  return lines;
}

/**
 * Render a thread as a readable Markdown document — the deliverable a
 * legal-aid attorney or case manager puts in a case file. Takes the turns as
 * the screen shows them (`coalesceThreadMessages` output), so each answer
 * keeps its citation links, the footnote numbers and source list of the
 * in-app Sources panel, and its verification status.
 */
export function buildThreadMarkdown({
  title,
  exportedAt,
  messages,
}: {
  title: string;
  exportedAt: Date;
  messages: UIMessage[];
}): string {
  const lines: string[] = [
    `# ${title.trim() || 'Conversation'}`,
    '',
    `*Exported ${exportedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} from NC Medicaid Navigator. Answers are AI-generated from NC Medicaid policy documents. ${WHO_DECIDES}*`,
    '',
  ];

  for (const msg of messages) {
    if (msg.role === 'user') {
      const text = (msg.parts ?? [])
        .filter(isTextPart)
        .map((part) => part.text)
        .join('\n\n')
        .trim();
      if (text) {
        lines.push('## Question', '', text, '');
      }
    } else if (msg.role === 'assistant') {
      lines.push(...answerMarkdown(msg));
    }
  }

  return lines.join('\n');
}
