import { render } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { usePinnedScroll } from '@/lib/use-pinned-scroll';

// Test-harness capture: the hook needs surrounding DOM (the viewport wrapper
// with the ref inside), so renderHook's wrapper isn't enough. Capturing into
// a ref-style container (property mutation, not variable reassignment) keeps
// the render pure enough for the react-hooks rules while letting assertions
// reach the latest hook result.
const capturedRef: { current: ReturnType<typeof usePinnedScroll> | null } = { current: null };
function hookResult(): ReturnType<typeof usePinnedScroll> {
  if (!capturedRef.current) throw new Error('hook not rendered yet');
  return capturedRef.current;
}

function Harness({ messages, status }: { messages: unknown; status: unknown }) {
  const result = usePinnedScroll({ messages, status });
  const { messagesEndRef } = result;
  // Capture after render (assertions run after act() flushes effects).
  useEffect(() => {
    capturedRef.current = result;
  });
  return (
    <div data-slot="scroll-area-viewport">
      <div ref={messagesEndRef} />
    </div>
  );
}

function NoViewportHarness({ messages }: { messages: unknown }) {
  const result = usePinnedScroll({ messages, status: 'ready' });
  const { messagesEndRef } = result;
  useEffect(() => {
    capturedRef.current = result;
  });
  return <div ref={messagesEndRef} />;
}

const scrollToSpy = vi.fn();

/** Give the jsdom viewport real-ish scroll geometry. */
function setGeometry(el: HTMLElement, { scrollHeight, clientHeight, scrollTop }: {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
}) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
  Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: scrollTop });
}

describe('usePinnedScroll', () => {
  beforeEach(() => {
    scrollToSpy.mockClear();
    // jsdom has no Element.scrollTo
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      writable: true,
      value: scrollToSpy,
    });
  });

  it('discovers the ScrollArea viewport after mount and exposes it as state', () => {
    const { container } = render(<Harness messages={1} status="ready" />);
    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]');

    expect(viewport).not.toBeNull();
    expect(hookResult().viewport).toBe(viewport);
  });

  it('exposes null when no viewport ancestor exists', () => {
    render(<NoViewportHarness messages={1} />);
    expect(hookResult().viewport).toBeNull();
  });

  it('follows new content while the user is pinned to the bottom', () => {
    const { container, rerender } = render(<Harness messages={1} status="ready" />);
    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;

    // User is at the bottom (within the 100px pin threshold).
    setGeometry(viewport, { scrollHeight: 1000, clientHeight: 400, scrollTop: 600 });
    fireEvent.scroll(viewport);

    scrollToSpy.mockClear();
    rerender(<Harness messages={2} status="ready" />);

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 1000, behavior: 'auto' });
  });

  it('does NOT follow new content after the user scrolls up to read', () => {
    const { container, rerender } = render(<Harness messages={1} status="ready" />);
    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;

    // User scrolled well away from the bottom.
    setGeometry(viewport, { scrollHeight: 1000, clientHeight: 400, scrollTop: 100 });
    fireEvent.scroll(viewport);

    scrollToSpy.mockClear();
    rerender(<Harness messages={2} status="ready" />);
    rerender(<Harness messages={2} status="streaming" />);

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('resumes following once the user scrolls back to the bottom', () => {
    const { container, rerender } = render(<Harness messages={1} status="ready" />);
    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;

    setGeometry(viewport, { scrollHeight: 1000, clientHeight: 400, scrollTop: 100 });
    fireEvent.scroll(viewport);
    scrollToSpy.mockClear();
    rerender(<Harness messages={2} status="ready" />);
    expect(scrollToSpy).not.toHaveBeenCalled();

    // Back to the bottom — pinned again.
    viewport.scrollTop = 600;
    fireEvent.scroll(viewport);
    rerender(<Harness messages={3} status="ready" />);

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 1000, behavior: 'auto' });
  });

  it('follows streaming chunks (status changes) while pinned', () => {
    const { container, rerender } = render(<Harness messages={1} status="ready" />);
    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;

    setGeometry(viewport, { scrollHeight: 1000, clientHeight: 400, scrollTop: 600 });
    fireEvent.scroll(viewport);

    scrollToSpy.mockClear();
    rerender(<Harness messages={1} status="streaming" />);

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 1000, behavior: 'auto' });
  });
});
