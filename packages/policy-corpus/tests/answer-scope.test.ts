import { describe, expect, it, vi } from 'vitest';
import { ANSWER_SCOPE_POLICY, coverageEvidenceIssue, resolveCoverageScope } from '../src/scope/coverage.js';
import { createAnswerFrameResolver } from '../src/frame/service.js';
import type { LegalPrimitiveService } from '../src/contracts.js';
import type { SessionExecutor } from '../src/types.js';

const today = new Date('2026-10-03T00:00:00Z');
const scope = (question: string) => resolveCoverageScope(question, today);

describe('bounded answer scope', () => {
  it.each([
    ['What MAGI income table applies in October 2026?', '2026-10-01', 'MA-3321-MAGI-Income-2.pdf'],
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
    ['Download the official Gujarati DHB-5097 form', 'gujarati-dhb-5097'],
    ['Quote the ગુજરાતી 5097 form', 'gujarati-dhb-5097'],
    ['What authority does the pharmacist standing order for OTC COVID-19 tests grant?', 'covid-standing-order'],
    ['Was the pharmacist COVID standing order withdrawn?', 'covid-standing-order'],
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
    expect(scope('Does HCWD impose an earned income cap?')).toBeNull();
    expect(scope('What language access rights apply to Gujarati speakers?')).toBeNull();
    expect(scope('What language-access rights apply when a Gujarati speaker receives DHB-5097?')?.notice).toBeNull();
    expect(scope('What language access rights apply to Gujarati speakers filling CAP/DA forms?')).toBeNull();
    expect(scope('What is the revision date of the 2025 MAGI income table?')?.notice).toBeNull();
    expect(scope('What does the NON-MAGI income table say?')).toBeNull();
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
