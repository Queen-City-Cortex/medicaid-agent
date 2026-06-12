import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatInput } from '../../src/components/ChatInput';

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
});
