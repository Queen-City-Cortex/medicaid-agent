'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Check, X, RotateCcw, ThumbsUp, ThumbsDown, Send } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface FeedbackState {
  id: string;
  rating: 'up' | 'down';
  comment: string | null;
}

interface MessageActionsProps {
  content: string;
  onRerun?: () => void;
  messageId?: string;
  feedback?: FeedbackState | null;
  onRate?: (rating: 'up' | 'down') => void;
  onClearRating?: () => void;
  onComment?: (comment: string) => void;
}

const btnClass = 'p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors';
const btnActiveUp = 'p-1.5 rounded-md text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 transition-colors';
const btnActiveDown = 'p-1.5 rounded-md text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30 transition-colors';

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_LABELS: Record<CopyState, string> = {
  idle: 'Copy message',
  copied: 'Copied',
  failed: 'Copy failed',
};

const COPY_TOOLTIPS: Record<CopyState, string> = {
  idle: 'Copy',
  copied: 'Copied!',
  failed: 'Copy failed',
};

export function MessageActions({ content, onRerun, messageId, feedback, onRate, onClearRating, onComment }: MessageActionsProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [commentText, setCommentText] = useState('');
  const copyTimerRef = useRef<number | null>(null);

  // Clear any pending reset timer on unmount.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    // Reset any in-flight timer so rapid clicks don't have an old timer
    // cutting the new feedback state short.
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    let next: CopyState;
    try {
      // Throws on permission denial; navigator.clipboard itself is undefined
      // in non-secure contexts — the try covers both.
      await navigator.clipboard.writeText(content);
      next = 'copied';
    } catch {
      next = 'failed';
    }
    setCopyState(next);
    copyTimerRef.current = window.setTimeout(() => {
      setCopyState('idle');
      copyTimerRef.current = null;
    }, 2000);
  };

  const handleThumbClick = (rating: 'up' | 'down') => {
    if (feedback?.rating === rating) {
      onClearRating?.();
    } else {
      onRate?.(rating);
    }
  };

  const handleCommentSubmit = () => {
    if (commentText.trim()) {
      onComment?.(commentText.trim());
      setCommentText('');
    }
  };

  return (
    <div className="mt-2">
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger
            className={copyState === 'failed' ? `${btnClass} text-destructive hover:text-destructive` : btnClass}
            onClick={handleCopy}
            aria-label={COPY_LABELS[copyState]}
          >
            {copyState === 'copied' ? (
              <Check className="w-3.5 h-3.5" />
            ) : copyState === 'failed' ? (
              <X className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </TooltipTrigger>
          <TooltipContent>{COPY_TOOLTIPS[copyState]}</TooltipContent>
        </Tooltip>

        {onRerun && (
          <Tooltip>
            <TooltipTrigger className={btnClass} onClick={onRerun} aria-label="Re-run query">
              <RotateCcw className="w-3.5 h-3.5" />
            </TooltipTrigger>
            <TooltipContent>Re-run</TooltipContent>
          </Tooltip>
        )}

        {messageId && onRate && (
          <>
            <span className="w-px h-4 bg-border mx-1" />
            <Tooltip>
              <TooltipTrigger
                className={feedback?.rating === 'up' ? btnActiveUp : btnClass}
                onClick={() => handleThumbClick('up')}
                aria-label="Rate helpful"
              >
                <ThumbsUp className="w-3.5 h-3.5" fill={feedback?.rating === 'up' ? 'currentColor' : 'none'} />
              </TooltipTrigger>
              <TooltipContent>Helpful</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                className={feedback?.rating === 'down' ? btnActiveDown : btnClass}
                onClick={() => handleThumbClick('down')}
                aria-label="Rate unhelpful"
              >
                <ThumbsDown className="w-3.5 h-3.5" fill={feedback?.rating === 'down' ? 'currentColor' : 'none'} />
              </TooltipTrigger>
              <TooltipContent>Not helpful</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {feedback?.rating === 'down' && onComment && !feedback.comment && (
        <div className="flex items-center gap-2 mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <input
            type="text"
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCommentSubmit(); }}
            placeholder="What went wrong?"
            aria-label="Feedback comment — describe what went wrong with this response"
            className="flex-1 text-xs px-3 py-1.5 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={handleCommentSubmit}
            disabled={!commentText.trim()}
            aria-label="Submit comment"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
