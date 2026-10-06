import { describe, expect, it, vi } from 'vitest';
import { ANSWER_SCOPE_POLICY, coverageEvidenceIssue, resolveCoverageScope } from '../src/scope/coverage.js';
import { createAnswerFrameResolver } from '../src/frame/service.js';
import type { LegalPrimitiveService } from '../src/contracts.js';
import type { SessionExecutor } from '../src/types.js';

const today = new Date('2026-10-03T00:00:00Z');
const scope = (question: string) => resolveCoverageScope(question, today);

describe('bounded answer scope', () => {
  it.each([
    ['What were the original 2025 MAGI income limits?', '2025-04-01', 'MA-3321-1.pdf'],
    ['What were the original 2025 MAGI income limits in the PDF MA-3321-1.pdf?', '2025-04-01', 'MA-3321-1.pdf'],
    ['What MAGI income table applies in October 2026?', '2026-10-01', 'MA-3321-MAGI-Income-2.pdf'],
    ['What were the original 2025 MAGI income limits in June 2025?', '2025-06-01', 'MA-3321-1.pdf'],
    ['What MAGI income table applies in June 2025?', '2025-06-01', 'MA-3321-1.pdf'],
    ['What MAGI income table applies on 2026-03-31?', '2026-03-31', 'MA-3321-1.pdf'],
    ['What MAGI income table applies on April 1, 2026?', '2026-04-01', 'MA-3321-MAGI-Income-2.pdf'],
  ])('selects the applicable table for %s', (question, date, file) => {
    expect(scope(question)).toMatchObject({ notice: null, requestedDate: date });
    expect(scope(question)?.requiredSourceUrls[0]).toContain(file);
  });

  it.each([
    'What MAGI income limits apply in February 2025?',
    'What MAGI income table applies on 2026-02-31?',
    'Compare MAGI income limits for 2025 and 2026.',
    'What MAGI income limits apply next year?',
    'What MAGI income limits apply in 2027?',
  ])('does not guess an unsupported or ambiguous period: %s', question => {
    expect(scope(question)?.notice).toBeTruthy();
    expect(scope(question)?.requiredSourceUrls).toEqual([]);
  });

  it.each([
    ['What does my Gujarati DHB-5097 say and what should I do?', 'gujarati-dhb-5097'],
    ['Translate my Gujarati DHB-5097 and tell me the next steps.', 'gujarati-dhb-5097'],
    ['What deadline does my Gujarati DHB-5097 give, and how do I reply?', 'gujarati-dhb-5097'],
    ['How do I complete the Gujarati DHB-5097? Show me the form.', 'gujarati-dhb-5097'],
    ['Is pharmacist authority for OTC COVID home tests still in effect and is it a covered benefit?', 'covid-standing-order'],
    ['Were pharmacists allowed to give out free OTC COVID home tests without a doctor?', 'covid-standing-order'],
    ['Who allowed pharmacists to hand out OTC COVID home tests on October 1, 2024, and did Medicaid cover them?', 'covid-standing-order'],
    ['Does Medicaid cover OTC COVID tests ordered by a pharmacist on October 1, 2024?', 'covid-standing-order'],
    ['What did the original 2025 MAGI income limit PDFs say?', 'magi-2025-archive'],
    ['Were the original 2025 MAGI income limits later superseded or withdrawn?', 'magi-2025-archive'],
    ['Compare the original 2025 MAGI income limits with the reposted version.', 'magi-2025-archive'],
    ['What were the 2025 MAGI limits in the document originally attached to the manual?', 'magi-2025-archive'],
    ['Compare the original 2025 MAGI income limits attachment with MA-3321-1.pdf.', 'magi-2025-archive'],
    ['Was MA-3321-1.pdf a duplicate of the original 2025 MAGI attachment?', 'magi-2025-archive'],
    ['What did the original 2025 MAGI attachments say, and what limits are in MA-3321-1.pdf?', 'magi-2025-archive'],
    ['How do I respond to my Gujarati DHB-5097, and what is its due date?', 'gujarati-dhb-5097'],
    ['Tell me the deadline in my Gujarati DHB-5097 and the process to appeal.', 'gujarati-dhb-5097'],
    ['My Gujarati DHB-5097 has a deadline; when is it and how do I reply?', 'gujarati-dhb-5097'],
    ['Is MA-3321-1.pdf the same as the original 2025 MAGI income limits file?', 'magi-2025-archive'],
    ['Does MA-3321-1.pdf match the original 2025 MAGI income limits posting?', 'magi-2025-archive'],
    ['Download the official Gujarati DHB-5097 form', 'gujarati-dhb-5097'],
    ['Quote the ગુજરાતી 5097 form', 'gujarati-dhb-5097'],
    ['Provide an interpretation of the exact wording of the official Gujarati DHB-5097.', 'gujarati-dhb-5097'],
    ['Under my language-access rights, please provide the official Gujarati DHB-5097 form.', 'gujarati-dhb-5097'],
    ['Could you provide the official Gujarati DHB-5097 form and translation services?', 'gujarati-dhb-5097'],
    ['What language-access rights apply, and interpret the exact wording of my Gujarati DHB-5097 notice?', 'gujarati-dhb-5097'],
    ['What authority does the pharmacist standing order for OTC COVID-19 tests grant?', 'covid-standing-order'],
    ['Was the original order allowing distribution of OTC COVID home tests rescinded?', 'covid-standing-order'],
    ['Was the pharmacist COVID standing order withdrawn?', 'covid-standing-order'],
    ['Quote the Gujarati DHB-5097 and explain what I should do next.', 'gujarati-dhb-5097'],
    ['Did Medicaid pay pharmacists for OTC COVID tests and authorize dispensing them?', 'covid-standing-order'],
    ['What did the original 2025 MAGI attachments say?', 'magi-2025-archive'],
    ['Were the two archived 2025 MAGI income-limit wrappers duplicates?', 'magi-2025-archive'],
  ])('declines unavailable original evidence: %s', (question, id) => {
    expect(scope(question)?.limitationIds).toContain(id);
    expect(scope(question)?.notice).toBeTruthy();
  });

  it('recognizes the four exact source identities without pretending they are retired', () => {
    for (const item of ANSWER_SCOPE_POLICY.limitations) {
      expect(scope(`What does ${item.source_url} say?`)?.limitationIds).toContain(item.id);
    }
  });

  it('keeps procedure research and unrelated policy families available', () => {
    expect(scope('What is DHB-5097 Request for Information?')?.notice).toBeNull();
    expect(scope('I received a DHB-5097 in Gujarati; what should I do?')?.notice).toBeNull();
    expect(scope('I received a DHB-5097 in Gujarati and cannot read it; what should I do?')?.notice).toBeNull();
    expect(scope('What documents do I need to show when I respond to my Gujarati DHB-5097?')?.notice).toBeNull();
    expect(scope('What should I do before the deadline on my Gujarati DHB-5097?')?.notice).toBeNull();
    expect(scope('What happens if I miss the deadline to respond to my Gujarati DHB-5097, and how do I appeal?')?.notice).toBeNull();
    expect(scope('How do I submit my response to the Gujarati DHB-5097 when the deadline has passed?')?.notice).toBeNull();
    expect(scope('How should I respond to my Gujarati DHB-5097 before the deadline?')?.notice).toBeNull();
    expect(scope('How should I respond to my Gujarati DHB-5097?')?.notice).toBeNull();
    expect(scope('Does HCWD impose an earned income cap?')).toBeNull();
    expect(scope('What language access rights apply to Gujarati speakers?')).toBeNull();
    expect(scope('What language-access rights apply when a Gujarati speaker receives DHB-5097?')?.notice).toBeNull();
    expect(scope('Must the agency provide interpreter services when a Gujarati speaker receives DHB-5097?')?.notice).toBeNull();
    expect(scope('What interpretation services are available for a Gujarati speaker receiving DHB-5097?')?.notice).toBeNull();
    expect(scope('Could you provide translation services for my Gujarati DHB-5097?')?.notice).toBeNull();
    expect(scope('Could you provide translation and interpretation services for my Gujarati DHB-5097?')?.notice).toBeNull();
    expect(scope('Under my language-access rights, could you provide interpretation services for a Gujarati speaker receiving DHB-5097?')?.notice).toBeNull();
    expect(scope('What language-access rights apply to obtaining the official Gujarati DHB-5097 form?')?.notice).toBeNull();
    expect(scope('What language access rights apply to Gujarati speakers filling CAP/DA forms?')).toBeNull();
    expect(scope('What is the revision date of the 2025 MAGI income table?')?.notice).toBeNull();
    expect(scope('What does the NON-MAGI income table say?')).toBeNull();
  });

  it('keeps pharmacist payment questions under dated payment evidence', () => {
    const selected = scope('Did Medicaid pay pharmacists for OTC COVID home tests on October 1, 2024?')!;
    expect(selected.notice).toBeNull();
    expect(selected.requestedDate).toBe('2024-10-01');
    expect(selected.requiredSourceUrls).toEqual([ANSWER_SCOPE_POLICY.required_bulletin.source_url]);
    for (const question of ['Under what conditions did Medicaid cover OTC COVID home tests on October 1, 2024?', 'Does Medicaid allow coverage of OTC COVID home tests on October 1, 2024?']) {
      expect(scope(question)?.notice).toBeNull();
      expect(scope(question)?.requiredSourceUrls).toEqual([ANSWER_SCOPE_POLICY.required_bulletin.source_url]);
    }
    expect(scope('Did Medicaid pay pharmacists for OTC COVID home tests in June 2025?')?.notice).toContain('additional dated evidence');
  });

  it('requires complete authoritative dated evidence, not a hint, lookalike URL, or web excerpt', () => {
    const selected = scope('What MAGI income limits apply in October 2026?')!;
    const source = { toolName: 'getSection', text: 'Effective: APRIL 1, 2026\n133% 1769', link: selected.requiredSourceUrls[0] };
    expect(coverageEvidenceIssue(selected, [source])).toBeNull();
    expect(coverageEvidenceIssue(selected, [{ ...source, text: 'Title section' }, source])).toBeNull();
    expect(coverageEvidenceIssue(selected, [{ ...source, toolName: 'resolveAnswerFrame' }])).toBeTruthy();
    expect(coverageEvidenceIssue(selected, [{ ...source, evidenceRole: 'supplementary' }])).toBeTruthy();
    expect(coverageEvidenceIssue(selected, [{ ...source, text: 'Effective: APRIL 1, 2025' }])).toBeTruthy();
    expect(coverageEvidenceIssue(selected, [{ ...source, link: source.link + '.fake' }])).toBeTruthy();
    expect(coverageEvidenceIssue(selected, [{ ...source, toolName: 'searchSections' }])).toBeTruthy();
  });

  it('separates COVID payment coverage from standing-order authority', () => {
    const selected = scope('Did pharmacy POS payment coverage for OTC COVID-19 home tests continue after October 1, 2024?')!;
    expect(selected.notice).toBeNull();
    expect(selected.requiredSourceUrls).toEqual([ANSWER_SCOPE_POLICY.required_bulletin.source_url]);
    expect(coverageEvidenceIssue(selected, [{ toolName: 'getSection', link: selected.requiredSourceUrls[0], text: 'Bulletin summary only' }])).toBeTruthy();
    expect(coverageEvidenceIssue(selected, [{ toolName: 'getSection', link: selected.requiredSourceUrls[0], text: 'Coverage ends Sept. 30, 2024.' }])).toBeNull();
  });

  it.each(['What is OTC COVID home-test payment coverage in 2030?', 'Does Medicaid cover OTC COVID home tests today?', 'What was OTC COVID home-test payment coverage in June 2025?'])('requires additional dated evidence for another payment period: %s', question => {
    expect(scope(question)?.notice).toContain('additional dated evidence');
    expect(scope(question)?.requiredSourceUrls).toEqual([]);
  });

  // Sentences the October 2026 review found refused or re-framed by substring matches.
  it.each([
    'My mom got COVID and now needs care at home. Will Medicaid pay for a home health aide?',
    'Does Medicaid cover at-home nursing for a COVID long-hauler?',
    'Are OTC medications like cough medicine covered by Medicaid if I have COVID?',
    'Are COVID vaccines given at home covered by Medicaid for homebound patients?',
    'Is Paxlovid covered for COVID patients recovering at home?',
    'Under Medicaid expansion, is there a limit on physical therapy visits?',
    'Are there visit limits for physical therapy under Medicaid expansion?',
    'Does Medicaid expansion cover portable oxygen equipment?',
    'What is the copay amount for prescriptions under Medicaid expansion?',
    'Is Medicaid expansion coverage limited for immigrants who arrived in 2019?',
    'Does MAGI count child support as income?',
    'What is Modified Adjusted Gross Income (MAGI)?',
    'What does MAGI stand for?',
  ])('leaves an unrelated question to ordinary research: %s', question => {
    expect(scope(question)).toBeNull();
  });

  it.each([
    'I make $2000 a month. What is the MAGI income limit for a family of 3?',
    'I make 2000 dollars a month. What is the MAGI income limit for a family of 3?',
    'We earn about 2025 a month. What is the MAGI income limit for a family of 3?',
    'My son was born in 2015. Is he under the MAGI income limit for children?',
    'My daughter was born on March 3, 2025. Is she under the MAGI income limit for children?',
    'My son was born 6/1/2025. Is he under the MAGI income limit for children?',
    'Is the MAGI income limit based on income before or after taxes?',
    'What is the income limit for Medicaid expansion after the 5% disregard?',
    'What is the MAGI income limit for a family of 3?',
  ])('reads no period from an amount, a birth year or a bare before/after: %s', question => {
    expect(scope(question)).toMatchObject({ notice: null, requestedDate: '2026-10-03', requiredSourceUrls: [ANSWER_SCOPE_POLICY.magi_tables[1].source_url] });
  });

  it.each([
    ['What is the 2025 MAGI income limit for a household of 2?', '2025-04-01', 0],
    ['I make $2000 a month. What was the MAGI income limit in June 2025?', '2025-06-01', 0],
    ['My son was born in 2015. What MAGI income limit applied to him in 2025?', '2025-04-01', 0],
    ['What was the MAGI income limit in 2025 per month for a family of 3?', '2025-04-01', 0],
    ['Where can I get the 2025 MAGI income limits?', '2025-04-01', 0],
    ['What is the MAGI limit for a family of 3?', '2026-10-03', 1],
    ['What does the MA-3321 table list for a household of one?', '2026-10-03', 1],
  ] as const)('keeps the stated period and the dated table for %s', (question, date, table) => {
    expect(scope(question)).toMatchObject({ notice: null, requestedDate: date, requiredSourceUrls: [ANSWER_SCOPE_POLICY.magi_tables[table].source_url] });
  });

  // Still refused: a stated year outside the supported tables fails closed even when it
  // belongs to another clause, and the review's wider edits to "previous" and to
  // "authorization" were not part of this change.
  it.each([
    'I make $2000 a month. What was the MAGI income limit in 2019?',
    'What were the MAGI income limits before the increase?',
    'What were the previous MAGI income limits?',
    'Medicaid expansion started in December 2023. What is the income limit for a single adult?',
    'Does Medicaid cover COVID tests taken at home?',
    'Does Medicaid cover over-the-counter COVID testing?',
  ])('still states the limitation for %s', question => {
    expect(scope(question)?.notice).toBeTruthy();
    expect(scope(question)?.requiredSourceUrls).toEqual([]);
  });

  it.each([
    'I lost my previous job. Do I meet the Medicaid expansion income limit now?',
    'Do I need prior authorization for Paxlovid after a positive at-home COVID test?',
  ])('states no limitation for %s', question => {
    expect(scope(question)?.notice ?? null).toBeNull();
  });

  it.each([
    'What are the Medicaid expansion limits for 2019?',
    'What was the MAGI eligibility threshold in 2019?',
  ])('still treats %s as a dated income-limit question', question => {
    expect(scope(question)?.notice).toBeTruthy();
  });

  // The scope code reads English only. A Spanish wording resolves nothing, so
  // neither the input block nor the user-text obligation fires for it; the
  // agent applies the scope of the English query the frame tool was called with.
  it.each([
    ['¿Qué tabla de ingresos MAGI se aplica en junio de 2025?', 'What MAGI income table applies in June 2025?', 'MA-3321-1.pdf', '2025-06-01'],
    ['¿Cuál es el límite de ingresos de MAGI para una familia de cuatro en octubre de 2026?', 'What is the MAGI income limit for a household of four in October 2026?', 'MA-3321-MAGI-Income-2.pdf', '2026-10-01'],
    ['¿Medicaid cubría las pruebas caseras de COVID-19 el 1 de octubre de 2024?', 'Did Medicaid cover at-home COVID-19 tests on October 1, 2024?', ANSWER_SCOPE_POLICY.required_bulletin.source_url, '2024-10-01'],
  ])('resolves the dated source from the English restatement of %s', (spanish, english, source, date) => {
    expect(scope(spanish)).toBeNull();
    expect(scope(english)).toMatchObject({ notice: null, requestedDate: date });
    expect(scope(english)?.requiredSourceUrls).toHaveLength(1);
    expect(scope(english)?.requiredSourceUrls[0]).toContain(source);
  });

  it.each([
    ['¿Qué límites de ingresos MAGI se aplican en febrero de 2025?', 'What MAGI income limits apply in February 2025?'],
    ['¿Medicaid cubre las pruebas caseras de COVID-19?', 'Does Medicaid cover at-home COVID-19 tests?'],
  ])('resolves the unsupported period from the English restatement of %s', (spanish, english) => {
    expect(scope(spanish)).toBeNull();
    expect(scope(english)?.notice).toBeTruthy();
    expect(scope(english)?.requiredSourceUrls).toEqual([]);
  });

  it('does not read a visit limit as an income limit', () => {
    expect(scope('What are the Medicaid expansion visit limits for physical therapy?')).toBeNull();
  });

  const DAY = 86_400_000;
  const latestTable = ANSWER_SCOPE_POLICY.magi_tables.reduce((latest, item) => item.supported_until > latest.supported_until ? item : latest);
  const daysOfSupportLeft = (now: number) => (Date.parse(`${latestTable.supported_until}T00:00:00Z`) - now) / DAY;

  it('supports an undated MAGI question through the last reviewed day and not after it', () => {
    const question = 'What is the MAGI income limit for a family of 3?';
    const lastDay = new Date(`${latestTable.supported_until}T00:00:00Z`);
    expect(resolveCoverageScope(question, lastDay)).toMatchObject({ notice: null, requiredSourceUrls: [latestTable.source_url] });
    expect(resolveCoverageScope(question, new Date(lastDay.getTime() + DAY))?.notice).toBeTruthy();
  });

  // Real clock, on purpose: this turns CI red 45 days before undated MAGI questions start being refused.
  it('has at least 45 days of reviewed MAGI table support left', () => {
    expect(daysOfSupportLeft(Date.parse('2020-01-01T00:00:00Z'))).toBeGreaterThan(45);
    expect(daysOfSupportLeft(Date.parse(`${latestTable.supported_until}T00:00:00Z`) - 44 * DAY)).toBeLessThan(45);
    expect(
      daysOfSupportLeft(Date.now()),
      `MAGI table support ends on ${latestTable.supported_until}, fewer than 45 days away; after that day every undated MAGI income-limit question is refused. `
      + 'Do the review that docs/operations/answer-coverage-scope.md requires before extending support (confirm the table at '
      + `${latestTable.source_url} stays in force, or ingest its successor), then change magi_tables[].supported_until for that table, or add the new table's entry, `
      + 'in packages/policy-corpus/src/scope/policy.json, and update the supported dates in the "Runtime behavior" table of that document. '
      + 'The policy hash changes, so stored answer-scope approvals must be prepared again.',
    ).toBeGreaterThanOrEqual(45);
  });

  it('reads a 10,000-character question in linear time', () => {
    const fill = (unit: string, tail = '') => unit.repeat(Math.ceil(10_000 / unit.length)).slice(0, 10_000 - tail.length) + tail;
    const inputs = [
      fill('provide a copy of ', 'zzz'),
      fill('magi income $1,000,000 born in march 3, 1999 original attachment '),
      fill('covid otc home test original standing order magi 2025 '),
      fill('i make about 2000 born on the 3 of march '),
      fill('gujarati 5097 what is the deadline notice form language access interpreter '),
      fill('a'), fill('$'), fill('1'), fill('1,'), fill('make 1'), fill(' '), fill('income '), fill('born in '), fill('born 1/'), fill('original '),
    ];
    for (const input of inputs) {
      const started = performance.now();
      resolveCoverageScope(input, today);
      expect(performance.now() - started, input.slice(0, 40)).toBeLessThan(500);
    }
  });

  it('fails closed when the scoped source is absent from the actual graph', async () => {
    const primitives = { getDocument: vi.fn(), getSection: vi.fn(), getAmendments: vi.fn(), lookupPolicy: vi.fn() } as unknown as LegalPrimitiveService;
    const session = { run: vi.fn().mockResolvedValue({ records: [] }) };
    const withSession: SessionExecutor = fn => fn(session);
    const resolver = createAnswerFrameResolver({ primitives, withSession, searchSectionsDetailed: vi.fn() });
    const result = await resolver.resolveAnswerFrame({ query: 'What MAGI income limits apply in October 2026?' });
    expect(session.run).toHaveBeenCalledWith(expect.stringContaining('d.source_url IN $urls'), { urls: [ANSWER_SCOPE_POLICY.magi_tables[1].source_url] });
    expect(result.primarySections).toEqual([]);
    expect(result.coverageScope?.notice).toContain('not available in this graph');
  });
});
