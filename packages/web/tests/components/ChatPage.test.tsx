import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  ThreadSidebar: ({ onSelectThread }: { onSelectThread: (threadId: string) => void }) => (
    <div data-testid="mock-thread-sidebar">
      <button type="button">Sidebar first action</button>
      <button type="button" data-testid="mock-select-thread" onClick={() => onSelectThread('thread-2')}>Past thread</button>
    </div>
  ),
}));

vi.mock('@/components/ChatInput', () => ({
  ChatInput: ({ deepResearch }: { deepResearch: boolean }) => (
    <div data-testid="mock-chat-input" data-deep-research={String(deepResearch)}>Chat input</div>
  ),
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

vi.mock('@/lib/use-mastra-client', () => {
  // Stable pass-through runner over a mock client (page.tsx now consumes
  // useMastraClientRunner and threads `run` into useChatThread/useDeepResearch).
  const client = {
    createMemoryThread: vi.fn().mockResolvedValue(undefined),
    getMemoryThread: vi.fn(() => ({
      listMessages: vi.fn().mockResolvedValue({ messages: [] }),
    })),
    getWorkflow: vi.fn(() => ({
      createRun: vi.fn().mockResolvedValue({
        runId: 'run-1',
        startAsync: vi.fn().mockResolvedValue({ status: 'suspended' }),
        resumeAsync: vi.fn().mockResolvedValue({ status: 'success' }),
      }),
    })),
  };
  const runner = { run: (op: (c: typeof client) => unknown) => op(client) };
  return {
    useMastraClientRunner: () => runner,
    useMastraReady: () => true,
  };
});

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

describe('ChatPage deep research run recovery', () => {
  const ACTIVE_RUN = {
    runId: 'run-1',
    state: 'awaiting_approval',
    question: 'Does X?',
    plan: {
      brief: 'Compare PA rules',
      subQuestions: [{ question: 'Which services need PA?', rationale: 'baseline', channels: ['concept'], useWeb: false }],
    },
    report: null,
    error: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const activeRun = () => new Response(JSON.stringify(ACTIVE_RUN), { status: 200, headers: { 'Content-Type': 'application/json' } });

  /** Stubs the research API; `current` answers the page's active-run lookup. */
  function stubResearch(current: () => Promise<Response>) {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (!url.includes('/research/')) return Promise.resolve(new Response(null, { status: 404 }));
      calls.push(`${init?.method ?? 'GET'} ${url.replace(/^.*(?=\/research\/)/, '')}`);
      if (url.endsWith('/research/runs/current')) return current();
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    return calls;
  }

  afterEach(() => { vi.restoreAllMocks(); });

  it('turns Deep Research on and shows the plan when the caller has an active run on load', async () => {
    stubResearch(async () => activeRun());
    render(<ChatPage />);

    expect(await screen.findByTestId('deep-research-plan')).toHaveTextContent('Which services need PA?');
    expect(screen.getByTestId('mock-chat-input')).toHaveAttribute('data-deep-research', 'true');

    // Declining and starting over stays in Deep Research, ready for a new question.
    fireEvent.click(screen.getByTestId('decline-plan'));
    fireEvent.click(await screen.findByRole('button', { name: 'Start over' }));
    expect(await screen.findByTestId('deep-research-empty')).toBeInTheDocument();
    expect(screen.getByTestId('mock-chat-input')).toHaveAttribute('data-deep-research', 'true');
  });

  it('sends no cancel when the thread is switched with Deep Research off', async () => {
    const calls = stubResearch(async () => new Response(null, { status: 204 }));
    render(<ChatPage />);
    await waitFor(() => expect(calls).toEqual(['GET /research/runs/current']));

    await act(async () => { fireEvent.click(screen.getByTestId('mock-select-thread')); });

    expect(calls).toEqual(['GET /research/runs/current']);
    expect(screen.getByTestId('mock-chat-input')).toHaveAttribute('data-deep-research', 'false');
  });

  it('still shows a run whose lookup answers after a thread switch, without cancelling it', async () => {
    let answer!: (response: Response) => void;
    const calls = stubResearch(() => new Promise(resolve => { answer = resolve; }));
    render(<ChatPage />);
    await waitFor(() => expect(calls).toEqual(['GET /research/runs/current']));

    await act(async () => { fireEvent.click(screen.getByTestId('mock-select-thread')); });
    expect(screen.queryByTestId('deep-research-plan')).not.toBeInTheDocument();
    await act(async () => { answer(activeRun()); });

    // The run is not left invisible: the plan card replaces the thread view.
    expect(await screen.findByTestId('deep-research-plan')).toBeInTheDocument();
    expect(screen.getByTestId('mock-chat-input')).toHaveAttribute('data-deep-research', 'true');
    expect(calls).toEqual(['GET /research/runs/current']);
  });

  it('cancels the shown run when the user leaves Deep Research by switching thread', async () => {
    const calls = stubResearch(async () => activeRun());
    render(<ChatPage />);
    await screen.findByTestId('deep-research-plan');

    await act(async () => { fireEvent.click(screen.getByTestId('mock-select-thread')); });

    await waitFor(() => expect(calls).toContain('POST /research/runs/run-1/cancel'));
    expect(screen.queryByTestId('deep-research-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-chat-input')).toHaveAttribute('data-deep-research', 'false');
  });
});
