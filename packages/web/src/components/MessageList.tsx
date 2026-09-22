'use client';

import { WITHHELD_ANSWER, UNVERIFIED_HISTORY } from '@nc-medicaid/contracts';
import { extractReleaseState } from '@/lib/message-verification';
import { useState, type RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import type { UIMessage } from 'ai';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MessageActions } from '@/components/MessageActions';
import { SourcesPanel, sourceRowId } from '@/components/SourcesPanel';
import { ToolStep, getToolDescriptor, summarizeToolInput } from '@/components/ToolStep';
import { VerificationBadge } from '@/components/VerificationBadge';
import { VersionNav } from '@/components/VersionNav';
import { getMessageCreatedAt } from '@/lib/parse-message';
import {
  buildAnswerClipboardText,
  buildCitationResolver,
  extractCitedUrls,
  extractMessageSources,
  extractVerificationState,
  getToolName,
  getTrailingAssistantText,
  hasRenderableAssistantPart,
  isTextPart,
  isToolPart,
  isTripwirePart,
  splitSourcesByCited,
  type CitationResolver,
  type MessageSource,
  type ToolMessagePart,
  type TripwireMessagePart,
} from '@/lib/message-parts';

// Answer prose reads like a printed document: Newsreader at a comfortable
// 16px with generous leading, Fraunces headings. The cited links + footnote
// markers are styled on the custom <a> renderer below.
const PROSE = 'prose dark:prose-invert max-w-none text-[16px] prose-headings:font-heading prose-headings:tracking-tight prose-h2:text-xl prose-h3:text-lg prose-p:leading-[1.75] prose-li:leading-[1.7] prose-li:my-1 prose-strong:text-foreground prose-strong:font-semibold prose-blockquote:border-l-accent/50 prose-blockquote:font-normal prose-blockquote:not-italic';
const PROSE_PROGRESS = 'prose prose-sm dark:prose-invert max-w-none text-muted-foreground prose-headings:text-foreground prose-p:my-0 prose-li:leading-relaxed';

interface MessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
  status: string;
  onRerun: (messageIndex: number, userIndex: number) => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  feedbackMap: Record<string, { id: string; rating: 'up' | 'down'; comment: string | null }>;
  onRate: (messageId: string, rating: 'up' | 'down') => void;
  onClearRating: (messageId: string) => void;
  onComment: (messageId: string, comment: string) => void;
  /** Client-side history of previous assistant messages keyed by the user msg they answered. Non-empty entries mean the user has re-run and earlier answers exist. */
  archivedVersions?: Record<string, UIMessage[]>;
  /** 1-based active version per user msg id. Missing / equal to total means "show live (latest)". */
  activeVersion?: Record<string, number>;
  onSelectVersion?: (userMsgId: string, version: number) => void;
}

function MarkdownText({
  text,
  finalAnswer,
  showCursor,
  resolveCitation,
  onCitationClick,
}: {
  text: string;
  finalAnswer: boolean;
  showCursor: boolean;
  resolveCitation?: CitationResolver;
  onCitationClick?: (sourceNumber: number) => void;
}) {
  return (
    <div className={finalAnswer ? PROSE : PROSE_PROGRESS}>
      <ReactMarkdown
        components={{
          a: ({ children, href }) => {
            // Resolve to the Sources-panel row by the link's visible label
            // first (unique per section) — a URL-only match collapses every
            // section of one policy PDF onto a single footnote number.
            const label = typeof children === 'string'
              ? children
              : Array.isArray(children)
                ? children.filter((c) => typeof c === 'string').join('')
                : '';
            const sourceNumber = resolveCitation?.(label, href ?? null);
            // A link that maps to a numbered source is a citation: keep it quiet
            // (ink-colored, hairline underline) so clusters of them don't read as
            // a wall of gold — the small gold [n] marker carries the citation
            // signal, and the Sources panel carries the full title. A link with
            // no source mapping is a genuine external reference, so it keeps the
            // gold treatment.
            const isCitation = sourceNumber !== undefined;
            return (
              <>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={
                    isCitation
                      ? 'text-foreground underline decoration-muted-foreground/30 underline-offset-2 transition-colors hover:text-accent hover:decoration-accent/60'
                      : 'font-medium text-accent underline decoration-accent/35 underline-offset-2 transition-colors hover:decoration-accent'
                  }
                >
                  {children}
                </a>
                {sourceNumber !== undefined && (
                  <sup>
                    <button
                      type="button"
                      data-testid="citation-footnote"
                      data-source-number={sourceNumber}
                      onClick={(event) => {
                        event.preventDefault();
                        onCitationClick?.(sourceNumber);
                      }}
                      // The visible footnote is tiny (0.72em inside <sup>); the
                      // ::after overlay extends the effective hit area to ≥24px
                      // in each dimension without shifting layout — tap-target
                      // minimums matter for mobile case managers.
                      className="relative ml-0.5 inline-flex cursor-pointer items-center rounded-sm px-0.5 font-mono text-[0.72em] font-medium text-accent/80 after:absolute after:-inset-2 after:content-[''] hover:bg-accent/15 hover:text-accent"
                      aria-label={`Jump to source ${sourceNumber} in the Sources panel`}
                    >
                      [{sourceNumber}]
                    </button>
                  </sup>
                )}
              </>
            );
          },
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
  feedbackMap: Record<string, { id: string; rating: 'up' | 'down'; comment: string | null }>;
  onRerun: (messageIndex: number, userIndex: number) => void;
  onRate: (messageId: string, rating: 'up' | 'down') => void;
  onClearRating: (messageId: string) => void;
  onComment: (messageId: string, comment: string) => void;
}) {
  const release = extractReleaseState(msg);
  const canShowAnswer = release?.status === 'passed' || release?.status === 'corrected';
  const parts = (msg.parts ?? []).filter(p => p.type !== 'text' || canShowAnswer);
  if (release?.status === 'withheld') parts.push({ type: 'text', text: release.reason === 'unverified_history' ? UNVERIFIED_HISTORY : WITHHELD_ANSWER });
  const lastToolIndex = parts.reduce((latest, part, index) => (isToolPart(part) ? index : latest), -1);
  const finalAnswerText = getTrailingAssistantText({ ...msg, parts });
  const visibleParts = parts
    .map((part, index) => ({ part, index }))
    .filter(({ part }) => isToolPart(part) || (isTextPart(part) && part.text.trim().length > 0));
  // Sources ordered cited-first so the panel can group them and budgeted
  // footnote numbers stay aligned with row positions.
  const { ordered: sources, citedCount } = splitSourcesByCited(
    extractMessageSources(msg),
    extractCitedUrls(msg),
  );
  const verification = extractVerificationState(msg);
  // Generation timestamp from memory's createdAt — present only on restored
  // thread messages (exactly where "when was this answer generated?" matters;
  // a just-streamed answer is self-evidently from now).
  const createdAt = getMessageCreatedAt(msg);
  const generatedAt = createdAt
    ? new Date(createdAt).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;
  // Detect the "tools ran but agent gave up without a text answer" state. This
  // happens when a mid-tool-loop model call throws (e.g. transient
  // AI_APICallError) and Mastra terminates the stream with finishReason that
  // isn't 'stop', so the verifier's text-replacement branch never runs and
  // the persisted message has tool parts but no final text. Without a
  // fallback, the UI renders silently (tools + Sources panel + blank space),
  // which is indistinguishable from "finished". Show an explicit notice.
  const endedWithoutAnswer =
    !isStreaming && lastToolIndex !== -1 && finalAnswerText.trim().length === 0;
  // An input guard (scope gate, length guard, injection detector) aborted the
  // run before generation. Without explicit rendering these turns were blank —
  // the stream carries only the data-tripwire part and a finish.
  const tripwirePart = parts.find(isTripwirePart) as TripwireMessagePart | undefined;
  const blockedMessage =
    tripwirePart?.data?.metadata?.userMessage ??
    (tripwirePart ? "This message couldn't be processed. Please rephrase and try again." : null);
  const toolStepCount = parts.filter(isToolPart).length;
  // Once a run completes with an answer, the tool loop collapses into a
  // single "Research trail" below the answer — ten full-width step cards
  // stacked above the answer buried the thing the user asked for. Streaming
  // keeps the live expanded view; ended-without-answer keeps the steps
  // expanded because they ARE the only output worth reading.
  const collapseTrail =
    !isStreaming && lastToolIndex !== -1 && finalAnswerText.trim().length > 0;
  const trailParts = collapseTrail
    ? visibleParts.filter(({ index }) => index <= lastToolIndex)
    : [];
  const inlineParts = collapseTrail
    ? visibleParts.filter(({ index }) => index > lastToolIndex)
    : visibleParts;
  const resolveCitation = buildCitationResolver(sources);
  // Open by default whenever the agent consulted any sources — hiding the
  // panel behind a click is the wrong default for a verification-first
  // product, and an answer with consulted-but-uncited sources is exactly the
  // case a skeptical reader should see. The user's explicit toggle always
  // wins once made.
  const [panelOpenOverride, setPanelOpenOverride] = useState<boolean | null>(null);
  const panelOpen = panelOpenOverride ?? sources.length > 0;
  const setPanelOpen = setPanelOpenOverride;
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);

  const handleCitationClick = (sourceNumber: number) => {
    const source: MessageSource | undefined = sources[sourceNumber - 1];
    if (!source) return;
    setPanelOpen(true);
    setHighlightedKey(source.key);
    // Wait a tick so the Collapsible content is in the DOM before scrolling to it.
    window.requestAnimationFrame(() => {
      const el = document.getElementById(sourceRowId(msg.id, source.key));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // Clear highlight after the transition finishes.
    window.setTimeout(() => setHighlightedKey(null), 1800);
  };

  // Shared by the MessageActions rerun button and the "Try again" button in
  // the ended-without-answer notice: find the user message this assistant
  // message answered and re-send it.
  const handleRerun = () => {
    let userIdx = -1;
    for (let index = messageIndex - 1; index >= 0; index--) {
      if (messages[index].role === 'user') {
        userIdx = index;
        break;
      }
    }
    if (userIdx === -1) return;
    onRerun(messageIndex, userIdx);
  };

  const renderPart = (
    { part, index }: { part: UIMessage['parts'][number]; index: number },
    isLastVisiblePart: boolean,
  ) => {
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
          resolveCitation={finalAnswer ? resolveCitation : undefined}
          onCitationClick={finalAnswer ? handleCitationClick : undefined}
        />
      </div>
    );
  };

  // Live narration while the tool loop runs: descriptor + summarized input +
  // step counter, all derived from the last tool part. Hidden once the final
  // answer starts streaming (the cursor takes over as the activity signal).
  const lastToolPart = lastToolIndex !== -1 ? (parts[lastToolIndex] as ToolMessagePart) : null;
  const showNarration =
    isStreaming && lastToolPart !== null && finalAnswerText.trim().length === 0;
  let narration: { text: string; step: number } | null = null;
  if (showNarration && lastToolPart) {
    const toolName = getToolName(lastToolPart);
    const { label } = getToolDescriptor(toolName);
    const inputSummary = summarizeToolInput(toolName, lastToolPart.input);
    narration = {
      text: inputSummary ? `${label} — ${inputSummary}` : label,
      step: toolStepCount,
    };
  }

  return (
    <div
      data-testid="assistant-message"
      className="pl-2 mt-6 animate-in fade-in slide-in-from-bottom-2 duration-200"
      // No aria-live here: announcing every streamed chunk spams screen
      // readers. MessageList renders a small status live region that announces
      // state transitions instead.
      aria-busy={isStreaming || undefined}
    >
      {inlineParts.map((entry, visibleIndex) =>
        renderPart(entry, visibleIndex === inlineParts.length - 1),
      )}

      {isStreaming && !hasRenderableAssistantPart(parts) && (
        <div data-testid="loading-indicator" className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Starting research...
        </div>
      )}

      {release?.status === 'verifying' && <p role="status" data-testid="verification-progress" className="my-3 text-sm text-muted-foreground">Checking the answer against sources…</p>}
      {release?.status === 'withheld' && <Button variant="outline" size="sm" onClick={handleRerun} data-testid="verification-retry">Try again</Button>}

      {narration && (
        <div
          data-testid="progress-narration"
          className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"
        >
          <span className="inline-block size-3.5 shrink-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <span className="min-w-0 truncate">{narration.text}</span>
          <span className="shrink-0 tabular-nums">
            · step {narration.step}
          </span>
        </div>
      )}

      {blockedMessage && (
        <div
          data-testid="blocked-message"
          role="alert"
          className="my-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
        >
          <p>{blockedMessage}</p>
        </div>
      )}

      {endedWithoutAnswer && !blockedMessage && (
        <div
          data-testid="ended-without-answer"
          role="alert"
          className="my-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
        >
          <p className="font-medium">The agent finished without a final answer.</p>
          <p className="mt-1 text-muted-foreground">
            This usually means a transient API error interrupted the synthesis step. The sources
            below show what was retrieved.
          </p>
          <Button
            data-testid="try-again-button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={handleRerun}
          >
            <RotateCcw className="size-3.5" />
            Try again
          </Button>
        </div>
      )}

      {!isStreaming && canShowAnswer && finalAnswerText && (
        <VerificationBadge verification={verification} outcome={release} />
      )}

      {collapseTrail && (
        <Collapsible>
          <div data-testid="research-trail" className="mt-4">
            <CollapsibleTrigger
              data-testid="research-trail-trigger"
              className="group flex w-full items-center justify-between rounded-xl border border-border/70 bg-muted/25 px-4 py-2.5 text-left transition-colors hover:bg-muted/45"
            >
              <span className="flex min-w-0 items-baseline gap-2 truncate text-sm font-medium text-foreground">
                Research trail
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {toolStepCount} step{toolStepCount === 1 ? '' : 's'}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
            </CollapsibleTrigger>
            <CollapsibleContent
              data-testid="research-trail-content"
              className="mt-2 rounded-xl border border-border/70 bg-muted/15 px-4 py-1"
            >
              {trailParts.map((entry) => renderPart(entry, false))}
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {!isStreaming && sources.length > 0 && (
        <SourcesPanel
          sources={sources}
          citedCount={citedCount}
          messageId={msg.id}
          open={panelOpen}
          onOpenChange={setPanelOpen}
          highlightedKey={highlightedKey}
          verification={verification}
        />
      )}

      {!isStreaming && generatedAt && finalAnswerText && (
        <p data-testid="generated-at" className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
          Generated {generatedAt}
        </p>
      )}

      {!isStreaming && (finalAnswerText || endedWithoutAnswer) && (
        <MessageActions
          content={buildAnswerClipboardText(finalAnswerText, sources)}
          onRerun={handleRerun}
          messageId={msg.id}
          feedback={feedbackMap[msg.id] ?? null}
          onRate={(rating) => onRate(msg.id, rating)}
          onClearRating={() => onClearRating(msg.id)}
          onComment={(comment) => onComment(msg.id, comment)}
        />
      )}
    </div>
  );
}

export function MessageList({ messages, isStreaming, status, onRerun, messagesEndRef, feedbackMap, onRate, onClearRating, onComment, archivedVersions, activeVersion, onSelectVersion }: MessageListProps) {
  // Screen-reader announcements for chat state transitions. A single hidden
  // live region announcing "Researching…" / "Answer ready" replaces aria-live
  // on the streaming message container, which re-announced every chunk.
  // Uses the "storing information from previous renders" pattern (setState
  // during render) rather than an effect.
  const [announcement, setAnnouncement] = useState('');
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    if (status === 'submitted') {
      setAnnouncement('Researching…');
    } else if (status === 'ready' && (prevStatus === 'streaming' || prevStatus === 'submitted')) {
      setAnnouncement('Answer ready');
    }
  }

  // Walk once to remember the nearest preceding user message for each
  // assistant. Used to look up archived versions + render a VersionNav above
  // the displayed message when earlier answers exist.
  const parentUserIdByAssistantIndex = new Map<number, string>();
  {
    let lastUserId: string | null = null;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === 'user') lastUserId = m.id;
      else if (m.role === 'assistant' && lastUserId) {
        parentUserIdByAssistantIndex.set(i, lastUserId);
      }
    }
  }

  return (
    <>
      <div data-testid="chat-status-announcer" role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {messages.map((msg, i) => {
        const parentUserId = parentUserIdByAssistantIndex.get(i);
        const archived: UIMessage[] = parentUserId ? (archivedVersions?.[parentUserId] ?? []) : [];
        const totalVersions = archived.length + 1;
        // Default active version = live (the last slot). Explicit active version only matters when archived.length > 0.
        const active = parentUserId ? (activeVersion?.[parentUserId] ?? totalVersions) : totalVersions;
        const showLive = active === totalVersions;
        const displayMsg = showLive ? msg : archived[active - 1] ?? msg;

        return (
          <div key={msg.id} className="group">
            {msg.role === 'user' && (
              <div className="flex justify-end mb-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                {/* The user's question reads as ink on paper — a right-aligned
                    filled block, distinct from the full-width answer document. */}
                <div data-testid="user-message" className="bg-primary text-primary-foreground rounded-xl rounded-tr-sm px-5 py-3 max-w-[80%] shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
                  {/* pre-wrap keeps the user's line breaks (attorneys paste
                      multi-line fact patterns); overflow-wrap:anywhere stops a
                      long pasted URL or ID from blowing out the bubble. */}
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {msg.parts.filter(p => p.type === 'text').map(p => (p as { text: string }).text).join('')}
                  </p>
                </div>
              </div>
            )}

            {msg.role === 'assistant' && (
              <>
                {totalVersions > 1 && parentUserId && onSelectVersion && (
                  <div className="mt-3 pl-2">
                    <VersionNav
                      current={active}
                      total={totalVersions}
                      onSelect={(v) => onSelectVersion(parentUserId, v)}
                    />
                  </div>
                )}
                <AssistantMessage
                  msg={displayMsg}
                  messageIndex={i}
                  messages={messages}
                  isStreaming={showLive && isStreaming && i === messages.length - 1}
                  feedbackMap={feedbackMap}
                  onRerun={onRerun}
                  onRate={onRate}
                  onClearRating={onClearRating}
                  onComment={onComment}
                />
              </>
            )}
          </div>
        );
      })}

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
