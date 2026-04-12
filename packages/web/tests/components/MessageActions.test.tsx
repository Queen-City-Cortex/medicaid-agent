import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageActions } from '../../src/components/MessageActions';

// MessageActions uses Tooltip which needs a TooltipProvider ancestor.
// Mock the tooltip components to render children directly.
vi.mock('../../src/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

describe('MessageActions', () => {
  it('renders copy button', () => {
    render(<MessageActions content="test content" />);
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument();
  });

  it('copies content to clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<MessageActions content="test content" />);
    await userEvent.click(screen.getByLabelText('Copy message'));

    expect(writeText).toHaveBeenCalledWith('test content');
  });

  it('shows rerun button only when onRerun is provided', () => {
    const { rerender } = render(<MessageActions content="test" />);
    expect(screen.queryByLabelText('Re-run query')).not.toBeInTheDocument();

    rerender(<MessageActions content="test" onRerun={() => {}} />);
    expect(screen.getByLabelText('Re-run query')).toBeInTheDocument();
  });

  it('renders thumbs-up and thumbs-down buttons when messageId is provided', () => {
    render(<MessageActions content="test" messageId="msg-1" threadId="t-1" onRate={() => {}} />);
    expect(screen.getByLabelText('Rate helpful')).toBeInTheDocument();
    expect(screen.getByLabelText('Rate unhelpful')).toBeInTheDocument();
  });

  it('does not render thumbs buttons when messageId is absent', () => {
    render(<MessageActions content="test" />);
    expect(screen.queryByLabelText('Rate helpful')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Rate unhelpful')).not.toBeInTheDocument();
  });

  it('calls onRate with "up" when thumbs-up clicked', async () => {
    const onRate = vi.fn();
    render(<MessageActions content="test" messageId="msg-1" threadId="t-1" onRate={onRate} />);
    await userEvent.click(screen.getByLabelText('Rate helpful'));
    expect(onRate).toHaveBeenCalledWith('up');
  });

  it('calls onClearRating when active thumb clicked again', async () => {
    const onClearRating = vi.fn();
    render(
      <MessageActions
        content="test"
        messageId="msg-1"
        threadId="t-1"
        feedback={{ id: 'fb-1', rating: 'up', comment: null }}
        onRate={() => {}}
        onClearRating={onClearRating}
      />,
    );
    await userEvent.click(screen.getByLabelText('Rate helpful'));
    expect(onClearRating).toHaveBeenCalled();
  });

  it('shows comment input when rated down', () => {
    render(
      <MessageActions
        content="test"
        messageId="msg-1"
        threadId="t-1"
        feedback={{ id: 'fb-1', rating: 'down', comment: null }}
        onRate={() => {}}
        onComment={() => {}}
      />,
    );
    expect(screen.getByPlaceholderText('What went wrong?')).toBeInTheDocument();
  });

  it('calls onComment when comment submitted', async () => {
    const onComment = vi.fn();
    render(
      <MessageActions
        content="test"
        messageId="msg-1"
        threadId="t-1"
        feedback={{ id: 'fb-1', rating: 'down', comment: null }}
        onRate={() => {}}
        onComment={onComment}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('What went wrong?'), 'Wrong policy');
    await userEvent.click(screen.getByLabelText('Submit comment'));
    expect(onComment).toHaveBeenCalledWith('Wrong policy');
  });
});
