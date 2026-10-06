import { renderHook, act } from '@testing-library/react';
import type { UIMessage, UIMessageChunk } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_IDLE_CHATS, useChatThread } from '@/lib/use-chat-thread';
import type { MastraRunner } from '@/lib/use-mastra-client';

// The hook runs over the real Chat class. Only the transport is replaced: a
// request is answered with a stream the test holds open, feeds and ends.
interface SentRequest {
  /** What the transport would have sent as the request body. */
  body: { messages: UIMessage[]; memory: { thread: string; resource: string } };
  /** The Authorization header the request would have carried. */
  headers: Record<string, string>;
  aborted: boolean;
  push: (...chunks: UIMessageChunk[]) => void;
  finish: () => void;
  fail: (error: Error) => void;
}

const sent = vi.hoisted(() => ({ requests: [] as unknown[] }));
const requests = sent.requests as SentRequest[];

vi.mock('ai', async (importOriginal) => {
  // Everything else stays real: Chat extends this module's AbstractChat.
  const actual = await importOriginal<typeof import('ai')>();
  class HeldTransport {
    constructor(private options: {
      headers: () => Promise<Record<string, string>>;
      prepareSendMessagesRequest: (request: { messages: UIMessage[] }) => { body: SentRequest['body'] };
    }) {}

    async sendMessages({ messages, abortSignal }: { messages: UIMessage[]; abortSignal?: AbortSignal }) {
      let controller!: ReadableStreamDefaultController<UIMessageChunk>;
      const stream = new ReadableStream<UIMessageChunk>({ start: (c) => { controller = c; } });
      const request: SentRequest = {
        body: this.options.prepareSendMessagesRequest({ messages }).body,
        headers: await this.options.headers(),
        aborted: false,
        push: (...chunks) => chunks.forEach((chunk) => controller.enqueue(chunk)),
        finish: () => controller.close(),
        fail: (error) => controller.error(error),
      };
      abortSignal?.addEventListener('abort', () => {
        request.aborted = true;
        controller.error(new DOMException('Aborted', 'AbortError'));
      });
      sent.requests.push(request);
      return stream;
    }

    async reconnectToStream() {
      return null;
    }
  }
  return { ...actual, DefaultChatTransport: HeldTransport };
});

function makeDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Page = { messages?: unknown[]; hasMore?: boolean };

// Without its stored outcome a stored answer is replaced by a withheld notice.
const PASSED = { type: 'data-verification-status', data: { status: 'passed', passCount: 1 } };

/** A stored thread of one short turn. */
const storedTurn = (name: string) => async (): Promise<Page> => ({
  messages: [
    { id: `${name}-q`, role: 'user', content: `question ${name}`, createdAt: '2026-01-01T12:00:00Z' },
    { id: `${name}-a`, role: 'assistant', content: { format: 2, parts: [{ type: 'text', text: `answer ${name}` }, PASSED] }, createdAt: '2026-01-01T12:00:01Z' },
  ],
});

/** A stored thread of `pages` full pages, served newest page first: page 0 is
 *  the newest question and answer, the last page the oldest. */
const pagedThread = (pages: number) => async ({ page }: { page: number }): Promise<Page> => ({
  messages: [
    { id: `q${page}`, role: 'user', content: `question on page ${page}`, createdAt: `2026-01-0${9 - page}T12:00:00Z` },
    { id: `a${page}`, role: 'assistant', content: { format: 2, parts: [] }, createdAt: `2026-01-0${9 - page}T12:00:01Z` },
  ],
  hasMore: page < pages - 1,
});

const startOfAnswer = (id: string): UIMessageChunk[] => [{ type: 'start', messageId: id }, { type: 'start-step' }, { type: 'text-start', id: 't' }];
const words = (delta: string): UIMessageChunk => ({ type: 'text-delta', id: 't', delta });
const endOfAnswer: UIMessageChunk[] = [{ type: 'text-end', id: 't' }, { type: 'finish-step' }, { type: 'finish' }];

function setup(initial: { resourceId?: string } = {}) {
  const listMessagesImpls = new Map<string, (params: { page: number }) => Promise<Page>>();
  const createMemoryThread = vi.fn(async () => undefined);
  const getMemoryThread = vi.fn((params: { threadId: string; agentId: string }) => ({
    listMessages: (paging: { page: number }) =>
      (listMessagesImpls.get(params.threadId) ?? (async () => ({ messages: [] as unknown[] })))(paging),
  }));
  const client = { createMemoryThread, getMemoryThread };
  // Pass-through runner: execute the op against the mock client. The real
  // fresh-token + 401-retry behavior lives in runWithFreshAuth (unit-tested in
  // tests/lib/mastra-client.test.ts).
  const run: MastraRunner = (op) => op(client as never);

  const onThreadSwitch = vi.fn();
  const loadThreadFeedback = vi.fn(async (_threadId: string, _isActive: () => boolean) => {});
  const closeMobileSidebar = vi.fn();
  const focusInput = vi.fn();
  const getAccessToken = vi.fn(async () => 'token');

  const utils = renderHook(
    ({ resourceId }: { resourceId: string }) =>
      useChatThread({
        resourceId,
        run,
        getAccessToken,
        onThreadSwitch,
        loadThreadFeedback,
        closeMobileSidebar,
        focusInput,
      }),
    { initialProps: { resourceId: initial.resourceId ?? 'user-1' } },
  );

  const texts = () => utils.result.current.messages.map((message) =>
    message.parts.filter((part) => part.type === 'text').map((part) => (part as { text: string }).text).join(''));
  const ids = () => utils.result.current.messages.map((message) => message.id);
  /** Sends a question in the visible thread and returns the held request. */
  const ask = async (text: string) => {
    const before = requests.length;
    await act(async () => {
      void utils.result.current.sendMessage({ text });
    });
    expect(requests).toHaveLength(before + 1);
    return requests[before];
  };
  const select = (threadId: string) => act(async () => {
    await utils.result.current.handleSelectThread(threadId);
  });
  const newThread = () => act(async () => {
    await utils.result.current.handleNewThread();
  });
  const feed = (request: SentRequest, ...chunks: UIMessageChunk[]) => act(async () => {
    request.push(...chunks);
  });
  const finish = (request: SentRequest) => act(async () => {
    request.push(...endOfAnswer);
    request.finish();
  });
  /** How many times each thread's stored messages were asked for. */
  const loads = (threadId: string) => getMemoryThread.mock.calls.filter(([params]) => params.threadId === threadId).length;

  return {
    ...utils,
    listMessagesImpls,
    createMemoryThread,
    getMemoryThread,
    onThreadSwitch,
    loadThreadFeedback,
    closeMobileSidebar,
    focusInput,
    getAccessToken,
    texts,
    ids,
    ask,
    select,
    newThread,
    feed,
    finish,
    loads,
  };
}

describe('useChatThread', () => {
  beforeEach(() => {
    requests.length = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // ── One Chat per thread ───────────────────────────────────────────────

  it('keeps a streaming thread streaming after switching away and back', async () => {
    const h = setup();
    h.listMessagesImpls.set('thread-b', storedTurn('b'));
    const threadA = h.result.current.threadId;

    const request = await h.ask('question a');
    await h.feed(request, ...startOfAnswer('answer-a'), words('The first'));
    expect(h.result.current.status).toBe('streaming');
    expect(h.texts()).toEqual(['question a', 'The first']);

    // Away: the other thread is shown, idle, and A's request is left alone.
    await h.select('thread-b');
    expect(h.result.current.threadId).toBe('thread-b');
    expect(h.result.current.status).toBe('ready');
    expect(h.texts()).toEqual(['question b', 'answer b']);
    expect(request.aborted).toBe(false);

    // A chunk that arrives while A is off screen is kept by A's Chat.
    await h.feed(request, words(' half'));
    expect(h.texts()).toEqual(['question b', 'answer b']);

    // Back: still streaming, with everything that arrived meanwhile, and not
    // read from the server, which holds only part of the turn.
    await h.select(threadA);
    expect(h.result.current.status).toBe('streaming');
    expect(h.result.current.isStreaming).toBe(true);
    expect(h.texts()).toEqual(['question a', 'The first half']);
    expect(h.loads(threadA)).toBe(0);

    await h.feed(request, words(' and the rest.'));
    await h.finish(request);
    expect(h.result.current.status).toBe('ready');
    expect(h.texts()).toEqual(['question a', 'The first half and the rest.']);
  });

  it('shows an answer that finished off screen whole on return, without reading the server', async () => {
    const h = setup();
    h.listMessagesImpls.set('thread-b', storedTurn('b'));
    const threadA = h.result.current.threadId;

    const request = await h.ask('question a');
    await h.feed(request, ...startOfAnswer('answer-a'), words('Whole'));
    await h.select('thread-b');
    await h.feed(request, words(' answer.'));
    await h.finish(request);

    await h.select(threadA);
    expect(h.result.current.status).toBe('ready');
    expect(h.texts()).toEqual(['question a', 'Whole answer.']);
    expect(h.loads(threadA)).toBe(0);
  });

  it('gives each of two streaming threads only its own chunks', async () => {
    const h = setup();
    const threadA = h.result.current.threadId;

    const requestA = await h.ask('question a');
    await h.feed(requestA, ...startOfAnswer('answer-a'), words('A1'));

    await h.newThread();
    const threadB = h.result.current.threadId;
    expect(threadB).not.toBe(threadA);
    expect(h.texts()).toEqual([]);

    const requestB = await h.ask('question b');
    expect(requestA.body.memory.thread).toBe(threadA);
    expect(requestB.body.memory.thread).toBe(threadB);
    // The server owns the history: each request carries its own newest question alone.
    expect(requestB.body.messages.map((message) => message.parts)).toEqual([[{ type: 'text', text: 'question b' }]]);

    await h.feed(requestB, ...startOfAnswer('answer-b'), words('B1'));
    await h.feed(requestA, words(' A2'));
    await h.feed(requestB, words(' B2'));
    expect(h.texts()).toEqual(['question b', 'B1 B2']);

    await h.select(threadA);
    expect(h.result.current.status).toBe('streaming');
    expect(h.texts()).toEqual(['question a', 'A1 A2']);

    await h.finish(requestA);
    expect(h.result.current.status).toBe('ready');
    await h.select(threadB);
    expect(h.result.current.status).toBe('streaming');
    expect(h.texts()).toEqual(['question b', 'B1 B2']);
  });

  it('stops the visible thread only', async () => {
    const h = setup();
    const threadA = h.result.current.threadId;

    const requestA = await h.ask('question a');
    await h.feed(requestA, ...startOfAnswer('answer-a'), words('A1'));
    await h.newThread();
    const requestB = await h.ask('question b');
    await h.feed(requestB, ...startOfAnswer('answer-b'), words('B1'));

    await act(async () => {
      await h.result.current.stop();
    });

    expect(requestB.aborted).toBe(true);
    expect(requestA.aborted).toBe(false);
    expect(h.result.current.status).toBe('ready');
    expect(h.result.current.wasStopped('answer-b')).toBe(true);

    await h.select(threadA);
    expect(h.result.current.status).toBe('streaming');
    expect(h.result.current.wasStopped('answer-a')).toBe(false);
    await h.feed(requestA, words(' A2'));
    expect(h.texts()).toEqual(['question a', 'A1 A2']);
  });

  it('refreshes the sidebar when a thread finishes off screen, without touching the visible thread', async () => {
    const h = setup();
    h.listMessagesImpls.set('thread-b', storedTurn('b'));

    const request = await h.ask('question a');
    await h.feed(request, ...startOfAnswer('answer-a'), words('A1'));
    await h.select('thread-b');
    const shown = h.result.current.messages;
    expect(h.result.current.threadVersion).toBe(0);

    await h.finish(request);

    expect(h.result.current.threadVersion).toBe(1);
    expect(h.result.current.threadId).toBe('thread-b');
    expect(h.result.current.messages).toBe(shown);
    expect(h.result.current.status).toBe('ready');
  });

  it('keeps a turn that failed off screen, with its error, for the return', async () => {
    const h = setup();
    h.listMessagesImpls.set('thread-b', storedTurn('b'));
    const threadA = h.result.current.threadId;

    const request = await h.ask('question a');
    await h.feed(request, ...startOfAnswer('answer-a'), words('A1'));
    await h.select('thread-b');
    await act(async () => {
      request.fail(new Error('upstream failed'));
    });

    // Nothing of it shows on the thread the user is reading.
    expect(h.result.current.status).toBe('ready');
    expect(h.result.current.error).toBeUndefined();

    await h.select(threadA);
    expect(h.result.current.status).toBe('error');
    expect(h.result.current.error?.message).toBe('upstream failed');
    expect(h.texts()).toEqual(['question a', 'A1']);
    expect(h.loads(threadA)).toBe(0);
  });

  it('"+ New" leaves the thread it came from as it was', async () => {
    const h = setup();
    const threadA = h.result.current.threadId;

    const request = await h.ask('question a');
    await h.feed(request, ...startOfAnswer('answer-a'), words('Answer a.'));
    await h.finish(request);

    await h.newThread();
    expect(h.result.current.threadId).not.toBe(threadA);
    expect(h.texts()).toEqual([]);
    expect(h.result.current.history).toBe('complete');
    expect(h.onThreadSwitch).toHaveBeenCalledTimes(1);

    await h.select(threadA);
    expect(h.texts()).toEqual(['question a', 'Answer a.']);
    expect(h.loads(threadA)).toBe(0);
  });

  // ── What is kept in memory ────────────────────────────────────────────

  it('drops the least recently shown idle thread beyond the cap, and reads it again when selected', async () => {
    const h = setup();
    const names = Array.from({ length: MAX_IDLE_CHATS + 2 }, (_, index) => `thread-${index}`);
    for (const name of names) h.listMessagesImpls.set(name, storedTurn(name));

    // thread-0 … thread-5 fill the cap behind the visible one; nothing is dropped yet.
    for (const name of names.slice(0, MAX_IDLE_CHATS + 1)) await h.select(name);
    // Showing thread-0 again makes thread-1 the least recently shown.
    await h.select('thread-0');
    await h.select(names[MAX_IDLE_CHATS]);
    expect(names.map(h.loads)).toEqual([1, 1, 1, 1, 1, 1, 0]);

    // One more thread puts six idle ones off screen: thread-1 goes.
    await h.select(names[MAX_IDLE_CHATS + 1]);
    await h.select('thread-0');
    expect(h.loads('thread-0')).toBe(1);
    await h.select('thread-2');
    expect(h.loads('thread-2')).toBe(1);
    await h.select('thread-1');
    expect(h.loads('thread-1')).toBe(2);
    expect(h.texts()).toEqual(['question thread-1', 'answer thread-1']);
  });

  it('never drops a thread with an answer on its way, however many others are opened', async () => {
    const h = setup();
    const threadA = h.result.current.threadId;
    const request = await h.ask('question a');
    await h.feed(request, ...startOfAnswer('answer-a'), words('A1'));

    const names = Array.from({ length: MAX_IDLE_CHATS + 3 }, (_, index) => `thread-${index}`);
    for (const name of names) {
      h.listMessagesImpls.set(name, storedTurn(name));
      await h.select(name);
    }
    // The oldest idle ones went instead.
    await h.select('thread-0');
    expect(h.loads('thread-0')).toBe(2);

    await h.feed(request, words(' A2'));
    await h.select(threadA);
    expect(h.result.current.status).toBe('streaming');
    expect(h.texts()).toEqual(['question a', 'A1 A2']);
    expect(h.loads(threadA)).toBe(0);
  });

  it('keeps a failed thread beyond the cap, since its error is nowhere else', async () => {
    const h = setup();
    const threadA = h.result.current.threadId;
    const request = await h.ask('question a');
    await act(async () => {
      request.fail(new Error('refused'));
    });
    expect(h.result.current.status).toBe('error');

    for (let index = 0; index < MAX_IDLE_CHATS + 3; index++) {
      h.listMessagesImpls.set(`thread-${index}`, storedTurn(`thread-${index}`));
      await h.select(`thread-${index}`);
    }

    await h.select(threadA);
    expect(h.result.current.status).toBe('error');
    expect(h.texts()).toEqual(['question a']);
  });

  it('drops an unused "+ New" page as soon as it is left', async () => {
    const h = setup();
    h.listMessagesImpls.set('thread-b', storedTurn('b'));
    const unused = h.result.current.threadId;

    await h.select('thread-b');
    // Selecting the id again finds no Chat and asks the server, as for any unknown thread.
    await h.select(unused);
    expect(h.loads(unused)).toBe(1);
  });

  // ── Stored history ────────────────────────────────────────────────────

  it('puts a slow response into its own thread, never into the one shown by then', async () => {
    const h = setup();
    const slowA = makeDeferred<Page>();
    h.listMessagesImpls.set('thread-a', () => slowA.promise);
    h.listMessagesImpls.set('thread-b', storedTurn('b'));

    // Select thread A; its response hangs.
    let selectA!: Promise<void>;
    act(() => {
      selectA = h.result.current.handleSelectThread('thread-a');
    });
    // The user switches to thread B before A's response lands.
    await h.select('thread-b');
    expect(h.ids()).toEqual(['b-q', 'b-a']);
    expect(h.result.current.history).toBe('complete');

    await act(async () => {
      slowA.resolve(await storedTurn('a')());
      await selectA;
    });
    expect(h.result.current.threadId).toBe('thread-b');
    expect(h.ids()).toEqual(['b-q', 'b-a']);
    expect(h.result.current.history).toBe('complete');

    // Back on A, what arrived meanwhile is shown, with no second request.
    await h.select('thread-a');
    expect(h.ids()).toEqual(['a-q', 'a-a']);
    expect(h.loads('thread-a')).toBe(1);
  });

  it('does not ask twice for a thread that is selected again while it is still loading', async () => {
    const h = setup();
    const slowA = makeDeferred<Page>();
    h.listMessagesImpls.set('thread-a', () => slowA.promise);
    h.listMessagesImpls.set('thread-b', storedTurn('b'));

    let selectA!: Promise<void>;
    act(() => {
      selectA = h.result.current.handleSelectThread('thread-a');
    });
    await h.select('thread-b');
    await h.select('thread-a');
    expect(h.result.current.history).toBe('loading');
    expect(h.loads('thread-a')).toBe(1);

    await act(async () => {
      slowA.resolve(await storedTurn('a')());
      await selectA;
    });
    expect(h.ids()).toEqual(['a-q', 'a-a']);
    expect(h.result.current.history).toBe('complete');
  });

  it('reports a thread that fails to open, and asks again on the next select', async () => {
    const h = setup();
    let failing = true;
    h.listMessagesImpls.set('thread-err', async () => {
      if (failing) throw new Error('db down');
      return storedTurn('err')();
    });

    await h.select('thread-err');
    expect(h.result.current.messages).toEqual([]);
    // The failure is reported, not shown as an empty conversation.
    expect(h.result.current.history).toBe('failed');

    failing = false;
    await act(async () => {
      await h.result.current.loadEarlierMessages();
    });
    expect(h.ids()).toEqual(['err-q', 'err-a']);
    expect(h.result.current.history).toBe('complete');
  });

  it('loads a thread of several pages whole and reports it complete', async () => {
    const h = setup();
    h.listMessagesImpls.set('thread-long', pagedThread(2));

    await h.select('thread-long');

    expect(h.ids()).toEqual(['q1', 'q0']);
    expect(h.result.current.history).toBe('complete');
  });

  it('opens a very long thread on its newest messages and loads earlier ones on request', async () => {
    const h = setup();
    h.listMessagesImpls.set('thread-huge', pagedThread(4));

    await h.select('thread-huge');
    expect(h.ids()).toEqual(['q2', 'q1', 'q0']);
    expect(h.result.current.history).toBe('more');

    await act(async () => {
      await h.result.current.loadEarlierMessages();
    });
    expect(h.ids()).toEqual(['q3', 'q2', 'q1', 'q0']);
    expect(h.result.current.history).toBe('complete');
  });

  it('keeps the newest messages and reports the failure when an earlier page fails', async () => {
    const h = setup();
    let failing = true;
    h.listMessagesImpls.set('thread-flaky', async (paging) => {
      if (paging.page === 1 && failing) throw new Error('page 1 failed');
      return pagedThread(2)(paging);
    });

    await h.select('thread-flaky');
    expect(h.ids()).toEqual(['q0']);
    expect(h.result.current.history).toBe('failed');

    failing = false;
    await act(async () => {
      await h.result.current.loadEarlierMessages();
    });
    expect(h.ids()).toEqual(['q1', 'q0']);
    expect(h.result.current.history).toBe('complete');
  });

  it('still pages earlier messages after switching away and back, from where the thread stopped', async () => {
    const h = setup();
    h.listMessagesImpls.set('thread-huge', pagedThread(4));
    h.listMessagesImpls.set('thread-b', storedTurn('b'));

    await h.select('thread-huge');
    await h.select('thread-b');
    expect(h.result.current.history).toBe('complete');

    await h.select('thread-huge');
    expect(h.result.current.history).toBe('more');
    expect(h.ids()).toEqual(['q2', 'q1', 'q0']);
    expect(h.loads('thread-huge')).toBe(1);

    await act(async () => {
      await h.result.current.loadEarlierMessages();
    });
    expect(h.ids()).toEqual(['q3', 'q2', 'q1', 'q0']);
    expect(h.result.current.history).toBe('complete');
  });

  it('finishes loading earlier messages for a thread that was left mid-load', async () => {
    const h = setup();
    const slowPage = makeDeferred<Page>();
    h.listMessagesImpls.set('thread-huge', (paging) => (paging.page === 3 ? slowPage.promise : pagedThread(4)(paging)));
    h.listMessagesImpls.set('thread-b', storedTurn('b'));

    await h.select('thread-huge');
    let earlier!: Promise<void>;
    act(() => {
      earlier = h.result.current.loadEarlierMessages();
    });
    expect(h.result.current.history).toBe('loading');

    await h.select('thread-b');
    expect(h.result.current.history).toBe('complete');
    await act(async () => {
      slowPage.resolve(await pagedThread(4)({ page: 3 }));
      await earlier;
    });
    expect(h.ids()).toEqual(['b-q', 'b-a']);

    await h.select('thread-huge');
    expect(h.ids()).toEqual(['q3', 'q2', 'q1', 'q0']);
    expect(h.result.current.history).toBe('complete');
  });

  it('puts earlier messages above a turn that is streaming, which goes on streaming', async () => {
    const h = setup();
    h.listMessagesImpls.set('thread-huge', pagedThread(4));

    await h.select('thread-huge');
    const request = await h.ask('a new question');
    await h.feed(request, ...startOfAnswer('answer-new'), words('Part one'));

    await act(async () => {
      await h.result.current.loadEarlierMessages();
    });
    expect(h.ids().slice(0, 4)).toEqual(['q3', 'q2', 'q1', 'q0']);
    expect(h.result.current.status).toBe('streaming');

    await h.feed(request, words(', part two.'));
    await h.finish(request);
    expect(h.texts().slice(-2)).toEqual(['a new question', 'Part one, part two.']);
    expect(h.ids()).toHaveLength(6);
  });

  // ── Feedback ──────────────────────────────────────────────────────────

  it('loads feedback on every select, including a thread whose Chat is still in memory', async () => {
    const h = setup();
    h.listMessagesImpls.set('thread-a', storedTurn('a'));
    h.listMessagesImpls.set('thread-b', storedTurn('b'));

    await h.select('thread-a');
    await h.select('thread-b');
    await h.select('thread-a');

    expect(h.loads('thread-a')).toBe(1);
    expect(h.loadThreadFeedback.mock.calls.map(([threadId]) => threadId)).toEqual(['thread-a', 'thread-b', 'thread-a']);
  });

  it('asks for feedback once per select and lets only the newest select use the answer', async () => {
    const h = setup();
    for (const name of ['thread-a', 'thread-b']) h.listMessagesImpls.set(name, storedTurn(name));

    // A, B, A in quick succession, before any feedback response.
    await h.select('thread-a');
    await h.select('thread-b');
    await h.select('thread-a');

    expect(h.loadThreadFeedback).toHaveBeenCalledTimes(3);
    const [firstA, forB, secondA] = h.loadThreadFeedback.mock.calls.map(([, isActive]) => isActive);
    // The first request for A is stale although A is visible again: only the
    // newest select may fill the map, or two responses would race.
    expect(firstA()).toBe(false);
    expect(forB()).toBe(false);
    expect(secondA()).toBe(true);

    await h.newThread();
    expect(secondA()).toBe(false);
    // A new thread has no row on the server, so nothing is asked of it.
    expect(h.loadThreadFeedback).toHaveBeenCalledTimes(3);
  });

  it('loads feedback even when the thread fails to open', async () => {
    const h = setup();
    h.listMessagesImpls.set('thread-err', async () => {
      throw new Error('db down');
    });

    await h.select('thread-err');

    expect(h.loadThreadFeedback).toHaveBeenCalledWith('thread-err', expect.any(Function));
  });

  // ── Select and "+ New" ────────────────────────────────────────────────

  it('resets per-thread state and manages sidebar/focus on select', async () => {
    const h = setup();

    await h.select('thread-x');

    expect(h.onThreadSwitch).toHaveBeenCalledTimes(1);
    expect(h.closeMobileSidebar).toHaveBeenCalledTimes(1);
    expect(h.focusInput).toHaveBeenCalledTimes(1);
  });

  it('handleNewThread on an empty thread only closes the sidebar and refocuses', async () => {
    const h = setup();
    const originalThreadId = h.result.current.threadId;

    await h.newThread();

    expect(h.result.current.threadId).toBe(originalThreadId);
    expect(h.onThreadSwitch).not.toHaveBeenCalled();
    expect(h.closeMobileSidebar).toHaveBeenCalledTimes(1);
    expect(h.focusInput).toHaveBeenCalledTimes(1);
  });

  it('never creates a thread from the browser: "+ New" only picks an id for the agent to create', async () => {
    const h = setup();
    const request = await h.ask('q');
    await h.finish(request);
    const before = h.result.current.threadId;

    await h.newThread();

    expect(h.result.current.threadId).not.toBe(before);
    expect(h.result.current.history).toBe('complete');
    // The new id has no row on the server yet, so nothing is asked of it.
    expect(h.createMemoryThread).not.toHaveBeenCalled();
    expect(h.getMemoryThread).not.toHaveBeenCalled();
    expect(h.result.current).not.toHaveProperty('ensureThreadExists');
  });

  // ── Requests ──────────────────────────────────────────────────────────

  it('sends the thread id and the newest user message, and nothing that could title or own the thread', async () => {
    const h = setup();
    const first = await h.ask('first');
    await h.feed(first, ...startOfAnswer('answer-1'), words('answer'));
    await h.finish(first);

    const second = await h.ask('second');

    expect(second.body).toEqual({
      messages: [expect.objectContaining({ role: 'user', parts: [{ type: 'text', text: 'second' }] })],
      memory: { thread: h.result.current.threadId, resource: 'user-1' },
    });
    expect(second.headers).toEqual({ Authorization: 'Bearer token' });
  });

  it('does not replay a stored thread: a question in a reopened thread is sent alone', async () => {
    const h = setup();
    h.listMessagesImpls.set('thread-huge', pagedThread(2));
    await h.select('thread-huge');
    expect(requests).toHaveLength(0);

    const request = await h.ask('a follow-up');

    expect(requests).toHaveLength(1);
    expect(request.body.messages).toHaveLength(1);
    expect(request.body.messages[0].parts).toEqual([{ type: 'text', text: 'a follow-up' }]);
    expect(request.body.memory.thread).toBe('thread-huge');
  });

  it('sends the owner and the token as they are when the request is made, not when the Chat was built', async () => {
    // The first Chat is built before sign-in has resolved.
    const h = setup({ resourceId: 'anonymous' });
    h.rerender({ resourceId: 'user-1' });
    h.getAccessToken.mockResolvedValue('fresh-token');

    const request = await h.ask('question');

    expect(request.body.memory.resource).toBe('user-1');
    expect(request.headers).toEqual({ Authorization: 'Bearer fresh-token' });
  });

  // ── Finished and stopped turns ────────────────────────────────────────

  it('bumps threadVersion when a response finishes (sidebar refresh key)', async () => {
    const h = setup();
    expect(h.result.current.threadVersion).toBe(0);

    const request = await h.ask('question');
    await h.feed(request, ...startOfAnswer('a1'), words('answer'));
    await h.finish(request);

    expect(h.result.current.threadVersion).toBe(1);
    expect(h.result.current.wasStopped('a1')).toBe(false);
  });

  it('remembers the message a turn ended on when the user pressed Stop', async () => {
    const h = setup();
    const request = await h.ask('question');
    await h.feed(request, ...startOfAnswer('a1'), words('partial'));

    await act(async () => {
      await h.result.current.stop();
    });

    expect(h.result.current.wasStopped('a1')).toBe(true);
    expect(h.result.current.wasStopped(h.ids()[0])).toBe(false);
    // The bump is what re-renders the page so the notice appears.
    expect(h.result.current.threadVersion).toBe(1);
  });

  it('remembers the question when Stop landed before any answer began', async () => {
    const h = setup();
    await h.ask('question');

    await act(async () => {
      await h.result.current.stop();
    });

    expect(h.result.current.messages).toHaveLength(1);
    expect(h.result.current.wasStopped(h.ids()[0])).toBe(true);
  });
});
