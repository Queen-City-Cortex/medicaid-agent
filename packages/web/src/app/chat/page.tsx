'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { useAuth } from '@workos-inc/authkit-nextjs/components';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { MessageActions } from '@/components/MessageActions';
import { ResearchTrace } from '@/components/ResearchTrace';
import { ScrollToBottom } from '@/components/ScrollToBottom';
import { ThreadSidebar } from '@/components/ThreadSidebar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAgentStream } from '@/lib/use-agent-stream';
import { generateUUID } from '@/lib/utils';
import { mastraClient } from '@/lib/mastra-client';

const AGENT_ID = 'nc-medicaid-navigator';

const PROSE = 'prose prose-sm dark:prose-invert max-w-none prose-headings:font-heading prose-headings:tracking-tight prose-h2:text-lg prose-h3:text-base prose-p:leading-relaxed prose-li:leading-relaxed prose-strong:text-foreground';

const EXAMPLES = [
  'Does NC Medicaid cover chiropractic services?',
  'What is the earned income limit for HCWD?',
  'How many days of therapeutic leave are allowed for nursing facility residents?',
];

export default function ChatPage() {
  const { user, loading: authLoading } = useAuth();
  const [threadId, setThreadId] = useState<string>(() => generateUUID());
  const [threadVersion, setThreadVersion] = useState(0);

  const resourceId = user?.id ?? 'anonymous';

  const {
    messages, isLoading, streamText, streamTimeline,
    sendMessage, setMessages, loadThread,
  } = useAgentStream({
    threadId,
    resourceId,
    onComplete: () => setThreadVersion(v => v + 1),
  });

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLElement | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    // Scroll the ScrollArea viewport — NOT scrollIntoView which walks up and
    // scrolls the overflow:hidden layout root, pushing the sidebar off-screen.
    const el = messagesEndRef.current;
    const viewport = el?.closest('[data-slot="scroll-area-viewport"]');
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, streamTimeline, streamText]);

  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);

  // Re-grab viewport ref whenever messages change (ensures it's set after auth resolves)
  useEffect(() => {
    const el = messagesEndRef.current?.closest('[data-slot="scroll-area-viewport"]');
    if (el) viewportRef.current = el as HTMLElement;
  });

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
  }, [resourceId]);

  const handleSelectThread = useCallback(async (tid: string) => {
    setThreadId(tid);
    setMessages([]);
    await loadThread(tid);
    inputRef.current?.focus({ preventScroll: true });
  }, [loadThread, setMessages]);

  const handleNewThread = useCallback(async () => {
    // Don't create another thread if the current one is empty
    if (messages.length === 0) {
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    const newId = generateUUID();
    setThreadId(newId);
    setMessages([]);
    await ensureThreadExists(newId);
    inputRef.current?.focus({ preventScroll: true });
  }, [messages.length, setMessages, ensureThreadExists]);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const question = input;
    setInput('');
    if (messages.length === 0) {
      await ensureThreadExists(threadId, question.slice(0, 60));
    }
    await sendMessage(question);
  }, [input, messages.length, threadId, ensureThreadExists, sendMessage]);

  const isStreaming = isLoading && (streamTimeline.length > 0 || !!streamText);

  if (authLoading) return null;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar toggle — fixed position so it never moves */}
      <button
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-50 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
      >
        {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
      </button>

      {/* Sidebar */}
      <div className={`shrink-0 flex flex-col h-full transition-all duration-200 overflow-hidden ${sidebarCollapsed ? 'w-0' : 'w-[280px]'}`}>
        <ThreadSidebar
          currentThreadId={threadId}
          resourceId={resourceId}
          refreshKey={threadVersion}
          onSelectThread={handleSelectThread}
          onNewThread={handleNewThread}
        />
      </div>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="border-b border-border bg-card px-8 py-5 shrink-0">
          <div className="max-w-3xl mx-auto flex items-baseline gap-3">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
              NC Medicaid Navigator
            </h1>
            <Separator orientation="vertical" className="h-5" />
            <span className="text-sm text-muted-foreground">Policy Research</span>
            <div className="ml-auto self-center">
              <ThemeToggle />
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 relative">
        <ScrollArea className="h-full">
          <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
            {/* Empty state */}
            {messages.length === 0 && !isLoading && (
              <div className="py-20 text-center">
                <h2 data-testid="empty-state" className="font-heading text-3xl font-semibold tracking-tight text-foreground mb-2">
                  What would you like to know?
                </h2>
                <p className="text-muted-foreground mb-10">
                  Research NC Medicaid policy across 2,000+ documents
                </p>
                <div className="grid gap-3 max-w-lg mx-auto">
                  {EXAMPLES.map((q, i) => (
                    <button
                      key={i}
                      data-testid="example-card"
                      onClick={() => { setInput(q); inputRef.current?.focus({ preventScroll: true }); }}
                      className="text-left px-4 py-3 rounded-lg border border-border bg-card text-sm text-foreground hover:border-accent hover:bg-muted transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Completed messages */}
            {messages.map((msg, i) => (
              <div key={i} className="group">
                {msg.role === 'user' && (
                  <div className="flex justify-end mb-6">
                    <div data-testid="user-message" className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-5 py-3 max-w-[75%]">
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                )}

                {msg.role === 'assistant' && (
                  <div data-testid="assistant-message" className="pl-2 mt-6">
                    {msg.timeline && msg.timeline.length > 0 && (
                      <div className="border-l-2 border-border pl-4 mb-4">
                        <ResearchTrace timeline={msg.timeline} />
                      </div>
                    )}
                    <div className={PROSE}>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    <MessageActions
                      content={msg.content}
                      onRerun={() => {
                        // Find the preceding user message index
                        let userIdx = -1;
                        for (let j = i - 1; j >= 0; j--) {
                          if (messages[j].role === 'user') { userIdx = j; break; }
                        }
                        if (userIdx === -1) return;
                        const question = messages[userIdx].content;
                        // Remove both the user message and this assistant response
                        // (sendMessage will re-add the user message)
                        setMessages(prev => prev.filter((_, idx) => idx !== i && idx !== userIdx));
                        sendMessage(question);
                      }}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Live streaming state */}
            {(isStreaming || (isLoading && !isStreaming)) && (
              <div className="pl-2 mt-6">
                {/* Research trace with left border while streaming */}
                {streamTimeline.length > 0 && (
                  <div className="border-l-2 border-accent/30 pl-4 mb-4">
                    <ResearchTrace timeline={streamTimeline} live />
                  </div>
                )}

                {/* Streaming answer text */}
                {streamText && (
                  <div className={PROSE}>
                    <ReactMarkdown>{streamText}</ReactMarkdown>
                    <span className="inline-block w-0.5 h-5 bg-accent animate-pulse ml-0.5 -mb-1" />
                  </div>
                )}

                {/* Initial loading indicator before any content arrives */}
                {!streamText && streamTimeline.length === 0 && (
                  <div data-testid="loading-indicator" className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    Starting research...
                  </div>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        <ScrollToBottom viewportRef={viewportRef} />
        </div>

        <footer className="border-t border-border bg-card px-8 py-5 shrink-0">
          <div className="max-w-3xl mx-auto flex gap-3">
            <input
              ref={inputRef}
              type="text"
              data-testid="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Ask about NC Medicaid policy..."
              className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
              disabled={isLoading}
            />
            <Button data-testid="send-button" onClick={handleSend} disabled={isLoading || !input.trim()} className="px-6">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Researching
                </span>
              ) : 'Ask'}
            </Button>
          </div>
          <p className="max-w-3xl mx-auto text-[11px] text-muted-foreground/50 mt-2">
            Answers are AI-generated from NC Medicaid policy documents. Verify critical information with DHHS.
          </p>
        </footer>
      </div>
    </div>
  );
}
