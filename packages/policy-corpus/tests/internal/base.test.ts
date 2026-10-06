import { describe, expect, it } from 'vitest';

import { matchesAnyTerm, matchesTerm, matchesToken } from '../../src/internal/base.js';

describe('matchesTerm', () => {
  it('matches a term only as a whole word', () => {
    expect(matchesTerm('can someone in an ach get pcs?', 'ach')).toBe(true);
    for (const text of ['how many hours each month?', 'help reaching the bathroom', 'a cpap machine', 'attach the form']) {
      expect(matchesTerm(text, 'ach'), text).toBe(false);
    }
    expect(matchesTerm('is chemotherapy covered?', 'therapy')).toBe(false);
    expect(matchesTerm('what information is needed?', 'form')).toBe(false);
    expect(matchesTerm('which form is needed?', 'form')).toBe(true);
  });

  it('matches a multi-word term only as that sequence of whole words', () => {
    expect(matchesTerm('care in an adult care home', 'adult care home')).toBe(true);
    expect(matchesTerm('adult day care at home', 'adult care home')).toBe(false);
    expect(matchesTerm('what home health services are covered?', 'at home')).toBe(false);
    expect(matchesTerm('what part does medicaid pay?', 'part d')).toBe(false);
    expect(matchesTerm('medicare part d', 'part d')).toBe(true);
    expect(matchesTerm('adult  care\thome', 'adult care home')).toBe(true);
  });

  it('treats hyphens and spaces between words as the same thing', () => {
    expect(matchesTerm('does medicaid cover in home aides?', 'in-home')).toBe(true);
    expect(matchesTerm('does medicaid cover in-home aides?', 'in-home')).toBe(true);
    expect(matchesTerm('are over the counter medications covered?', 'over-the-counter medications')).toBe(true);
    expect(matchesTerm('are over-the-counter medications covered?', 'over the counter medications')).toBe(true);
    // A hyphen is a word boundary.
    expect(matchesTerm('which services are telehealth-eligible?', 'telehealth')).toBe(true);
    expect(matchesTerm('what are the non-covered services?', 'covered')).toBe(true);
  });

  it('treats a slash as a word boundary that is literal inside a term', () => {
    expect(matchesTerm('who is eligible for cap/c?', 'cap/c')).toBe(true);
    expect(matchesTerm('who is eligible for cap/choice?', 'cap/c')).toBe(false);
    expect(matchesTerm('who is eligible for cap/cd?', 'cap/c')).toBe(false);
    expect(matchesTerm('billing for pcs/home health', 'pcs')).toBe(true);
  });

  it('matches a word before a possessive or punctuation', () => {
    expect(matchesTerm("is my child's wheelchair covered?", 'child')).toBe(true);
    expect(matchesTerm('policy 3l vs. 3l-1', 'vs')).toBe(true);
    expect(matchesTerm('what about hospice (telehealth)?', 'telehealth')).toBe(true);
  });

  it('does not infer plurals or other inflections', () => {
    expect(matchesTerm('are adult care homes covered?', 'adult care home')).toBe(false);
    expect(matchesTerm('are childless adults eligible?', 'child')).toBe(false);
    expect(matchesTerm('a federally qualified health center', 'federal')).toBe(false);
    expect(matchesAnyTerm('are adult care homes covered?', ['adult care home', 'adult care homes'])).toBe(true);
  });

  it('never matches an empty term', () => {
    expect(matchesTerm('anything', '')).toBe(false);
    expect(matchesAnyTerm('anything', [])).toBe(false);
  });

  it('leaves policy numbers to matchesToken, which keeps the hyphen in the token', () => {
    expect(matchesTerm('compare with policy 8c-1', '8c')).toBe(true);
    expect(matchesToken('compare with policy 8c-1', '8c')).toBe(false);
  });
});
