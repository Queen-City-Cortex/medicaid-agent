import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VersionNav } from '../../src/components/VersionNav';

describe('VersionNav', () => {
  it('renders nothing when total is 1 (nothing to navigate)', () => {
    const { container } = render(
      <VersionNav current={1} total={1} onSelect={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a human-readable "Answer N of M" indicator', () => {
    render(<VersionNav current={2} total={3} onSelect={() => {}} />);
    expect(screen.getByTestId('version-indicator')).toHaveTextContent('Answer 2 of 3');
  });

  it('labels prev/next accessibly and explains session-only retention', () => {
    render(<VersionNav current={2} total={3} onSelect={() => {}} />);
    expect(screen.getByLabelText('Previous answer')).toBeInTheDocument();
    expect(screen.getByLabelText('Next answer')).toBeInTheDocument();
    expect(screen.getByTestId('version-nav')).toHaveAttribute(
      'title',
      'Earlier answers are kept only for this session',
    );
  });

  it('calls onSelect with current-1 when prev is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<VersionNav current={3} total={4} onSelect={onSelect} />);
    await user.click(screen.getByTestId('version-prev'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('calls onSelect with current+1 when next is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<VersionNav current={1} total={3} onSelect={onSelect} />);
    await user.click(screen.getByTestId('version-next'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('disables prev at version 1', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<VersionNav current={1} total={3} onSelect={onSelect} />);
    const prev = screen.getByTestId('version-prev');
    expect(prev).toBeDisabled();
    await user.click(prev);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('disables next at the last version', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<VersionNav current={3} total={3} onSelect={onSelect} />);
    const next = screen.getByTestId('version-next');
    expect(next).toBeDisabled();
    await user.click(next);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
