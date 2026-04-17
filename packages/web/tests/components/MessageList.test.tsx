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

function renderMessageList(messages: UIMessage[], options?: { isStreaming?: boolean; status?: string }) {
  const messagesEndRef = { current: null };

  render(
    <MessageList
      messages={messages}
      isStreaming={options?.isStreaming ?? false}
      status={options?.status ?? 'ready'}
      onRerun={vi.fn()}
      messagesEndRef={messagesEndRef}
      feedbackMap={{}}
      threadId="thread-1"
      onRate={vi.fn()}
      onClearRating={vi.fn()}
      onComment={vi.fn()}
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
});
