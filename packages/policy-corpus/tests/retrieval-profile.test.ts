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

  it('keeps every state group beside the federal ones on the federal-authority search path', () => {
    const analysis = analyzeQuery('What must a 1915(c) waiver application include under federal law?');
    const signals = buildRetrievalProfileSignals({ query: analysis.query }, analysis);

    expect(signals.typeGroups).toEqual([
      ['federal_regulation'],
      ['federal_statute'],
      ['clinical_policy'],
      ['dhhs_policy'],
      ['bulletin', 'state_plan_amendment', 'waiver', 'provider_manual'],
      ['nc_statute'],
    ]);
  });

  it('adds managed care contracts to the federal-authority groups for a medical loss ratio question', () => {
    const analysis = analyzeQuery('What federal rule sets the medical loss ratio for managed care plans?');
    const signals = buildRetrievalProfileSignals({ query: analysis.query }, analysis);

    expect(signals.typeGroups.slice(0, 2)).toEqual([['federal_regulation'], ['federal_statute']]);
    expect(signals.typeGroups).toContainEqual(['clinical_policy']);
    expect(signals.typeGroups.at(-1)).toEqual(['managed_care_contract']);
  });

  it('searches the base groups for an income question that names the federal poverty level', () => {
    const analysis = analyzeQuery(
      'What is the income limit as a percentage of the federal poverty level for pregnant women?',
    );
    const signals = buildRetrievalProfileSignals({ query: analysis.query }, analysis);

    expect(signals.profileName).toBe('baseline_hybrid');
    expect(signals.typeGroups).toContainEqual(['dhhs_policy']);
    expect(signals.typeGroups).toContainEqual(['beneficiary_guidance']);
  });

  it('does not put a question on the operational profile for "form" inside another word', () => {
    const analysis = analyzeQuery('What information must be documented for personal care services?');
    const signals = buildRetrievalProfileSignals({ query: analysis.query }, analysis);

    expect(signals.profileName).toBe('baseline_hybrid');
  });

  it('keeps beneficiary guidance out of the federal-authority search path', () => {
    const analysis = analyzeQuery('What must a 1915(c) waiver application include under federal law?');
    const signals = buildRetrievalProfileSignals({ query: analysis.query }, analysis);

    expect(signals.profileName).toBe('federal_hybrid');
    expect(signals.typeGroups.flat()).not.toContain('beneficiary_guidance');
  });
});
