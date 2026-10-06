import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '../../src/components/ChatInput';
import { useIsMobile } from '../../src/lib/use-is-mobile';

// jsdom has no matchMedia; the hook is mocked and flipped per-test.
vi.mock('@/lib/use-is-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

const useIsMobileMock = vi.mocked(useIsMobile);

beforeEach(() => {
  useIsMobileMock.mockReturnValue(false);
});

function renderInput(overrides: Partial<Parameters<typeof ChatInput>[0]> = {}) {
  const props = {
    input: '',
    setInput: () => {},
    isLoading: false,
    onSend: () => {},
    onStop: () => {},
    inputRef: createRef<HTMLTextAreaElement>(),
    ...overrides,
  };
  return render(<ChatInput {...props} />);
}

describe('ChatInput', () => {
  it('exposes the textarea with an accessible label and helper text', () => {
    renderInput();

    const input = screen.getByLabelText('Ask a policy question');
    expect(input).toHaveAttribute('id', 'chat-input');
    expect(input).toHaveAttribute('aria-describedby', 'chat-input-helper-text');
    expect(screen.getByText(/Answers are AI-generated/)).toHaveAttribute('id', 'chat-input-helper-text');
  });

  it('sends on Enter and inserts a newline on Shift+Enter', () => {
    const onSend = vi.fn();
    renderInput({ input: 'question', onSend });
    const input = screen.getByLabelText('Ask a policy question');

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('does not send mid-IME-composition', () => {
    const onSend = vi.fn();
    renderInput({ input: 'こんにちは', onSend });
    const input = screen.getByLabelText('Ask a policy question');

    // Committing an IME candidate fires Enter with isComposing=true.
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    Object.defineProperty(event, 'isComposing', { value: true });
    input.dispatchEvent(event);

    expect(onSend).not.toHaveBeenCalled();
  });

  it('keeps the textarea enabled while streaming so the user can compose', () => {
    const onSend = vi.fn();
    renderInput({ isLoading: true, input: 'draft', onSend });

    const input = screen.getByLabelText('Ask a policy question');
    expect(input).not.toBeDisabled();

    // ...but Enter must not send while a run is in progress.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('swaps the Ask button for a working Stop button while streaming', () => {
    const onStop = vi.fn();
    renderInput({ isLoading: true, onStop });

    expect(screen.queryByTestId('send-button')).not.toBeInTheDocument();
    const stop = screen.getByTestId('stop-button');
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('disables Ask when the input is empty', () => {
    renderInput({ input: '   ' });
    expect(screen.getByTestId('send-button')).toBeDisabled();
  });

  it('does not send on Enter on mobile — sending is button-only', () => {
    useIsMobileMock.mockReturnValue(true);
    const onSend = vi.fn();
    renderInput({ input: 'question', onSend });
    const input = screen.getByLabelText('Ask a policy question');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();

    // The Ask button still works.
    fireEvent.click(screen.getByTestId('send-button'));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('hides the character counter for ordinary input lengths', () => {
    renderInput({ input: 'a'.repeat(8_999) });
    expect(screen.queryByTestId('char-counter')).not.toBeInTheDocument();
  });

  it('shows a quiet character counter from 9,000 characters', () => {
    renderInput({ input: 'a'.repeat(9_000) });
    const counter = screen.getByTestId('char-counter');
    expect(counter).toHaveTextContent('9,000 / 10,000');
    expect(counter.className).toContain('text-muted-foreground');
    expect(counter.className).not.toContain('text-destructive');
  });

  it('switches the counter to a destructive tone at the limit', () => {
    renderInput({ input: 'a'.repeat(10_000) });
    const counter = screen.getByTestId('char-counter');
    expect(counter).toHaveTextContent('10,000 / 10,000');
    expect(counter).toHaveTextContent('limit reached');
    expect(counter.className).toContain('text-destructive');
  });
});

describe('ChatInput Deep Research pill', () => {
  it('names the state of a research run that is out of view', () => {
    renderInput({ deepResearch: false, onToggleDeepResearch: () => {}, deepResearchStatus: 'report ready' });
    expect(screen.getByTestId('deep-research-toggle')).toHaveTextContent('Deep Research off · report ready');
  });

  it('shows only the mode when there is no hidden run', () => {
    renderInput({ deepResearch: true, onToggleDeepResearch: () => {} });
    expect(screen.getByTestId('deep-research-toggle')).toHaveTextContent(/^Deep Research on$/);
  });
});
