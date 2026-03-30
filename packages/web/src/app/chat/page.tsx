'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { useAuth } from '@workos-inc/authkit-nextjs/components';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { MessageActions } from '@/components/MessageActions';
import { ResearchTrace } from '@/components/ResearchTrace';
import { ScrollToBottom } from '@/components/ScrollToBottom';
import { ThreadSidebar } from '@/components/ThreadSidebar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useIsMobile } from '@/lib/use-is-mobile';
import { generateUUID } from '@/lib/utils';
import { convertThreadMessageToUIMessage } from '@/lib/parse-message';
import { extractMessageParts } from '@/lib/message-parts';
import { mastraClient } from '@/lib/mastra-client';

const AGENT_ID = 'nc-medicaid-navigator';
const MASTRA_URL = process.env.NEXT_PUBLIC_MASTRA_URL || 'http://localhost:4111';

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
  const isMobile = useIsMobile();

  const resourceId = user?.id ?? 'anonymous';

  // Transport re-creates when threadId/resourceId change — this also resets useChat state
  const transport = useMemo(() => new DefaultChatTransport({
    api: `${MASTRA_URL}/chat`,
    credentials: 'include' as RequestCredentials,
    prepareSendMessagesRequest({ messages }) {
      return {
        body: {
          messages,
          memory: { thread: threadId, resource: resourceId },
        },
      };
    },
  }), [threadId, resourceId]);

  const { messages, status, sendMessage, setMessages } = useChat({
    id: threadId,
    transport,
    onFinish: () => setThreadVersion(v => v + 1),
  });

  const isStreaming = status === 'streaming';
  const isLoading = status === 'streaming' || status === 'submitted';

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
  });

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
  }, [resourceId]);

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
      setMessages(converted);
    } catch (err) {
      console.error('Failed to load thread messages:', err);
      setMessages([]);
    }
  }, [setMessages]);

  const handleSelectThread = useCallback(async (tid: string) => {
    setThreadId(tid);
    setMessages([]);
    if (isMobile) setSidebarCollapsed(true);
    await loadThread(tid);
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
    if (isMobile) setSidebarCollapsed(true);
    await ensureThreadExists(newId);
    inputRef.current?.focus({ preventScroll: true });
  }, [messages.length, setMessages, ensureThreadExists, isMobile]);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const question = input;
    setInput('');
    if (messages.length === 0) {
      await ensureThreadExists(threadId, question.slice(0, 60));
    }
    await sendMessage({ text: question });
  }, [input, messages.length, threadId, ensureThreadExists, sendMessage]);

  if (authLoading) return null;

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

            {/* Messages */}
            {messages.map((msg, i) => (
              <div key={msg.id} className="group">
                {msg.role === 'user' && (
                  <div className="flex justify-end mb-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div data-testid="user-message" className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-5 py-3 max-w-[75%] shadow-sm">
                      <p className="text-sm leading-relaxed">
                        {msg.parts.filter(p => p.type === 'text').map(p => (p as { text: string }).text).join('')}
                      </p>
                    </div>
                  </div>
                )}

                {msg.role === 'assistant' && (() => {
                  const { traceEntries, answerText } = extractMessageParts(msg);
                  const isThisStreaming = isStreaming && i === messages.length - 1;

                  return (
                    <div data-testid="assistant-message" className="pl-2 mt-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      {traceEntries.length > 0 && (
                        <div className={`border-l-2 ${isThisStreaming ? 'border-accent/30' : 'border-border'} pl-4 mb-4`}>
                          <ResearchTrace entries={traceEntries} live={isThisStreaming} />
                        </div>
                      )}

                      {answerText && (
                        <div className={PROSE}>
                          <ReactMarkdown>{answerText}</ReactMarkdown>
                          {isThisStreaming && (
                            <span className="inline-block w-0.5 h-5 bg-accent animate-pulse ml-0.5 -mb-1" />
                          )}
                        </div>
                      )}

                      {/* Loading indicator when no content yet */}
                      {isThisStreaming && !answerText && traceEntries.length === 0 && (
                        <div data-testid="loading-indicator" className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                          Starting research...
                        </div>
                      )}

                      {!isThisStreaming && answerText && (
                        <MessageActions
                          content={answerText}
                          onRerun={() => {
                            let userIdx = -1;
                            for (let j = i - 1; j >= 0; j--) {
                              if (messages[j].role === 'user') { userIdx = j; break; }
                            }
                            if (userIdx === -1) return;
                            const userText = messages[userIdx].parts
                              .filter(p => p.type === 'text')
                              .map(p => (p as { text: string }).text)
                              .join('');
                            const newMessages = messages.filter((_, idx) => idx !== i && idx !== userIdx);
                            setMessages(newMessages);
                            sendMessage({ text: userText });
                          }}
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}

            {/* Submitted but no assistant message yet */}
            {status === 'submitted' && (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant') && (
              <div className="pl-2 mt-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div data-testid="loading-indicator" className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  Starting research...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        <ScrollToBottom viewportRef={viewportRef} hasMessages={messages.length > 0 || isLoading} />
        </div>

        <footer className="border-t border-border bg-card px-4 md:px-8 py-5 shrink-0">
          <div className="max-w-3xl mx-auto flex gap-3">
            <textarea
              ref={inputRef}
              rows={1}
              data-testid="chat-input"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about NC Medicaid policy..."
              className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow resize-none overflow-y-auto scrollbar-none"
              style={{ maxHeight: '120px' }}
              disabled={isLoading}
            />
            <Button data-testid="send-button" onClick={handleSend} disabled={isLoading || !input.trim()} className="px-6 self-end">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Researching
                </span>
              ) : 'Ask'}
            </Button>
          </div>
          <p className="max-w-3xl mx-auto text-xs text-muted-foreground/70 mt-2">
            Answers are AI-generated from NC Medicaid policy documents. Verify critical information with DHHS.
          </p>
        </footer>
      </div>
    </div>
  );
}
