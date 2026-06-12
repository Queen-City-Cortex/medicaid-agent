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

describe('authority-citation signals', () => {
  it('recognizes authority-citation phrasing', () => {
    const signals = buildFederalAuthoritySignals(
      'What federal statute establishes the EPSDT benefit for children on Medicaid?',
    );
    expect(signals.authorityCitationQuery).toBe(true);
  });

  it('does not fire for application-process questions without authority phrasing', () => {
    const signals = buildFederalAuthoritySignals(
      'How does a state submit a 1915(c) waiver application to CMS?',
    );
    expect(signals.authorityCitationQuery).toBe(false);
  });

  it('expands program acronyms in focus terms with their statutory names', () => {
    const signals = buildFederalAuthoritySignals(
      'What federal authority establishes the EPSDT benefit?',
    );
    expect(signals.focusTerms).toContain('early and periodic screening');
  });

  it('recognizes 1915(c) authority questions phrased with plural regulations', () => {
    const signals = buildFederalAuthoritySignals(
      'Where in the federal regulations is the authority for 1915(c) HCBS waivers?',
    );
    expect(signals.waiverAuthorityQuery).toBe(true);
  });
});
