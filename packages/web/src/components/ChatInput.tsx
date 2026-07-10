'use client';

import { type RefObject } from 'react';
import { Square, Telescope } from 'lucide-react';
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
  /** When provided, renders a Deep Research mode toggle above the composer. */
  deepResearch?: boolean;
  onToggleDeepResearch?: () => void;
}

export function ChatInput({
  input,
  setInput,
  isLoading,
  onSend,
  onStop,
  inputRef,
  deepResearch = false,
  onToggleDeepResearch,
}: ChatInputProps) {
  const helperTextId = 'chat-input-helper-text';
  // On mobile, Enter inserts a newline and sending is button-only — phone
  // keyboards have no Shift+Enter, so Enter-to-send makes multi-line
  // questions impossible to type.
  const isMobile = useIsMobile();
  const showCounter = input.length >= COUNTER_THRESHOLD;
  const atLimit = input.length >= MAX_INPUT_LENGTH;

  return (
    <footer className="border-t border-border bg-card px-4 md:px-8 py-4 shrink-0 print:hidden">
      <div className="max-w-3xl mx-auto">
        <label htmlFor="chat-input" className="sr-only">
          Ask a policy question
        </label>
        {onToggleDeepResearch && (
          <div className="mb-2 flex items-center">
            <button
              type="button"
              data-testid="deep-research-toggle"
              onClick={onToggleDeepResearch}
              aria-pressed={deepResearch}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                deepResearch
                  ? 'border-accent/50 bg-accent/12 text-accent'
                  : 'border-input text-muted-foreground hover:text-foreground',
              )}
            >
              <Telescope className="size-3.5" />
              Deep Research {deepResearch ? 'on' : 'off'}
            </button>
          </div>
        )}
        {/* Unified composer: textarea + action button share one bordered field
            that lights up its gold ring on focus — a single deliberate "filing"
            input rather than two loose controls. */}
        <div className="flex items-end gap-2 rounded-xl border border-input bg-background py-1.5 pl-2 pr-1.5 transition-shadow focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/20">
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
            placeholder={deepResearch ? 'Describe a topic to research in depth…' : 'Ask about NC Medicaid policy…'}
            className="flex-1 resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-[15px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none scrollbar-none"
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
              size="sm"
              className="h-8 self-end px-4 font-mono text-xs uppercase tracking-wider"
              aria-label="Stop generating"
            >
              <Square className="size-3 fill-current" />
              Stop
            </Button>
          ) : (
            <Button
              data-testid="send-button"
              onClick={onSend}
              disabled={isLoading || !input.trim()}
              size="sm"
              className="h-8 self-end px-4 font-mono text-xs uppercase tracking-wider"
            >
              Ask
            </Button>
          )}
        </div>
      </div>
      <div className="max-w-3xl mx-auto mt-2 flex items-baseline justify-between gap-4">
        <p id={helperTextId} className="text-xs text-muted-foreground">
          Answers are AI-generated from NC Medicaid policy documents. Verify critical information with DHHS.{' '}
          <a href="/terms" className="underline underline-offset-2 hover:text-foreground">
            Terms
          </a>
          {' · '}
          <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy
          </a>
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
