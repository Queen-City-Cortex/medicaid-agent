import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatThread } from '@/lib/use-chat-thread';
import type { MastraRunner } from '@/lib/use-mastra-client';

type MinimalMessage = { id: string; role: string; parts: Array<Record<string, unknown>> };

const mocks = vi.hoisted(() => ({
  setMessages: vi.fn(),
  chat: {
    messages: [] as Array<{ id: string; role: string; parts: Array<Record<string, unknown>> }>,
    status: 'ready' as string,
    error: undefined as Error | undefined,
  },
  lastUseChatOptions: null as null | { onFinish?: () => void },
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: { onFinish?: () => void }) => {
    mocks.lastUseChatOptions = options;
    return {
      messages: mocks.chat.messages,
      status: mocks.chat.status,
      error: mocks.chat.error,
      sendMessage: vi.fn(),
      regenerate: vi.fn(),
      stop: vi.fn(),
      setMessages: mocks.setMessages,
    };
  },
}));

vi.mock('ai', () => ({
  DefaultChatTransport: class DefaultChatTransport {},
}));

function makeDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const listMessagesImpls = new Map<string, () => Promise<{ messages?: unknown[] }>>();
  const createMemoryThread = vi.fn(async () => undefined);
  const getMemoryThread = vi.fn((params: { threadId: string; agentId: string }) => ({
    listMessages: () =>
      (listMessagesImpls.get(params.threadId) ?? (async () => ({ messages: [] as unknown[] })))(),
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

  const utils = renderHook(() =>
    useChatThread({
      resourceId: 'user-1',
      run,
      getAccessToken,
      onThreadSwitch,
      loadThreadFeedback,
      closeMobileSidebar,
      focusInput,
    }),
  );

  return {
    ...utils,
    listMessagesImpls,
    createMemoryThread,
    getMemoryThread,
    onThreadSwitch,
    loadThreadFeedback,
    closeMobileSidebar,
    focusInput,
  };
}

describe('useChatThread', () => {
  beforeEach(() => {
    mocks.setMessages.mockClear();
    mocks.chat.messages = [];
    mocks.chat.status = 'ready';
    mocks.chat.error = undefined;
    mocks.lastUseChatOptions = null;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('drops a stale loadThread response after the user switches threads', async () => {
    const { result, listMessagesImpls, loadThreadFeedback } = setup();

    const slowA = makeDeferred<{ messages?: unknown[] }>();
    listMessagesImpls.set('thread-a', () => slowA.promise);
    listMessagesImpls.set('thread-b', async () => ({
      messages: [{ id: 'b-user', role: 'user', content: 'question b' }],
    }));

    // Select thread A; its DB response hangs.
    let selectA!: Promise<void>;
    act(() => {
      selectA = result.current.handleSelectThread('thread-a');
    });

    // User switches to thread B before A's response lands.
    await act(async () => {
      await result.current.handleSelectThread('thread-b');
    });

    expect(result.current.threadId).toBe('thread-b');
    expect(mocks.setMessages).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'b-user', role: 'user' }),
    ]);
    expect(loadThreadFeedback).toHaveBeenCalledTimes(1);
    expect(loadThreadFeedback).toHaveBeenCalledWith('thread-b', expect.any(Function));
    const isActiveForB = loadThreadFeedback.mock.calls[0][1];
    expect(isActiveForB()).toBe(true);

    // A's stale response finally arrives — it must be dropped entirely.
    mocks.setMessages.mockClear();
    await act(async () => {
      slowA.resolve({ messages: [{ id: 'a-user', role: 'user', content: 'question a' }] });
      await selectA;
    });

    expect(mocks.setMessages).not.toHaveBeenCalled();
    expect(loadThreadFeedback).toHaveBeenCalledTimes(1);
  });

  it('clears messages when loadThread fails for the still-active thread', async () => {
    const { result, listMessagesImpls, loadThreadFeedback } = setup();
    listMessagesImpls.set('thread-err', async () => {
      throw new Error('db down');
    });

    await act(async () => {
      await result.current.handleSelectThread('thread-err');
    });

    expect(mocks.setMessages).toHaveBeenCalledWith([]);
    expect(loadThreadFeedback).not.toHaveBeenCalled();
  });

  it('restores cached messages on thread switch instead of refetching from the DB', async () => {
    const { result, rerender, getMemoryThread } = setup();
    const originalThreadId = result.current.threadId;

    const streamed: MinimalMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'q' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'answer' }] },
    ];

    // Simulate a stream completing: the streaming → ready transition caches
    // the live messages for the current thread.
    mocks.chat.messages = streamed;
    mocks.chat.status = 'streaming';
    act(() => rerender());
    mocks.chat.status = 'ready';
    act(() => rerender());

    // "+ New" switches away…
    await act(async () => {
      await result.current.handleNewThread();
    });
    expect(result.current.threadId).not.toBe(originalThreadId);
    expect(mocks.setMessages).toHaveBeenCalledWith([]);

    // …and switching back restores the cached messages without a DB fetch.
    mocks.setMessages.mockClear();
    await act(async () => {
      await result.current.handleSelectThread(originalThreadId);
    });

    expect(mocks.setMessages).toHaveBeenCalledWith(streamed);
    expect(getMemoryThread).not.toHaveBeenCalled();

    // The cache is consumed on restore: selecting the thread again falls back
    // to a DB load.
    await act(async () => {
      await result.current.handleSelectThread(originalThreadId);
    });
    expect(getMemoryThread).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: originalThreadId }),
    );
  });

  it('resets per-thread state and manages sidebar/focus on select', async () => {
    const { result, onThreadSwitch, closeMobileSidebar, focusInput } = setup();

    await act(async () => {
      await result.current.handleSelectThread('thread-x');
    });

    expect(onThreadSwitch).toHaveBeenCalledTimes(1);
    expect(closeMobileSidebar).toHaveBeenCalledTimes(1);
    expect(focusInput).toHaveBeenCalledTimes(1);
  });

  it('handleNewThread on an empty thread only closes the sidebar and refocuses', async () => {
    const { result, onThreadSwitch, closeMobileSidebar, focusInput } = setup();
    const originalThreadId = result.current.threadId;

    await act(async () => {
      await result.current.handleNewThread();
    });

    expect(result.current.threadId).toBe(originalThreadId);
    expect(onThreadSwitch).not.toHaveBeenCalled();
    expect(mocks.setMessages).not.toHaveBeenCalled();
    expect(closeMobileSidebar).toHaveBeenCalledTimes(1);
    expect(focusInput).toHaveBeenCalledTimes(1);
  });

  it('handleNewThread never creates the thread eagerly — creation is lazy via ensureThreadExists', async () => {
    const { result, createMemoryThread } = setup();
    mocks.chat.messages = [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'q' }] }];

    await act(async () => {
      await result.current.handleNewThread();
    });
    expect(createMemoryThread).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.ensureThreadExists(result.current.threadId, 'My question');
    });
    expect(createMemoryThread).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: result.current.threadId, title: 'My question' }),
    );
  });

  it('ensureThreadExists swallows "already exists" errors', async () => {
    const { result, createMemoryThread } = setup();
    createMemoryThread.mockRejectedValueOnce(new Error('conflict'));

    await expect(
      act(async () => {
        await result.current.ensureThreadExists('thread-dup');
      }),
    ).resolves.not.toThrow();
  });

  it('bumps threadVersion when a response finishes (sidebar refresh key)', () => {
    const { result } = setup();
    expect(result.current.threadVersion).toBe(0);

    act(() => {
      mocks.lastUseChatOptions?.onFinish?.();
    });

    expect(result.current.threadVersion).toBe(1);
  });
});
