import { describe, expect, it } from 'vitest';
import type { CorpusRetrievalHit } from '../src/types.js';
import { rerankRetrievalHit } from '../src/internal/shared.js';
import { analyzeQuery } from '../src/query/analysis.js';
import { buildRetrievalProfileSignals } from '../src/profiles/retrieval-signals.js';

function makeHit(overrides: Partial<CorpusRetrievalHit>): CorpusRetrievalHit {
  return {
    sectionId: 'sec:test',
    sectionNumber: null,
    sectionTitle: null,
    documentTitle: null,
    documentType: null,
    policyNumber: null,
    content: null,
    score: 1,
    authorityTier: null,
    answerRole: null,
    sourceFormat: null,
    answerReady: true,
    corpusBucket: null,
    variantGroup: null,
    variantDate: null,
    retrievalReady: true,
    ...overrides,
  };
}

describe('retrieval ranking', () => {
  it('does not classify waiver application questions as reimbursement or operational queries', () => {
    const analysis = analyzeQuery(
      "What is the federal statutory authority for NC's CAP/DA waiver, and what does the state need to demonstrate in its waiver application?",
    );
    const signals = buildRetrievalProfileSignals({ query: analysis.query, topK: 10 }, analysis);

    expect(analysis.flags.isReimbursementQuery).toBe(false);
    expect(analysis.flags.isOperationalRoutingQuery).toBe(false);
    expect(signals.profileName).toBe('federal_hybrid');
    expect(signals.typeGroups[0]).toEqual(['federal_regulation']);
    expect(signals.typeGroups[1]).toEqual(['federal_statute']);
  });

  it('boosts waiver-authority sections above unrelated 1915(b) state-plan hits', () => {
    const analysis = analyzeQuery(
      "What is the federal statutory authority for NC's CAP/DA waiver, and what does the state need to demonstrate in its waiver application?",
    );
    const waiverFederalHit = makeHit({
      sectionId: 'sec:441.301',
      sectionNumber: '441.301',
      sectionTitle: 'Contents of request for a waiver',
      documentTitle: '42 CFR Part 441',
      documentType: 'federal_regulation',
      policyNumber: '42-CFR-441',
      content: 'The agency must provide assurances and information required for a waiver request.',
      score: 0.85,
    });
    const statePlanHit = makeHit({
      sectionId: 'sec:1915b',
      sectionTitle: 'A. Statutory Authority (1 of 3)',
      documentTitle: 'draft application for NC 1915(b) Waiver Renewal',
      documentType: 'state_plan_amendment',
      content: "The State's waiver program is authorized under section 1915(b) of the Act.",
      score: 1.09,
    });

    const federalScore = rerankRetrievalHit(
      waiverFederalHit,
      analysis.normalizedQuery,
      analysis.searchTerms,
      analysis.procedureCodes,
      analysis.requestedYears,
      analysis.explicitPolicyNumbers,
      new Map(),
      null,
    ).score;
    const statePlanScore = rerankRetrievalHit(
      statePlanHit,
      analysis.normalizedQuery,
      analysis.searchTerms,
      analysis.procedureCodes,
      analysis.requestedYears,
      analysis.explicitPolicyNumbers,
      new Map(),
      null,
    ).score;

    expect(federalScore).toBeGreaterThan(statePlanScore);
  });

  it('boosts HCWD earned-income history change notices above year-specific premium charts', () => {
    const analysis = analyzeQuery(
      'Is there a maximum earned income limit for people on HCWD (Health Coverage for Workers with Disabilities), and what premiums apply?',
    );
    const changeNoticeHit = makeHit({
      sectionId: 'sec:hcwd-change',
      sectionTitle: 'D. MA-2180, Health Coverage for Workers with Disabilities, is revised in:',
      documentTitle: 'CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III',
      documentType: 'dhhs_policy',
      content:
        'Remove the 150% FPL income limit from policy and provide information about sliding scale premiums.',
      score: 1.19,
    });
    const premiumChartHit = makeHit({
      sectionId: 'sec:hcwd-chart',
      sectionTitle: '2019 HCWD Premiums (Effective April 1, 2019)',
      documentTitle: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES – 2019 HCWD Premiums',
      documentType: 'dhhs_policy',
      policyNumber: 'MA-2180',
      content: '2019 premium chart for HCWD beneficiaries.',
      score: 1.625,
    });

    const changeNoticeScore = rerankRetrievalHit(
      changeNoticeHit,
      analysis.normalizedQuery,
      analysis.searchTerms,
      analysis.procedureCodes,
      analysis.requestedYears,
      analysis.explicitPolicyNumbers,
      new Map(),
      null,
    ).score;
    const premiumChartScore = rerankRetrievalHit(
      premiumChartHit,
      analysis.normalizedQuery,
      analysis.searchTerms,
      analysis.procedureCodes,
      analysis.requestedYears,
      analysis.explicitPolicyNumbers,
      new Map(),
      null,
    ).score;

    expect(changeNoticeScore).toBeGreaterThan(premiumChartScore);
  });
});
