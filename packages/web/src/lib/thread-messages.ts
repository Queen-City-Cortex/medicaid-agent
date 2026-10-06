// Owns paging through a thread's stored messages. The server returns 40
// messages unless asked for more, and one turn is stored as several, so a
// single request loses the start of any conversation past about ten turns.

import type { RawThreadMessage } from './parse-message';

/** Messages per request. The server sets no maximum; 100 keeps each response
 *  small while a typical thread still loads in one or two requests. */
export const THREAD_PAGE_SIZE = 100;

/** Ceiling for an export, which needs every message: 10,000 stored messages.
 *  A thread past it fails the export instead of writing part of it. */
export const EXPORT_MAX_PAGES = 100;

/** Pages loaded per restore step: the newest 300 messages (about 80 turns)
 *  when a thread opens, and 300 more each time the user asks for earlier ones.
 *  Rendering a whole very long thread at once would stall the page. */
export const RESTORE_BATCH_PAGES = 3;

type MessageOrder = { field: 'createdAt'; direction: 'ASC' | 'DESC' };

/** The part of the Mastra client's thread handle that paging uses. */
export interface ThreadMessagePager {
  listMessages(params: { page: number; perPage: number; orderBy: MessageOrder }): Promise<{ messages?: unknown[] }>;
}

async function fetchPage(thread: ThreadMessagePager, page: number, direction: MessageOrder['direction']) {
  const result = await thread.listMessages({
    page,
    perPage: THREAD_PAGE_SIZE,
    orderBy: { field: 'createdAt', direction },
  });
  return {
    messages: (result.messages ?? []) as RawThreadMessage[],
    // The client's response type omits the paging fields the server sends.
    hasMore: (result as { hasMore?: boolean }).hasMore === true,
  };
}

/** Rows not seen on an earlier page. Offsets shift when a message is stored
 *  between two requests, so a row can come back twice. */
function unseen(rows: RawThreadMessage[], seen: Set<string>): RawThreadMessage[] {
  return rows.filter((row) => {
    if (!row.id) return true;
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

/**
 * Every stored message of a thread, oldest first. Rejects if any page fails
 * or the thread is longer than the ceiling, so a caller never gets part of a
 * thread without knowing it.
 */
export async function listAllThreadMessages(thread: ThreadMessagePager): Promise<RawThreadMessage[]> {
  const seen = new Set<string>();
  const all: RawThreadMessage[] = [];
  for (let page = 0; page < EXPORT_MAX_PAGES; page++) {
    const { messages, hasMore } = await fetchPage(thread, page, 'ASC');
    all.push(...unseen(messages, seen));
    if (!hasMore) return all;
  }
  throw new Error(`Thread is too long to load in full (over ${EXPORT_MAX_PAGES * THREAD_PAGE_SIZE} stored messages)`);
}

/** Where a partly restored thread stopped. */
export interface RestoreCursor {
  nextPage: number;
  seen: Set<string>;
  /** Answer rows loaded ahead of their question, kept until it arrives. */
  heldBack: RawThreadMessage[];
}

export interface RestoreBatch {
  /** Oldest first. Starts at a question whenever older messages remain. */
  messages: RawThreadMessage[];
  /** Null once the start of the thread has been loaded. */
  next: RestoreCursor | null;
  /** An older page failed; `messages` holds what loaded before it. */
  failed: boolean;
}

/** The server returns the rows of a page oldest first whichever window was
 *  asked for; put a page that arrives newest first back in that order. */
function oldestFirst(rows: RawThreadMessage[]): RawThreadMessage[] {
  const first = rows[0]?.createdAt;
  const last = rows[rows.length - 1]?.createdAt;
  return first && last && new Date(first) > new Date(last) ? [...rows].reverse() : rows;
}

/**
 * The next step of restoring a thread for the screen: the newest messages
 * first, then earlier ones from `cursor`, up to RESTORE_BATCH_PAGES pages a
 * call. Rejects only when the first page of the step fails; a later failure
 * keeps the pages already loaded and sets `failed`.
 */
export async function loadEarlierThreadMessages(
  thread: ThreadMessagePager,
  cursor?: RestoreCursor,
): Promise<RestoreBatch> {
  const seen = new Set(cursor?.seen);
  let rows = cursor?.heldBack ?? [];
  let page = cursor?.nextPage ?? 0;
  let hasMore = true;
  let failed = false;

  for (let fetched = 0; hasMore && fetched < RESTORE_BATCH_PAGES; fetched++) {
    try {
      const result = await fetchPage(thread, page, 'DESC');
      rows = [...unseen(oldestFirst(result.messages), seen), ...rows];
      hasMore = result.hasMore;
      page++;
    } catch (err) {
      if (fetched === 0) throw err;
      failed = true;
      break;
    }
  }
  if (!hasMore) return { messages: rows, next: null, failed: false };

  // A page can end inside a turn. Hold the answer rows that precede the first
  // question until the page with their question and tool calls is loaded,
  // or the answer would show without its question or its sources.
  const firstQuestion = rows.findIndex((row) => row.role === 'user');
  const cut = firstQuestion === -1 ? rows.length : firstQuestion;
  return {
    messages: rows.slice(cut),
    next: { nextPage: page, seen, heldBack: rows.slice(0, cut) },
    failed,
  };
}

/** `loaded` without the messages already in `shown`: a turn asked while its
 *  thread was still loading can be stored by the time the page is read. */
export function withoutShown<T extends { id: string }>(loaded: T[], shown: readonly { id: string }[]): T[] {
  if (shown.length === 0) return loaded;
  const ids = new Set(shown.map((message) => message.id));
  return loaded.filter((message) => !ids.has(message.id));
}
