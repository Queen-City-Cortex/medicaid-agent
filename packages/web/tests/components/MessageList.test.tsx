import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  onRerun?: (messageIndex: number, userIndex: number) => void;
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
      onRerun={options?.onRerun ?? vi.fn()}
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
  it('renders the answer first and collapses completed tool runs into a research trail', async () => {
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

    // The final answer renders BEFORE the trail — the answer is what the
    // user asked for; the tool loop is supporting evidence.
    const answer = screen.getByText('No, chiropractic services are not covered.');
    const trigger = screen.getByTestId('research-trail-trigger');
    expect(trigger).toHaveTextContent('Research trail');
    expect(trigger).toHaveTextContent('2 steps');
    expect(
      answer.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Collapsed by default: tool steps and progress prose are out of the DOM.
    expect(screen.queryByText('Looking up policy')).not.toBeInTheDocument();
    expect(screen.queryByText('Checking the policy first.')).not.toBeInTheDocument();

    // Expanding reveals the interleaved progress text + tool steps in their
    // original order, inside the trail content.
    const user = userEvent.setup();
    await user.click(trigger);

    const trailContent = screen.getByTestId('research-trail-content');
    const orderedNodes = [
      screen.getByText('Checking the policy first.'),
      screen.getByText('Looking up policy'),
      screen.getByText('Now checking for amendments.'),
      screen.getByText('Checking amendments'),
    ];
    for (const node of orderedNodes) {
      expect(trailContent).toContainElement(node);
    }
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

  it('shows a generation timestamp on restored messages and omits it without metadata', () => {
    renderMessageList([
      {
        id: 'assistant-fresh',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Streamed just now.' }],
      },
      {
        id: 'assistant-restored',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Restored from memory.' }],
        metadata: { createdAt: '2026-04-09T17:50:36.141Z' },
      },
    ]);

    const stamps = screen.getAllByTestId('generated-at');
    expect(stamps).toHaveLength(1);
    expect(stamps[0]).toHaveTextContent(/Generated April 9, 2026/);
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
    // The live view stays expanded — no research trail until the run completes.
    expect(screen.queryByTestId('research-trail')).not.toBeInTheDocument();
  });

  it('narrates the current step while streaming, replacing the static loading indicator', () => {
    renderMessageList(
      [
        {
          id: 'assistant-narration',
          role: 'assistant',
          parts: [
            {
              type: 'dynamic-tool',
              toolName: 'searchSections',
              toolCallId: 'tc-1',
              state: 'output-available',
              input: { query: 'therapeutic leave' },
              output: { sections: [] },
            },
            {
              type: 'dynamic-tool',
              toolName: 'getSection',
              toolCallId: 'tc-2',
              state: 'input-available',
              input: { sectionId: 'sec-8c-321' },
            },
          ],
        },
      ],
      { isStreaming: true },
    );

    const narration = screen.getByTestId('progress-narration');
    // Descriptor + summarized input from the LAST tool part, plus step count.
    expect(narration).toHaveTextContent('Reading section');
    expect(narration).toHaveTextContent('Section: sec-8c-321');
    expect(narration).toHaveTextContent('step 2');
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
  });

  it('drops the narration line once the final answer starts streaming', () => {
    renderMessageList(
      [
        {
          id: 'assistant-answering',
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
            { type: 'text', text: 'The answer is forming…' },
          ],
        },
      ],
      { isStreaming: true },
    );

    expect(screen.queryByTestId('progress-narration')).not.toBeInTheDocument();
  });

  it('renders legacy stored V2 messages in order after parsing', async () => {
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

    // Completed run: the answer is visible immediately, the tool loop is
    // collapsed into the research trail.
    const finalAnswer = screen.getByText('Here is the final answer.');
    const trigger = screen.getByTestId('research-trail-trigger');
    expect(
      finalAnswer.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const user = userEvent.setup();
    await user.click(trigger);

    const firstNote = screen.getByText('First note.');
    const toolLabel = screen.getByText('Searching policies');
    expect(firstNote.compareDocumentPosition(toolLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    // The tool steps stay expanded (no collapsed trail) — they are the only
    // output worth inspecting in this state.
    expect(screen.getByText('Searching policies')).toBeInTheDocument();
    expect(screen.queryByTestId('research-trail')).not.toBeInTheDocument();
  });

  it('wires the Try again button in the ended-without-answer notice to the rerun path', async () => {
    const onRerun = vi.fn();
    renderMessageList(
      [
        {
          id: 'user-q',
          role: 'user',
          parts: [{ type: 'text', text: 'Is therapeutic leave covered?' }],
        },
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
      ],
      { onRerun },
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('try-again-button'));
    // Same wiring as the MessageActions rerun button: (assistantIndex, userIndex).
    expect(onRerun).toHaveBeenCalledWith(1, 0);
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

  it('preserves user line breaks and wraps long tokens in the user bubble', () => {
    renderMessageList([
      {
        id: 'user-multiline',
        role: 'user',
        parts: [{ type: 'text', text: 'Fact one.\nFact two.' }],
      },
    ]);

    const bubbleText = screen.getByTestId('user-message').querySelector('p');
    expect(bubbleText).not.toBeNull();
    expect(bubbleText!.className).toContain('whitespace-pre-wrap');
    expect(bubbleText!.className).toContain('[overflow-wrap:anywhere]');
  });

  it('gives citation footnotes an expanded hit area without changing visual size', () => {
    const url = 'https://example.org/policy-8c.pdf';
    renderMessageList([
      {
        id: 'assistant-cited',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'getSection',
            toolCallId: 'tc-1',
            state: 'output-available',
            input: { sectionId: 'sec-1' },
            output: {
              section: {
                title: 'Therapeutic Leave',
                sectionNumber: '3.2.1',
                policyNumber: '8C',
                url,
              },
            },
          },
          { type: 'text', text: `Covered per [Policy 8C § 3.2.1](${url}).` },
        ],
      },
    ]);

    const footnote = screen.getByTestId('citation-footnote');
    // The ::after overlay extends the tap target to ≥24px on each side while
    // the visible footnote stays superscript-sized.
    expect(footnote.className).toContain('after:-inset-2');
    expect(footnote.className).toContain('relative');
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
    expect(screen.getByTestId('version-indicator')).toHaveTextContent('Answer 2 of 2');
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
    expect(screen.getByTestId('version-indicator')).toHaveTextContent('Answer 1 of 2');
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
