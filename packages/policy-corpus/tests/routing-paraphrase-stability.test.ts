import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildRetrievalProfileSignals } from '../src/profiles/retrieval-signals.js';
import { analyzeQuery } from '../src/query/analysis.js';

// A free regression gate: no model, embedding or graph call. Each held-out
// question is a paraphrase of one golden question, so the keyword router
// should give both the same question type and retrieval profile.
//
// The lists below are the pairs it does not, recorded from the router's own
// output. They may only shrink. Fix a pair with a rule that is right for the
// wording in general, never with one written for that question; when a pair
// starts agreeing, this test fails until its id is removed.
const KNOWN_QUESTION_TYPE_DISAGREEMENTS = [
  'h-003',
  'h-005',
  'h-007',
  'h-023',
  'h-025',
  'h-026',
  'h-029',
  'h-030',
  'h-033',
  'h-034',
  'h-037',
  'h-038',
  // The golden wording names "plan amendments" and is no longer typed as an
  // amendment question; the paraphrase says "amendments to a state's
  // Medicaid plan" and still is.
  'h-047',
];
const KNOWN_PROFILE_DISAGREEMENTS = ['h-033'];

interface Question {
  id: string;
  question: string;
  paraphrase_of?: string;
}

function loadQuestions(file: string): Question[] {
  return JSON.parse(
    readFileSync(new URL(`../../pipeline/data/golden/${file}`, import.meta.url), 'utf8'),
  ) as Question[];
}

function route(question: string): { questionType: string; profileName: string } {
  const analysis = analyzeQuery(question);
  return {
    questionType: analysis.questionType,
    profileName: buildRetrievalProfileSignals({ query: question }, analysis).profileName,
  };
}

describe('router stability across golden questions and their held-out paraphrases', () => {
  const golden = new Map(loadQuestions('dataset.json').map((row) => [row.id, row]));
  const pairs = loadQuestions('heldout-paraphrase.json').map((paraphrase) => ({
    paraphrase,
    original: golden.get(paraphrase.paraphrase_of ?? ''),
  }));

  it('pairs every held-out paraphrase with a golden question', () => {
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.filter((pair) => !pair.original).map((pair) => pair.paraphrase.id)).toEqual([]);
  });

  it('gives a paraphrase the question type of its original, outside the known list', () => {
    const disagreements = pairs
      .filter((pair) => route(pair.paraphrase.question).questionType !== route(pair.original!.question).questionType)
      .map((pair) => pair.paraphrase.id);
    expect(disagreements).toEqual(KNOWN_QUESTION_TYPE_DISAGREEMENTS);
  });

  it('gives a paraphrase the retrieval profile of its original, outside the known list', () => {
    const disagreements = pairs
      .filter((pair) => route(pair.paraphrase.question).profileName !== route(pair.original!.question).profileName)
      .map((pair) => pair.paraphrase.id);
    expect(disagreements).toEqual(KNOWN_PROFILE_DISAGREEMENTS);
  });
});
