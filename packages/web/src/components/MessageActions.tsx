'use client';

import { useState } from 'react';
import { Copy, Check, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface MessageActionsProps {
  content: string;
  onRerun?: () => void;
}

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
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Copied!' : 'Copy'}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${rating === 'up' ? 'bg-muted text-foreground' : ''}`}
            onClick={() => setRating(r => r === 'up' ? null : 'up')}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Good response</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${rating === 'down' ? 'bg-muted text-foreground' : ''}`}
            onClick={() => setRating(r => r === 'down' ? null : 'down')}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Bad response</TooltipContent>
      </Tooltip>

      {onRerun && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRerun}>
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Re-run</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
