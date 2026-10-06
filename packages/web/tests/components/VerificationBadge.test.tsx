import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VerificationBadge } from '../../src/components/VerificationBadge';

describe('VerificationBadge', () => {
  it('labels a corrected release as verified, since the corrected text passed its recheck', () => {
    render(<VerificationBadge outcome={{ status: 'corrected', passCount: 2 }} />);
    const badge = screen.getByTestId('verification-badge');
    expect(badge).toHaveTextContent('Corrected and verified against cited sources');
    expect(badge).toHaveAttribute('data-outcome', 'corrected');
  });

  it('labels a passed release as verified', () => {
    render(<VerificationBadge outcome={{ status: 'passed', passCount: 1 }} />);
    const badge = screen.getByTestId('verification-badge');
    expect(badge).toHaveTextContent('Verified against cited sources');
    expect(badge).toHaveAttribute('data-outcome', 'passed');
  });

  it('never labels a withheld outcome as verified', () => {
    render(<VerificationBadge outcome={{ status: 'withheld', reason: 'unavailable', passCount: 1 }} />);
    const badge = screen.getByTestId('verification-badge');
    expect(badge).toHaveTextContent('Answer withheld');
    expect(badge).not.toHaveTextContent('Verified against cited sources');
  });

  it('renders nothing without a release outcome', () => {
    const { container } = render(<VerificationBadge outcome={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('carries the release outcome as its only state: no confidence level, score or claim counts', () => {
    // Fields a stale server or cached message might still attach are not read.
    const stale = { status: 'corrected', passCount: 2, severity: 'low', confidence: 0.2, counts: { unsupported: 3, relevanceMinor: 1 } };
    render(<VerificationBadge outcome={stale as never} />);
    const badge = screen.getByTestId('verification-badge');
    expect(badge).toHaveTextContent(/^Corrected and verified against cited sources$/);
    expect(badge).not.toHaveAttribute('data-severity');
  });
});
