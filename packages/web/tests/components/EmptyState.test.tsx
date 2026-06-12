import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyState } from '../../src/components/EmptyState';

vi.mock('@workos-inc/authkit-nextjs/components', () => ({
  useAccessToken: () => ({
    getAccessToken: vi.fn().mockResolvedValue('token'),
    accessToken: 'token',
  }),
}));

describe('EmptyState', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('shows the corpus freshness line once the status loads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ lastUpdated: '2026-06-12T16:57:16.514Z', documentCount: 6691 }),
      }),
    );
    render(<EmptyState onSelectExample={() => {}} />);
    const status = await screen.findByTestId('empty-state-corpus-status');
    expect(status).toHaveTextContent(/6,691 documents/);
    expect(status).toHaveTextContent(/last updated June 12, 2026/);
  });

  it('omits the freshness line entirely when the status request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    render(<EmptyState onSelectExample={() => {}} />);
    // A wrong freshness claim is worse than none — nothing may render.
    await waitFor(() => {
      expect(screen.queryByTestId('empty-state-corpus-status')).toBeNull();
    });
  });
});
