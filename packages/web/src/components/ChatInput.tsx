'use client';

import { type RefObject } from 'react';
import { Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/lib/use-is-mobile';
import { cn } from '@/lib/utils';

const MAX_INPUT_LENGTH = 10_000;
// Show the character counter only when the user is actually approaching the
// limit — a permanent counter is noise for the 99% of questions under a
// paragraph. The maxLength attribute silently swallows keystrokes past the
// limit, so the counter is the user's only warning before that happens.
const COUNTER_THRESHOLD = 9_000;

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  onSend: () => void;
  onStop?: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

export function ChatInput({ input, setInput, isLoading, onSend, onStop, inputRef }: ChatInputProps) {
  const helperTextId = 'chat-input-helper-text';
  // On mobile, Enter inserts a newline and sending is button-only — phone
  // keyboards have no Shift+Enter, so Enter-to-send makes multi-line
  // questions impossible to type.
  const isMobile = useIsMobile();
  const showCounter = input.length >= COUNTER_THRESHOLD;
  const atLimit = input.length >= MAX_INPUT_LENGTH;

  return (
    <footer className="border-t border-border bg-card px-4 md:px-8 py-5 shrink-0 print:hidden">
      <div className="max-w-3xl mx-auto flex gap-3">
        <label htmlFor="chat-input" className="sr-only">
          Ask a policy question
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          rows={1}
          data-testid="chat-input"
          aria-describedby={helperTextId}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              if (isMobile) return;
              // Committing an IME candidate (CJK/Vietnamese input) fires
              // Enter mid-composition — that must not send the message.
              if (e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (!isLoading) onSend();
            }
          }}
          maxLength={MAX_INPUT_LENGTH}
          placeholder="Ask about NC Medicaid policy…"
          className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow resize-none overflow-y-auto scrollbar-none"
          style={{ maxHeight: '120px' }}
        />
        {/* The textarea stays enabled during a run so the user can draft the
            next question; Enter-to-send is gated on !isLoading above, and the
            action button becomes Stop. */}
        {isLoading && onStop ? (
          <Button
            data-testid="stop-button"
            onClick={onStop}
            variant="outline"
            className="px-6 self-end"
            aria-label="Stop generating"
          >
            <span className="flex items-center gap-2">
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </span>
          </Button>
        ) : (
          <Button
            data-testid="send-button"
            onClick={onSend}
            disabled={isLoading || !input.trim()}
            className="px-6 self-end"
          >
            Ask
          </Button>
        )}
      </div>
      <div className="max-w-3xl mx-auto mt-2 flex items-baseline justify-between gap-4">
        <p id={helperTextId} className="text-xs text-muted-foreground">
          Answers are AI-generated from NC Medicaid policy documents. Verify critical information with DHHS.
        </p>
        {showCounter && (
          <p
            data-testid="char-counter"
            aria-live="polite"
            className={cn(
              'shrink-0 text-xs tabular-nums',
              atLimit ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {input.length.toLocaleString('en-US')} / {MAX_INPUT_LENGTH.toLocaleString('en-US')}
            {atLimit && <span className="ml-1">— limit reached</span>}
          </p>
        )}
      </div>
    </footer>
  );
}
