'use client';

import { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ResearchTrace } from '@/components/ResearchTrace';
import { useAgentStream } from '@/lib/use-agent-stream';

const PROSE = 'prose prose-sm prose-slate max-w-none prose-headings:font-heading prose-headings:tracking-tight prose-h2:text-lg prose-h3:text-base prose-p:leading-relaxed prose-li:leading-relaxed prose-strong:text-foreground';

const EXAMPLES = [
  'Does NC Medicaid cover chiropractic services?',
  'What is the earned income limit for HCWD?',
  'How many days of therapeutic leave are allowed for nursing facility residents?',
];

export default function ChatPage() {
  const {
    messages, isLoading, liveTimeline,
    streamingReasoning, streamingAnswer, sendMessage,
  } = useAgentStream();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveTimeline, streamingReasoning, streamingAnswer]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  const isStreaming = isLoading && (liveTimeline.length > 0 || streamingReasoning || streamingAnswer);

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="border-b border-border bg-card px-8 py-5">
        <div className="max-w-3xl mx-auto flex items-baseline gap-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            NC Medicaid Navigator
          </h1>
          <Separator orientation="vertical" className="h-5" />
          <span className="text-sm text-muted-foreground">Policy Research</span>
        </div>
      </header>

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
                {EXAMPLES.map((q, i) => (
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

          {/* Completed messages */}
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
                  {msg.timeline && msg.timeline.length > 0 && (
                    <ResearchTrace timeline={msg.timeline} />
                  )}
                  <Card>
                    <CardContent className={`p-6 ${PROSE}`}>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          ))}

          {/* Live streaming state */}
          {isStreaming && (
            <div className="space-y-3">
              {/* Research trace: reasoning + tool calls (already interleaved) */}
              {liveTimeline.length > 0 && (
                <ResearchTrace timeline={liveTimeline} live />
              )}

              {/* Answer streaming */}
              {streamingAnswer && (
                <Card>
                  <CardContent className={`p-6 ${PROSE}`}>
                    <ReactMarkdown>{streamingAnswer}</ReactMarkdown>
                    <span className="inline-block w-0.5 h-5 bg-accent animate-pulse ml-0.5 -mb-1" />
                  </CardContent>
                </Card>
              )}

              {/* Loading indicator before any text arrives */}
              {!streamingReasoning && !streamingAnswer && liveTimeline.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  Starting research...
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <footer className="border-t border-border bg-card px-8 py-5">
        <div className="max-w-3xl mx-auto flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask about NC Medicaid policy..."
            className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
            disabled={isLoading}
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim()} className="px-6">
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
