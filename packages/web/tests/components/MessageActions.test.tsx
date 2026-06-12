import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
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
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders copy button', () => {
    render(<MessageActions content="test content" />);
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument();
  });

  it('copies content to clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<MessageActions content="test content" />);
    await userEvent.click(screen.getByLabelText('Copy message'));

    expect(writeText).toHaveBeenCalledWith('test content');
    expect(await screen.findByLabelText('Copied')).toBeInTheDocument();
  });

  it('shows a "Copy failed" state when the clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<MessageActions content="test content" />);
    await userEvent.click(screen.getByLabelText('Copy message'));

    expect(await screen.findByLabelText('Copy failed')).toBeInTheDocument();
  });

  it('treats a missing clipboard API (non-secure context) as a copy failure', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });

    render(<MessageActions content="test content" />);
    await userEvent.click(screen.getByLabelText('Copy message'));

    expect(await screen.findByLabelText('Copy failed')).toBeInTheDocument();
  });

  it('keeps the copied state alive on rapid clicks instead of letting the first timer cut it short', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<MessageActions content="test content" />);

    fireEvent.click(screen.getByLabelText('Copy message'));
    // Flush the (microtask) clipboard promise without advancing timers.
    await act(async () => {});
    expect(screen.getByLabelText('Copied')).toBeInTheDocument();

    // Second click 1.5s in — restarts the 2s feedback window.
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.click(screen.getByLabelText('Copied'));
    await act(async () => {});

    // 1s after the second click the first timer (2s mark) would have fired.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByLabelText('Copied')).toBeInTheDocument();

    // The restarted window expires 2s after the second click.
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument();
  });

  it('clears the pending reset timer on unmount', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const clearSpy = vi.spyOn(window, 'clearTimeout');

    const { unmount } = render(<MessageActions content="test content" />);
    await userEvent.click(screen.getByLabelText('Copy message'));
    await screen.findByLabelText('Copied');

    clearSpy.mockClear();
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('shows rerun button only when onRerun is provided', () => {
    const { rerender } = render(<MessageActions content="test" />);
    expect(screen.queryByLabelText('Re-run query')).not.toBeInTheDocument();

    rerender(<MessageActions content="test" onRerun={() => {}} />);
    expect(screen.getByLabelText('Re-run query')).toBeInTheDocument();
  });

  it('renders thumbs-up and thumbs-down buttons when messageId is provided', () => {
    render(<MessageActions content="test" messageId="msg-1" onRate={() => {}} />);
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
    render(<MessageActions content="test" messageId="msg-1" onRate={onRate} />);
    await userEvent.click(screen.getByLabelText('Rate helpful'));
    expect(onRate).toHaveBeenCalledWith('up');
  });

  it('calls onClearRating when active thumb clicked again', async () => {
    const onClearRating = vi.fn();
    render(
      <MessageActions
        content="test"
        messageId="msg-1"
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
