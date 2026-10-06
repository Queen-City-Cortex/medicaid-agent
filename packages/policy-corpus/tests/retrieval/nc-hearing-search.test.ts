import { describe, expect, it } from 'vitest';

import type { QueryAnalysis, RetrievalProfile } from '../../src/contracts.js';
import type { CorpusRetrievalHit } from '../../src/types.js';
import { analyzeQuery } from '../../src/query/analysis.js';
import { policyScopedBackend } from '../../src/retrieval/backends/policy-scoped.js';
import { finalizeHybridHits } from '../../src/retrieval/collector.js';
import { BASE_TYPE_GROUPS, EXACT_POLICY_NUMBER_BOOST } from '../../src/internal/scoring-constants.js';
import { sectionHit, type StubRecord } from '../helpers/graph-fixtures.js';
import { makeHit } from '../helpers/objects.js';

// SAFE-1b search path. The appeal alias adds statute numbers (and, on a county
// cue, the county manuals) to analyzeQuery().explicitPolicyNumbers. Those
// numbers reach search in two places only: the policy-scoped backend (an
// additional stage-1 source keyed on the named numbers) and the exact-number
// rerank boost. These tests drive the real backend through a session stub that
// applies the backend's own WHERE clause to an in-memory graph, and the real
// finalizeHybridHits rerank, on the graph before and after the corpus release
// that adds the statutes.

interface GraphSection {
  sectionId: string;
  policyNumber: string;
  documentType: string;
  sectionTitle: string;
  content: string;
}

const PRIOR_AUTH_CLINICAL: GraphSection = {
  sectionId: 'sec:clinical:1A-14:pa',
  policyNumber: '1A-14',
  documentType: 'clinical_policy',
  sectionTitle: 'Prior Approval',
  content: 'Prior authorization is required. A denied request may be appealed.',
};
const COUNTY_MANUAL_2420: GraphSection = {
  sectionId: 'sec:dhhs:MA-2420:hearing',
  policyNumber: 'MA-2420',
  documentType: 'dhhs_policy',
  sectionTitle: 'Notice and Hearings Process',
  content: 'The county DSS must notify the applicant of a denied application and the right to appeal.',
};
const COUNTY_MANUAL_3430: GraphSection = {
  sectionId: 'sec:dhhs:MA-3430:hearing',
  policyNumber: 'MA-3430',
  documentType: 'dhhs_policy',
  sectionTitle: 'Notice and Hearings Process',
  content: 'A county appeal of a denied application must be requested within 60 days.',
};
const STATUTE_SECTIONS: GraphSection[] = [
  ['108A-70.9A', 'Notice of adverse determination; appeal of a denied prior authorization'],
  ['108D-14', 'Internal plan appeal of a denied service'],
  ['108D-15', 'Contested case hearing after a denied plan appeal'],
  ['108A-79', 'Appeal of a county denied application to the county DSS'],
].map(([policyNumber, content]) => ({
  sectionId: `sec:nc_statute:${policyNumber}`,
  policyNumber,
  documentType: 'nc_statute',
  sectionTitle: `G.S. ${policyNumber}`,
  content,
}));

const BEFORE_RELEASE = [PRIOR_AUTH_CLINICAL, COUNTY_MANUAL_2420, COUNTY_MANUAL_3430];
const AFTER_RELEASE = [...BEFORE_RELEASE, ...STATUTE_SECTIONS];

/** Applies the policy-scoped backend's filter (type, named number, term match) to a graph. */
function sessionOver(graph: GraphSection[]) {
  const calls: Array<{ query: string; params: Record<string, unknown> }> = [];
  const session = {
    async run(query: string, params: Record<string, unknown>) {
      calls.push({ query, params });
      const docTypes = params.docTypes as string[];
      const policyNumbers = params.policyNumbers as string[];
      const terms = (params.terms as string[] | undefined) ?? null;
      const records: StubRecord[] = graph
        .filter((section) => docTypes.includes(section.documentType))
        .filter((section) => policyNumbers.includes(section.policyNumber.toUpperCase()))
        // The vector query has no term filter; the keyword query requires a match.
        .filter((section) => terms === null || terms.some((term) => section.content.toLowerCase().includes(term)))
        .map((section) => sectionHit({ ...section, documentTitle: section.policyNumber, score: terms === null ? 0.8 : 1 }));
      return { records };
    },
  };
  return { session, calls };
}

const PROFILE: RetrievalProfile = {
  name: 'test',
  lane: 'baseline_hybrid',
  wideningPolicy: 'none',
  hasExplicitDocumentTypes: false,
  typeGroups: BASE_TYPE_GROUPS.map((group) => [...group]),
  perGroupK: 10,
  enabledBackends: [],
};

async function policyScoped(graph: GraphSection[], analysis: QueryAnalysis) {
  const { session, calls } = sessionOver(graph);
  const hits = await policyScopedBackend.retrieve({
    session: session as never,
    analysis,
    profile: PROFILE,
    embedding: [0.1, 0.2],
  } as never);
  return { hits, calls };
}

/** Main's analysis for the same question: identical except that the alias names nothing. */
const asOnMain = (analysis: QueryAnalysis): QueryAnalysis => ({ ...analysis, explicitPolicyNumbers: [] });

const asHit = (section: GraphSection, score: number): CorpusRetrievalHit =>
  makeHit({ ...section, documentTitle: section.policyNumber, score });

function rerank(hits: CorpusRetrievalHit[], analysis: QueryAnalysis) {
  const sectionMap = new Map(hits.map((hit) => [hit.sectionId, hit]));
  return finalizeHybridHits({ sectionMap: sectionMap as never, analysis, topK: 20 });
}

const PRIOR_AUTH_QUESTION = 'My prior authorization was denied. How do I appeal?';
const COUNTY_QUESTION = 'The county DSS denied my Medicaid application. How do I appeal?';

// Hits the other stage-1 backends (vector, fulltext) return for the question; the
// same set on main and on the branch.
const PRIOR_AUTH_STAGE_ONE = [
  asHit(PRIOR_AUTH_CLINICAL, 0.7),
  asHit(COUNTY_MANUAL_2420, 0.5),
  makeHit({ sectionId: 'sec:bulletin:pa', documentType: 'bulletin', policyNumber: null, score: 0.6, content: 'Appeal a prior authorization denial.' }),
];

describe('SAFE-1b search path: appeal alias numbers', () => {
  it('names the statutes for a prior-authorization appeal and the manuals only on a county cue', () => {
    expect(analyzeQuery(PRIOR_AUTH_QUESTION).explicitPolicyNumbers).toEqual(['108A-70.9A', '108D-14', '108D-15']);
    expect(analyzeQuery(COUNTY_QUESTION).explicitPolicyNumbers).toEqual(['108A-79', 'MA-2420', 'MA-3430']);
  });

  describe('(a) before the release: named statute numbers match no document', () => {
    it('policy-scoped retrieval runs, returns nothing and does not throw', async () => {
      const analysis = analyzeQuery(PRIOR_AUTH_QUESTION);
      const { hits, calls } = await policyScoped(BEFORE_RELEASE, analysis);
      expect(hits).toEqual([]);
      // Two queries (vector, keyword) per type group: an additional source, not a filter on others.
      expect(calls).toHaveLength(PROFILE.typeGroups.length * 2);
      // On main the backend is skipped entirely (no named numbers).
      expect((await policyScoped(BEFORE_RELEASE, asOnMain(analysis))).calls).toHaveLength(0);
    });

    it('reranks the same stage-one hits to the same scores and order as main: nothing demoted or dropped', () => {
      const analysis = analyzeQuery(PRIOR_AUTH_QUESTION);
      const branch = rerank(PRIOR_AUTH_STAGE_ONE, analysis);
      const main = rerank(PRIOR_AUTH_STAGE_ONE, asOnMain(analysis));
      expect(branch.map((hit) => hit.sectionId)).toEqual(main.map((hit) => hit.sectionId));
      expect(branch.map((hit) => hit.score)).toEqual(main.map((hit) => hit.score));
      expect(branch).toHaveLength(PRIOR_AUTH_STAGE_ONE.length);
    });
  });

  describe('(b) after the release: statute sections are present', () => {
    it('policy-scoped retrieval adds the named statutes and nothing else', async () => {
      const { hits } = await policyScoped(AFTER_RELEASE, analyzeQuery(PRIOR_AUTH_QUESTION));
      expect(new Set(hits.map((hit) => hit.policyNumber))).toEqual(new Set(['108A-70.9A', '108D-14', '108D-15']));
      expect(hits.every((hit) => hit.documentType === 'nc_statute')).toBe(true);
    });

    it('statute hits surface alongside the other hits, each boosted exactly as a named policy', async () => {
      const analysis = analyzeQuery(PRIOR_AUTH_QUESTION);
      const { hits: scoped } = await policyScoped(AFTER_RELEASE, analysis);
      // The section map keys on sectionId, so the vector and keyword rows for a statute merge.
      const merged = [...PRIOR_AUTH_STAGE_ONE, ...scoped];
      const branch = rerank(merged, analysis);
      const main = rerank(merged, asOnMain(analysis));
      const scoreOn = (list: CorpusRetrievalHit[], id: string) => list.find((hit) => hit.sectionId === id)!.score;

      for (const id of PRIOR_AUTH_STAGE_ONE.map((hit) => hit.sectionId)) {
        expect(branch.some((hit) => hit.sectionId === id)).toBe(true);
        expect(scoreOn(branch, id)).toBeCloseTo(scoreOn(main, id), 10);
      }
      for (const policyNumber of ['108A-70.9A', '108D-14', '108D-15']) {
        const id = `sec:nc_statute:${policyNumber}`;
        expect(scoreOn(branch, id) - scoreOn(main, id)).toBeCloseTo(EXACT_POLICY_NUMBER_BOOST, 10);
      }
    });
  });

  describe('(c) county cue: 108A-79, MA-2420 and MA-3430', () => {
    it('before the release the manuals are fetched by number and boosted; 108A-79 matches nothing', async () => {
      const analysis = analyzeQuery(COUNTY_QUESTION);
      const { hits } = await policyScoped(BEFORE_RELEASE, analysis);
      expect(new Set(hits.map((hit) => hit.policyNumber))).toEqual(new Set(['MA-2420', 'MA-3430']));

      const stageOne = [asHit(COUNTY_MANUAL_2420, 0.5), asHit(PRIOR_AUTH_CLINICAL, 0.6)];
      const branch = rerank(stageOne, analysis);
      const main = rerank(stageOne, asOnMain(analysis));
      const delta = (id: string) =>
        branch.find((hit) => hit.sectionId === id)!.score - main.find((hit) => hit.sectionId === id)!.score;
      expect(delta(COUNTY_MANUAL_2420.sectionId)).toBeCloseTo(EXACT_POLICY_NUMBER_BOOST, 10);
      expect(delta(PRIOR_AUTH_CLINICAL.sectionId)).toBeCloseTo(0, 10);
    });

    it('after the release the county statute joins the manuals', async () => {
      const { hits } = await policyScoped(AFTER_RELEASE, analyzeQuery(COUNTY_QUESTION));
      expect(new Set(hits.map((hit) => hit.policyNumber))).toEqual(new Set(['MA-2420', 'MA-3430', '108A-79']));
    });
  });
});
