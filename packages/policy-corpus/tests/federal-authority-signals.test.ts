import { describe, expect, it } from 'vitest';
import { buildFederalAuthoritySignals } from '../src/frame/federal-authority.js';

describe('federal authority signals', () => {
  it('recognizes waiver-application questions and suppresses public-notice mode by default', () => {
    const signals = buildFederalAuthoritySignals(
      "What is the federal statutory authority for NC's CAP/DA waiver, and what does the state need to demonstrate in its waiver application?",
    );

    expect(signals.waiverApplicationQuery).toBe(true);
    expect(signals.publicNoticeQuery).toBe(false);
    expect(signals.mlrQuery).toBe(false);
    expect(signals.focusedFederalQuery).toBeTruthy();
  });

  it('recognizes MLR implementation questions as both federal-authority and implementation-oriented', () => {
    const signals = buildFederalAuthoritySignals(
      'What medical loss ratio (MLR) must Medicaid managed care organizations meet under federal law, and how does NC implement this requirement?',
    );

    expect(signals.mlrQuery).toBe(true);
    expect(signals.implementationQuery).toBe(true);
    expect(signals.implementationSectionTerms.length).toBeGreaterThan(0);
  });

  it('turns on public-notice mode for notice-specific waiver questions', () => {
    const signals = buildFederalAuthoritySignals(
      'What public notice must a state provide before submitting a 1915(c) waiver application?',
    );

    expect(signals.waiverApplicationQuery).toBe(true);
    expect(signals.publicNoticeQuery).toBe(true);
  });
});
