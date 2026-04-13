import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResearchTrace, type TraceEntry } from '../../src/components/ResearchTrace';

describe('ResearchTrace', () => {
  it('returns null for empty entries', () => {
    const { container } = render(<ResearchTrace entries={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders known tool names with labels', () => {
    const entries: TraceEntry[] = [
      { type: 'tool', toolName: 'searchSections', toolCallId: 'tc-1', state: 'output-available', count: 1 },
    ];
    render(<ResearchTrace entries={entries} />);
    expect(screen.getByText('Searching policies')).toBeInTheDocument();
  });

  it('renders unknown tool names with a generic label', () => {
    const entries: TraceEntry[] = [
      { type: 'tool', toolName: 'someNewTool', toolCallId: 'tc-2', state: 'output-available', count: 1 },
    ];
    render(<ResearchTrace entries={entries} />);
    expect(screen.getByText('Researching sources')).toBeInTheDocument();
  });

  it('shows tool counts when repeated steps are collapsed', () => {
    const entries: TraceEntry[] = [
      { type: 'tool', toolName: 'getAmendments', toolCallId: 'tc-3', state: 'output-available', count: 2 },
    ];
    render(<ResearchTrace entries={entries} />);
    expect(screen.getByText('Checking amendments (2)')).toBeInTheDocument();
  });
});
