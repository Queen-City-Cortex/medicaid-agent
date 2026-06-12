import { describe, expect, it } from 'vitest';
import type { CorpusRetrievalHit } from '../src/types.js';
import { buildRerankQueryContext, rerankRetrievalHit, type RerankQueryContext } from '../src/internal/shared.js';
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

function contextForQuery(
  query: string,
  overrides: Partial<Omit<RerankQueryContext, 'flags'>> = {},
): RerankQueryContext {
  const analysis = analyzeQuery(query);
  return buildRerankQueryContext({
    queryLower: analysis.normalizedQuery,
    queryTerms: analysis.searchTerms,
    procedureCodes: analysis.procedureCodes,
    requestedYears: analysis.requestedYears,
    exactPolicyNumbers: analysis.explicitPolicyNumbers,
    documentCoverageBoosts: new Map(),
    latestChangeMarkerValue: null,
    ...overrides,
  });
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
    const context = contextForQuery(
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

    const federalScore = rerankRetrievalHit(waiverFederalHit, context).score;
    const statePlanScore = rerankRetrievalHit(statePlanHit, context).score;

    expect(federalScore).toBeGreaterThan(statePlanScore);
  });

  it('boosts HCWD earned-income history change notices above year-specific premium charts', () => {
    const context = contextForQuery(
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

    const changeNoticeScore = rerankRetrievalHit(changeNoticeHit, context).score;
    const premiumChartScore = rerankRetrievalHit(premiumChartHit, context).score;

    expect(changeNoticeScore).toBeGreaterThan(premiumChartScore);
  });

  // Exact scores captured from the pre-refactor implementation (shared.ts
  // rerankRetrievalHit before the per-query flags were hoisted out of the
  // per-hit loop). The restructuring must not change any score.
  it('produces scores identical to the pre-refactor implementation', () => {
    const sharedBoosts = new Map([['::Some Doc', 0.05]]);
    const cases: Array<{
      name: string;
      query: string;
      hit: CorpusRetrievalHit;
      latestChangeMarkerValue?: number | null;
      expected: number;
    }> = [
      {
        name: 'waiver-federal',
        query:
          "What is the federal statutory authority for NC's CAP/DA waiver, and what does the state need to demonstrate in its waiver application?",
        hit: makeHit({
          sectionId: 'sec:441.301',
          sectionNumber: '441.301',
          sectionTitle: 'Contents of request for a waiver',
          documentTitle: '42 CFR Part 441',
          documentType: 'federal_regulation',
          policyNumber: '42-CFR-441',
          content: 'The agency must provide assurances and information required for a waiver request.',
          score: 0.85,
        }),
        expected: 1.93499999999999983,
      },
      {
        name: 'waiver-stateplan',
        query:
          "What is the federal statutory authority for NC's CAP/DA waiver, and what does the state need to demonstrate in its waiver application?",
        hit: makeHit({
          sectionId: 'sec:1915b',
          sectionTitle: 'A. Statutory Authority (1 of 3)',
          documentTitle: 'draft application for NC 1915(b) Waiver Renewal',
          documentType: 'state_plan_amendment',
          content: "The State's waiver program is authorized under section 1915(b) of the Act.",
          score: 1.09,
        }),
        expected: 0.7240000000000002,
      },
      {
        name: 'hcwd-change-notice',
        query:
          'Is there a maximum earned income limit for people on HCWD (Health Coverage for Workers with Disabilities), and what premiums apply?',
        hit: makeHit({
          sectionId: 'sec:hcwd-change',
          sectionTitle: 'D. MA-2180, Health Coverage for Workers with Disabilities, is revised in:',
          documentTitle: 'CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III',
          documentType: 'dhhs_policy',
          content:
            'Remove the 150% FPL income limit from policy and provide information about sliding scale premiums.',
          score: 1.19,
        }),
        expected: 1.79000000000000004,
      },
      {
        name: 'hcwd-premium-chart',
        query:
          'Is there a maximum earned income limit for people on HCWD (Health Coverage for Workers with Disabilities), and what premiums apply?',
        hit: makeHit({
          sectionId: 'sec:hcwd-chart',
          sectionTitle: '2019 HCWD Premiums (Effective April 1, 2019)',
          documentTitle: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES – 2019 HCWD Premiums',
          documentType: 'dhhs_policy',
          policyNumber: 'MA-2180',
          content: '2019 premium chart for HCWD beneficiaries.',
          score: 1.625,
        }),
        expected: 1.61499999999999999,
      },
      {
        name: 'reimbursement-fee-schedule',
        query: 'What is the reimbursement rate for CPT code 92507 speech therapy?',
        hit: makeHit({
          sectionId: 'sec:fee',
          sectionTitle: 'Speech Therapy Fee Schedule',
          documentTitle: 'Outpatient Specialized Therapies Fee Schedule',
          documentType: 'fee_schedule',
          answerRole: 'reimbursement',
          corpusBucket: 'primary',
          sourceFormat: 'xlsx',
          content: 'CPT 92507 treatment of speech, language disorder rate $45.00',
          score: 0.9,
        }),
        expected: 1.84399999999999986,
      },
      {
        name: 'coverage-authoritative',
        query: 'Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?',
        hit: makeHit({
          sectionId: 'sec:cov',
          sectionNumber: '3.2.1',
          sectionTitle: 'Specific criteria covered by Medicaid',
          documentTitle: 'Clinical Coverage Policy 5B Orthotics and Prosthetics',
          documentType: 'clinical_policy',
          policyNumber: '5B',
          authorityTier: 'authoritative',
          content: 'Medicaid covers services when medical necessity criteria are met. Some services are not covered.',
          score: 1.1,
        }),
        expected: 1.61499999999999999,
      },
      {
        name: 'latest-change-notice-marker',
        query: 'What is the latest change notice for MA-3550?',
        hit: makeHit({
          sectionId: 'sec:cn',
          sectionTitle: 'Change No. 05-23',
          documentTitle: 'MA-3550 Change Notice 05-23',
          documentType: 'dhhs_policy',
          policyNumber: 'MA-3550',
          content: 'Implementation: effective June 1, 2023.',
          score: 0.95,
        }),
        latestChangeMarkerValue: 202305,
        expected: 1.83600000000000008,
      },
      {
        name: 'pediatric-mismatch',
        query: 'Does NC Medicaid cover wheelchair ramps for adults under CAP/DA?',
        hit: makeHit({
          sectionId: 'sec:peds',
          sectionTitle: 'EPSDT special provision',
          documentTitle: 'Clinical Coverage Policy 10A',
          documentType: 'clinical_policy',
          content: 'Beneficiaries under 21 years of age receive EPSDT services for children.',
          score: 1.0,
          answerReady: false,
          retrievalReady: false,
        }),
        expected: 0.54000000000000015,
      },
    ];

    for (const testCase of cases) {
      const context = contextForQuery(testCase.query, {
        documentCoverageBoosts: sharedBoosts,
        latestChangeMarkerValue: testCase.latestChangeMarkerValue ?? null,
      });
      const score = rerankRetrievalHit(testCase.hit, context).score;
      expect(score, testCase.name).toBe(testCase.expected);
    }
  });
});
