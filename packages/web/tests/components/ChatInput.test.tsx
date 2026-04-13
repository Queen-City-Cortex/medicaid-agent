import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatInput } from '../../src/components/ChatInput';

describe('ChatInput', () => {
  it('exposes the textarea with an accessible label and helper text', () => {
    render(
      <ChatInput
        input=""
        setInput={() => {}}
        isLoading={false}
        onSend={() => {}}
        inputRef={createRef<HTMLTextAreaElement>()}
      />,
    );

    const input = screen.getByLabelText('Ask a policy question');
    expect(input).toHaveAttribute('id', 'chat-input');
    expect(input).toHaveAttribute('aria-describedby', 'chat-input-helper-text');
    expect(screen.getByText(/Answers are AI-generated/)).toHaveAttribute('id', 'chat-input-helper-text');
  });
});
