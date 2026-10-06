import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPage from '../../src/app/chat/page';

// The page with the real chat hook, transport, input and sidebar over a
// stand-in agent: a thread exists only once the agent has accepted a first
// message on `/chat`, and the browser has no call that creates one.
const agent = vi.hoisted(() => ({
  threads: [] as Array<{ id: string; title: string; updatedAt: string }>,
  createMemoryThread: vi.fn(),
  listMemoryThreads: vi.fn(),
  chatBodies: [] as Array<{ messages: Array<{ parts: Array<{ text: string }> }>; memory: { thread: string; resource: string } }>,
  otherRequests: [] as string[],
}));

vi.mock('@workos-inc/authkit-nextjs/components', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'testing@queencitycortex.com' }, loading: false, signOut: vi.fn() }),
  useAccessToken: () => ({ getAccessToken: async () => 'token', accessToken: 'token' }),
}));
vi.mock('@/lib/use-mastra-client', () => {
  const client = {
    createMemoryThread: agent.createMemoryThread,
    listMemoryThreads: agent.listMemoryThreads,
    getMemoryThread: () => ({ listMessages: async () => ({ messages: [] }) }),
  };
  const runner = { run: <T,>(op: (c: typeof client) => T): T => op(client) };
  return { useMastraClientRunner: () => runner, useMastraReady: () => true };
});
vi.mock('@/components/ScrollToBottom', () => ({ ScrollToBottom: () => null }));
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/lib/use-is-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/use-corpus-status', () => ({ useCorpusStatus: () => null }));
vi.mock('@/lib/use-deep-research', () => ({
  useDeepResearch: () => ({ status: 'idle', isBusy: false, reset: () => {}, start: async () => {} }),
}));
vi.mock('@/lib/feedback-client', () => ({
  submitFeedback: vi.fn(),
  deleteFeedback: vi.fn(),
  getFeedbackByThread: vi.fn().mockResolvedValue([]),
}));

const REFUSAL = 'Remove client-identifying information before sending this question.';
const REFUSED = 'My client Jane Roe, SSN 123-45-6789, was denied personal care services.';
const ACCEPTED = 'Does North Carolina Medicaid cover personal care services for adults living at home?';

function answerStream(text: string): Response {
  const chunks = [
    { type: 'start', messageId: 'answer-1' }, { type: 'start-step' },
    // As the agent's release gate sends it: the outcome, then the released text.
    { type: 'data-verification-status', data: { status: 'passed', passCount: 1 } },
    { type: 'text-start', id: 't1' }, { type: 'text-delta', id: 't1', delta: text }, { type: 'text-end', id: 't1' },
    { type: 'finish-step' }, { type: 'finish' },
  ];
  return new Response(`${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
  });
}

/** The agent's `/chat`: the identifier screen first, then the thread, titled
 *  from the first 60 characters, for an id it has not seen. */
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.pathname !== '/chat' || init?.method !== 'POST') {
    agent.otherRequests.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    return new Response('{}', { status: 404 });
  }
  const body = JSON.parse(String(init.body)) as (typeof agent.chatBodies)[number];
  agent.chatBodies.push(body);
  const text = body.messages[0].parts.map(part => part.text).join('');
  if (/\d{3}-\d{2}-\d{4}/.test(text)) {
    return new Response(JSON.stringify({ error: { code: 'client_identifier_detected', message: REFUSAL } }),
      { status: 422, headers: { 'content-type': 'application/json' } });
  }
  if (!agent.threads.some(thread => thread.id === body.memory.thread)) {
    agent.threads.unshift({ id: body.memory.thread, title: text.slice(0, 60), updatedAt: new Date().toISOString() });
  }
  return answerStream('Personal care services are covered.');
}

async function send(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByTestId('chat-input'), text);
  await user.click(screen.getByTestId('send-button'));
}

const threadTitles = () => screen.queryAllByTestId('thread-item').map(item => item.textContent);

describe('ChatPage first message', () => {
  beforeEach(() => {
    agent.threads.length = 0;
    agent.chatBodies.length = 0;
    agent.otherRequests.length = 0;
    agent.createMemoryThread.mockReset();
    agent.listMemoryThreads.mockReset();
    agent.listMemoryThreads.mockImplementation(async () => ({ threads: [...agent.threads] }));
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the question to the agent alone, and the sidebar lists the new thread once the turn ends', async () => {
    render(<ChatPage />);
    await waitFor(() => expect(agent.listMemoryThreads).toHaveBeenCalled());
    expect(threadTitles()).toEqual([]);

    await send(ACCEPTED);

    await waitFor(() => expect(screen.getByTestId('assistant-message')).toHaveTextContent('Personal care services are covered.'));
    // No reload and no thread switch: the finished turn refreshes the list.
    await waitFor(() => expect(threadTitles()).toEqual([expect.stringContaining(ACCEPTED.slice(0, 60))]));
    expect(agent.createMemoryThread).not.toHaveBeenCalled();
    expect(agent.otherRequests).toEqual([]);
    expect(agent.chatBodies).toHaveLength(1);
    expect(agent.chatBodies[0].memory).toEqual({ thread: expect.any(String), resource: 'user-1' });
    expect(agent.threads.map(thread => thread.id)).toEqual([agent.chatBodies[0].memory.thread]);
  });

  it('stores nothing for a refused first message and titles the thread from the question sent next', async () => {
    render(<ChatPage />);
    await waitFor(() => expect(agent.listMemoryThreads).toHaveBeenCalled());

    await send(REFUSED);

    const refusal = await screen.findByTestId('chat-error-identifier-detected');
    expect(refusal).toHaveTextContent(REFUSAL);
    // Sending the same text again would be refused again.
    expect(refusal.querySelector('button')).toBeNull();
    expect(agent.createMemoryThread).not.toHaveBeenCalled();
    expect(agent.otherRequests).toEqual([]);
    expect(agent.threads).toEqual([]);
    // The list was read again when the turn ended, and still has no thread.
    await waitFor(() => expect(agent.listMemoryThreads.mock.calls.length).toBeGreaterThan(1));
    expect(threadTitles()).toEqual([]);
    // The refused question stays on screen, in this tab only; the input is
    // empty and usable. The hook reports a refusal as an error state, not a
    // thrown send, so the text is not put back in the input.
    expect(screen.getAllByTestId('user-message').map(item => item.textContent)).toEqual([REFUSED]);
    expect(screen.getByTestId('chat-input')).toHaveValue('');
    expect(screen.getByTestId('chat-input')).toBeEnabled();

    await send(ACCEPTED);

    await waitFor(() => expect(screen.getByTestId('assistant-message')).toHaveTextContent('Personal care services are covered.'));
    await waitFor(() => expect(threadTitles()).toHaveLength(1));
    // Same conversation id, created by the first accepted message.
    expect(agent.chatBodies.map(body => body.memory.thread)).toEqual([agent.chatBodies[0].memory.thread, agent.chatBodies[0].memory.thread]);
    expect(agent.threads).toEqual([expect.objectContaining({ id: agent.chatBodies[0].memory.thread, title: ACCEPTED.slice(0, 60) })]);
    expect(JSON.stringify(agent.threads)).not.toContain('Jane Roe');
    expect(threadTitles().join(' ')).not.toContain('Jane Roe');
    expect(agent.createMemoryThread).not.toHaveBeenCalled();
  });

  it('starts a clean conversation from "+ New" after a refused first message', async () => {
    render(<ChatPage />);
    await waitFor(() => expect(agent.listMemoryThreads).toHaveBeenCalled());
    await send(REFUSED);
    await screen.findByTestId('chat-error-identifier-detected');

    await userEvent.setup().click(screen.getByTestId('new-thread-button'));

    await waitFor(() => expect(screen.queryByTestId('user-message')).not.toBeInTheDocument());
    expect(screen.queryByTestId('chat-error-identifier-detected')).not.toBeInTheDocument();
    expect(threadTitles()).toEqual([]);

    await send(ACCEPTED);
    await waitFor(() => expect(threadTitles()).toHaveLength(1));
    // A different id from the refused attempt's, which never reached storage.
    expect(agent.chatBodies[1].memory.thread).not.toBe(agent.chatBodies[0].memory.thread);
    expect(agent.threads.map(thread => thread.id)).toEqual([agent.chatBodies[1].memory.thread]);
    expect(agent.createMemoryThread).not.toHaveBeenCalled();
  });
});
