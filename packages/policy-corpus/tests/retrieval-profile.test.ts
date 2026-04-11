import { describe, expect, it } from 'vitest';
import { analyzeQuery } from '../src/query/analysis.js';
import { buildRetrievalProfileSignals } from '../src/profiles/retrieval-signals.js';

describe('retrieval profile signals', () => {
  it('chooses the operational profile and document expansion for reimbursement queries', () => {
    const analysis = analyzeQuery('What is the reimbursement rate for T1001 in 2024?');
    const signals = buildRetrievalProfileSignals({ query: analysis.query, topK: 8 }, analysis);

    expect(signals.profileName).toBe('operational_hybrid');
    expect(signals.enabledBackends).toContain('document_expansion');
    expect(signals.enabledBackends).not.toContain('change_notice_header');
  });

  it('keeps federal questions on the federal profile without amendment-only backends', () => {
    const analysis = analyzeQuery('What must a 1915(c) waiver application include under federal law?');
    const signals = buildRetrievalProfileSignals({ query: analysis.query, topK: 8 }, analysis);

    expect(signals.profileName).toBe('federal_hybrid');
    expect(signals.enabledBackends).not.toContain('amendment_context');
    expect(signals.enabledBackends).not.toContain('change_notice_header');
  });
});
