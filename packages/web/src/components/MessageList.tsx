'use client';

import { type RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import type { UIMessage } from 'ai';
import { MessageActions } from '@/components/MessageActions';
import { ResearchTrace } from '@/components/ResearchTrace';
import { extractMessageParts } from '@/lib/message-parts';

const PROSE = 'prose prose-sm dark:prose-invert max-w-none prose-headings:font-heading prose-headings:tracking-tight prose-h2:text-lg prose-h3:text-base prose-p:leading-relaxed prose-li:leading-relaxed prose-strong:text-foreground';

interface MessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
  status: string;
  onRerun: (messageIndex: number, userIndex: number) => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  feedbackMap: Record<string, { id: string; rating: 'up' | 'down'; comment: string | null }>;
  threadId: string;
  onRate: (messageId: string, rating: 'up' | 'down') => void;
  onClearRating: (messageId: string) => void;
  onComment: (messageId: string, comment: string) => void;
}

export function MessageList({ messages, isStreaming, status, onRerun, messagesEndRef, feedbackMap, threadId, onRate, onClearRating, onComment }: MessageListProps) {
  return (
    <>
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
                    <ReactMarkdown components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">{children}</a> }}>{answerText}</ReactMarkdown>
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
                      onRerun(i, userIdx);
                    }}
                    messageId={msg.id}
                    threadId={threadId}
                    feedback={feedbackMap[msg.id] ?? null}
                    onRate={(rating) => onRate(msg.id, rating)}
                    onClearRating={() => onClearRating(msg.id)}
                    onComment={(comment) => onComment(msg.id, comment)}
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
    </>
  );
}
