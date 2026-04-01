'use client';

import { useState } from 'react';
import { Copy, Check, RotateCcw } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface MessageActionsProps {
  content: string;
  onRerun?: () => void;
}

const btnClass = 'p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors';

export function MessageActions({ content, onRerun }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-0.5 mt-2">
      <Tooltip>
        <TooltipTrigger className={btnClass} onClick={handleCopy} aria-label={copied ? 'Copied' : 'Copy message'}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Copied!' : 'Copy'}</TooltipContent>
      </Tooltip>

      {onRerun && (
        <Tooltip>
          <TooltipTrigger className={btnClass} onClick={onRerun} aria-label="Re-run query">
            <RotateCcw className="w-3.5 h-3.5" />
          </TooltipTrigger>
          <TooltipContent>Re-run</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
