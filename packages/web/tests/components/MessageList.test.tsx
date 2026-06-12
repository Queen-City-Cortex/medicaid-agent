import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';
import { MessageList } from '../../src/components/MessageList';
import { convertThreadMessageToUIMessage } from '../../src/lib/parse-message';

vi.mock('@/components/MessageActions', () => ({
  MessageActions: ({ content }: { content: string }) => (
    <div data-testid="message-actions">{content}</div>
  ),
}));

function renderMessageList(messages: UIMessage[], options?: {
  isStreaming?: boolean;
  status?: string;
  archivedVersions?: Record<string, UIMessage[]>;
  activeVersion?: Record<string, number>;
  onSelectVersion?: (userMsgId: string, version: number) => void;
}) {
  const messagesEndRef = { current: null };

  render(
    <MessageList
      messages={messages}
      isStreaming={options?.isStreaming ?? false}
      status={options?.status ?? 'ready'}
      onRerun={vi.fn()}
      messagesEndRef={messagesEndRef}
      feedbackMap={{}}
      onRate={vi.fn()}
      onClearRating={vi.fn()}
      onComment={vi.fn()}
      archivedVersions={options?.archivedVersions}
      activeVersion={options?.activeVersion}
      onSelectVersion={options?.onSelectVersion ?? (() => {})}
    />,
  );
}

describe('MessageList', () => {
  it('renders assistant parts in native order', () => {
    renderMessageList([
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Checking the policy first.' },
          {
            type: 'dynamic-tool',
            toolName: 'lookupPolicy',
            toolCallId: 'tc-1',
            state: 'output-available',
            input: { policyNumber: '5B' },
            output: { documents: [{ policyNumber: '5B', title: 'Clinical Coverage Policy 5B' }] },
          },
          { type: 'text', text: 'Now checking for amendments.' },
          {
            type: 'dynamic-tool',
            toolName: 'getAmendments',
            toolCallId: 'tc-2',
            state: 'output-available',
            input: { documentId: 'doc:5B' },
            output: { amendments: [], authoritativeDocument: { policyNumber: '5B', title: 'Clinical Coverage Policy 5B' } },
          },
          { type: 'text', text: '## Answer\n\nNo, chiropractic services are not covered.' },
        ],
      },
    ]);

    const orderedNodes = [
      screen.getByText('Checking the policy first.'),
      screen.getByText('Looking up policy'),
      screen.getByText('Now checking for amendments.'),
      screen.getByText('Checking amendments'),
      screen.getByText('No, chiropractic services are not covered.'),
    ];

    for (let index = 0; index < orderedNodes.length - 1; index++) {
      expect(
        orderedNodes[index].compareDocumentPosition(orderedNodes[index + 1]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('renders text-only assistant messages and uses the trailing answer for actions', () => {
    renderMessageList([
      {
        id: 'assistant-2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Plain answer with no tools.' }],
      },
    ]);

    expect(screen.getAllByText('Plain answer with no tools.')).toHaveLength(2);
    expect(screen.getByTestId('message-actions')).toHaveTextContent('Plain answer with no tools.');
  });

  it('hides step-start parts while keeping later content visible', () => {
    renderMessageList([
      {
        id: 'assistant-3',
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          { type: 'text', text: 'Progress update.' },
          {
            type: 'dynamic-tool',
            toolName: 'searchSections',
            toolCallId: 'tc-3',
            state: 'output-available',
            input: { query: 'EPSDT' },
            output: { sections: [] },
          },
        ],
      },
    ]);

    expect(screen.getByText('Progress update.')).toBeInTheDocument();
    expect(screen.getByText('Searching policies')).toBeInTheDocument();
    expect(screen.queryByText('step-start')).not.toBeInTheDocument();
  });

  it('shows running tool rows while streaming', () => {
    renderMessageList(
      [
        {
          id: 'assistant-4',
          role: 'assistant',
          parts: [
            {
              type: 'dynamic-tool',
              toolName: 'searchSections',
              toolCallId: 'tc-4',
              state: 'input-available',
              input: { query: 'telehealth speech therapy' },
            },
          ],
        },
      ],
      { isStreaming: true },
    );

    expect(screen.getByText('Searching policies')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.queryByTestId('message-actions')).not.toBeInTheDocument();
  });

  it('renders legacy stored V2 messages in order after parsing', () => {
    const parsed = convertThreadMessageToUIMessage({
      id: 'assistant-v2',
      role: 'assistant',
      content: {
        format: 2,
        parts: [
          { type: 'text', text: 'First note.' },
          {
            type: 'tool-invocation',
            toolInvocation: {
              toolCallId: 'tc-v2',
              toolName: 'searchSections',
              args: { query: 'PCS assisted living' },
              result: { sections: [{ title: 'Section 3.2.1' }] },
              state: 'result',
            },
          },
          { type: 'text', text: '## Answer\n\nHere is the final answer.' },
        ],
      },
    });

    expect(parsed).not.toBeNull();
    renderMessageList([parsed!]);

    const firstNote = screen.getByText('First note.');
    const toolLabel = screen.getByText('Searching policies');
    const finalAnswer = screen.getByText('Here is the final answer.');

    expect(firstNote.compareDocumentPosition(toolLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toolLabel.compareDocumentPosition(finalAnswer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows an explicit "ended without answer" notice + Rerun when tools ran but no final text was produced', () => {
    // This is the symptom of a mid-stream API error: tools have "Done" state
    // but no final text part was ever emitted. Without the notice the UI goes
    // silent; MessageActions (including Rerun) were also hidden because they
    // were gated on finalAnswerText.
    renderMessageList([
      {
        id: 'assistant-empty',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'searchSections',
            toolCallId: 'tc-1',
            state: 'output-available',
            input: { query: 'x' },
            output: { sections: [] },
          },
        ],
      },
    ]);

    expect(screen.getByTestId('ended-without-answer')).toBeInTheDocument();
    expect(screen.getByText(/finished without a final answer/i)).toBeInTheDocument();
    // MessageActions (Rerun etc.) must be reachable even though content is empty.
    expect(screen.getByTestId('message-actions')).toBeInTheDocument();
  });

  it('does not show the "ended without answer" notice while streaming', () => {
    renderMessageList(
      [
        {
          id: 'assistant-streaming',
          role: 'assistant',
          parts: [
            {
              type: 'dynamic-tool',
              toolName: 'searchSections',
              toolCallId: 'tc-1',
              state: 'output-available',
              input: { query: 'x' },
              output: { sections: [] },
            },
          ],
        },
      ],
      { isStreaming: true },
    );

    expect(screen.queryByTestId('ended-without-answer')).not.toBeInTheDocument();
  });

  it('does not show the "ended without answer" notice when a final text part exists', () => {
    renderMessageList([
      {
        id: 'assistant-ok',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'searchSections',
            toolCallId: 'tc-1',
            state: 'output-available',
            input: { query: 'x' },
            output: { sections: [] },
          },
          { type: 'text', text: 'Here is the answer.' },
        ],
      },
    ]);

    expect(screen.queryByTestId('ended-without-answer')).not.toBeInTheDocument();
  });

  it('announces status transitions via a hidden live region instead of aria-live on messages', () => {
    const baseProps = {
      messages: [
        {
          id: 'assistant-live',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Streaming answer.' }],
        } as UIMessage,
      ],
      onRerun: vi.fn(),
      messagesEndRef: { current: null },
      feedbackMap: {},
      onRate: vi.fn(),
      onClearRating: vi.fn(),
      onComment: vi.fn(),
    };

    const { rerender } = render(<MessageList {...baseProps} isStreaming={false} status="ready" />);
    const announcer = screen.getByTestId('chat-status-announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer).toHaveTextContent('');

    rerender(<MessageList {...baseProps} isStreaming={false} status="submitted" />);
    expect(announcer).toHaveTextContent('Researching…');

    rerender(<MessageList {...baseProps} isStreaming={true} status="streaming" />);
    expect(announcer).toHaveTextContent('Researching…');
    // The streaming message container itself must not be a live region.
    expect(screen.getByTestId('assistant-message')).not.toHaveAttribute('aria-live');

    rerender(<MessageList {...baseProps} isStreaming={false} status="ready" />);
    expect(announcer).toHaveTextContent('Answer ready');
  });

  // ── Version navigation ────────────────────────────────────────────────

  const USER_MSG: UIMessage = {
    id: 'user-1',
    role: 'user',
    parts: [{ type: 'text', text: 'Question?' }],
  } as unknown as UIMessage;

  const ASSISTANT_V2: UIMessage = {
    id: 'assistant-v2-live',
    role: 'assistant',
    parts: [{ type: 'text', text: 'Second answer (live).' }],
  } as unknown as UIMessage;

  const ASSISTANT_V1_ARCHIVED: UIMessage = {
    id: 'assistant-v1-archived',
    role: 'assistant',
    parts: [{ type: 'text', text: 'First answer (archived).' }],
  } as unknown as UIMessage;

  it('does not render a version-nav when no earlier versions exist', () => {
    renderMessageList([USER_MSG, ASSISTANT_V2]);
    expect(screen.queryByTestId('version-nav')).not.toBeInTheDocument();
  });

  it('renders the version-nav when an earlier version is archived', () => {
    renderMessageList([USER_MSG, ASSISTANT_V2], {
      archivedVersions: { 'user-1': [ASSISTANT_V1_ARCHIVED] },
    });
    expect(screen.getByTestId('version-indicator')).toHaveTextContent('2 / 2');
    // Live (v2) is the default displayed version. The MessageActions mock also
    // renders the trailing answer text, so we expect it twice (prose + mock).
    expect(screen.getAllByText('Second answer (live).').length).toBeGreaterThan(0);
    expect(screen.queryByText('First answer (archived).')).not.toBeInTheDocument();
  });

  it('renders the archived content when activeVersion points at an earlier slot', () => {
    renderMessageList([USER_MSG, ASSISTANT_V2], {
      archivedVersions: { 'user-1': [ASSISTANT_V1_ARCHIVED] },
      activeVersion: { 'user-1': 1 },
    });
    expect(screen.getAllByText('First answer (archived).').length).toBeGreaterThan(0);
    expect(screen.queryByText('Second answer (live).')).not.toBeInTheDocument();
    expect(screen.getByTestId('version-indicator')).toHaveTextContent('1 / 2');
  });

  it('fires onSelectVersion with the user-msg id and new version number', async () => {
    const onSelectVersion = vi.fn();
    renderMessageList([USER_MSG, ASSISTANT_V2], {
      archivedVersions: { 'user-1': [ASSISTANT_V1_ARCHIVED] },
      onSelectVersion,
    });
    const user = (await import('@testing-library/user-event')).default.setup();
    await user.click(screen.getByTestId('version-prev'));
    expect(onSelectVersion).toHaveBeenCalledWith('user-1', 1);
  });
});
