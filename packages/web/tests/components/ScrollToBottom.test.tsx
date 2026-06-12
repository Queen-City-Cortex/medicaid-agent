import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScrollToBottom } from '../../src/components/ScrollToBottom';

// The component was dead in production for the entire pre-review history:
// it attached its scroll listener to a ref that was only populated after its
// effect ran, so the button could never appear. It now receives the viewport
// element as state — these tests pin the attach-when-available behavior.

function makeViewport({ scrollTop = 0, scrollHeight = 1000, clientHeight = 400 } = {}) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  el.scrollTop = scrollTop;
  el.scrollTo = vi.fn();
  return el;
}

describe('ScrollToBottom', () => {
  it('appears when the viewport is scrolled away from the bottom', () => {
    const viewport = makeViewport({ scrollTop: 0 }); // 600px from bottom
    render(<ScrollToBottom viewport={viewport} hasMessages />);
    expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
  });

  it('stays hidden while pinned to the bottom', () => {
    const viewport = makeViewport({ scrollTop: 600 }); // exactly at bottom
    render(<ScrollToBottom viewport={viewport} hasMessages />);
    expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();
  });

  it('renders nothing until the viewport exists, then attaches on arrival', () => {
    const { rerender } = render(<ScrollToBottom viewport={null} hasMessages />);
    expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();

    const viewport = makeViewport({ scrollTop: 0 });
    rerender(<ScrollToBottom viewport={viewport} hasMessages />);
    expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
  });

  it('responds to scroll events', () => {
    const viewport = makeViewport({ scrollTop: 600 });
    render(<ScrollToBottom viewport={viewport} hasMessages />);
    expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();

    viewport.scrollTop = 0;
    fireEvent.scroll(viewport);
    expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
  });

  it('scrolls smoothly to the bottom on click', () => {
    const viewport = makeViewport({ scrollTop: 0 });
    render(<ScrollToBottom viewport={viewport} hasMessages />);
    fireEvent.click(screen.getByLabelText('Scroll to bottom'));
    expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' });
  });
});
