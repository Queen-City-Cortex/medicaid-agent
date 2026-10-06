import { describe, expect, it } from 'vitest';
import { analyzeQuery } from '../src/query/analysis.js';
import { buildRetrievalProfileSignals } from '../src/profiles/retrieval-signals.js';

describe('retrieval profile signals', () => {
  it('chooses the operational profile and document expansion for reimbursement queries', () => {
    const analysis = analyzeQuery('What is the reimbursement rate for T1001 in 2024?');
    const signals = buildRetrievalProfileSignals({ query: analysis.query, topK: 8 }, analysis);

    expect(signals.profileName).toBe('operational_hybrid');
    expect(signals.enabledBackends).toContain('document_expansion');
  });

  it('keeps federal questions on the federal profile without amendment-only backends', () => {
    const analysis = analyzeQuery('What must a 1915(c) waiver application include under federal law?');
    const signals = buildRetrievalProfileSignals({ query: analysis.query, topK: 8 }, analysis);

    expect(signals.profileName).toBe('federal_hybrid');
    expect(signals.enabledBackends).not.toContain('amendment_context');
  });

  it('searches beneficiary guidance as its own group on the default and operational profiles', () => {
    const baseline = analyzeQuery('How do I report a change of address to NC Medicaid?');
    const baselineSignals = buildRetrievalProfileSignals({ query: baseline.query }, baseline);

    expect(baselineSignals.profileName).toBe('baseline_hybrid');
    expect(baselineSignals.typeGroups).toContainEqual(['beneficiary_guidance']);

    const operational = analyzeQuery('What is the reimbursement rate for T1001 in 2024?');
    const operationalSignals = buildRetrievalProfileSignals({ query: operational.query }, operational);

    expect(operationalSignals.profileName).toBe('operational_hybrid');
    expect(operationalSignals.typeGroups).toContainEqual(['beneficiary_guidance']);
  });

  it('keeps beneficiary guidance out of the federal-authority search path', () => {
    const analysis = analyzeQuery('What must a 1915(c) waiver application include under federal law?');
    const signals = buildRetrievalProfileSignals({ query: analysis.query }, analysis);

    expect(signals.profileName).toBe('federal_hybrid');
    expect(signals.typeGroups.flat()).not.toContain('beneficiary_guidance');
  });
});
