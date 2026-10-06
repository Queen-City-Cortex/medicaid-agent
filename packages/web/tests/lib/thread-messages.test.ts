import { describe, expect, it, vi } from 'vitest';
import {
  EXPORT_MAX_PAGES,
  RESTORE_BATCH_PAGES,
  THREAD_PAGE_SIZE,
  listAllThreadMessages,
  loadEarlierThreadMessages,
  type ThreadMessagePager,
} from '../../src/lib/thread-messages';

type Row = { id: string; role: string; content: string; createdAt: string };

/** `count` stored rows, oldest first. Every fourth row is a question, the
 *  three after it are its answer, as a stored turn is several rows. */
function storedRows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    role: i % 4 === 0 ? 'user' : 'assistant',
    content: `row ${i}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
  }));
}

/**
 * Pages the way the server does: `orderBy` picks which window of rows a page
 * covers, and the rows of a page always come back oldest first. `store` is
 * read on each call, so a test can add a row between two page requests.
 */
function fakeThread(store: { rows: Row[] }, onPage?: (page: number) => void) {
  const listMessages = vi.fn(async (params: Parameters<ThreadMessagePager['listMessages']>[0]) => {
    onPage?.(params.page);
    const ordered = params.orderBy.direction === 'DESC' ? [...store.rows].reverse() : store.rows;
    const offset = params.page * params.perPage;
    const window = ordered.slice(offset, offset + params.perPage);
    return {
      messages: [...window].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      hasMore: offset + params.perPage < store.rows.length,
    };
  });
  return { listMessages };
}

const ids = (rows: Array<{ id?: string }>) => rows.map((row) => row.id);

describe('listAllThreadMessages', () => {
  it('requests pages of 100, oldest first, until the server reports no more', async () => {
    const rows = storedRows(101);
    const thread = fakeThread({ rows });

    const all = await listAllThreadMessages(thread);

    expect(ids(all)).toEqual(ids(rows));
    expect(thread.listMessages.mock.calls.map(([params]) => params)).toEqual([
      { page: 0, perPage: THREAD_PAGE_SIZE, orderBy: { field: 'createdAt', direction: 'ASC' } },
      { page: 1, perPage: THREAD_PAGE_SIZE, orderBy: { field: 'createdAt', direction: 'ASC' } },
    ]);
  });

  it('rejects the whole call when a later page fails', async () => {
    const thread = fakeThread({ rows: storedRows(250) }, (page) => {
      if (page === 1) throw new Error('page 1 failed');
    });

    await expect(listAllThreadMessages(thread)).rejects.toThrow('page 1 failed');
  });

  it('keeps one copy of a row the server returns on two pages', async () => {
    const rows = storedRows(150);
    const thread = {
      listMessages: vi.fn(async ({ page }: { page: number }) =>
        page === 0
          ? { messages: rows.slice(0, 100), hasMore: true }
          : { messages: rows.slice(99), hasMore: false }),
    };

    const all = await listAllThreadMessages(thread);

    expect(ids(all)).toEqual(ids(rows));
  });

  it('includes a message stored while the pages were being fetched', async () => {
    const store = { rows: storedRows(150) };
    const late: Row = { id: 'late', role: 'user', content: 'late', createdAt: '2026-02-01T00:00:00.000Z' };
    const thread = fakeThread(store, (page) => {
      if (page === 1) store.rows = [...store.rows, late];
    });

    const all = await listAllThreadMessages(thread);

    expect(all).toHaveLength(151);
    expect(all.at(-1)?.id).toBe('late');
  });

  it('treats a response without hasMore as the last page', async () => {
    const thread = { listMessages: vi.fn(async () => ({ messages: storedRows(3) })) };

    expect(await listAllThreadMessages(thread)).toHaveLength(3);
    expect(thread.listMessages).toHaveBeenCalledTimes(1);
  });

  it('fails instead of returning part of a thread that never ends', async () => {
    const thread = {
      listMessages: vi.fn(async ({ page }: { page: number }) => ({
        messages: [{ id: `p${page}`, role: 'user', content: 'again' }],
        hasMore: true,
      })),
    };

    await expect(listAllThreadMessages(thread)).rejects.toThrow(/too long/);
    expect(thread.listMessages).toHaveBeenCalledTimes(EXPORT_MAX_PAGES);
  });
});

describe('loadEarlierThreadMessages', () => {
  it('loads a thread shorter than the bound whole, oldest first', async () => {
    const rows = storedRows(101);
    const thread = fakeThread({ rows });

    const batch = await loadEarlierThreadMessages(thread);

    expect(ids(batch.messages)).toEqual(ids(rows));
    expect(batch.next).toBeNull();
    expect(batch.failed).toBe(false);
    expect(thread.listMessages.mock.calls.map(([params]) => params)).toEqual([
      { page: 0, perPage: THREAD_PAGE_SIZE, orderBy: { field: 'createdAt', direction: 'DESC' } },
      { page: 1, perPage: THREAD_PAGE_SIZE, orderBy: { field: 'createdAt', direction: 'DESC' } },
    ]);
  });

  it('stops at the bound with the newest messages and resumes from the cursor', async () => {
    // 450 rows: the newest 300 are rows 150..449. Row 150 is mid-turn (its
    // question is row 148), so the first batch starts at the question in row 152.
    const rows = storedRows(450);
    const thread = fakeThread({ rows });

    const first = await loadEarlierThreadMessages(thread);

    expect(thread.listMessages).toHaveBeenCalledTimes(RESTORE_BATCH_PAGES);
    expect(first.failed).toBe(false);
    expect(first.messages[0]).toMatchObject({ id: 'm152', role: 'user' });
    expect(first.messages.at(-1)?.id).toBe('m449');
    expect(first.next).not.toBeNull();

    const second = await loadEarlierThreadMessages(thread, first.next!);

    expect(second.next).toBeNull();
    // The two answer rows held back from the first batch rejoin their turn.
    expect(ids(second.messages)).toEqual(ids(rows.slice(0, 152)));
    expect(thread.listMessages).toHaveBeenCalledTimes(RESTORE_BATCH_PAGES + 2);
  });

  it('drops the rows a new message pushes onto the next page', async () => {
    // Newest-first offsets shift by one when a message is stored between two
    // requests, so the next page starts with a row already loaded.
    const store = { rows: storedRows(150) };
    const late: Row = { id: 'late', role: 'user', content: 'late', createdAt: '2026-02-01T00:00:00.000Z' };
    const thread = fakeThread(store, (page) => {
      if (page === 1) store.rows = [...store.rows, late];
    });

    const batch = await loadEarlierThreadMessages(thread);

    expect(ids(batch.messages)).toEqual(ids(storedRows(150)));
    expect(batch.next).toBeNull();
  });

  it('keeps the pages already loaded when an older page fails, and can retry it', async () => {
    const rows = storedRows(250);
    let failing = true;
    const thread = fakeThread({ rows }, (page) => {
      if (page === 1 && failing) throw new Error('page 1 failed');
    });

    const first = await loadEarlierThreadMessages(thread);

    expect(first.failed).toBe(true);
    // Rows 150..249 loaded; rows 150 and 151 wait for their question.
    expect(ids(first.messages)).toEqual(ids(rows.slice(152)));

    failing = false;
    const retry = await loadEarlierThreadMessages(thread, first.next!);

    expect(retry.failed).toBe(false);
    expect(retry.next).toBeNull();
    expect(ids([...retry.messages, ...first.messages])).toEqual(ids(rows));
  });

  it('rejects when the first page of a batch fails', async () => {
    const thread = fakeThread({ rows: storedRows(10) }, () => {
      throw new Error('first page failed');
    });

    await expect(loadEarlierThreadMessages(thread)).rejects.toThrow('first page failed');
  });

  it('puts a page that arrives newest first back in order', async () => {
    const rows = storedRows(5);
    const thread = { listMessages: vi.fn(async () => ({ messages: [...rows].reverse(), hasMore: false })) };

    const batch = await loadEarlierThreadMessages(thread);

    expect(ids(batch.messages)).toEqual(ids(rows));
  });
});
