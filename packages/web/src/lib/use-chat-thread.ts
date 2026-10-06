'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Chat, useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { debugLog } from '@/lib/debug';
import { generateUUID } from '@/lib/utils';
import { coalesceThreadMessages } from '@/lib/parse-message';
import { loadEarlierThreadMessages, withoutShown, type RestoreBatch, type RestoreCursor } from '@/lib/thread-messages';
import { MASTRA_URL } from '@/lib/mastra-url';
import type { MastraRunner } from '@/lib/use-mastra-client';

const AGENT_ID = 'nc-medicaid-navigator';

/**
 * How much of the visible thread's stored history is on screen: all of it,
 * a request in flight, older messages left to load on request, or a request
 * that failed and can be retried.
 */
export type ThreadHistoryStatus = 'complete' | 'loading' | 'more' | 'failed';

/**
 * How many threads that are off screen and idle keep their Chat. The visible
 * thread, and any thread with an answer on its way or one that failed, are
 * kept as well and do not count.
 */
export const MAX_IDLE_CHATS = 5;

/** One thread held in memory: its Chat and how much of its history is loaded. */
interface ThreadChat {
  chat: Chat<UIMessage>;
  history: ThreadHistoryStatus;
  /** Where a partly loaded thread stopped. Absent once it is loaded to its
   *  start, and before its first load has succeeded. */
  cursor?: RestoreCursor;
}

/** Nothing is on its way into this thread, so dropping its Chat loses nothing
 *  that a later select cannot load again. A failed turn is not idle: its error
 *  is only in the Chat. */
function isIdle(thread: ThreadChat): boolean {
  return thread.chat.status === 'ready' && thread.history !== 'loading';
}

export interface UseChatThreadOptions {
  /** Memory resource the threads belong to (the WorkOS user id). */
  resourceId: string;
  /**
   * Runs a thread/memory op against a client built from a freshly-fetched
   * token (with 401 refresh-retry) — see `useMastraClientRunner`. Message
   * loads must survive the access token expiring mid-session, so they go
   * through this rather than a render-time client snapshot.
   */
  run: MastraRunner;
  /** Returns the current WorkOS access token (for the chat transport). */
  getAccessToken: () => Promise<string | null | undefined>;
  /**
   * Called synchronously whenever the visible thread changes (select or new)
   * so per-thread UI state (feedback) can be reset.
   */
  onThreadSwitch: () => void;
  /**
   * Loads persisted feedback for a freshly loaded thread. `isActive` reports
   * whether the user is still viewing `threadId` — implementations must check
   * it after their own awaits so a stale response is dropped.
   */
  loadThreadFeedback: (threadId: string, isActive: () => boolean) => Promise<void>;
  /** Collapses the sidebar when on mobile (no-op on desktop). */
  closeMobileSidebar: () => void;
  /** Moves focus back to the chat input. */
  focusInput: () => void;
}

/**
 * Owns the chat thread lifecycle: which thread is visible, and one Chat per
 * thread that has been opened in this session.
 *
 * Contract:
 * - Each thread has its own Chat, with its own transport, held in a map for
 *   as long as the page is open. Switching thread only changes which Chat
 *   `useChat` reads: an answer on its way keeps streaming into its own Chat
 *   while another thread is shown, and is still streaming, or finished, on
 *   return. `stop` and `sendMessage` act on the visible thread's Chat alone.
 * - A stored thread is read from the server only when its Chat holds nothing.
 *   The response goes into that thread's Chat whichever thread is visible by
 *   then, so it can never land in another thread.
 * - Idle Chats that are off screen are dropped, least recently shown first,
 *   beyond MAX_IDLE_CHATS. A dropped thread is read from the server again
 *   when it is next selected.
 * - Feedback is loaded on every select. `isActive` is true only for the
 *   newest select, so an older response is dropped.
 * - The browser never creates a thread. It picks an id, and the agent
 *   creates the thread when it accepts the first message sent with that id,
 *   titled from that message. Until then the id has no row on the server:
 *   "+ New" and a first message the agent refuses leave nothing behind.
 * - A stored thread opens on its newest messages (see `thread-messages.ts`
 *   for the bound). `history` says whether older ones remain or failed to
 *   load, and `loadEarlierMessages` fetches the next batch above what is shown.
 * - `threadVersion` increments when a response finishes in any thread — used
 *   as the sidebar's refresh key, which is how a new thread and its title appear.
 */
export function useChatThread({
  resourceId,
  run,
  getAccessToken,
  onThreadSwitch,
  loadThreadFeedback,
  closeMobileSidebar,
  focusInput,
}: UseChatThreadOptions) {
  const [threadId, setThreadId] = useState<string>(() => generateUUID());
  const [threadVersion, setThreadVersion] = useState(0);

  // The thread the user is currently viewing, for callbacks that outlive a render.
  const activeThreadRef = useRef(threadId);
  // Counts selects, so a feedback response is used only by the newest one.
  const selectCount = useRef(0);

  // Insertion order is least recently shown first.
  const threads = useRef(new Map<string, ThreadChat>());
  // `history` lives on the thread, not in React state: a re-render reads it.
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  // A Chat outlives the render that built it, so its transport reads the
  // owner and the token source at request time. The first Chat is built
  // before sign-in has resolved, when the owner is still a placeholder.
  const request = useRef({ resourceId, getAccessToken });
  useEffect(() => {
    request.current = { resourceId, getAccessToken };
  }, [resourceId, getAccessToken]);

  // Ids of the messages a turn ended on because the user pressed Stop: the
  // partial answer, or the question itself when no answer had begun. A ref,
  // not message state. The threadVersion bump in onFinish re-renders the
  // page, which is when the lookup is read. Not persisted: after a reload the
  // reason a turn ended is unknown.
  const stoppedIds = useRef(new Set<string>());
  const wasStopped = useCallback((messageId: string) => stoppedIds.current.has(messageId), []);

  const evictIdle = useCallback(() => {
    const idle = [...threads.current].filter(([tid, thread]) => tid !== activeThreadRef.current && isIdle(thread));
    for (const [tid] of idle.slice(0, Math.max(0, idle.length - MAX_IDLE_CHATS))) {
      threads.current.delete(tid);
      debugLog(`[chat] dropped idle chat ${tid.slice(0, 8)}…`);
    }
  }, []);

  /** The thread's Chat, built the first time the thread is asked for. */
  const threadChat = useCallback((tid: string): ThreadChat => {
    const held = threads.current.get(tid);
    if (held) return held;
    const transport = new DefaultChatTransport<UIMessage>({
      api: `${MASTRA_URL}/chat`,
      credentials: 'include' as RequestCredentials,
      headers: async () => {
        const token = await request.current.getAccessToken();
        return token ? { Authorization: `Bearer ${token}` } as Record<string, string> : {} as Record<string, string>;
      },
      prepareSendMessagesRequest({ messages }) {
        // The agent keeps only the newest user message and reads history from
        // its own guarded store, so replaying the thread only grows the body.
        return {
          body: {
            messages: messages.filter(m => m.role === 'user').slice(-1),
            memory: { thread: tid, resource: request.current.resourceId },
          },
        };
      },
    });
    // useChat ignores its own onFinish and onError when it is handed a Chat,
    // and a Chat that is off screen has no hook at all: they are set here.
    const chat = new Chat<UIMessage>({
      id: tid,
      transport,
      onFinish: ({ messages: finished, isAbort }) => {
        const last = finished[finished.length - 1];
        if (isAbort && last) stoppedIds.current.add(last.id);
        setThreadVersion(v => v + 1);
        // A thread that finished off screen has just become idle.
        evictIdle();
      },
      onError: (err) => console.error(`[chat] stream error in thread ${tid.slice(0, 8)}…:`, err),
    });
    const thread: ThreadChat = { chat, history: 'complete' };
    threads.current.set(tid, thread);
    return thread;
  }, [evictIdle]);

  // The one read of the map during render: the visible thread's Chat, built
  // here if this is the first time the thread is shown. It is the same lazy
  // initialisation React allows for a ref, keyed by thread, and gives the
  // same Chat however often the render runs.
  // eslint-disable-next-line react-hooks/refs
  const visible = threadChat(threadId);
  const { messages, status, error, sendMessage, stop } = useChat({ chat: visible.chat });

  const isStreaming = status === 'streaming';
  const isLoading = status === 'streaming' || status === 'submitted';

  // Log status transitions of the visible thread.
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current !== status) {
      const parts = messages.filter(m => m.role === 'assistant').flatMap(m => m.parts);
      const textLen = parts.filter(p => p.type === 'text').reduce((n, p) => n + ((p as { text: string }).text?.length ?? 0), 0);
      const toolCount = parts.filter(p => p.type !== 'text' && p.type !== 'step-start').length;
      debugLog(`[chat] status: ${prevStatus.current} → ${status} | msgs: ${messages.length} | parts: ${parts.length} (text: ${textLen} chars, tools: ${toolCount})`);
      if (status === 'error') {
        console.error('[chat] entered error state', error);
      }
    }
    prevStatus.current = status;
  }, [status, messages, error]);

  const setHistory = useCallback((thread: ThreadChat, history: ThreadHistoryStatus) => {
    thread.history = history;
    rerender();
  }, []);

  /** Makes `tid` the visible thread and settles what is kept in memory. */
  const show = useCallback((tid: string) => {
    const leaving = activeThreadRef.current;
    const left = threads.current.get(leaving);
    // An unused "+ New" page, or a thread that failed to open, holds nothing.
    if (leaving !== tid && left && isIdle(left) && left.chat.messages.length === 0) threads.current.delete(leaving);
    const thread = threadChat(tid);
    threads.current.delete(tid);
    threads.current.set(tid, thread);
    activeThreadRef.current = tid;
    selectCount.current += 1;
    setThreadId(tid);
    evictIdle();
    return thread;
  }, [threadChat, evictIdle]);

  const loadThread = useCallback(async (tid: string, thread: ThreadChat) => {
    if (thread.history === 'loading') return;
    const cursor = thread.cursor;
    setHistory(thread, 'loading');
    let batch: RestoreBatch;
    try {
      batch = await run((client) =>
        loadEarlierThreadMessages(client.getMemoryThread({ threadId: tid, agentId: AGENT_ID }), cursor),
      );
    } catch (err) {
      console.error('Failed to load thread messages:', err);
      setHistory(thread, 'failed');
      return;
    }
    thread.cursor = batch.next ?? undefined;
    // Coalesce each agent turn's split assistant messages (answer / tools /
    // verifier / observational-memory) into one, so a reloaded thread
    // renders like the live stream (Research trail, footnotes, trust badge).
    const converted = coalesceThreadMessages(batch.messages);
    const assistantParts = converted.filter(m => m.role === 'assistant').flatMap(m => m.parts);
    debugLog(`[chat] loadThread ${tid.slice(0, 8)}… | ${batch.messages.length} db msgs → ${converted.length} ui msgs | assistant parts: ${assistantParts.length} (types: ${[...new Set(assistantParts.map(p => p.type))].join(',')})`);
    // Stored messages go above what the Chat holds, which may by now include
    // a turn the user has just asked, still streaming or not. The Chat writes
    // a streamed answer to its last message, so adding above it is safe.
    thread.chat.messages = [...withoutShown(converted, thread.chat.messages), ...thread.chat.messages];
    setHistory(thread, batch.failed ? 'failed' : batch.next ? 'more' : 'complete');
  }, [run, setHistory]);

  const loadEarlierMessages = useCallback(
    () => loadThread(threadId, threadChat(threadId)),
    [loadThread, threadChat, threadId],
  );

  const handleSelectThread = useCallback(async (tid: string) => {
    const thread = show(tid);
    const select = selectCount.current;
    const held = thread.chat.messages.length > 0 || !isIdle(thread);
    debugLog(`[chat] selectThread ${tid.slice(0, 8)}… | held: ${held} | status: ${thread.chat.status}`);
    onThreadSwitch();
    closeMobileSidebar();

    // On every select, whether or not the messages are read again: the page
    // has just dropped the last thread's feedback. Not waited for; it fills
    // in beside the messages.
    void loadThreadFeedback(tid, () => selectCount.current === select)
      .catch((err) => console.error('Failed to load thread feedback:', err));
    // A Chat that holds messages, or has a turn or a load on its way, is
    // shown as it is. Reading the thread again would put a stored copy of a
    // running turn beside the live one.
    if (!held) {
      thread.cursor = undefined;
      await loadThread(tid, thread);
    }

    focusInput();
  }, [show, loadThread, loadThreadFeedback, onThreadSwitch, closeMobileSidebar, focusInput]);

  const handleNewThread = useCallback(async () => {
    if (messages.length === 0) {
      closeMobileSidebar();
      focusInput();
      return;
    }
    // Nothing is created here: the agent creates the thread when it accepts
    // the first message sent with this id. The thread being left keeps its
    // Chat and whatever is streaming into it.
    show(generateUUID());
    onThreadSwitch();
    closeMobileSidebar();
    focusInput();
  }, [messages.length, show, onThreadSwitch, closeMobileSidebar, focusInput]);

  return {
    threadId,
    threadVersion,
    messages,
    status,
    error,
    isStreaming,
    isLoading,
    sendMessage,
    stop,
    wasStopped,
    history: visible.history,
    loadEarlierMessages,
    handleSelectThread,
    handleNewThread,
  };
}
