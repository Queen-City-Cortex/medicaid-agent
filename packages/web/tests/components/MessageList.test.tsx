import { VERIFICATION_PART, UNVERIFIED_HISTORY, WITHHELD_ANSWER } from '@nc-medicaid/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';
import { MessageList } from '../../src/components/MessageList';
import { convertThreadMessageToUIMessage } from '../../src/lib/parse-message';
import { resolveCitedSources } from '../../src/lib/message-parts';

vi.mock('@/components/MessageActions', () => ({
  MessageActions: ({ content }: { content: string }) => (
    <div data-testid="message-actions">{content}</div>
  ),
}));

interface RenderOptions {
  explicitRelease?: boolean;
  isStreaming?: boolean;
  status?: string;
  onRerun?: (userIndex: number) => void;
  wasStopped?: (messageId: string) => boolean;
}

function messageList(messages: UIMessage[], options?: RenderOptions) {
  const releasedFixture = (m: UIMessage): UIMessage => m.role === 'assistant' && m.parts.some(p => p.type === 'text') && !m.parts.some(p => p.type === VERIFICATION_PART)
    ? { ...m, parts: [...m.parts, { type: VERIFICATION_PART, data: { status: 'passed', passCount: 1 } }] } : m;
  if (!options?.explicitRelease) messages = messages.map(releasedFixture);

  return (
    <MessageList
      messages={messages}
      isStreaming={options?.isStreaming ?? false}
      status={options?.status ?? 'ready'}
      onRerun={options?.onRerun ?? vi.fn()}
      wasStopped={options?.wasStopped}
      messagesEndRef={{ current: null }}
      feedbackMap={{}}
      onRate={vi.fn()}
      onClearRating={vi.fn()}
      onComment={vi.fn()}
    />
  );
}

/** Renders the list; the returned function renders it again with new props. */
function renderMessageList(messages: UIMessage[], options?: RenderOptions) {
  const { rerender } = render(messageList(messages, options));
  return (next: UIMessage[], nextOptions?: RenderOptions) => rerender(messageList(next, nextOptions));
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
            output: { amendments: [], document: { policyNumber: '5B', title: 'Clinical Coverage Policy 5B' } },
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

    // A stored row with no release outcome: its text is withheld, and the
    // tool loop is collapsed into the research trail under the notice.
    const finalAnswer = screen.getByTestId('withheld-answer');
    expect(finalAnswer).toHaveAttribute('data-reason', 'unverified_history');
    expect(screen.queryByText(/final answer/)).not.toBeInTheDocument();
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
    expect(within(screen.getByTestId('ended-without-answer')).getByTestId('get-help')).toBeInTheDocument();
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

  // ── A turn read from storage with no answer ───────────────────────────

  const STORED_IN_TOOLS = { ...STOPPED_IN_TOOLS, metadata: { createdAt: '2026-06-22T15:30:00.000Z' } } as UIMessage;

  it('shows a stored turn with tools and no answer as a plain note, with no way to start a second run', () => {
    const onRerun = vi.fn();
    renderMessageList([QUESTION, STORED_IN_TOOLS], { onRerun });

    const note = screen.getByTestId('stored-without-answer');
    expect(note).toHaveTextContent('No answer has been saved for this question.');
    expect(note).toHaveTextContent('It may still be in progress. Reload the page to check.');
    // Not an alert: nothing happened while the user was here.
    expect(note).toHaveAttribute('role', 'note');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // The run may still be going on the server: no retry in the note, and no
    // "Ask again" under it.
    expect(screen.queryByTestId('ended-without-answer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('try-again-button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again|ask again/i })).not.toBeInTheDocument();
    expect(onRerun).not.toHaveBeenCalled();
    // The steps that were stored are still shown, as stopped, not running.
    expect(screen.getByText('Interrupted')).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('shows the same note for a stored turn that was last seen being checked', () => {
    renderMessageList([QUESTION, { ...STOPPED_WHILE_VERIFYING, metadata: { createdAt: '2026-06-22T15:30:00.000Z' } } as UIMessage],
      { explicitRelease: true });

    expect(screen.getByTestId('stored-without-answer')).toBeInTheDocument();
    expect(screen.queryByTestId('try-again-button')).not.toBeInTheDocument();
    expect(screen.queryByText('PRIVATE_DRAFT_SENTINEL')).not.toBeInTheDocument();
  });

  it('shows a turn that is still streaming as streaming, with neither notice', () => {
    renderMessageList([QUESTION, STOPPED_IN_TOOLS], { isStreaming: true, status: 'streaming' });

    expect(screen.getByTestId('progress-narration')).toBeInTheDocument();
    expect(screen.queryByTestId('stored-without-answer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ended-without-answer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('keeps the retry for a turn that ended without an answer in this session', () => {
    renderMessageList([QUESTION, STOPPED_IN_TOOLS]);

    expect(screen.queryByTestId('stored-without-answer')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('ended-without-answer')).getByTestId('try-again-button')).toBeInTheDocument();
  });

  it('announces a turn that ended without an answer only when it ended on screen', () => {
    // Ended while its thread was off screen: the Chat still holds it, and the
    // list mounts with the turn already over.
    const { unmount } = render(messageList([QUESTION, STOPPED_IN_TOOLS]));
    expect(screen.getByTestId('ended-without-answer')).toHaveAttribute('role', 'group');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    unmount();

    // Ended while it was being watched.
    const rerender = renderMessageList([QUESTION, STOPPED_IN_TOOLS], { isStreaming: true, status: 'streaming' });
    rerender([QUESTION, STOPPED_IN_TOOLS]);
    expect(screen.getByTestId('ended-without-answer')).toHaveAttribute('role', 'alert');
  });

  it('keeps the stopped notice and its retry on a turn the user stopped, stored or not', () => {
    renderMessageList([QUESTION, STORED_IN_TOOLS], { wasStopped: id => id === 'assistant-tools' });

    expect(screen.queryByTestId('stored-without-answer')).not.toBeInTheDocument();
    expect(screen.getByTestId('ended-without-answer')).toHaveTextContent('You stopped this answer.');
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
    expect(within(screen.getByTestId('blocked-message')).getByTestId('get-help')).toBeInTheDocument();
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


describe('citation links and footnotes', () => {
  const url = 'https://example.org/policy-8c.pdf';
  const cited: UIMessage[] = [{
    id: 'assistant-cited',
    role: 'assistant',
    parts: [
      { type: 'dynamic-tool', toolName: 'getSection', toolCallId: 'tc-1', state: 'output-available', input: { sectionId: 'sec-1' },
        output: { section: { title: 'Therapeutic Leave', sectionNumber: '3.2.1', policyNumber: '8C', url } } },
      { type: 'text', text: `Covered per [Policy 8C § 3.2.1](${url}).` },
    ],
  }];
  // jsdom does not implement scrollIntoView.
  const scrollIntoView = Element.prototype.scrollIntoView;
  afterEach(() => { Element.prototype.scrollIntoView = scrollIntoView; });

  it('keeps a focused footnote and citation link in the document across a re-render', () => {
    const rerender = renderMessageList(cited);
    const footnote = screen.getByTestId('citation-footnote');
    const link = screen.getByRole('link', { name: 'Policy 8C § 3.2.1' });
    footnote.focus();
    expect(footnote).toHaveFocus();

    // Any re-render: a stream chunk elsewhere, the corpus-status poll, the highlight timer.
    rerender(cited);

    expect(footnote.isConnected).toBe(true);
    expect(link.isConnected).toBe(true);
    expect(screen.getByTestId('citation-footnote')).toBe(footnote);
    expect(footnote).toHaveFocus();
  });

  it('moves focus to the source row link when a footnote is activated', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderMessageList(cited);
    const user = userEvent.setup();
    const footnote = screen.getByTestId('citation-footnote');
    footnote.focus();

    await user.keyboard('{Enter}');

    const sourceLink = within(screen.getByTestId('source-item')).getByRole('link');
    await waitFor(() => expect(sourceLink).toHaveFocus());
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    // The footnote that was pressed is still there to come back to.
    expect(footnote.isConnected).toBe(true);
  });

  it('opens a collapsed Sources panel, then focuses the source row link', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderMessageList(cited);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('sources-panel-trigger'));
    await waitFor(() => expect(screen.queryByTestId('source-item')).not.toBeInTheDocument());

    await user.click(screen.getByTestId('citation-footnote'));

    await waitFor(() => expect(within(screen.getByTestId('source-item')).getByRole('link')).toHaveFocus());
  });
});

describe('transcript semantics', () => {
  it('renders the turns as an ordered list with a hidden heading naming each speaker, and no live region', () => {
    renderMessageList([
      { id: 'q', role: 'user', parts: [{ type: 'text', text: 'Is dental covered?' }] },
      { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'Yes, under Policy 4A.' }] },
    ]);

    const list = screen.getByRole('list', { name: 'Conversation' });
    expect(list.tagName).toBe('OL');
    const turns = within(list).getAllByRole('listitem');
    expect(turns).toHaveLength(2);
    expect(Array.from(list.children)).toEqual(turns);
    const asked = within(turns[0]).getByRole('heading', { name: 'You asked' });
    const answered = within(turns[1]).getByRole('heading', { name: 'Navigator answered' });
    expect(asked).toHaveClass('sr-only');
    expect(answered).toHaveClass('sr-only');
    expect(turns[0]).toContainElement(screen.getByTestId('user-message'));
    expect(turns[1]).toContainElement(screen.getByTestId('assistant-message'));

    // Reading every streamed chunk aloud is what a log or a live region would do.
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(list).not.toHaveAttribute('aria-live');
    expect(list.querySelector('[aria-live], [role="log"], [role="status"], [role="alert"]')).toBeNull();
  });

  it('renders no list before the first message', () => {
    renderMessageList([]);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('verification release UI', () => {
  it('shows a corrected release after history reload', () => {
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
      { id: 'answer', role: 'assistant', parts: [{ type: 'text', text: WITHHELD_ANSWER },
        { type: VERIFICATION_PART, data: { status: 'withheld', passCount: 0 } }] }], { explicitRelease: true, onRerun: rerun });
    await userEvent.setup().click(screen.getByTestId('verification-retry'));
    expect(rerun).toHaveBeenCalledWith(0);
  });
  it('shows the help contacts beside a withheld answer and not beside a released one', () => {
    renderMessageList([{ id: 'withheld', role: 'assistant', parts: [
      { type: VERIFICATION_PART, data: { status: 'withheld', reason: 'unsupported', passCount: 2 } }] }], { explicitRelease: true });
    expect(screen.getByTestId('get-help')).toHaveTextContent('1-877-201-3750');
    cleanup();
    renderMessageList([{ id: 'released', role: 'assistant', parts: [
      { type: 'text', text: 'A released answer.' },
      { type: VERIFICATION_PART, data: { status: 'passed', passCount: 1 } }] }], { explicitRelease: true });
    expect(screen.queryByTestId('get-help')).not.toBeInTheDocument();
  });
});

describe('withheld answer notice', () => {
  const NOT_GROUNDED = "Answer withheldWe couldn't verify an answer to this question against NC Medicaid policy, so we haven't shown one."
    + 'Try asking about one specific service, program or policy number. For a decision about your own case, contact your county DSS, the NC Medicaid Ombudsman, or Legal Aid of NC.';
  const UNAVAILABLE = "Answer withheldWe couldn't check this answer right now. Please try again in a few minutes.";
  const UNVERIFIED = "Answer withheldThis stored answer can't be shown because its verification could not be confirmed."
    + 'To get a checked answer, ask the question again as a new message.';
  const question: UIMessage = { id: 'q', role: 'user', parts: [{ type: 'text', text: 'Is dental covered?' }] };
  const tool = { type: 'dynamic-tool', toolName: 'searchSections', toolCallId: 'tc-1', state: 'output-available', input: { query: 'dental' },
    output: { sections: [{ id: 'sec:1', title: 'Dental', sectionNumber: '5.1', policyNumber: '4A', url: 'https://medicaid.ncdhhs.gov/4a/download' }] } };
  /** A withheld turn as the server sends and stores it: tool steps, its fixed sentence, the outcome. */
  const withheldTurn = (reason: string | undefined, id = 'a', stored = false): UIMessage => ({
    id, role: 'assistant',
    ...(stored ? { metadata: { createdAt: '2026-06-22T15:30:00.000Z' } } : {}),
    parts: [tool, { type: 'text', text: reason === 'unverified_history' ? UNVERIFIED_HISTORY : WITHHELD_ANSWER },
      { type: VERIFICATION_PART, data: { status: 'withheld', ...(reason ? { reason } : {}), passCount: 1 } }],
  } as UIMessage);

  it.each([
    ['unavailable', UNAVAILABLE, true],
    ['unsupported', NOT_GROUNDED, true],
    ['invalid_citation', NOT_GROUNDED, true],
    ['unusable_correction', NOT_GROUNDED, true],
    ['unverified_history', UNVERIFIED, false],
    [undefined, NOT_GROUNDED, true],
  ])('shows a %s outcome as one notice with its own wording', (reason, text, canRetry) => {
    renderMessageList([question, withheldTurn(reason)], { explicitRelease: true });

    const notice = screen.getByTestId('withheld-answer');
    expect(notice).toHaveTextContent(new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${canRetry ? 'Try again' : ''}$`));
    expect(notice).toHaveAccessibleName('Answer withheld');
    expect(notice).toHaveAttribute('data-reason', reason ?? 'unknown');
    expect(within(notice).queryByTestId('verification-retry') !== null).toBe(canRetry);
    // One notice and nothing else: no second alert for a turn that ran tools,
    // no badge, no answer prose (the server's fixed sentence is not shown).
    expect(screen.queryByTestId('ended-without-answer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('verification-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('generated-at')).not.toBeInTheDocument();
    expect(screen.queryByText(/could not verify this answer|was not verified before release/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Answer withheld')).toHaveLength(1);
    // The tool steps fold into the trail under the notice.
    expect(screen.getByTestId('research-trail')).toBeInTheDocument();
  });

  it('names the three contacts without a number or a link', () => {
    renderMessageList([question, withheldTurn('unsupported')], { explicitRelease: true });
    const notice = screen.getByTestId('withheld-answer');
    expect(within(notice).queryByRole('link')).not.toBeInTheDocument();
    expect(notice.textContent).not.toMatch(/\d/);
  });

  it('is an alert, mounted once, for the answer withheld in this session, and the announcer does not say "Answer ready"', () => {
    const rerender = renderMessageList([], { explicitRelease: true });
    rerender([question], { status: 'submitted', explicitRelease: true });
    expect(screen.getByTestId('chat-status-announcer')).toHaveTextContent('Researching…');

    // The outcome arrives while the stream is still open: no notice yet.
    rerender([question, withheldTurn('unsupported')], { status: 'streaming', isStreaming: true, explicitRelease: true });
    expect(screen.queryByTestId('withheld-answer')).not.toBeInTheDocument();

    rerender([question, withheldTurn('unsupported')], { status: 'ready', explicitRelease: true });
    const alert = screen.getByRole('alert');
    expect(alert).toBe(screen.getByTestId('withheld-answer'));
    expect(screen.getByTestId('chat-status-announcer')).toBeEmptyDOMElement();

    // A later render (the corpus-status poll, a rating) keeps the same node, so it is not announced again.
    rerender([question, withheldTurn('unsupported')], { status: 'ready', explicitRelease: true });
    expect(screen.getByRole('alert')).toBe(alert);
  });

  it('is an alert when the whole turn arrives in one render after the question was sent', () => {
    const rerender = renderMessageList([question], { status: 'submitted', explicitRelease: true });
    rerender([question, withheldTurn('unavailable')], { status: 'ready', explicitRelease: true });
    expect(screen.getByRole('alert')).toBe(screen.getByTestId('withheld-answer'));
  });

  it('announces nothing when a thread with two stored withheld turns is opened', () => {
    const stored = [question, withheldTurn('unsupported', 'a1', true),
      { ...question, id: 'q2' }, withheldTurn('unverified_history', 'a2', true)];
    renderMessageList(stored, { explicitRelease: true });

    expect(screen.getAllByTestId('withheld-answer')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Answer withheld' })).toHaveLength(2);
    expect(screen.getByTestId('chat-status-announcer')).toBeEmptyDOMElement();
  });

  it('does not announce the withheld turn again after leaving the thread and coming back', () => {
    const live = [question, withheldTurn('unsupported')];
    const rerender = renderMessageList([question], { status: 'submitted', explicitRelease: true });
    rerender(live, { status: 'ready', explicitRelease: true });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender([{ id: 'other-q', role: 'user', parts: [{ type: 'text', text: 'Another thread' }] }], { explicitRelease: true });
    // The hook restores the thread from its in-session cache, in the live shape.
    rerender(live, { explicitRelease: true });
    expect(screen.getByTestId('withheld-answer')).toHaveAttribute('role', 'group');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps only the newest withheld turn as the alert when a retry is withheld too', () => {
    const first = [question, withheldTurn('unsupported', 'a1')];
    const rerender = renderMessageList([question], { status: 'submitted', explicitRelease: true });
    rerender(first, { status: 'ready', explicitRelease: true });
    const retry = { ...question, id: 'q2' };
    rerender([...first, retry], { status: 'submitted', explicitRelease: true });
    rerender([...first, retry, withheldTurn('unsupported', 'a2')], { status: 'ready', explicitRelease: true });

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toBe(screen.getAllByTestId('withheld-answer')[1]);
  });

  it('leaves the retry to the page-level error box while it is showing', () => {
    renderMessageList([question, withheldTurn('unsupported')], { status: 'error', explicitRelease: true });
    expect(screen.getByTestId('withheld-answer')).toBeInTheDocument();
    expect(screen.queryByTestId('verification-retry')).not.toBeInTheDocument();
  });
});
