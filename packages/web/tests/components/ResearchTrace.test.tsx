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
      { type: 'tool', toolName: 'searchSections', toolCallId: 'tc-1', state: 'output-available' },
    ];
    render(<ResearchTrace entries={entries} />);
    expect(screen.getByText('Searching policies')).toBeInTheDocument();
  });

  it('renders unknown tool name as-is', () => {
    const entries: TraceEntry[] = [
      { type: 'tool', toolName: 'someNewTool', toolCallId: 'tc-2', state: 'output-available' },
    ];
    render(<ResearchTrace entries={entries} />);
    expect(screen.getByText('someNewTool')).toBeInTheDocument();
  });

  it('renders reasoning entries as italic text', () => {
    const entries: TraceEntry[] = [
      { type: 'reasoning', text: 'Let me think about this...' },
    ];
    render(<ResearchTrace entries={entries} />);
    const element = screen.getByText('Let me think about this...');
    expect(element.tagName).toBe('P');
    expect(element.classList.contains('italic')).toBe(true);
  });
});
