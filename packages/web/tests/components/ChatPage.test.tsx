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
  ChatInput: ({ deepResearch, deepResearchStatus, input, setInput, onSend, onToggleDeepResearch }: {
    deepResearch: boolean; deepResearchStatus?: string; input: string;
    setInput: (value: string) => void; onSend: () => void; onToggleDeepResearch: () => void;
  }) => (
    <div data-testid="mock-chat-input" data-deep-research={String(deepResearch)} data-run-status={deepResearchStatus ?? ''}>
      <textarea aria-label="Question" value={input} onChange={(event) => setInput(event.target.value)} />
      <button type="button" data-testid="mock-send" onClick={onSend}>Ask</button>
      <button type="button" data-testid="mock-toggle-deep-research" onClick={onToggleDeepResearch}>Deep Research</button>
    </div>
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

  /** Stubs the research API; `current` answers the page's active-run lookup and
   *  `other` any other research request it chooses to (default: 204). */
  function stubResearch(current: () => Promise<Response>, other?: (call: string) => Response | undefined) {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (!url.includes('/research/')) return Promise.resolve(new Response(null, { status: 404 }));
      const call = `${init?.method ?? 'GET'} ${url.replace(/^.*(?=\/research\/)/, '')}`;
      calls.push(call);
      if (url.endsWith('/research/runs/current')) return current();
      return Promise.resolve(other?.(call) ?? new Response(null, { status: 204 }));
    });
    return calls;
  }
  const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const chatInput = () => screen.getByTestId('mock-chat-input');
  const switchThread = () => act(async () => { fireEvent.click(screen.getByTestId('mock-select-thread')); });
  const toggleDeepResearch = () => act(async () => { fireEvent.click(screen.getByTestId('mock-toggle-deep-research')); });

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

  it('keeps a plan awaiting approval when the user switches thread, and shows it again from the pill', async () => {
    const calls = stubResearch(async () => activeRun());
    render(<ChatPage />);
    await screen.findByTestId('deep-research-plan');

    await switchThread();

    expect(screen.queryByTestId('deep-research-view')).not.toBeInTheDocument();
    expect(chatInput()).toHaveAttribute('data-deep-research', 'false');
    expect(chatInput()).toHaveAttribute('data-run-status', 'plan ready');

    await toggleDeepResearch();
    expect(screen.getByTestId('deep-research-plan')).toHaveTextContent('Which services need PA?');
    expect(chatInput()).toHaveAttribute('data-run-status', '');
    expect(calls).toEqual(['GET /research/runs/current']);
  });

  it('leaves a run in progress running across a thread switch and the toggle; only Cancel research cancels it', async () => {
    const researching = { ...ACTIVE_RUN, state: 'researching' };
    const calls = stubResearch(
      async () => jsonResponse(researching),
      call => (call === 'GET /research/runs/run-1' ? jsonResponse(researching) : undefined),
    );
    render(<ChatPage />);
    await screen.findByTestId('cancel-research');

    await switchThread();
    expect(screen.queryByTestId('deep-research-view')).not.toBeInTheDocument();
    expect(chatInput()).toHaveAttribute('data-run-status', 'running');

    await toggleDeepResearch();
    expect(screen.getByTestId('cancel-research')).toBeInTheDocument();
    await toggleDeepResearch();
    expect(screen.queryByTestId('deep-research-view')).not.toBeInTheDocument();
    expect(calls.filter(call => call.startsWith('POST'))).toEqual([]);

    await toggleDeepResearch();
    fireEvent.click(screen.getByTestId('cancel-research'));
    await waitFor(() => expect(calls).toContain('POST /research/runs/run-1/cancel'));
    expect(await screen.findByText('Research was cancelled.')).toBeInTheDocument();
  });

  it('keeps a finished report across a thread switch and marks it ready on the pill', async () => {
    const report = {
      status: 'completed', question: 'Does X?', brief: 'b', reportMarkdown: 'The finished report body.',
      subQuestions: [], corpusSources: [], webSources: [], workerFailures: [], citationProvenance: null,
      stats: { reflectionRounds: 0, subQuestionCount: 1, corpusSourceCount: 0, webSourceCount: 0 },
    };
    const calls = stubResearch(
      async () => activeRun(),
      call => (call === 'GET /research/runs/run-1' ? jsonResponse({ ...ACTIVE_RUN, state: 'completed', report }) : undefined),
    );
    render(<ChatPage />);
    fireEvent.click(await screen.findByTestId('approve-plan'));
    expect(await screen.findByText('The finished report body.')).toBeInTheDocument();

    await switchThread();
    expect(screen.queryByText('The finished report body.')).not.toBeInTheDocument();
    expect(chatInput()).toHaveAttribute('data-run-status', 'report ready');

    await toggleDeepResearch();
    expect(screen.getByText('The finished report body.')).toBeInTheDocument();
    expect(calls.filter(call => call.endsWith('/cancel'))).toEqual([]);
  });

  it.each([
    ['409 active run', () => jsonResponse({ error: { code: 'active_research_run', message: 'Only one active research run is allowed per user.' } }, 409)],
    ['429 daily limit', () => jsonResponse({ error: { code: 'research_daily_quota', message: 'You have used both research reports available in a 24-hour period.' } }, 429)],
  ])('puts the typed question back in the input when the start is refused: %s', async (label, refusal) => {
    // No run when the page loads; by the time the start is refused there is one.
    let lookups = 0;
    stubResearch(
      async () => (++lookups === 1 ? new Response(null, { status: 204 }) : activeRun()),
      call => (call === 'POST /research/runs' ? refusal() : undefined),
    );
    render(<ChatPage />);
    await waitFor(() => expect(lookups).toBe(1));
    await toggleDeepResearch();
    const input = screen.getByLabelText('Question');
    fireEvent.change(input, { target: { value: 'How does therapeutic leave work?' } });
    await act(async () => { fireEvent.click(screen.getByTestId('mock-send')); });

    expect(await screen.findByTestId('deep-research-notice')).toBeInTheDocument();
    await waitFor(() => expect(input).toHaveValue('How does therapeutic leave work?'));
    if (label.startsWith('409')) expect(screen.getByTestId('deep-research-plan')).toBeInTheDocument();
    else expect(screen.getByTestId('deep-research-empty')).toBeInTheDocument();
  });
});
