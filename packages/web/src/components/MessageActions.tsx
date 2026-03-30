'use client';

import { useState } from 'react';
import { Copy, Check, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react';

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
    <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors"
        aria-label={copied ? 'Copied' : 'Copy response'}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>

      <button
        onClick={() => setRating(r => r === 'up' ? null : 'up')}
        className={`p-1.5 rounded-md transition-colors ${
          rating === 'up'
            ? 'text-foreground bg-muted'
            : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted'
        }`}
        aria-label="Thumbs up"
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={() => setRating(r => r === 'down' ? null : 'down')}
        className={`p-1.5 rounded-md transition-colors ${
          rating === 'down'
            ? 'text-foreground bg-muted'
            : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted'
        }`}
        aria-label="Thumbs down"
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>

      {onRerun && (
        <button
          onClick={onRerun}
          className="p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors"
          aria-label="Re-run question"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
