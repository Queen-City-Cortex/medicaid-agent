import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from '../../src/components/EmptyState';

describe('EmptyState', () => {
  it('states the corpus scope by document family', () => {
    render(<EmptyState onSelectExample={() => {}} />);
    const scope = screen.getByTestId('empty-state-scope');
    expect(scope).toHaveTextContent(/clinical coverage policies/i);
    expect(scope).toHaveTextContent(/eligibility manuals/i);
    expect(scope).toHaveTextContent(/42 CFR/);
    expect(scope).toHaveTextContent(/Social Security Act/);
    expect(scope).toHaveTextContent(/change notices/i);
  });

  it('states what the tool cannot do', () => {
    render(<EmptyState onSelectExample={() => {}} />);
    const limits = screen.getByTestId('empty-state-limits');
    expect(limits).toHaveTextContent(/legal advice/i);
    expect(limits).toHaveTextContent(/individual cases or eligibility/i);
    expect(limits).toHaveTextContent(/NC DHHS/);
  });

  it('groups example questions by persona', () => {
    render(<EmptyState onSelectExample={() => {}} />);
    const personas = screen.getAllByTestId('example-persona').map((el) => el.textContent);
    expect(personas).toEqual(['For attorneys', 'For case managers', 'For beneficiaries']);

    const cards = screen.getAllByTestId('example-card');
    expect(cards.length).toBeGreaterThanOrEqual(4);
    expect(cards.length).toBeLessThanOrEqual(6);
  });

  it('expands acronyms in example questions', () => {
    render(<EmptyState onSelectExample={() => {}} />);
    expect(
      screen.getByText(/Health Coverage for Workers with Disabilities \(HCWD\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Community Alternatives Program for Disabled Adults \(CAP\/DA\)/),
    ).toBeInTheDocument();
  });

  it('fires onSelectExample with the question text when a card is clicked', async () => {
    const onSelectExample = vi.fn();
    render(<EmptyState onSelectExample={onSelectExample} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Does NC Medicaid cover chiropractic services?'));
    expect(onSelectExample).toHaveBeenCalledWith('Does NC Medicaid cover chiropractic services?');
  });

  it('shows the corpus freshness line when status is available', () => {
    render(
      <EmptyState
        onSelectExample={() => {}}
        corpusStatus={{
          lastUpdated: '2026-06-12T16:57:16.514Z',
          documentCount: 6691,
        }}
      />,
    );
    const status = screen.getByTestId('empty-state-corpus-status');
    expect(status).toHaveTextContent(/6,691 documents/);
    expect(status).toHaveTextContent(/last updated June 12, 2026/);
  });

  it('omits the freshness line entirely when status is unavailable', () => {
    render(<EmptyState onSelectExample={() => {}} />);
    expect(screen.queryByTestId('empty-state-corpus-status')).toBeNull();
  });

  it('shows a calm lexical fallback notice when semantic retrieval is degraded', () => {
    render(
      <EmptyState
        onSelectExample={() => {}}
        corpusStatus={{
          lastUpdated: null,
          documentCount: 6691,
          retrievalMode: 'lexical-degraded',
        }}
      />,
    );

    expect(screen.getByTestId('degraded-search-notice')).toHaveTextContent(
      /source-text keywords and citations/i,
    );
  });
});
