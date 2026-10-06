import type { ReactNode } from 'react';
import { VERIFICATION_PART } from '@nc-medicaid/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPage from '../../src/app/chat/page';

// The page with its real MessageList, so a click on a message's own controls
// is followed all the way to what the chat hook is asked to send.
const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  chat: {
    messages: [] as Array<{ id: string; role: string; parts: Array<Record<string, unknown>> }>,
    status: 'ready' as string,
    error: undefined as Error | undefined,
  },
}));

vi.mock('@workos-inc/authkit-nextjs/components', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: false }),
  useAccessToken: () => ({ getAccessToken: vi.fn().mockResolvedValue('token'), accessToken: 'token' }),
}));

vi.mock('@ai-sdk/react', () => ({
  // The hook builds one Chat per thread and hands it to useChat, mocked below.
  Chat: class Chat {
    messages = [];
    status = 'ready';
  },
  useChat: () => ({
    messages: mocks.chat.messages,
    status: mocks.chat.status,
    error: mocks.chat.error,
    sendMessage: mocks.sendMessage,
    setMessages: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('ai', () => ({
  DefaultChatTransport: class DefaultChatTransport {},
}));

vi.mock('@/components/ThreadSidebar', () => ({ ThreadSidebar: () => null }));
vi.mock('@/components/ChatInput', () => ({ ChatInput: () => null }));
vi.mock('@/components/ScrollToBottom', () => ({ ScrollToBottom: () => null }));
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/lib/use-is-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/use-mastra-client', () => {
  const runner = { run: () => Promise.resolve(undefined) };
  return { useMastraClientRunner: () => runner, useMastraReady: () => true };
});
vi.mock('@/lib/use-corpus-status', () => ({ useCorpusStatus: () => null }));
vi.mock('@/lib/use-deep-research', () => ({
  useDeepResearch: () => ({ status: 'idle', isBusy: false, reset: () => {}, start: async () => {} }),
}));
vi.mock('@/lib/feedback-client', () => ({
  submitFeedback: vi.fn(),
  deleteFeedback: vi.fn(),
  getFeedbackByThread: vi.fn().mockResolvedValue([]),
}));

const question = (id: string, text: string) => ({ id, role: 'user', parts: [{ type: 'text', text }] });
const answer = (id: string, text: string) => ({
  id,
  role: 'assistant',
  parts: [{ type: 'text', text }, { type: VERIFICATION_PART, data: { status: 'passed', passCount: 1 } }],
});
const TOOL_ONLY = {
  id: 'a1',
  role: 'assistant',
  parts: [{ type: 'dynamic-tool', toolName: 'searchSections', toolCallId: 'tc-1', state: 'output-available', input: {}, output: { sections: [] } }],
};

describe('ChatPage ask again', () => {
  beforeEach(() => {
    mocks.sendMessage.mockReset();
    mocks.chat.messages = [];
    mocks.chat.status = 'ready';
    mocks.chat.error = undefined;
  });

  it('asks the first question again as a new turn and keeps every earlier message', async () => {
    mocks.chat.messages = [
      question('u1', 'Is dental covered?'),
      answer('a1', 'Dental is covered.'),
      question('u2', 'Is vision covered?'),
      answer('a2', 'Vision is covered.'),
    ];
    render(<ChatPage />);

    const firstAnswer = screen.getAllByTestId('assistant-message')[0];
    await userEvent.setup().click(within(firstAnswer).getByRole('button', { name: 'Ask again' }));

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).toHaveBeenCalledWith({ text: 'Is dental covered?' });
    expect(screen.getAllByTestId('user-message').map(el => el.textContent)).toEqual(['Is dental covered?', 'Is vision covered?']);
    const answers = screen.getAllByTestId('assistant-message');
    expect(answers).toHaveLength(2);
    expect(answers[0]).toHaveTextContent('Dental is covered.');
    expect(answers[1]).toHaveTextContent('Vision is covered.');
  });

  it('offers no way to ask again while an answer is on its way', () => {
    mocks.chat.messages = [question('u1', 'Is dental covered?'), answer('a1', 'Dental is covered.'), question('u2', 'Is vision covered?')];
    mocks.chat.status = 'submitted';
    render(<ChatPage />);

    expect(screen.queryByRole('button', { name: 'Ask again' })).not.toBeInTheDocument();
  });

  it('retries a failed request in place when no answer had begun', async () => {
    mocks.chat.messages = [question('u1', 'Is dental covered?')];
    mocks.chat.status = 'error';
    mocks.chat.error = new Error('boom');
    render(<ChatPage />);

    await userEvent.setup().click(within(screen.getByTestId('chat-error')).getByRole('button', { name: 'Try again' }));

    // Reusing the question's id keeps a single copy of it on screen.
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).toHaveBeenCalledWith({ text: 'Is dental covered?', messageId: 'u1' });
  });

  it('retries as a new turn when the failed answer had already begun', async () => {
    mocks.chat.messages = [question('u1', 'Is dental covered?'), TOOL_ONLY];
    mocks.chat.status = 'error';
    mocks.chat.error = new Error('boom');
    render(<ChatPage />);

    await userEvent.setup().click(within(screen.getByTestId('chat-error')).getByRole('button', { name: 'Try again' }));

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).toHaveBeenCalledWith({ text: 'Is dental covered?' });
  });

  it('shows a single retry, in the error box, for a turn that failed part-way', () => {
    mocks.chat.messages = [question('u1', 'Is dental covered?'), TOOL_ONLY];
    mocks.chat.status = 'error';
    mocks.chat.error = new Error('boom');
    render(<ChatPage />);

    expect(screen.getByTestId('chat-error')).toHaveTextContent('Sorry, there was an error processing your question.');
    expect(screen.queryByTestId('ended-without-answer')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /try again|ask again/i })).toHaveLength(1);
  });

  it('says the connection dropped, without blaming the service, and still offers the retry', () => {
    mocks.chat.messages = [question('u1', 'Is dental covered?'), TOOL_ONLY];
    mocks.chat.status = 'error';
    mocks.chat.error = new TypeError('network error');
    render(<ChatPage />);

    const box = screen.getByTestId('chat-error-disconnected');
    expect(box).toHaveTextContent('The connection dropped before the answer finished.');
    expect(box).not.toHaveTextContent(/error/i);
    expect(screen.getAllByRole('button', { name: /try again|ask again/i })).toHaveLength(1);
  });
});
