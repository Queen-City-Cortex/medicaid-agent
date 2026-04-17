'use client';

import { type RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import type { UIMessage } from 'ai';
import { MessageActions } from '@/components/MessageActions';
import { ToolStep } from '@/components/ToolStep';
import { getTrailingAssistantText, hasRenderableAssistantPart, isTextPart, isToolPart } from '@/lib/message-parts';

const PROSE = 'prose prose-sm dark:prose-invert max-w-none prose-headings:font-heading prose-headings:tracking-tight prose-h2:text-lg prose-h3:text-base prose-p:leading-relaxed prose-li:leading-relaxed prose-strong:text-foreground';
const PROSE_PROGRESS = 'prose prose-sm dark:prose-invert max-w-none text-muted-foreground prose-headings:text-foreground prose-p:my-0 prose-li:leading-relaxed';

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

function MarkdownText({
  text,
  finalAnswer,
  showCursor,
}: {
  text: string;
  finalAnswer: boolean;
  showCursor: boolean;
}) {
  return (
    <div className={finalAnswer ? PROSE : PROSE_PROGRESS}>
      <ReactMarkdown
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
      {showCursor && (
        <span className="inline-block w-0.5 h-5 bg-accent animate-pulse ml-0.5 -mb-1" />
      )}
    </div>
  );
}

function AssistantMessage({
  msg,
  messageIndex,
  messages,
  isStreaming,
  threadId,
  feedbackMap,
  onRerun,
  onRate,
  onClearRating,
  onComment,
}: {
  msg: UIMessage;
  messageIndex: number;
  messages: UIMessage[];
  isStreaming: boolean;
  threadId: string;
  feedbackMap: Record<string, { id: string; rating: 'up' | 'down'; comment: string | null }>;
  onRerun: (messageIndex: number, userIndex: number) => void;
  onRate: (messageId: string, rating: 'up' | 'down') => void;
  onClearRating: (messageId: string) => void;
  onComment: (messageId: string, comment: string) => void;
}) {
  const parts = msg.parts ?? [];
  const lastToolIndex = parts.reduce((latest, part, index) => (isToolPart(part) ? index : latest), -1);
  const finalAnswerText = getTrailingAssistantText(msg);
  const visibleParts = parts
    .map((part, index) => ({ part, index }))
    .filter(({ part }) => isToolPart(part) || (isTextPart(part) && part.text.trim().length > 0));

  return (
    <div
      data-testid="assistant-message"
      className="pl-2 mt-6 animate-in fade-in slide-in-from-bottom-2 duration-200"
      // Screen readers get incremental updates while streaming; polite keeps it
      // from interrupting the user's current focus. Once streaming completes
      // (isStreaming=false) we drop live-region semantics so re-rendered
      // content doesn't re-announce.
      aria-live={isStreaming ? 'polite' : undefined}
      aria-busy={isStreaming || undefined}
      role={isStreaming ? 'status' : undefined}
    >
      {visibleParts.map(({ part, index }, visibleIndex) => {
        const isLastVisiblePart = visibleIndex === visibleParts.length - 1;
        if (isToolPart(part)) {
          return (
            <ToolStep
              key={part.toolCallId ?? `tool-${index}`}
              part={part}
            />
          );
        }
        if (!isTextPart(part)) return null;

        const finalAnswer = lastToolIndex === -1 || index > lastToolIndex;
        return (
          <div key={`text-${msg.id}-${index}`} className={finalAnswer ? 'my-4' : 'my-3'}>
            <MarkdownText
              text={part.text}
              finalAnswer={finalAnswer}
              showCursor={isStreaming && isLastVisiblePart}
            />
          </div>
        );
      })}

      {isStreaming && !hasRenderableAssistantPart(parts) && (
        <div data-testid="loading-indicator" className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Starting research...
        </div>
      )}

      {!isStreaming && finalAnswerText && (
        <MessageActions
          content={finalAnswerText}
          onRerun={() => {
            let userIdx = -1;
            for (let index = messageIndex - 1; index >= 0; index--) {
              if (messages[index].role === 'user') {
                userIdx = index;
                break;
              }
            }
            if (userIdx === -1) return;
            onRerun(messageIndex, userIdx);
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

          {msg.role === 'assistant' && (
            <AssistantMessage
              msg={msg}
              messageIndex={i}
              messages={messages}
              isStreaming={isStreaming && i === messages.length - 1}
              threadId={threadId}
              feedbackMap={feedbackMap}
              onRerun={onRerun}
              onRate={onRate}
              onClearRating={onClearRating}
              onComment={onComment}
            />
          )}
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
