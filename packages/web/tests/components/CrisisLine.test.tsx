import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';
import ChatPage from '../../src/app/chat/page';
import { SiteFooter } from '../../src/components/SiteFooter';

const CRISIS_LINE = 'In an emergency call 911. Thinking about suicide or in crisis? Call or text 988.';

// The line must not depend on the conversation: it is there on an empty
// thread and stays once messages arrive. The real ChatInput renders inside
// the real page; everything around it is stubbed.
const chat = vi.hoisted(() => ({ messages: [] as unknown[] }));

vi.mock('@workos-inc/authkit-nextjs/components', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: false }),
  useAccessToken: () => ({
    getAccessToken: vi.fn().mockResolvedValue('token'),
    accessToken: 'token',
  }),
}));

vi.mock('@ai-sdk/react', () => ({
  // The hook builds one Chat per thread and hands it to useChat, mocked below.
  Chat: class Chat {
    messages = [];
    status = 'ready';
  },
  useChat: () => ({
    messages: chat.messages,
    status: 'ready',
    error: null,
    sendMessage: vi.fn(),
    setMessages: vi.fn(),
  }),
}));

vi.mock('ai', () => ({
  DefaultChatTransport: class DefaultChatTransport {},
}));

vi.mock('@/components/ThreadSidebar', () => ({ ThreadSidebar: () => null }));
vi.mock('@/components/EmptyState', () => ({ EmptyState: () => <div data-testid="mock-empty-state" /> }));
vi.mock('@/components/MessageList', () => ({
  MessageList: ({ messages }: { messages: UIMessage[] }) => (
    <div data-testid="mock-message-list">{messages.length}</div>
  ),
}));
vi.mock('@/components/ScrollToBottom', () => ({ ScrollToBottom: () => null }));
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/lib/use-is-mobile', () => ({ useIsMobile: () => false }));

vi.mock('@/lib/use-mastra-client', () => {
  const client = {
    createMemoryThread: vi.fn().mockResolvedValue(undefined),
    getMemoryThread: vi.fn(() => ({ listMessages: vi.fn().mockResolvedValue({ messages: [] }) })),
    getWorkflow: vi.fn(),
  };
  const runner = { run: (op: (c: typeof client) => unknown) => op(client) };
  return { useMastraClientRunner: () => runner, useMastraReady: () => true };
});

vi.mock('@/lib/feedback-client', () => ({
  submitFeedback: vi.fn(),
  deleteFeedback: vi.fn(),
  getFeedbackByThread: vi.fn().mockResolvedValue([]),
}));

describe('911 and 988 line', () => {
  beforeEach(() => {
    chat.messages = [];
  });

  it('is in the composer helper text before any message is sent', () => {
    render(<ChatPage />);
    expect(screen.getByTestId('mock-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('crisis-line')).toHaveTextContent(CRISIS_LINE);
    // Part of the description read out when the question box takes focus.
    expect(screen.getByLabelText('Ask a policy question')).toHaveAttribute(
      'aria-describedby',
      screen.getByTestId('crisis-line').parentElement!.id,
    );
  });

  it('stays in the composer helper text once the thread has messages', () => {
    chat.messages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'They cut off my Medicaid.' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'An answer.' }] },
    ];
    render(<ChatPage />);
    expect(screen.queryByTestId('mock-empty-state')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-message-list')).toHaveTextContent('2');
    expect(screen.getByTestId('crisis-line')).toHaveTextContent(CRISIS_LINE);
  });

  it('is in the site footer of the public pages', () => {
    render(<SiteFooter />);
    expect(screen.getByTestId('footer-crisis-line')).toHaveTextContent(CRISIS_LINE);
  });
});
