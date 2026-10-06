import { VERIFICATION_PART, UNVERIFIED_HISTORY } from '@nc-medicaid/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';
import { MessageList } from '../../src/components/MessageList';
import { convertThreadMessageToUIMessage } from '../../src/lib/parse-message';
import { resolveCitedSources } from '../../src/lib/message-parts';

vi.mock('@/components/MessageActions', () => ({
  MessageActions: ({ content }: { content: string }) => (
    <div data-testid="message-actions">{content}</div>
  ),
}));

function renderMessageList(messages: UIMessage[], options?: {
  explicitRelease?: boolean;
  isStreaming?: boolean;
  status?: string;
  onRerun?: (userIndex: number) => void;
  wasStopped?: (messageId: string) => boolean;
}) {
  const releasedFixture = (m: UIMessage): UIMessage => m.role === 'assistant' && m.parts.some(p => p.type === 'text') && !m.parts.some(p => p.type === VERIFICATION_PART)
    ? { ...m, parts: [...m.parts, { type: VERIFICATION_PART, data: { status: 'passed', passCount: 1 } }] } : m;
  if (!options?.explicitRelease) messages = messages.map(releasedFixture);
  const messagesEndRef = { current: null };

  render(
    <MessageList
      messages={messages}
      isStreaming={options?.isStreaming ?? false}
      status={options?.status ?? 'ready'}
      onRerun={options?.onRerun ?? vi.fn()}
      wasStopped={options?.wasStopped}
      messagesEndRef={messagesEndRef}
      feedbackMap={{}}
      onRate={vi.fn()}
      onClearRating={vi.fn()}
      onComment={vi.fn()}
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
    const finalAnswer = screen.getAllByText(UNVERIFIED_HISTORY)[0];
    const trigger = screen.getByTestId('research-trail-trigger');
    expect(
      finalAnswer.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const user = userEvent.setup();
    await user.click(trigger);

    expect(screen.queryByText('First note.')).not.toBeInTheDocument();
    expect(screen.getByText('Searching policies')).toBeInTheDocument();
  });

  it('shows an explicit "ended without answer" notice + Rerun when tools ran but no final text was produced', () => {
    // Tools have "Done" state but no final text part was ever emitted. Without
    // the notice the UI goes silent; MessageActions (including Rerun) were
    // also hidden because they were gated on finalAnswerText.
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
    // Why the turn ended is unknown here, so the notice names no cause.
    expect(screen.getByTestId('ended-without-answer')).toHaveTextContent('This answer ended before it was finished.');
    expect(screen.getByTestId('ended-without-answer')).not.toHaveTextContent(/error|stopped/i);
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
    // Same wiring as the MessageActions "Ask again" button: the index of the
    // question this message answered.
    expect(onRerun).toHaveBeenCalledWith(0);
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

  it('numbers a citation whose label is formatted, by its section', () => {
    const url = 'https://example.org/policy-8c.pdf';
    const section = (toolCallId: string, sectionNumber: string) => ({
      type: 'dynamic-tool' as const,
      toolName: 'getSection',
      toolCallId,
      state: 'output-available' as const,
      input: { sectionId: toolCallId },
      output: { section: { title: `Section ${sectionNumber}`, sectionNumber, policyNumber: '8C', url } },
    });
    renderMessageList([
      {
        id: 'assistant-bold-cite',
        role: 'assistant',
        parts: [
          section('tc-1', '3.2.1'),
          section('tc-2', '5.6'),
          { type: 'text', text: `Limits are in [**Policy 8-C § 5.6**](${url}).` },
        ],
      },
    ]);

    // Two rows share the URL, so only the label's section can pick one. The
    // cited row sorts first, hence footnote 1.
    expect(screen.getByTestId('citation-footnote').textContent).toBe('[1]');
  });

  it('counts a citation as cited when only its section number is formatted', () => {
    const url = 'https://example.org/policy-8c.pdf';
    const sources = ['3.2.1', '5.6'].map((sectionNumber) => ({
      label: `Policy 8C § ${sectionNumber}`, url, sectionNumber,
    })) as Parameters<typeof resolveCitedSources>[1];
    const msg = { id: 'm', role: 'assistant', parts: [{ type: 'text', text: `See [Policy 8-C § **5.6**](${url}).` }] } as UIMessage;

    const { ordered, citedCount } = resolveCitedSources(msg, sources);

    expect(citedCount).toBe(1);
    expect(ordered[0].sectionNumber).toBe('5.6');
  });

  // ── Stopped, dropped and failed turns ─────────────────────────────────

  const QUESTION: UIMessage = { id: 'user-q', role: 'user', parts: [{ type: 'text', text: 'Is dental covered?' }] };
  const STOPPED_IN_TOOLS: UIMessage = {
    id: 'assistant-tools',
    role: 'assistant',
    parts: [
      { type: 'dynamic-tool', toolName: 'searchSections', toolCallId: 'tc-1', state: 'output-available', input: { query: 'x' }, output: { sections: [] } },
      { type: 'dynamic-tool', toolName: 'getSection', toolCallId: 'tc-2', state: 'input-available', input: { sectionId: 's-1' } },
    ],
  } as unknown as UIMessage;
  const STOPPED_WHILE_VERIFYING: UIMessage = {
    id: 'assistant-verifying',
    role: 'assistant',
    parts: [{ type: 'text', text: 'PRIVATE_DRAFT_SENTINEL' }, { type: VERIFICATION_PART, data: { status: 'verifying' } }],
  } as unknown as UIMessage;

  it('shows an interrupted step, no spinner and a stopped notice after Stop in the tool loop', () => {
    renderMessageList([QUESTION, STOPPED_IN_TOOLS], { wasStopped: id => id === 'assistant-tools' });

    expect(screen.getByText('Interrupted')).toBeInTheDocument();
    expect(screen.queryByText('Running')).not.toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByTestId('progress-narration')).not.toBeInTheDocument();
    const notice = screen.getByTestId('ended-without-answer');
    expect(notice).toHaveTextContent('You stopped this answer.');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).not.toHaveTextContent(/error/i);
  });

  it('names no cause when a turn that ended in the tool loop was not stopped by the user', () => {
    renderMessageList([QUESTION, STOPPED_IN_TOOLS]);

    expect(screen.getByText('Interrupted')).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
    const notice = screen.getByTestId('ended-without-answer');
    expect(notice).toHaveTextContent('This answer ended before it was finished.');
    expect(notice).not.toHaveTextContent(/error|stopped/i);
  });

  it('drops the checking line and shows a stopped notice after Stop during verification', () => {
    renderMessageList([QUESTION, STOPPED_WHILE_VERIFYING], { explicitRelease: true, wasStopped: id => id === 'assistant-verifying' });

    expect(screen.queryByTestId('verification-progress')).not.toBeInTheDocument();
    expect(screen.getByTestId('ended-without-answer')).toHaveTextContent('You stopped this answer.');
    expect(screen.queryByText('PRIVATE_DRAFT_SENTINEL')).not.toBeInTheDocument();
  });

  it('shows the neutral notice, not the checking line, for a turn that ended while verifying', () => {
    renderMessageList([QUESTION, STOPPED_WHILE_VERIFYING], { explicitRelease: true });

    expect(screen.queryByTestId('verification-progress')).not.toBeInTheDocument();
    expect(screen.getByTestId('ended-without-answer')).toHaveTextContent('This answer ended before it was finished.');
    expect(screen.queryByText('PRIVATE_DRAFT_SENTINEL')).not.toBeInTheDocument();
  });

  it('shows a stopped notice when Stop landed before any progress was shown', () => {
    renderMessageList([QUESTION, { id: 'assistant-draft', role: 'assistant', parts: [{ type: 'text', text: 'PRIVATE_DRAFT_SENTINEL' }] }],
      { explicitRelease: true, wasStopped: id => id === 'assistant-draft' });

    expect(screen.getByTestId('ended-without-answer')).toHaveTextContent('You stopped this answer.');
    expect(screen.queryByText('PRIVATE_DRAFT_SENTINEL')).not.toBeInTheDocument();
  });

  it('puts the stopped notice under the question when Stop landed before the answer began', async () => {
    const onRerun = vi.fn();
    renderMessageList([QUESTION], { onRerun, wasStopped: id => id === 'user-q' });

    const notice = screen.getByTestId('stopped-before-answer');
    expect(notice).toHaveTextContent('You stopped this answer.');
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRerun).toHaveBeenCalledWith(0);
  });

  it('leaves the retry to the page-level error box while it is showing', () => {
    renderMessageList([QUESTION, STOPPED_IN_TOOLS], { status: 'error' });

    expect(screen.getByText('Interrupted')).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByTestId('ended-without-answer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('keeps the notice on an earlier ended turn while a later one has failed', () => {
    renderMessageList([QUESTION, STOPPED_IN_TOOLS, { ...QUESTION, id: 'user-q2' }], { status: 'error' });

    expect(screen.getByTestId('ended-without-answer')).toBeInTheDocument();
  });

  it('announces a stopped answer as stopped, not ready', () => {
    const props = {
      messages: [QUESTION, STOPPED_IN_TOOLS],
      onRerun: vi.fn(),
      messagesEndRef: { current: null },
      feedbackMap: {},
      onRate: vi.fn(),
      onClearRating: vi.fn(),
      onComment: vi.fn(),
    };
    const { rerender } = render(<MessageList {...props} isStreaming={true} status="streaming" />);
    rerender(<MessageList {...props} isStreaming={false} status="ready" wasStopped={id => id === 'assistant-tools'} />);

    expect(screen.getByTestId('chat-status-announcer')).toHaveTextContent('Answer stopped');
  });

  it('renders a guard tripwire as a friendly blocked-message notice, not a blank bubble', () => {
    renderMessageList([
      {
        id: 'assistant-blocked',
        role: 'assistant',
        parts: [
          {
            type: 'data-tripwire',
            data: {
              reason: 'off-topic request blocked',
              metadata: { code: 'off-topic', userMessage: 'I can only help with NC Medicaid questions.' },
              processorId: 'scope-gate',
            },
          } as unknown as UIMessage['parts'][number],
        ],
      },
    ]);
    expect(screen.getByTestId('blocked-message')).toHaveTextContent('I can only help with NC Medicaid questions.');
    expect(screen.queryByTestId('ended-without-answer')).not.toBeInTheDocument();
  });

  it('falls back to generic blocked-message copy when the tripwire carries no userMessage', () => {
    renderMessageList(
      [
        {
          id: 'assistant-blocked',
          role: 'assistant',
          parts: [
            { type: 'data-tripwire', data: { reason: 'blocked' } } as unknown as UIMessage['parts'][number],
          ],
        },
      ],
      // Streaming: the tripwire part must also count as renderable so the
      // "Starting research..." spinner yields to the notice.
      { isStreaming: true },
    );
    expect(screen.getByTestId('blocked-message')).toHaveTextContent("couldn't be processed");
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
  });
});


describe('verification release UI', () => {
  it('shows a corrected release after history reload without confidence fields', () => {
    renderMessageList([{ id: 'restored-corrected', role: 'assistant', parts: [
      { type: 'text', text: 'A corrected answer.' },
      { type: VERIFICATION_PART, data: { status: 'corrected', passCount: 2 } },
    ] }], { explicitRelease: true });
    expect(screen.getByTestId('verification-badge')).toHaveTextContent('Corrected and verified against cited sources');
  });

  it('never renders unchecked draft text while verifying', () => {
    renderMessageList([{ id: 'draft', role: 'assistant', parts: [
      { type: 'text', text: 'PRIVATE_DRAFT_SENTINEL' },
      { type: VERIFICATION_PART, data: { status: 'verifying' } },
    ] }], { isStreaming: true, explicitRelease: true });
    expect(screen.queryByText('PRIVATE_DRAFT_SENTINEL')).not.toBeInTheDocument();
    expect(screen.getByTestId('verification-progress')).toHaveTextContent('Checking the answer against sources');
  });
  it('does not render an unsigned cached message', () => {
    renderMessageList([{ id: 'draft', role: 'assistant', parts: [{ type: 'text', text: 'PRIVATE_DRAFT_SENTINEL' }] }], { explicitRelease: true });
    expect(screen.queryByText('PRIVATE_DRAFT_SENTINEL')).not.toBeInTheDocument();
  });
  it('offers retry on a withheld answer', async () => {
    const rerun = vi.fn();
    renderMessageList([{ id: 'user', role: 'user', parts: [{ type: 'text', text: 'Question' }] },
      { id: 'answer', role: 'assistant', parts: [{ type: 'text', text: UNVERIFIED_HISTORY },
        { type: VERIFICATION_PART, data: { status: 'withheld', passCount: 0 } }] }], { explicitRelease: true, onRerun: rerun });
    await userEvent.setup().click(screen.getByTestId('verification-retry'));
    expect(rerun).toHaveBeenCalledWith(0);
  });
});
