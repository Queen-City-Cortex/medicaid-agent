'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { PanelLeftOpen, PanelLeftClose, Landmark } from 'lucide-react';
import { useAuth, useAccessToken } from '@workos-inc/authkit-nextjs/components';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatInput } from '@/components/ChatInput';
import { DeepResearchView } from '@/components/DeepResearchView';
import { EmptyState } from '@/components/EmptyState';
import { MessageList } from '@/components/MessageList';
import { ScrollToBottom } from '@/components/ScrollToBottom';
import { ThreadSidebar } from '@/components/ThreadSidebar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useIsMobile } from '@/lib/use-is-mobile';
import { useMastraClientRunner } from '@/lib/use-mastra-client';
import { useAnswerVersions } from '@/lib/use-answer-versions';
import { useChatThread } from '@/lib/use-chat-thread';
import { useDeepResearch } from '@/lib/use-deep-research';
import { useFeedback } from '@/lib/use-feedback';
import { usePinnedScroll } from '@/lib/use-pinned-scroll';
import { useSidebarState } from '@/lib/use-sidebar-state';

export default function ChatPage() {
  const { user, loading: authLoading } = useAuth();
  const { getAccessToken } = useAccessToken();
  const { run } = useMastraClientRunner();
  const isMobile = useIsMobile();

  const resourceId = user?.id ?? 'anonymous';

  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const { sidebarCollapsed, toggleSidebar, closeMobileSidebar, sidebarRef, sidebarToggleRef } =
    useSidebarState({ isMobile });

  const {
    feedbackMap,
    loadFeedback,
    resetFeedback,
    handleRate: rateMessage,
    handleClearRating,
    handleComment: commentOnMessage,
  } = useFeedback({ getAccessToken });

  const {
    archivedVersions,
    activeVersion,
    resetVersions,
    selectVersion,
    handleRerun: rerunAnswer,
  } = useAnswerVersions();

  // Deep Research is a distinct mode (declared before onThreadSwitch so the
  // thread-switch reset can flip back to chat view). A HITL plan-approval gate
  // then a long cited report, driven by the deepResearchWorkflow via the
  // Mastra client — separate from the streaming chat agent.
  const [deepMode, setDeepMode] = useState(false);
  const deepResearch = useDeepResearch({ run });
  // Pull out the stable `reset` callback so onThreadSwitch can depend on it
  // rather than the whole `deepResearch` object (a new reference every render),
  // keeping onThreadSwitch — and the useChatThread callbacks that list it —
  // referentially stable.
  const resetDeepResearch = deepResearch.reset;

  // Feedback, answer versions, and deep-research mode are per-thread client
  // state — drop them all when the visible thread changes. Resetting deep mode
  // here fixes the case where picking a past chat while Deep Research was on
  // left the DeepResearchView mounted and the selection appeared to do nothing.
  const onThreadSwitch = useCallback(() => {
    resetFeedback();
    resetVersions();
    resetDeepResearch();
    setDeepMode(false);
  }, [resetFeedback, resetVersions, resetDeepResearch]);

  const {
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
    handleSelectThread,
    handleNewThread,
  } = useChatThread({
    resourceId,
    run,
    getAccessToken,
    onThreadSwitch,
    loadThreadFeedback: loadFeedback,
    closeMobileSidebar,
    focusInput,
  });

  const { viewport, messagesEndRef } = usePinnedScroll({ messages, status });

  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);

  // Reset textarea height when input is cleared
  useEffect(() => {
    if (!input && inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [input]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || input.length > 10_000) return;
    const question = input;
    setInput('');
    if (deepMode) {
      await deepResearch.start(question);
      return;
    }
    try {
      if (messages.length === 0) {
        await ensureThreadExists(threadId, question.slice(0, 60));
      }
      await sendMessage({ text: question });
    } catch (err) {
      // A transient send/transport failure must not silently swallow the
      // user's typed question — restore it so they can retry without retyping.
      // Don't clobber text they've already begun typing again during the await.
      console.error('[chat] send failed; restoring input', err);
      setInput((current) => (current ? current : question));
    }
  }, [input, deepMode, deepResearch, messages.length, threadId, ensureThreadExists, sendMessage]);

  // Toggling Deep Research OFF discards its (now-irrelevant) plan/report state
  // so flipping back to chat — or toggling on again — starts clean.
  const toggleDeepResearch = useCallback(() => {
    if (deepMode) deepResearch.reset();
    setDeepMode((v) => !v);
  }, [deepMode, deepResearch]);

  const handleRerun = useCallback((messageIndex: number, userIndex: number) => {
    rerunAnswer({ messages, regenerate, messageIndex, userIndex });
  }, [rerunAnswer, messages, regenerate]);

  const handleSelectExample = useCallback((question: string) => {
    setInput(question);
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const handleRate = useCallback((messageId: string, rating: 'up' | 'down') =>
    rateMessage(threadId, messageId, rating), [rateMessage, threadId]);

  const handleComment = useCallback((messageId: string, comment: string) =>
    commentOnMessage(threadId, messageId, comment), [commentOnMessage, threadId]);

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
    <div className="flex h-screen bg-background overflow-hidden print:h-auto print:overflow-visible">
      {/* Sidebar — fixed overlay on mobile, in-flow on desktop */}
      <div
        ref={sidebarRef}
        id="thread-sidebar"
        aria-hidden={sidebarCollapsed || undefined}
        inert={sidebarCollapsed}
        className={[
        'flex flex-col h-full bg-sidebar border-r border-sidebar-border print:hidden',
        'fixed inset-y-0 left-0 z-40 w-[280px] transition-transform duration-200',
        sidebarCollapsed ? '-translate-x-full' : 'translate-x-0',
        'md:relative md:z-auto md:translate-x-0 md:transition-[width] md:shrink-0 md:overflow-hidden',
        sidebarCollapsed ? 'md:w-0' : 'md:w-[280px]',
      ].join(' ')}
      >
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

      {/* Main chat area — inert while the mobile sidebar overlay is open so
          background content can't be tabbed into behind the backdrop */}
      <div className="flex flex-col flex-1 min-w-0" inert={isMobile && !sidebarCollapsed}>
        {/* Masthead — a thin gold "letterhead" rule sits across the very top
            (the ::after gradient), signalling an official record. */}
        <header className="relative border-b border-border bg-card px-4 md:px-8 py-4 shrink-0 print:hidden after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-accent/70 after:to-transparent">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <button
              ref={sidebarToggleRef}
              onClick={toggleSidebar}
              aria-controls="thread-sidebar"
              aria-expanded={!sidebarCollapsed}
              className="p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-md bg-accent/12 text-accent ring-1 ring-accent/25"
            >
              <Landmark className="size-4" />
            </span>
            <div className="min-w-0">
              <h1 className="font-heading text-xl md:text-2xl font-semibold leading-none tracking-tight text-foreground truncate">
                NC Medicaid Navigator
              </h1>
              <span className="mt-1 hidden font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:block">
                Policy Research · Queen City Cortex
              </span>
            </div>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 relative">
        <ScrollArea className="h-full bg-background">
          <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 space-y-8">
            {deepMode ? (
              <DeepResearchView controller={deepResearch} />
            ) : (
            <>
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
              onRate={handleRate}
              onClearRating={handleClearRating}
              onComment={handleComment}
              archivedVersions={archivedVersions}
              activeVersion={activeVersion}
              onSelectVersion={selectVersion}
            />

            {error && (
              <div data-testid="assistant-message" className="pl-2 mt-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <p>Sorry, there was an error processing your question.</p>
                  <button
                    type="button"
                    onClick={() => regenerate()}
                    className="mt-2 inline-flex items-center rounded-md border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}
            </>
            )}
          </div>
        </ScrollArea>
        <ScrollToBottom viewport={viewport} hasMessages={messages.length > 0 || isLoading} />
        </div>

        <ChatInput
          input={input}
          setInput={setInput}
          isLoading={deepMode ? deepResearch.isBusy : isLoading}
          onSend={handleSend}
          onStop={deepMode ? undefined : stop}
          inputRef={inputRef}
          deepResearch={deepMode}
          onToggleDeepResearch={toggleDeepResearch}
        />
      </div>
    </div>
  );
}
