import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPage from '../../src/app/chat/page';

vi.mock('@workos-inc/authkit-nextjs/components', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: false }),
  useAccessToken: () => ({
    getAccessToken: vi.fn().mockResolvedValue('token'),
    accessToken: 'token',
  }),
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    status: 'ready',
    error: null,
    sendMessage: vi.fn(),
    setMessages: vi.fn(),
  }),
}));

vi.mock('ai', () => ({
  DefaultChatTransport: class DefaultChatTransport {},
}));

vi.mock('@/components/ThreadSidebar', () => ({
  ThreadSidebar: () => (
    <div data-testid="mock-thread-sidebar">
      <button type="button">Sidebar first action</button>
    </div>
  ),
}));

vi.mock('@/components/ChatInput', () => ({
  ChatInput: () => <div>Chat input</div>,
}));

vi.mock('@/components/EmptyState', () => ({
  EmptyState: () => <div>Empty state</div>,
}));

vi.mock('@/components/MessageList', () => ({
  MessageList: () => <div>Messages</div>,
}));

vi.mock('@/components/ScrollToBottom', () => ({
  ScrollToBottom: () => null,
}));

vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <div>Theme toggle</div>,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('@/components/ui/separator', () => ({
  Separator: () => <div aria-hidden="true" />,
}));

vi.mock('@/lib/use-is-mobile', () => ({
  useIsMobile: () => true,
}));

vi.mock('@/lib/use-mastra-client', () => ({
  useMastraClient: () => ({
    createMemoryThread: vi.fn().mockResolvedValue(undefined),
    getMemoryThread: vi.fn(() => ({
      listMessages: vi.fn().mockResolvedValue({ messages: [] }),
    })),
  }),
}));

vi.mock('@/lib/feedback-client', () => ({
  submitFeedback: vi.fn(),
  deleteFeedback: vi.fn(),
  getFeedbackByThread: vi.fn().mockResolvedValue([]),
}));

describe('ChatPage mobile sidebar', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(key, value);
        }),
        removeItem: vi.fn((key: string) => {
          storage.delete(key);
        }),
      },
    });
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
  });

  it('keeps the collapsed sidebar out of the accessibility tree and restores focus to the toggle on close', async () => {
    const user = userEvent.setup();

    render(<ChatPage />);

    const toggle = screen.getByRole('button', { name: 'Open sidebar' });
    const sidebarWrapper = screen.getByTestId('mock-thread-sidebar').parentElement;

    expect(sidebarWrapper).toHaveAttribute('aria-hidden', 'true');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Sidebar first action' })).not.toBeInTheDocument();

    await user.click(toggle);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Sidebar first action' })).toHaveFocus());
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open sidebar' })).toHaveFocus());
    expect(sidebarWrapper).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button', { name: 'Sidebar first action' })).not.toBeInTheDocument();
  });
});
