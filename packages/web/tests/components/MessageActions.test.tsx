import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageActions } from '../../src/components/MessageActions';

// MessageActions uses Tooltip which needs a TooltipProvider ancestor.
// Mock the tooltip components to render children directly.
vi.mock('../../src/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
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
});
