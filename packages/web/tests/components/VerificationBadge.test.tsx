import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VerificationBadge } from '../../src/components/VerificationBadge';
import type { VerificationState } from '../../src/lib/message-parts';

function state(overrides: Partial<VerificationState>): VerificationState {
  return {
    severity: 'high',
    confidence: 0.95,
    rewrote: false,
    counts: { unsupported: 0, missingCitation: 0, relevanceMajor: 0, relevanceMinor: 0 },
    pureMarkerFallback: false,
    ...overrides,
  };
}

describe('VerificationBadge', () => {
  it('shows the verified state in plain language', () => {
    render(<VerificationBadge verification={state({})} />);
    expect(screen.getByTestId('verification-badge')).toHaveTextContent('Verified against cited sources');
  });

  it('shows partially-verified with a claim count when the verifier rewrote', () => {
    render(
      <VerificationBadge
        verification={state({
          severity: 'medium',
          rewrote: true,
          counts: { unsupported: 2, missingCitation: 1, relevanceMajor: 0, relevanceMinor: 0 },
        })}
      />,
    );
    const badge = screen.getByTestId('verification-badge');
    expect(badge).toHaveTextContent('Partially verified');
    expect(badge).toHaveTextContent('3 claims could not be matched to the cited sources');
  });

  it('shows a strong low-confidence warning', () => {
    render(<VerificationBadge verification={state({ severity: 'low', rewrote: true })} />);
    const badge = screen.getByTestId('verification-badge');
    expect(badge).toHaveTextContent('Low confidence');
    expect(badge).toHaveTextContent('verify before relying');
  });

  it('never leaks verifier internals for the inconclusive fallback', () => {
    render(<VerificationBadge verification={state({ severity: 'medium', rewrote: true, pureMarkerFallback: true })} />);
    const badge = screen.getByTestId('verification-badge');
    expect(badge).toHaveTextContent('Automatic verification was inconclusive');
    expect(badge).not.toHaveTextContent(/rewrite/i);
    expect(badge).not.toHaveTextContent(/fallback/i);
  });
});
