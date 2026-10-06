import { describe, expect, it } from 'vitest';
import { normalizeSearchText } from '../../src/internal/base.js';
import {
  detectAnswerQuestionType,
  extractAliasedPolicyNumbers,
  extractAppealPolicyNumbers,
  extractExplicitPolicyNumbers,
  isFederalAuthorityQuery,
} from '../../src/internal/query-intent.js';
import { collectPolicyNumbersForQuery, defaultTypeGroupsForQuery } from '../../src/internal/retrieval-planning.js';
import { FEDERAL_DOCUMENT_TYPES, POLICY_ROUTING_DOCUMENT_TYPES } from '../../src/internal/scoring-constants.js';
import { analyzeQuery } from '../../src/query/analysis.js';
import * as termLists from '../../src/internal/term-lists.js';

const SERVICE = ['108A-70.9A', '108D-14', '108D-15'];
const COUNTY = ['108A-79', 'MA-2420', 'MA-3430'];
const STATUTES = [...SERVICE, '108A-79'];
const matchesCountyCue = (queryLower: string) =>
  termLists.COUNTY_ELIGIBILITY_APPEAL_TERMS.some((term) => new RegExp(`(?<![a-z0-9])${term}(?![a-z0-9])`).test(queryLower));
// The search collector's input. Frame document routing (collectPolicyNumbersForQuery) never carries the alias.
const route = (query: string) => analyzeQuery(query).explicitPolicyNumbers;

describe('North Carolina hearing statutes: type group', () => {
  it('searches nc_statute by default, on operational and on federal-authority questions', () => {
    for (const query of [
      'how long do i have to appeal a denial',
      'what is the billing code for a claim appeal',
      'what does 42 cfr 431.221 say about requesting a fair hearing',
    ]) {
      expect(defaultTypeGroupsForQuery(query).flat()).toContain('nc_statute');
    }
  });

  it('gives the statutes no type-wide boost and no place in hit-derived policy routing', () => {
    expect(FEDERAL_DOCUMENT_TYPES.has('nc_statute')).toBe(false);
    expect(POLICY_ROUTING_DOCUMENT_TYPES.has('nc_statute')).toBe(false);
  });
});

describe('North Carolina hearing statutes: citation', () => {
  it.each([
    ['What does 108A-70.9A say?', '108A-70.9A'],
    ['Explain G.S. 108A-70.9A(d).', '108A-70.9A'],
    ['What does N.C.G.S. § 108D-15 require?', '108D-15'],
    ['Summarise g.s. 108a-79.', '108A-79'],
  ])('%s -> %s', (query, citation) => {
    expect(extractExplicitPolicyNumbers(query)).toEqual([citation]);
  });

  it('does not read a clinical policy number out of a statute citation', () => {
    expect(extractExplicitPolicyNumbers('Compare policy 9A with G.S. 108A-70.9A')).toEqual(
      expect.arrayContaining(['9A', '108A-70.9A']),
    );
    expect(extractExplicitPolicyNumbers('Compare policy 9A with G.S. 108A-70.9A')).toHaveLength(2);
  });
});

describe('appeal alias', () => {
  it.each([
    'My prior authorization was denied. How do I appeal?',
    'How do I appeal a reduction, suspension or termination of a service?',
    'I got a notice of adverse benefit determination. Can I request a fair hearing?',
  ])('service decision: %s', (query) => {
    const numbers = route(query);
    expect(numbers).toEqual(expect.arrayContaining(['108D-14', '108D-15']));
    expect(numbers).not.toEqual(expect.arrayContaining(['MA-2420']));
    expect(numbers).not.toEqual(expect.arrayContaining(['MA-3430']));
    expect(numbers).not.toEqual(expect.arrayContaining(['108A-79']));
  });

  it('separates Medicaid Direct from a managed care plan', () => {
    expect(route('How do I appeal a Medicaid Direct service denial?')).toEqual(['108A-70.9A']);
    expect(route('My health plan denied a service. How do I file a plan appeal and then a State fair hearing?')).toEqual([
      '108D-14',
      '108D-15',
    ]);
    expect(route('My prior authorization was denied. How do I appeal?')).toEqual(SERVICE);
  });

  it.each([
    'The county DSS denied my Medicaid application. How do I appeal?',
    'My eligibility was terminated by the county. Can I request a hearing?',
  ])('county eligibility decision: %s', (query) => {
    expect(route(query)).toEqual(COUNTY);
  });

  it('names the four statutes and no manual when the question names neither kind', () => {
    for (const query of ['How long do I have to appeal a Medicaid denial?', 'What is a fair hearing?']) {
      expect(route(query)).toEqual(STATUTES);
    }
  });

  it('names all six when the question names both kinds', () => {
    expect(route('Can I appeal if the county ended my eligibility and my services stopped?')).toEqual([
      ...SERVICE,
      ...COUNTY,
    ]);
  });

  // The invariant #222 was held for: the manuals state the county time limit
  // only, so nothing but a county eligibility cue may name them. It must hold
  // on a graph without the statutes, where the manuals would be the only
  // North Carolina hearing documents an appeal question could reach.
  it.each([
    'How long do I have to appeal a Medicaid denial?',
    'What is a fair hearing?',
    'How do I request a hearing?',
    'I got a notice of action. What now?',
    'Can I appeal?',
    'My prior authorization was denied. How do I appeal?',
    'How do I appeal a reduction, suspension or termination of a service?',
    'How do I appeal a Medicaid Direct service denial?',
    'My health plan denied a service. How do I file a plan appeal?',
    'I got a notice of adverse benefit determination. Can I request a fair hearing?',
    'Does Medicaid cover dental implants, and how do I appeal if it is denied?',
    'What does 42 CFR 431.221 require for a CAP/DA fair hearing request?',
    'What federal regulation governs how long I have to appeal a prior authorization denial?',
  ])('names no county manual without a county cue: %s', (query) => {
    const queryLower = normalizeSearchText(query);
    expect(matchesCountyCue(queryLower)).toBe(false);
    for (const numbers of [route(query), analyzeQuery(query).explicitPolicyNumbers, extractAppealPolicyNumbers(queryLower)]) {
      expect(numbers.length).toBeGreaterThan(0);
      expect(numbers).not.toContain('MA-2420');
      expect(numbers).not.toContain('MA-3430');
    }
  });

  it('names a county manual only with a county cue, for every cue term', () => {
    for (const term of termLists.COUNTY_ELIGIBILITY_APPEAL_TERMS) {
      expect(extractAppealPolicyNumbers(normalizeSearchText(`How do I appeal a ${term} decision?`))).toEqual(COUNTY);
    }
  });

  // "Social services" contains the service cue "services" but names the
  // county agency: it is a county cue only.
  it.each([
    ['How do I appeal a social services decision?', COUNTY],
    ['The Department of Social Services denied my Medicaid. How do I appeal?', COUNTY],
    ['How do I appeal a DSS decision?', COUNTY],
    ['My county DSS denied my application and the plan denied a service. How do I appeal?', [...SERVICE, ...COUNTY]],
    ['Social services cut my home health services. How do I appeal?', [...SERVICE, ...COUNTY]],
  ])('reads a county agency name as a county cue only: %s', (query, expected) => {
    expect(extractAppealPolicyNumbers(normalizeSearchText(query))).toEqual(expected);
  });

  it('applies under prior_authorization typing', () => {
    const query = 'What prior authorization is needed for a power wheelchair, and how do I appeal a denial?';
    expect(detectAnswerQuestionType(query)).toBe('prior_authorization');
    expect(route(query)).toEqual(expect.arrayContaining(SERVICE));
  });

  it('applies through the federal-authority alias gate, which still drops programme aliases', () => {
    const query = 'What does 42 CFR 431.221 require for a CAP/DA fair hearing request?';
    expect(isFederalAuthorityQuery(normalizeSearchText(query))).toBe(true);
    const numbers = route(query);
    expect(numbers).toEqual(expect.arrayContaining(['108A-70.9A', '108A-79']));
    expect(numbers).not.toContain('3K-2');
  });

  it('adds to a programme alias instead of replacing it', () => {
    const numbers = route('Does CAP/DA cover home modifications and how do I appeal a service denial?');
    expect(numbers[0]).toBe('3K-2');
    expect(numbers).toEqual(expect.arrayContaining(SERVICE));
  });

  // A frame that finds a document for a routed number uses it in place of the
  // policy its hits point to (collectLookupDocuments in frame/context/routing).
  // The alias therefore never reaches frame routing, on either graph state:
  // the hearing sources arrive as search hits beside the coverage policy.
  it.each([
    'Does Medicaid cover dental implants, and how do I appeal if it is denied?',
    'What prior authorization is needed for a power wheelchair, and how do I appeal a denial?',
    'How long do I have to appeal a Medicaid denial?',
    'The county DSS denied my Medicaid application. How do I appeal?',
  ])('routes no frame document by alias: %s', (query) => {
    expect(collectPolicyNumbersForQuery(query)).toEqual([]);
    expect(extractAliasedPolicyNumbers(normalizeSearchText(query))).toEqual([]);
    expect(route(query).length).toBeGreaterThan(0);
  });

  it('still routes a frame by a statute the question cites', () => {
    expect(collectPolicyNumbersForQuery('What does G.S. 108A-70.9A(d) say about appealing?')).toEqual(['108A-70.9A']);
  });

  it('leaves a coverage question alone', () => {
    expect(extractAppealPolicyNumbers('does medicaid cover dental services for adults')).toEqual([]);
    expect(route('Does CAP/DA cover home modifications?')).toEqual(['3K-2']);
  });

  it('writes no number of days into the term lists', () => {
    expect(JSON.stringify(termLists)).not.toMatch(/\bdays?\b|\b(30|60|90|120)\b/);
  });
});

describe('appeal alias in query analysis (the search collector input)', () => {
  const numbers = (query: string) => analyzeQuery(query).explicitPolicyNumbers;

  it('keeps the appeal alias on a federal-authority question', () => {
    const query = 'What federal regulation governs how long I have to appeal a prior authorization denial?';
    expect(isFederalAuthorityQuery(normalizeSearchText(query))).toBe(true);
    expect(numbers(query)).toEqual(expect.arrayContaining(SERVICE));
  });

  it('names the statutes and not the county manuals for a service denial', () => {
    const routed = numbers('My prior authorization was denied. How long do I have to request a fair hearing?');
    expect(routed).toEqual(expect.arrayContaining(SERVICE));
    expect(routed).not.toContain('MA-2420');
    expect(routed).not.toContain('MA-3430');
  });

  it('names the four statutes and no manual when the question does not say which decision', () => {
    expect(numbers('How long do I have to appeal a Medicaid denial?')).toEqual(STATUTES);
  });
});
