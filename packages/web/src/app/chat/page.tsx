'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

type TimelineEntry =
  | { type: 'reasoning'; text: string }
  | { type: 'tool'; name: string; status: 'running' | 'done' };

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timeline?: TimelineEntry[];
}

const TOOL_LABELS: Record<string, string> = {
  searchSections: 'Searching policies',
  getSection: 'Reading section',
  getDocument: 'Loading document',
  getSectionContext: 'Checking hierarchy',
  followReferences: 'Following references',
  getAmendments: 'Checking amendments',
  findConceptSections: 'Finding concepts',
  lookupPolicy: 'Looking up policy',
};

const TOOL_ICONS: Record<string, string> = {
  searchSections: '🔍',
  getSection: '📄',
  getDocument: '📋',
  getSectionContext: '🔗',
  followReferences: '↗',
  getAmendments: '📝',
  findConceptSections: '🏷',
  lookupPolicy: '📖',
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [liveTimeline, setLiveTimeline] = useState<TimelineEntry[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, liveTimeline, streamingText]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const question = input;
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setInput('');
    setIsLoading(true);
    setLiveTimeline([]);
    setStreamingText('');

    try {
      const mastraUrl = process.env.NEXT_PUBLIC_MASTRA_URL || 'http://localhost:4111';
      const res = await fetch(`${mastraUrl}/api/agents/ncMedicaidAgent/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: question }],
          maxSteps: 15,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const timeline: TimelineEntry[] = [];
      let currentStepText = '';
      let currentStepHasTools = false;
      let finalAnswerText = '';
      const activeTools = new Map<string, string>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            switch (event.type) {
              case 'step-start': {
                if (currentStepText.trim()) {
                  if (currentStepHasTools) {
                    // already pushed
                  } else {
                    finalAnswerText += currentStepText;
                    setStreamingText(finalAnswerText);
                  }
                }
                currentStepText = '';
                currentStepHasTools = false;
                break;
              }

              case 'tool-call-input-streaming-start': {
                if (currentStepText.trim()) {
                  timeline.push({ type: 'reasoning', text: currentStepText.trim() });
                  currentStepText = '';
                  setStreamingText(finalAnswerText);
                  setLiveTimeline([...timeline]);
                }
                currentStepHasTools = true;
                const name = event.payload?.toolName || 'unknown';
                activeTools.set(event.payload?.toolCallId, name);
                timeline.push({ type: 'tool', name, status: 'running' });
                setLiveTimeline([...timeline]);
                break;
              }

              case 'tool-result': {
                const toolCallId = event.payload?.toolCallId;
                const name = activeTools.get(toolCallId) || 'unknown';
                activeTools.delete(toolCallId);
                for (let j = timeline.length - 1; j >= 0; j--) {
                  const entry = timeline[j];
                  if (entry.type === 'tool' && entry.name === name && entry.status === 'running') {
                    timeline[j] = { ...entry, status: 'done' };
                    break;
                  }
                }
                setLiveTimeline([...timeline]);
                break;
              }

              case 'text-delta': {
                const text = event.payload?.text || '';
                currentStepText += text;
                if (!currentStepHasTools) {
                  setStreamingText(finalAnswerText + currentStepText);
                }
                break;
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      if (currentStepText.trim()) {
        if (currentStepHasTools) {
          timeline.push({ type: 'reasoning', text: currentStepText.trim() });
        } else {
          finalAnswerText += currentStepText;
        }
      }

      const content = finalAnswerText.trim() || 'No response generated.';
      setStreamingText('');
      setLiveTimeline([]);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content,
        timeline: timeline.length > 0 ? timeline.map(e =>
          e.type === 'tool' ? { ...e, status: 'done' as const } : e
        ) : undefined,
      }]);

    } catch (error) {
      console.error('Agent error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, there was an error processing your question. Please try again.',
      }]);
      setLiveTimeline([]);
      setStreamingText('');
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const toolCount = (timeline: TimelineEntry[]) =>
    timeline.filter(e => e.type === 'tool').length;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-8 py-5">
        <div className="max-w-3xl mx-auto flex items-baseline gap-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            NC Medicaid Navigator
          </h1>
          <Separator orientation="vertical" className="h-5" />
          <span className="text-sm text-muted-foreground">Policy Research</span>
        </div>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
          {/* Empty state */}
          {messages.length === 0 && !isLoading && (
            <div className="py-20 text-center">
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground mb-2">
                What would you like to know?
              </h2>
              <p className="text-muted-foreground mb-10">
                Research NC Medicaid policy across 2,000+ documents
              </p>
              <div className="grid gap-3 max-w-lg mx-auto">
                {[
                  'Does NC Medicaid cover chiropractic services?',
                  'What is the earned income limit for HCWD?',
                  'How many days of therapeutic leave are allowed for nursing facility residents?',
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className="text-left px-4 py-3 rounded-lg border border-border bg-card text-sm text-foreground hover:border-accent hover:bg-muted transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message thread */}
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === 'user' && (
                <div className="flex justify-end mb-6">
                  <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-5 py-3 max-w-[75%]">
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              )}

              {msg.role === 'assistant' && (
                <div className="space-y-3">
                  {/* Research timeline (collapsed) */}
                  {msg.timeline && msg.timeline.length > 0 && (
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group cursor-pointer">
                        <svg className="w-3 h-3 transition-transform group-data-[state=open]:rotate-90" viewBox="0 0 12 12" fill="none">
                          <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>{toolCount(msg.timeline)} tools · research trace</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <Card className="mt-2 border-dashed">
                          <CardContent className="p-4 space-y-1.5">
                            {msg.timeline.map((entry, j) => (
                              entry.type === 'tool' ? (
                                <div key={j} className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span className="w-4 text-center opacity-60">{TOOL_ICONS[entry.name] || '·'}</span>
                                  <span>{TOOL_LABELS[entry.name] || entry.name}</span>
                                </div>
                              ) : (
                                <p key={j} className="text-xs text-muted-foreground/70 italic pl-6">
                                  {entry.text}
                                </p>
                              )
                            ))}
                          </CardContent>
                        </Card>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Answer */}
                  <Card>
                    <CardContent className="p-6 prose prose-sm prose-slate max-w-none prose-headings:font-heading prose-headings:tracking-tight prose-h2:text-lg prose-h3:text-base prose-p:leading-relaxed prose-li:leading-relaxed prose-strong:text-foreground">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          ))}

          {/* Live research panel */}
          {liveTimeline.length > 0 && (
            <Card className="border-accent/30 bg-accent/5 animate-in fade-in duration-300">
              <CardContent className="p-4 space-y-1.5">
                {liveTimeline.map((entry, i) => (
                  entry.type === 'tool' ? (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {entry.status === 'running' ? (
                        <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span className="w-4 text-center text-accent">{TOOL_ICONS[entry.name] || '✓'}</span>
                      )}
                      <span className={entry.status === 'done' ? 'text-muted-foreground' : 'text-foreground'}>
                        {TOOL_LABELS[entry.name] || entry.name}
                      </span>
                    </div>
                  ) : (
                    <p key={i} className="text-sm text-muted-foreground italic pl-6">
                      {entry.text}
                    </p>
                  )
                ))}
              </CardContent>
            </Card>
          )}

          {/* Streaming answer */}
          {streamingText && (
            <Card className="animate-in fade-in duration-200">
              <CardContent className="p-6 prose prose-sm prose-slate max-w-none prose-headings:font-heading prose-headings:tracking-tight">
                <ReactMarkdown>{streamingText}</ReactMarkdown>
                <span className="inline-block w-0.5 h-5 bg-accent animate-pulse ml-0.5 -mb-1" />
              </CardContent>
            </Card>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <footer className="border-t border-border bg-card px-8 py-5">
        <div className="max-w-3xl mx-auto flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Ask about NC Medicaid policy..."
            className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
            disabled={isLoading}
          />
          <Button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            size="default"
            className="px-6"
          >
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
  );
}
