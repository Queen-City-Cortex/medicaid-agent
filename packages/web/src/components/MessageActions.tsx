'use client';

import { useState } from 'react';
import { Copy, Check, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface MessageActionsProps {
  content: string;
  onRerun?: () => void;
}

const btnClass = 'p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors';
const btnActiveClass = 'p-1.5 rounded-md bg-muted text-foreground transition-colors';

export function MessageActions({ content, onRerun }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState<'up' | 'down' | null>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-0.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <Tooltip>
        <TooltipTrigger className={btnClass} onClick={handleCopy}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Copied!' : 'Copy'}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          className={rating === 'up' ? btnActiveClass : btnClass}
          onClick={() => setRating(r => r === 'up' ? null : 'up')}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </TooltipTrigger>
        <TooltipContent>Good response</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          className={rating === 'down' ? btnActiveClass : btnClass}
          onClick={() => setRating(r => r === 'down' ? null : 'down')}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </TooltipTrigger>
        <TooltipContent>Bad response</TooltipContent>
      </Tooltip>

      {onRerun && (
        <Tooltip>
          <TooltipTrigger className={btnClass} onClick={onRerun}>
            <RotateCcw className="w-3.5 h-3.5" />
          </TooltipTrigger>
          <TooltipContent>Re-run</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
