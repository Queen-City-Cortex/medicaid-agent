import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ToolStep } from '../../src/components/ToolStep';

describe('ToolStep', () => {
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
            amendments: [{ id: 'chg-1' }, { id: 'chg-2' }],
            authoritativeDocument: { title: 'Clinical Coverage Policy 5B' },
          },
        }}
      />,
    );

    await user.click(screen.getByTestId('tool-step-trigger'));

    expect(screen.getByTestId('tool-step-input-summary')).toHaveTextContent('Document: doc:5B');
    expect(screen.getByTestId('tool-step-output-summary')).toHaveTextContent('2 amendments');
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
