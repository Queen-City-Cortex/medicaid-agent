'use client';

import { type RefObject } from 'react';
import { Button } from '@/components/ui/button';

const MAX_INPUT_LENGTH = 10_000;

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  onSend: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

export function ChatInput({ input, setInput, isLoading, onSend, inputRef }: ChatInputProps) {
  const helperTextId = 'chat-input-helper-text';

  return (
    <footer className="border-t border-border bg-card px-4 md:px-8 py-5 shrink-0">
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
              e.preventDefault();
              onSend();
            }
          }}
          maxLength={MAX_INPUT_LENGTH}
          placeholder="Ask about NC Medicaid policy..."
          className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow resize-none overflow-y-auto scrollbar-none"
          style={{ maxHeight: '120px' }}
          disabled={isLoading}
        />
        <Button data-testid="send-button" onClick={onSend} disabled={isLoading || !input.trim()} className="px-6 self-end">
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Researching
            </span>
          ) : 'Ask'}
        </Button>
      </div>
      <p id={helperTextId} className="max-w-3xl mx-auto text-xs text-muted-foreground mt-2">
        Answers are AI-generated from NC Medicaid policy documents. Verify critical information with DHHS.
      </p>
    </footer>
  );
}
