import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ToolStep } from '../../src/components/ToolStep';

describe('ToolStep', () => {
  const unfinished = { type: 'dynamic-tool', toolName: 'getSection', toolCallId: 'tc-live', state: 'input-available', input: { sectionId: 's-1' } } as const;

  it('spins on an unfinished step only while its run is live', () => {
    const { container, rerender } = render(<ToolStep part={unfinished} isLive />);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).not.toBeNull();

    rerender(<ToolStep part={unfinished} isLive={false} />);
    expect(screen.getByText('Interrupted')).toBeInTheDocument();
    expect(screen.queryByText('Running')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('renders known tool names with friendly labels and stays collapsed by default', () => {
    render(
      <ToolStep
        part={{
          type: 'dynamic-tool',
          toolName: 'searchSections',
          toolCallId: 'tc-1',
          state: 'output-available',
          input: { query: 'chiropractic' },
          output: { sections: [{ title: 'Result 1' }] },
        }}
      />,
    );

    expect(screen.getByText('Searching policies')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.queryByText('Raw result')).not.toBeInTheDocument();
  });

  it('expands to show summaries and raw details', async () => {
    const user = userEvent.setup();

    render(
      <ToolStep
        part={{
          type: 'dynamic-tool',
          toolName: 'getAmendments',
          toolCallId: 'tc-2',
          state: 'output-available',
          input: { documentId: 'doc:5B' },
          output: {
            document: { title: 'Clinical Coverage Policy 5B' },
            amendments: [{ id: 'chg-1' }, { id: 'chg-2' }],
            latestAmendment: { title: 'Policy 5B Revision 2025-09-01' },
          },
        }}
      />,
    );

    await user.click(screen.getByTestId('tool-step-trigger'));

    expect(screen.getByTestId('tool-step-input-summary')).toHaveTextContent('Document: doc:5B');
    // The looked-up policy is the current document; the newest revision is
    // labelled as an amendment, never as the current document.
    expect(screen.getByTestId('tool-step-output-summary')).toHaveTextContent(
      '2 amendments | Current document: Clinical Coverage Policy 5B | Latest amendment: Policy 5B Revision 2025-09-01',
    );
    expect(screen.getByText('Raw input')).toBeInTheDocument();
    expect(screen.getByText('Raw result')).toBeInTheDocument();
  });

  it('renders unknown tool names with a generic label', () => {
    render(
      <ToolStep
        part={{
          type: 'dynamic-tool',
          toolName: 'someNewTool',
          toolCallId: 'tc-3',
          state: 'output-available',
        }}
      />,
    );

    expect(screen.getByText('Researching sources')).toBeInTheDocument();
  });

  it('renders a Failed state for output-error parts and reveals the error when expanded', async () => {
    const user = userEvent.setup();

    render(
      <ToolStep
        part={{
          type: 'dynamic-tool',
          toolName: 'searchSections',
          toolCallId: 'tc-err',
          state: 'output-error',
          input: { query: 'chiropractic' },
          errorText: 'Upstream search index timed out',
        }}
      />,
    );

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    expect(screen.queryByText(/timed out/)).not.toBeInTheDocument();

    await user.click(screen.getByTestId('tool-step-trigger'));

    expect(screen.getByTestId('tool-step-error')).toHaveTextContent('Upstream search index timed out');
  });

  it('shows a fallback message when a failed tool part has no errorText', async () => {
    const user = userEvent.setup();

    render(
      <ToolStep
        part={{
          type: 'dynamic-tool',
          toolName: 'getSection',
          toolCallId: 'tc-err-2',
          state: 'output-error',
        }}
      />,
    );

    await user.click(screen.getByTestId('tool-step-trigger'));

    expect(screen.getByTestId('tool-step-error')).toHaveTextContent(
      'The tool call failed without an error message.',
    );
  });

  it('shows returned and total counts when a section listing is partial', async () => {
    const user = userEvent.setup();
    const sections = Array.from({ length: 100 }, (_, index) => ({ id: `sec-${index}` }));

    const { unmount } = render(
      <ToolStep
        part={{
          type: 'dynamic-tool',
          toolName: 'getDocument',
          toolCallId: 'tc-doc',
          state: 'output-available',
          input: { documentId: 'doc:spa' },
          output: { document: { title: 'State Plan Amendment', sections, sectionCount: 2164, sectionsTruncated: true } },
        }}
      />,
    );
    await user.click(screen.getByTestId('tool-step-trigger'));
    expect(screen.getByTestId('tool-step-output-summary')).toHaveTextContent(
      'State Plan Amendment | 100 of 2,164 sections',
    );
    unmount();

    render(
      <ToolStep
        part={{
          type: 'dynamic-tool',
          toolName: 'findConceptSections',
          toolCallId: 'tc-concept',
          state: 'output-available',
          input: { conceptName: 'Prior Authorization' },
          output: { sections: sections.slice(0, 40), total: 2573, truncated: true },
        }}
      />,
    );
    await user.click(screen.getByTestId('tool-step-trigger'));
    expect(screen.getByTestId('tool-step-output-summary')).toHaveTextContent('40 of 2,573 linked sections');
  });

  it('shows a single count when a section listing is complete', async () => {
    const user = userEvent.setup();

    render(
      <ToolStep
        part={{
          type: 'dynamic-tool',
          toolName: 'getDocument',
          toolCallId: 'tc-doc-2',
          state: 'output-available',
          input: { documentId: 'doc:8C' },
          output: { document: { title: 'Policy 8C', sections: [{ id: 'sec-1' }], sectionCount: 1, sectionsTruncated: false } },
        }}
      />,
    );
    await user.click(screen.getByTestId('tool-step-trigger'));
    expect(screen.getByTestId('tool-step-output-summary')).toHaveTextContent('Policy 8C | 1 section');
  });

  it('keeps large results hidden until expanded', async () => {
    const user = userEvent.setup();
    const largeOutput = { payload: 'A'.repeat(800) };

    render(
      <ToolStep
        part={{
          type: 'dynamic-tool',
          toolName: 'lookupPolicy',
          toolCallId: 'tc-4',
          state: 'output-available',
          input: { policyNumber: '8C' },
          output: largeOutput,
        }}
      />,
    );

    expect(screen.queryByText(/AAAA/)).not.toBeInTheDocument();

    await user.click(screen.getByTestId('tool-step-trigger'));

    expect(screen.getByText(/AAAA/)).toBeInTheDocument();
  });
});
