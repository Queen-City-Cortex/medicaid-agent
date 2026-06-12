import { describe, expect, it } from 'vitest';
import { analyzeQuery } from '../src/query/analysis.js';
import { selectRetrievalProfile } from '../src/profiles/retrieval.js';

describe('query analysis', () => {
  it('captures policy aliases and service focus for coverage queries', () => {
    const analysis = analyzeQuery('Does CAP/DA cover home modifications under Policy 3K-2?');

    expect(analysis.questionType).toBe('coverage');
    expect(analysis.explicitPolicyNumbers).toContain('3K-2');
    expect(analysis.aliasedPolicyNumbers).toContain('3K-2');
    expect(analysis.serviceFocusTerms).toContain('home');
    expect(analysis.flags.isCoverageQuestion).toBe(true);
    expect(analysis.route.lane).toBe('baseline_hybrid');
  });

  it('suppresses alias expansion for federal authority questions and builds a focused federal query', () => {
    const analysis = analyzeQuery('What must a 1915(c) waiver application include under federal law?');

    expect(analysis.questionType).toBe('federal_authority');
    expect(analysis.aliasedPolicyNumbers).toEqual([]);
    expect(analysis.flags.isFederalAuthorityQuery).toBe(true);
    expect(analysis.flags.isWaiverApplicationQuery).toBe(true);
    expect(analysis.focusedFederalQuery).toContain('waiver');
    expect(analysis.route.lane).toBe('graph_reasoning');
  });

  it('recognizes managed care contract routing signals', () => {
    const analysis = analyzeQuery('What do NC managed care contracts require for MLR reporting?');

    expect(analysis.flags.isManagedCareContractQuery).toBe(true);
    expect(analysis.flags.isManagedCareOperationsQuery).toBe(true);
    expect(analysis.flags.asksForImplementation).toBe(true);
  });
});

describe('retrieval profiles', () => {
  it('enables amendment-specific backends for change-notice questions', () => {
    const analysis = analyzeQuery('What is the latest change notice for MA-3550?');
    const profile = selectRetrievalProfile({ query: analysis.query, topK: 8 }, analysis);

    expect(profile.name).toBe('amendment_hybrid');
    expect(profile.enabledBackends).toContain('amendment_context');
  });

  it('keeps explicit document type scoping when callers provide it', () => {
    const analysis = analyzeQuery('42 CFR 438 medical loss ratio');
    const profile = selectRetrievalProfile(
      {
        query: analysis.query,
        topK: 6,
        documentTypes: ['federal_regulation'],
      },
      analysis,
    );

    expect(profile.hasExplicitDocumentTypes).toBe(true);
    expect(profile.typeGroups).toEqual([['federal_regulation']]);
    expect(profile.perGroupK).toBeGreaterThan(0);
  });
});
