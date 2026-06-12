import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SourcesPanel } from '../../src/components/SourcesPanel';
import type { MessageSource, VerificationState } from '../../src/lib/message-parts';

const SAMPLE: MessageSource[] = [
  {
    key: 'a',
    label: 'Policy 8C § 3.2.1',
    title: 'Outpatient Behavioral Health',
    url: 'https://medicaid.ncdhhs.gov/8c/download',
    originTool: 'getSection',
    sectionNumber: '3.2.1',
    snippet: null,
  },
  {
    key: 'b',
    label: 'Policy 3K-2',
    title: 'Community Alternatives Program',
    url: 'https://medicaid.ncdhhs.gov/3k-2/download',
    originTool: 'lookupPolicy',
    sectionNumber: null,
    snippet: null,
  },
];

describe('SourcesPanel', () => {
  it('renders nothing when given an empty list', () => {
    const { container } = render(<SourcesPanel sources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the count and stays collapsed by default', () => {
    render(<SourcesPanel sources={SAMPLE} />);
    expect(screen.getByText('Sources')).toBeInTheDocument();
    expect(screen.getByText('2 sources')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('pluralizes correctly for a single source', () => {
    render(<SourcesPanel sources={[SAMPLE[0]]} />);
    expect(screen.getByText('1 source')).toBeInTheDocument();
  });

  it('expands to show clickable links with target=_blank for safe external navigation', async () => {
    const user = userEvent.setup();
    render(<SourcesPanel sources={SAMPLE} />);

    await user.click(screen.getByTestId('sources-panel-trigger'));

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', SAMPLE[0].url);
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByText('Policy 8C § 3.2.1')).toBeInTheDocument();
    expect(screen.getByText('Outpatient Behavioral Health')).toBeInTheDocument();
  });

  it('reflects controlled open prop without a user click', () => {
    render(<SourcesPanel sources={SAMPLE} open={true} onOpenChange={() => {}} />);
    // With open=true, list items must be present immediately.
    expect(screen.getAllByTestId('source-item')).toHaveLength(2);
  });

  it('assigns row ids scoped by messageId so footnote clicks can scroll to them', () => {
    render(<SourcesPanel sources={SAMPLE} messageId="msg-42" open={true} onOpenChange={() => {}} />);
    const first = document.getElementById('source-msg-42-a');
    const second = document.getElementById('source-msg-42-b');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
  });

  it('marks the highlighted row via data-highlighted', () => {
    render(<SourcesPanel sources={SAMPLE} open={true} onOpenChange={() => {}} highlightedKey="b" />);
    const items = screen.getAllByTestId('source-item');
    expect(items[0]).not.toHaveAttribute('data-highlighted');
    expect(items[1]).toHaveAttribute('data-highlighted');
  });

  it('does not render a confidence dot when verification prop is absent', () => {
    render(<SourcesPanel sources={SAMPLE} />);
    expect(screen.queryByTestId('verification-dot')).not.toBeInTheDocument();
  });

  it.each<[VerificationState['severity'], string]>([
    ['high', 'high'],
    ['medium', 'medium'],
    ['low', 'low'],
  ])('renders the confidence dot with data-severity=%s', (severity) => {
    const verification: VerificationState = {
      severity,
      confidence: severity === 'high' ? 1 : severity === 'medium' ? 0.7 : 0.3,
      rewrote: severity !== 'high',
      counts: { unsupported: 0, missingCitation: 0, relevanceMajor: 0, relevanceMinor: 0 },
      pureMarkerFallback: false,
    };
    render(<SourcesPanel sources={SAMPLE} verification={verification} />);
    const dot = screen.getByTestId('verification-dot');
    expect(dot).toHaveAttribute('data-severity', severity);
    // The dot is presentational — not focusable, hidden from the
    // accessibility tree — so it does not nest an interactive element
    // inside the CollapsibleTrigger button.
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot).not.toHaveAttribute('tabindex');
    // Its meaning lives in the trigger's accessible name instead.
    expect(screen.getByTestId('sources-panel-trigger')).toHaveAccessibleName(
      new RegExp(`Verifier confidence: ${severity}`),
    );
  });

  it('dot click does not toggle the collapsible panel', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const verification: VerificationState = {
      severity: 'medium',
      confidence: 0.7,
      rewrote: true,
      counts: { unsupported: 1, missingCitation: 0, relevanceMajor: 0, relevanceMinor: 0 },
      pureMarkerFallback: false,
    };
    render(
      <SourcesPanel
        sources={SAMPLE}
        verification={verification}
        open={false}
        onOpenChange={onOpenChange}
      />,
    );
    await user.click(screen.getByTestId('verification-dot'));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
