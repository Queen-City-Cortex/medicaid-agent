'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { useAuth, useAccessToken } from '@workos-inc/authkit-nextjs/components';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ChatInput } from '@/components/ChatInput';
import { EmptyState } from '@/components/EmptyState';
import { MessageList } from '@/components/MessageList';
import { ScrollToBottom } from '@/components/ScrollToBottom';
import { ThreadSidebar } from '@/components/ThreadSidebar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useIsMobile } from '@/lib/use-is-mobile';
import { generateUUID } from '@/lib/utils';
import { convertThreadMessageToUIMessage } from '@/lib/parse-message';
import { useMastraClient } from '@/lib/use-mastra-client';
import { submitFeedback, deleteFeedback, getFeedbackByThread } from '@/lib/feedback-client';

const AGENT_ID = 'nc-medicaid-navigator';
const MASTRA_URL = process.env.NEXT_PUBLIC_MASTRA_URL || 'http://localhost:4111';

export default function ChatPage() {
  const { user, loading: authLoading } = useAuth();
  const { getAccessToken } = useAccessToken();
  const mastraClient = useMastraClient();
  const [threadId, setThreadId] = useState<string>(() => generateUUID());
  const [threadVersion, setThreadVersion] = useState(0);
  const isMobile = useIsMobile();

  const resourceId = user?.id ?? 'anonymous';

  const [feedbackMap, setFeedbackMap] = useState<Record<string, { id: string; rating: 'up' | 'down'; comment: string | null }>>({});

  // Bridges savePerStep's async DB writes: caches messages when streaming ends
  // so clicking "+New" then back shows the complete response, not a partial DB snapshot.
  const messageCache = useRef<Map<string, UIMessage[]>>(new Map());
  const pendingRestore = useRef<UIMessage[] | null>(null);

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

  const { messages, status, error, sendMessage, setMessages } = useChat({
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

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const viewportRef = useRef<HTMLElement | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    if (window.innerWidth < 768) return true;
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  }, []);

  // Auto-scroll on new content
  useEffect(() => {
    const el = messagesEndRef.current;
    const viewport = el?.closest('[data-slot="scroll-area-viewport"]');
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, status]);

  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);

  // Re-grab viewport ref whenever messages change
  useEffect(() => {
    const el = messagesEndRef.current?.closest('[data-slot="scroll-area-viewport"]');
    if (el) viewportRef.current = el as HTMLElement;
  }, [messages]);

  // Reset textarea height when input is cleared
  useEffect(() => {
    if (!input && inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [input]);


  const ensureThreadExists = useCallback(async (tid: string, title?: string) => {
    try {
      await mastraClient.createMemoryThread({
        threadId: tid,
        resourceId,
        agentId: AGENT_ID,
        title: title ?? 'New conversation',
      });
    } catch {
      // Thread may already exist — that's fine
    }
  }, [resourceId, mastraClient]);

  const loadThread = useCallback(async (tid: string) => {
    try {
      const thread = mastraClient.getMemoryThread({ threadId: tid, agentId: AGENT_ID });
      const result = await thread.listMessages();
      const dbMessages = result.messages ?? [];
      const converted: UIMessage[] = [];
      for (const msg of dbMessages) {
        const uiMsg = convertThreadMessageToUIMessage(msg as { id?: string; role: string; content: unknown });
        if (uiMsg) converted.push(uiMsg);
      }
      const assistantParts = converted.filter(m => m.role === 'assistant').flatMap(m => m.parts);
      console.log(`[chat] loadThread ${tid.slice(0, 8)}… | ${dbMessages.length} db msgs → ${converted.length} ui msgs | assistant parts: ${assistantParts.length} (types: ${[...new Set(assistantParts.map(p => p.type))].join(',')})`);
      setMessages(converted);
      try {
        const token = await getAccessToken();
        if (token) {
          const entries = await getFeedbackByThread(tid, MASTRA_URL, token);
          const map: Record<string, { id: string; rating: 'up' | 'down'; comment: string | null }> = {};
          for (const entry of entries) {
            map[entry.messageId] = { id: entry.id, rating: entry.rating, comment: entry.comment };
          }
          setFeedbackMap(map);
        }
      } catch (err) {
        console.error('Failed to load feedback:', err);
      }
    } catch (err) {
      console.error('Failed to load thread messages:', err);
      setMessages([]);
    }
  }, [setMessages, mastraClient, getAccessToken]);

  const handleSelectThread = useCallback(async (tid: string) => {
    const hasCached = messageCache.current.has(tid);
    console.log(`[chat] selectThread ${tid.slice(0, 8)}… | cached: ${hasCached}`);
    setThreadId(tid);
    setFeedbackMap({});
    if (isMobile) setSidebarCollapsed(true);

    const cached = messageCache.current.get(tid);
    if (cached && cached.length > 0) {
      pendingRestore.current = cached;
      messageCache.current.delete(tid);
    } else {
      pendingRestore.current = null;
      await loadThread(tid);
    }

    inputRef.current?.focus({ preventScroll: true });
  }, [loadThread, setMessages, isMobile]);

  const handleNewThread = useCallback(async () => {
    if (messages.length === 0) {
      if (isMobile) setSidebarCollapsed(true);
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    const newId = generateUUID();
    setThreadId(newId);
    setMessages([]);
    setFeedbackMap({});
    if (isMobile) setSidebarCollapsed(true);
    await ensureThreadExists(newId);
    inputRef.current?.focus({ preventScroll: true });
  }, [messages.length, setMessages, ensureThreadExists, isMobile]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || input.length > 10_000) return;
    const question = input;
    setInput('');
    if (messages.length === 0) {
      await ensureThreadExists(threadId, question.slice(0, 60));
    }
    await sendMessage({ text: question });
  }, [input, messages.length, threadId, ensureThreadExists, sendMessage]);

  const handleRerun = useCallback((messageIndex: number, userIndex: number) => {
    const userText = messages[userIndex].parts
      .filter(p => p.type === 'text')
      .map(p => (p as { text: string }).text)
      .join('');
    const newMessages = messages.filter((_, idx) => idx !== messageIndex && idx !== userIndex);
    setMessages(newMessages);
    sendMessage({ text: userText });
  }, [messages, setMessages, sendMessage]);

  const handleSelectExample = useCallback((question: string) => {
    setInput(question);
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const handleRate = useCallback(async (messageId: string, rating: 'up' | 'down') => {
    const prev = feedbackMap[messageId];
    const optimistic = { id: prev?.id ?? messageId, rating, comment: null };
    setFeedbackMap(m => ({ ...m, [messageId]: optimistic }));

    try {
      const token = await getAccessToken();
      if (!token) return;
      const result = await submitFeedback({ messageId, threadId, rating }, MASTRA_URL, token);
      setFeedbackMap(m => ({ ...m, [messageId]: { ...m[messageId], id: result.id } }));
    } catch {
      if (prev) setFeedbackMap(m => ({ ...m, [messageId]: prev }));
      else setFeedbackMap(m => { const { [messageId]: _, ...rest } = m; return rest; });
    }
  }, [feedbackMap, threadId, getAccessToken]);

  const handleClearRating = useCallback(async (messageId: string) => {
    const prev = feedbackMap[messageId];
    if (!prev) return;
    setFeedbackMap(m => { const { [messageId]: _, ...rest } = m; return rest; });

    try {
      const token = await getAccessToken();
      if (!token) return;
      await deleteFeedback(prev.id, MASTRA_URL, token);
    } catch {
      setFeedbackMap(m => ({ ...m, [messageId]: prev }));
    }
  }, [feedbackMap, getAccessToken]);

  const handleComment = useCallback(async (messageId: string, comment: string) => {
    const prev = feedbackMap[messageId];
    if (!prev) return;
    setFeedbackMap(m => ({ ...m, [messageId]: { ...m[messageId], comment } }));

    try {
      const token = await getAccessToken();
      if (!token) return;
      await submitFeedback({ messageId, threadId, rating: 'down', comment }, MASTRA_URL, token);
    } catch {
      setFeedbackMap(m => ({ ...m, [messageId]: prev }));
    }
  }, [feedbackMap, threadId, getAccessToken]);

  if (authLoading) return (
    <div className="flex h-screen bg-background">
      <div className="hidden md:block w-[280px] bg-sidebar border-r border-sidebar-border shrink-0" />
      <div className="flex flex-col flex-1">
        <div className="border-b border-border bg-card px-8 py-5 shrink-0">
          <div className="max-w-3xl mx-auto h-8 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex-1" />
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar — fixed overlay on mobile, in-flow on desktop */}
      <div className={[
        'flex flex-col h-full bg-sidebar border-r border-sidebar-border',
        'fixed inset-y-0 left-0 z-40 w-[280px] transition-transform duration-200',
        sidebarCollapsed ? '-translate-x-full' : 'translate-x-0',
        'md:relative md:z-auto md:translate-x-0 md:transition-[width] md:shrink-0 md:overflow-hidden',
        sidebarCollapsed ? 'md:w-0' : 'md:w-[280px]',
      ].join(' ')}>
        <ThreadSidebar
          currentThreadId={threadId}
          resourceId={resourceId}
          refreshKey={threadVersion}
          onSelectThread={handleSelectThread}
          onNewThread={handleNewThread}
        />
      </div>

      {/* Mobile backdrop */}
      {!sidebarCollapsed && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="border-b border-border bg-card px-4 md:px-8 py-5 shrink-0">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
              NC Medicaid Navigator
            </h1>
            <Separator orientation="vertical" className="h-5 hidden md:block" />
            <span className="text-sm text-muted-foreground hidden md:inline">Policy Research</span>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 relative">
        <ScrollArea className="h-full bg-background">
          <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 space-y-8">
            {messages.length === 0 && !isLoading && (
              <EmptyState onSelectExample={handleSelectExample} />
            )}

            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              status={status}
              onRerun={handleRerun}
              messagesEndRef={messagesEndRef}
              feedbackMap={feedbackMap}
              threadId={threadId}
              onRate={handleRate}
              onClearRating={handleClearRating}
              onComment={handleComment}
            />

            {error && (
              <div data-testid="assistant-message" className="pl-2 mt-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  Sorry, there was an error processing your question. Please try again.
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <ScrollToBottom viewportRef={viewportRef} hasMessages={messages.length > 0 || isLoading} />
        </div>

        <ChatInput
          input={input}
          setInput={setInput}
          isLoading={isLoading}
          onSend={handleSend}
          inputRef={inputRef}
        />
      </div>
    </div>
  );
}
