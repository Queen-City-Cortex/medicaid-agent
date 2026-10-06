// Which tokens in a question count as a policy number. The cases come from
// the October 2026 review findings (RETR-1) and from ordinary phrasings; none
// is taken from the golden or held-out benchmark questions.

import { describe, expect, it } from 'vitest';

import { extractExplicitPolicyNumbers, preferTypedFormDocuments } from '../../src/internal/query-intent.js';
import { analyzeQuery } from '../../src/query/analysis.js';

describe('extractExplicitPolicyNumbers', () => {
  it.each<[string, string[]]>([
    // Look-alikes: a digit-and-letter token with no cue names no policy.
    ['Does NC Medicaid cover 3D mammograms?', []],
    ['Is a 3D mammogram covered for women over 40?', []],
    ['Does Medicaid pay for dialysis in stage 3b kidney disease?', []],
    ['What is covered for stage 4B cancer?', []],
    ['Are 8h private duty nursing shifts covered?', []],
    ['Take 2x daily', []],
    ['Can I get a 90d supply of my medication?', []],
    ['What is the NC Medicaid policy on 3D mammograms?', []],
    ['Is tomosynthesis billed under 3d imaging codes?', []],
    ['Which is covered, 3D vs 2D mammography?', []],
    ['Is a 5k copay waiver available?', []],
    // Numbers, years, ages and amounts.
    ['Is a child age 9 eligible for dental sealants?', []],
    ['Are children under 21 covered for hearing aids?', []],
    ['What changed in 2024?', []],
    ['Is there a $15 copay for 10 visits?', []],
    ['Does the policy allow 30 days of therapy?', []],
    ['Is there a policy 30 days limit?', []],
    ['What is the policy 15 visit limit?', []],
    ['What does policy 3.2 mean?', []],
    ['Which policy applied in policy 2024?', []],
    ['What 15 policies changed?', []],
    // A typed number with no cue is left to search.
    ['What does 8C say about telehealth?', []],
    ['Is 3K the right one?', []],
    ['10a', []],
    // Cue before the number.
    ['policy 3D', ['3D']],
    ['Clinical Coverage Policy No. 8C', ['8C']],
    ['What does Clinical Coverage Policy 3L require?', ['3L']],
    ['policy (5B)', ['5B']],
    ['policy number 8C', ['8C']],
    ['Policy No: 1-H', ['1-H']],
    ['CCP 10A', ['10A']],
    ['under policy 8c, is therapy covered?', ['8C']],
    // Stored numbers the old pattern could not see.
    ['What does policy 1-I cover?', ['1-I']],
    ['Does policy 7 cover hearing aid batteries?', ['7']],
    ['Does policy 15 cover air ambulance?', ['15']],
    ['policy #9', ['9']],
    ['What does Policy 8 say?', ['8']],
    // Cue after the number.
    ['Is that in the 3L policy?', ['3L']],
    // "under", only where the number ends the clause.
    ['Is PCS covered under 3L?', ['3L']],
    ['Under 8C, is family therapy covered?', ['8C']],
    ['What is required under 5A.', ['5A']],
    // Section cues.
    ['What does section 5.6 of 3L require?', ['3L']],
    ['Explain 3L section 5.6', ['3L']],
    ['See 8C, § 3.2', ['8C']],
    // Lists: a bare token joined to a number that already qualified.
    ['policies 8C and 8A', ['8C', '8A']],
    ['Does 3L or 3L-1 apply to an adult care home?', ['3L', '3L-1']],
    ['Compare policy 3L, 3K-2 and 8A', ['3L', '3K-2', '8A']],
    ['policy 8C vs 8A', ['8C', '8A']],
    // A numeric suffix needs no cue.
    ['1A-15', ['1A-15']],
    ['What does 1A-2 cover?', ['1A-2']],
    ['Is ACT in 8A-1?', ['8A-1']],
    ['What is 1-O-1 about?', ['1-O-1']],
    ['policy 8C-1', ['8C-1']],
    // Manual and form numbers resolve to the stored PREFIX-digits.
    ['MA-2180', ['MA-2180']],
    ['What does MA 2180 say about premiums?', ['MA-2180']],
    ['MA2180', ['MA-2180']],
    ['ma-2420 transfer of assets', ['MA-2420']],
    ['Where do I send form DHB-5125B after a transportation no-show?', ['DHB-5125']],
    ['What is DHB-5008A for?', ['DHB-5008']],
    ['MA-3233-A', ['MA-3233']],
    ['Is DSS-8110sp the Spanish notice?', ['DSS-8110']],
    // One policy typed two ways counts once.
    ['Does policy 1-H or policy 1H apply?', ['1-H']],
    // Federal citations and State Plan Amendment numbers are not policy
    // numbers here; the lookup tool resolves them when the model asks.
    ['What does 42 CFR 440.230 require?', []],
    ['What does section 1915(c) of the Social Security Act allow?', []],
    ['What did SPA 24-0028 change?', []],
  ])('%s -> %j', (question, expected) => {
    expect(extractExplicitPolicyNumbers(question)).toEqual(expected);
    // isPolicyVariantQuery passes lower-cased text.
    expect(extractExplicitPolicyNumbers(question.toLowerCase())).toEqual(expected);
  });

  it('does not read one suffixed form number as two policies', () => {
    for (const question of [
      'Where do I send form DHB-5125B after a transportation no-show?',
      'What is DHB-5008A for?',
    ]) {
      const analysis = analyzeQuery(question);
      expect(analysis.explicitPolicyNumbers).toHaveLength(1);
      expect(analysis.questionType).not.toBe('policy_variant');
    }
  });

  it('gives a look-alike question no policy number to scope retrieval or lookup', () => {
    expect(analyzeQuery('Does NC Medicaid cover 3D mammograms?').explicitPolicyNumbers).toEqual([]);
  });
});

describe('preferTypedFormDocuments', () => {
  const forms = [
    { title: 'DHB-5125 Notice of NEMT Suspension' },
    { title: 'DHB-5125A Notice A' },
    { title: 'DHB-5125Asp Aviso A' },
    { title: 'DHB-5125B Notice B' },
    { title: 'DHB-5125Bsp Aviso B' },
  ];

  it('puts the form the asker typed first and keeps the rest in order', () => {
    expect(preferTypedFormDocuments('Where do I send form dhb 5125b?', forms).map((form) => form.title)).toEqual([
      'DHB-5125B Notice B',
      'DHB-5125 Notice of NEMT Suspension',
      'DHB-5125A Notice A',
      'DHB-5125Asp Aviso A',
      'DHB-5125Bsp Aviso B',
    ]);
  });

  it('leaves the order alone when no suffix was typed', () => {
    expect(preferTypedFormDocuments('What is DHB-5125?', forms)).toBe(forms);
    expect(preferTypedFormDocuments('Is PCS covered under 3L?', forms)).toBe(forms);
  });
});
