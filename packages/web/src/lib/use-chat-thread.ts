'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { generateUUID } from '@/lib/utils';
import { convertThreadMessageToUIMessage } from '@/lib/parse-message';
import { MASTRA_URL } from '@/lib/mastra-url';
import type { MastraRunner } from '@/lib/use-mastra-client';

const AGENT_ID = 'nc-medicaid-navigator';

export interface UseChatThreadOptions {
  /** Memory resource the threads belong to (the WorkOS user id). */
  resourceId: string;
  /**
   * Runs a thread/memory op against a client built from a freshly-fetched
   * token (with 401 refresh-retry) — see `useMastraClientRunner`. Thread
   * creation + message loads must survive the access token expiring
   * mid-session, so they go through this rather than a render-time client
   * snapshot.
   */
  run: MastraRunner;
  /** Returns the current WorkOS access token (for the chat transport). */
  getAccessToken: () => Promise<string | null | undefined>;
  /**
   * Called synchronously whenever the visible thread changes (select or new)
   * so per-thread UI state (feedback, answer versions) can be reset.
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
 * Owns the chat thread lifecycle: threadId state, the useChat transport
 * wiring, and the message cache that bridges savePerStep's async DB writes.
 *
 * Contract:
 * - `handleSelectThread` guards against stale `loadThread` responses via
 *   `activeThreadRef` — a slow response for a thread the user has already
 *   navigated away from never overwrites the newer thread's messages.
 * - Completed streams are cached per-thread so switching away and back shows
 *   the complete response even before the DB write settles.
 * - New threads are created lazily on first send (see `ensureThreadExists`),
 *   never eagerly on "+ New".
 * - `threadVersion` increments when a response finishes — used as the
 *   sidebar's refresh key.
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

  // Bridges savePerStep's async DB writes: caches messages when streaming ends
  // so clicking "+New" then back shows the complete response, not a partial DB snapshot.
  const messageCache = useRef<Map<string, UIMessage[]>>(new Map());
  const pendingRestore = useRef<UIMessage[] | null>(null);

  // The thread the user is currently viewing — guards against a slow
  // loadThread response overwriting a newer selection.
  const activeThreadRef = useRef(threadId);

  // Transport re-creates when threadId/resourceId change — this also resets useChat state
  const transport = useMemo(() => new DefaultChatTransport({
    api: `${MASTRA_URL}/chat`,
    credentials: 'include' as RequestCredentials,
    headers: async () => {
      const token = await getAccessToken();
      return token ? { Authorization: `Bearer ${token}` } as Record<string, string> : {} as Record<string, string>;
    },
    prepareSendMessagesRequest({ messages }) {
      return {
        body: {
          messages,
          memory: { thread: threadId, resource: resourceId },
        },
      };
    },
  }), [threadId, resourceId, getAccessToken]);

  const { messages, status, error, sendMessage, regenerate, setMessages, stop } = useChat({
    id: `${threadId}:${resourceId}`,
    transport,
    onFinish: () => setThreadVersion(v => v + 1),
    onError: (err) => console.error('[chat] stream error:', err),
  });

  const isStreaming = status === 'streaming';
  const isLoading = status === 'streaming' || status === 'submitted';

  // Restore cached messages after useChat recreates its Chat instance.
  // setMessages in handleSelectThread writes to the old instance; this effect
  // fires after the new instance mounts and applies the pending restore.
  useEffect(() => {
    if (pendingRestore.current) {
      console.log(`[chat] restoring ${pendingRestore.current.length} cached messages`);
      setMessages(pendingRestore.current);
      pendingRestore.current = null;
    }
  }, [threadId, setMessages]);

  // Log status transitions and cache messages when streaming completes.
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current !== status) {
      const parts = messages.filter(m => m.role === 'assistant').flatMap(m => m.parts);
      const textLen = parts.filter(p => p.type === 'text').reduce((n, p) => n + ((p as { text: string }).text?.length ?? 0), 0);
      const toolCount = parts.filter(p => p.type !== 'text' && p.type !== 'step-start').length;
      console.log(`[chat] status: ${prevStatus.current} → ${status} | msgs: ${messages.length} | parts: ${parts.length} (text: ${textLen} chars, tools: ${toolCount})`);

      if (prevStatus.current === 'streaming' && status === 'ready' && messages.length > 0) {
        messageCache.current.set(threadId, messages);
        console.log(`[chat] cached ${messages.length} messages for thread ${threadId.slice(0, 8)}…`);
      }
      if (status === 'error') {
        console.error('[chat] entered error state', error);
      }
    }
    prevStatus.current = status;
  }, [status, threadId, messages, error]);

  const ensureThreadExists = useCallback(async (tid: string, title?: string) => {
    try {
      await run((client) =>
        client.createMemoryThread({
          threadId: tid,
          resourceId,
          agentId: AGENT_ID,
          title: title ?? 'New conversation',
        }),
      );
    } catch {
      // Thread may already exist — that's fine
    }
  }, [resourceId, run]);

  const loadThread = useCallback(async (tid: string) => {
    try {
      const result = await run((client) =>
        client.getMemoryThread({ threadId: tid, agentId: AGENT_ID }).listMessages(),
      );
      // The user may have switched threads while this request was in flight —
      // a stale response must not overwrite the newer thread's messages.
      if (activeThreadRef.current !== tid) return;
      const dbMessages = result.messages ?? [];
      const converted: UIMessage[] = [];
      for (const msg of dbMessages) {
        const uiMsg = convertThreadMessageToUIMessage(
          msg as { id?: string; role: string; content: unknown; createdAt?: string | Date },
        );
        if (uiMsg) converted.push(uiMsg);
      }
      const assistantParts = converted.filter(m => m.role === 'assistant').flatMap(m => m.parts);
      console.log(`[chat] loadThread ${tid.slice(0, 8)}… | ${dbMessages.length} db msgs → ${converted.length} ui msgs | assistant parts: ${assistantParts.length} (types: ${[...new Set(assistantParts.map(p => p.type))].join(',')})`);
      setMessages(converted);
      await loadThreadFeedback(tid, () => activeThreadRef.current === tid);
    } catch (err) {
      console.error('Failed to load thread messages:', err);
      if (activeThreadRef.current === tid) setMessages([]);
    }
  }, [setMessages, run, loadThreadFeedback]);

  const handleSelectThread = useCallback(async (tid: string) => {
    const hasCached = messageCache.current.has(tid);
    console.log(`[chat] selectThread ${tid.slice(0, 8)}… | cached: ${hasCached}`);
    activeThreadRef.current = tid;
    setThreadId(tid);
    onThreadSwitch();
    closeMobileSidebar();

    const cached = messageCache.current.get(tid);
    if (cached && cached.length > 0) {
      pendingRestore.current = cached;
      messageCache.current.delete(tid);
    } else {
      pendingRestore.current = null;
      await loadThread(tid);
    }

    focusInput();
  }, [loadThread, onThreadSwitch, closeMobileSidebar, focusInput]);

  const handleNewThread = useCallback(async () => {
    if (messages.length === 0) {
      closeMobileSidebar();
      focusInput();
      return;
    }
    const newId = generateUUID();
    activeThreadRef.current = newId;
    setThreadId(newId);
    setMessages([]);
    onThreadSwitch();
    closeMobileSidebar();
    // The thread is created lazily by handleSend (with the question as its
    // title) — eager creation here accumulated empty "New conversation"
    // threads in the sidebar for every + New click.
    focusInput();
  }, [messages.length, setMessages, onThreadSwitch, closeMobileSidebar, focusInput]);

  return {
    threadId,
    threadVersion,
    messages,
    status,
    error,
    isStreaming,
    isLoading,
    sendMessage,
    regenerate,
    stop,
    ensureThreadExists,
    loadThread,
    handleSelectThread,
    handleNewThread,
  };
}
