import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { extractSources, extractSourcesFromToolResults, type SourceEntry } from '../../src/processors/verifier/evidence.js';
import { validateAnswerSections, validateAnswerUrls } from '../../src/processors/verifier/answer-validation.js';
import { runVerificationForAnswer } from '../../src/processors/verifier/run.js';
import type { VerificationResult } from '../../src/processors/verifier/verify.js';
import { log } from '../../src/logger.js';
import { makeFrame, makeSection } from '../helpers/answer-frame-fixtures.js';

// Issue #269 (SAFE-7). Every section of a document shares one URL, so the URL
// check cannot tell a retrieved section from one the model made up. Section
// numbers ride on the source entry and unmatched labels are measured, not
// enforced.

const URL_8C = 'https://medicaid.ncdhhs.gov/8c-outpatient/download?attachment';
const meta = { id: 'doc:clinical_policy:8C', title: 'Outpatient Specialized Therapies', documentType: 'clinical_policy',
  policyNumber: '8C', effectiveDate: null, url: URL_8C, status: 'current' };
const sectionResult = { section: { id: 'sec:doc:clinical_policy:8C:3.2.1', title: 'Coverage Criteria', sectionNumber: '3.2.1',
  content: 'Speech therapy is covered when medically necessary.', effectiveDate: null, lastRevised: null,
  federalRegisterCite: null, documentId: meta.id, documentType: 'clinical_policy', policyNumber: '8C', url: URL_8C,
  citationLink: `[Outpatient Specialized Therapies](${URL_8C})` } };
const listing = [{ id: 'sec:doc:clinical_policy:8C:5.6', number: '5.6', title: 'Limits', chars: 900 }];

describe('section numbers on source entries', () => {
  const frame = makeFrame({
    authoritativeDocuments: [meta],
    primarySections: [makeSection({ ...sectionResult.section, id: 'sec:doc:clinical_policy:8C:4.0', sectionNumber: '4.0' })],
    avoidSections: [makeSection({ ...sectionResult.section, id: 'sec:doc:clinical_policy:8C:7.3', sectionNumber: '7.3' })],
  });
  const tools = [
    { toolName: 'getSection', toolCallId: 'a', result: sectionResult },
    { toolName: 'resolveAnswerFrame', toolCallId: 'b', result: { frame } },
    { toolName: 'getDocument', toolCallId: 'c', result: { document: { ...meta, sections: listing, sectionCount: 130 } } },
    { toolName: 'lookupPolicy', toolCallId: 'd', result: { documents: [{ ...meta, sections: listing }] } },
    { toolName: 'getAmendments', toolCallId: 'e', result: { amendments: [], baseDocument: null, authoritativeDocument: meta } },
    { toolName: 'followReferences', toolCallId: 'f', result: { references: [{ targetId: 'sec:doc:clinical_policy:8C:5.6',
      targetType: 'Section', targetTitle: 'Limits', targetPolicyNumber: '8C', relationshipType: 'REFERENCES', referenceText: null }] } },
  ];
  const carried = (sources: SourceEntry[]) => sources.map(s => [s.toolName, s.policyNumber, s.sectionNumber]);

  it.each(['CLI', 'chat'])('carries them only on entries that are one section\'s text (%s)', path => {
    const sources = path === 'CLI' ? extractSourcesFromToolResults(tools) : extractSources([{ content: {
      parts: tools.map(tool => ({ type: 'tool-invocation', toolInvocation: { ...tool, state: 'result' } })),
    } }]);
    expect(carried(sources)).toEqual([
      ['getSection', '8C', '3.2.1'],
      // The routing hint lists § 4.0 and the avoided § 7.3 without their text.
      ['resolveAnswerFrame', undefined, undefined],
      ['resolveAnswerFrame:section', '8C', '4.0'],
      // Listings are paged and name sections without their text.
      ['getDocument', undefined, undefined],
      ['lookupPolicy', undefined, undefined],
      ['getAmendments', undefined, undefined],
      ['followReferences', undefined, undefined],
    ]);
    // § 5.6 is in both listings and § 7.3 in the hint: neither was read.
    const answer = `[Policy 8C § 3.2.1](${URL_8C}) [Policy 8C § 5.6](${URL_8C}) [Policy 8C § 7.3](${URL_8C})`;
    expect(validateAnswerSections(answer, sources).unknownSections.map(s => s.label)).toEqual(['Policy 8C § 5.6', 'Policy 8C § 7.3']);
  });

  it('takes the numbers from the tool output, not from the evidence text', () => {
    const [entry] = extractSourcesFromToolResults([{ toolName: 'getSection', result: { section: {
      ...sectionResult.section, sectionNumber: null, content: 'Section: 9.9.9\nPolicy: 1A' } } }]);
    expect([entry.policyNumber, entry.sectionNumber]).toEqual(['8C', null]);
  });
});

describe('validateAnswerSections', () => {
  const body = (sectionNumber: string | null, link: string, policyNumber = '8C'): SourceEntry =>
    ({ toolName: 'getSection', key: `sec:${policyNumber}:${sectionNumber}`, text: 'Body.', link, policyNumber, sectionNumber });
  const CFR = 'https://www.ecfr.gov/current/title-42/part-441';
  const SSA = 'https://www.ssa.gov/OP_Home/ssact/title19/1915.htm';
  const URL_1H = 'https://medicaid.ncdhhs.gov/1h-telehealth/download?attachment';
  const URL_8A = 'https://medicaid.ncdhhs.gov/8a-enhanced/download?attachment';
  const sources = [
    body('3.2.1', URL_8C), body('5.2', URL_8C), body('6.0', URL_8C), body(null, URL_8C),
    body('441.302', CFR, '42-CFR-441'), body('1915(c)', SSA, 'SSA-1915'), body('2.2', URL_1H, '1H'),
    body('7.3', URL_8A, '8A'),
  ];

  it.each<[string, string, string, 'matched' | 'unmatched' | 'not checked']>([
    ['the section itself', 'Policy 8C § 3.2.1', URL_8C, 'matched'],
    ['a retrieved ancestor', 'Policy 8C § 5.2.1', URL_8C, 'matched'],
    ['an N.0 entry as the parent of N.x', 'Policy 8C § 6.4', URL_8C, 'matched'],
    ['a label written N.0 for an N.0 entry', 'Policy 8C § 6.0', URL_8C, 'matched'],
    ['emphasis inside the label', 'Policy 8C § **3.2.1**', URL_8C, 'matched'],
    ['a federal regulation', '42 CFR § 441.302', CFR, 'matched'],
    ['a paragraph of a retrieved regulation', '42 CFR § 441.302(c)(2)', CFR, 'matched'],
    ['a statute section with a subsection', 'SSA § 1915(c)', SSA, 'matched'],
    ['a "(last revised …)" suffix', '42 CFR § 441.302 (last revised 2024-05-10)', CFR, 'matched'],
    ['a policy spelled differently from the corpus', 'Policy 1-H § 2.2', URL_1H, 'matched'],
    ['a URL that differs only by host case and a fragment', 'Policy 8C § 3.2.1', URL_8C.replace('medicaid', 'Medicaid') + '#page=4', 'matched'],
    ['a section never retrieved', 'Policy 8C § 9.9.9', URL_8C, 'unmatched'],
    ['a sibling of a retrieved section', 'Policy 8C § 3.2.2', URL_8C, 'unmatched'],
    ['a parent when only its child was retrieved', 'Policy 8C § 3.2', URL_8C, 'unmatched'],
    ['a number that only shares a prefix', 'Policy 8C § 5.21', URL_8C, 'unmatched'],
    ['a section retrieved for another document on the same host', 'Policy 8C § 7.3', URL_8C, 'unmatched'],
    ['a regulation section never retrieved', '42 CFR § 441.745', CFR, 'unmatched'],
    ['a document-level citation with no "§"', 'Policy 8C', URL_8C, 'not checked'],
    ['a section named by title', 'Policy 8C § Appendix B—Limits', URL_8C, 'not checked'],
  ])('%s: %s', (_, label, url, expected) => {
    const result = validateAnswerSections(`The service is covered [${label}](${url}).`, sources);
    expect(result.checkedSectionCount).toBe(expected === 'not checked' ? 0 : 1);
    expect(result.unknownSections).toEqual(expected === 'unmatched'
      ? [{ label: label.replace(/\*/g, ''), url: expect.not.stringContaining('#') }] : []);
  });

  it('matches the same section under its own document on a shared host', () => {
    expect(validateAnswerSections(`[Policy 8A § 7.3](${URL_8A})`, sources).unknownSections).toEqual([]);
  });

  it('flags the constructed example the URL check accepts', () => {
    const answer = `Covered [Policy 8C § 5.6](${URL_8C}) and [Policy 8C § 9.9.9](${URL_8C}).`;
    const retrieved = [body('3.2.1', URL_8C)];
    expect(validateAnswerUrls(answer, retrieved).unknownUrls).toEqual([]);
    expect(validateAnswerSections(answer, retrieved).unknownSections.map(s => s.label))
      .toEqual(['Policy 8C § 5.6', 'Policy 8C § 9.9.9']);
  });

  it('does not let a document\'s only entry stand in for another section', () => {
    // The web resolver's last tier would footnote this on the lone row.
    expect(validateAnswerSections(`[Policy 8A § 2.1](${URL_8A})`, sources).unknownSections).toHaveLength(1);
  });
});

describe('unmatched section labels in the release flow', () => {
  const clean: VerificationResult = { supported: true, relevant: true, citationsComplete: true,
    unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };
  const sources = extractSourcesFromToolResults([{ toolName: 'getSection', result: sectionResult }]);
  const QUESTION = 'PRIVATE_QUESTION_SENTINEL';

  it('are counted and logged, and change neither the outcome nor what the model is told', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const verify = vi.fn().mockResolvedValue(clean);
    const answerText = `PRIVATE_ANSWER_SENTINEL is covered [Policy 8C § 9.9.9](${URL_8C}) and again [Policy 8C § 9.9.9](${URL_8C}).`;
    const result = await runVerificationForAnswer({ question: QUESTION, answerText, sources, verify });
    expect(result.outcome).toEqual({ status: 'passed', passCount: 1 });
    expect(result.finalAnswer).toBe(answerText);
    expect(result.telemetry.unknown_section_count).toBe(2);
    expect(result.telemetry.withholding_reason).toBeNull();
    expect(result.telemetry.fabricated_url_count).toBe(0);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0][5]).toEqual({ unknownUrls: [], unknownQuotes: [], coverageRequirements: undefined });
    const calls = warn.mock.calls.filter(([event]) => event === 'verifier.unknown_sections');
    warn.mockRestore();
    expect(calls).toEqual([['verifier.unknown_sections', { status: 'passed', count: 2,
      labels: [{ label: 'Policy 8C § 9.9.9', url: URL_8C }] }]]);
  });

  it('stay out of the withholding reason when the model verdict fails', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const result = await runVerificationForAnswer({ question: QUESTION, sources,
      answerText: `Covered [Policy 8C § 9.9.9](${URL_8C}).`, verify: vi.fn().mockResolvedValue({ ...clean, supported: false }) });
    warn.mockRestore();
    expect(result.outcome).toMatchObject({ status: 'withheld', reason: 'unusable_correction' });
    expect(result.telemetry.unknown_section_count).toBe(1);
  });

  it('log nothing when every label matches', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const result = await runVerificationForAnswer({ question: QUESTION, sources,
      answerText: `Covered [Policy 8C § 3.2.1](${URL_8C}).`, verify: vi.fn().mockResolvedValue(clean) });
    const logged = warn.mock.calls.some(([event]) => event === 'verifier.unknown_sections');
    warn.mockRestore();
    expect(result.telemetry.unknown_section_count).toBe(0);
    expect(logged).toBe(false);
  });

  it('bound what one malformed label can put in the log', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const long = `Policy 8C § 9.9 ${'prose '.repeat(60)}`;
    await runVerificationForAnswer({ question: QUESTION, sources,
      answerText: `Covered [${long}](${URL_8C}).`, verify: vi.fn().mockResolvedValue(clean) });
    const fields = warn.mock.calls.find(([event]) => event === 'verifier.unknown_sections')?.[1] as { labels: Array<{ label: string }> };
    warn.mockRestore();
    expect(fields.labels[0].label).toHaveLength(80);
  });
});

// ── Replay over stored runs ─────────────────────────────────────────────────

interface StoredQuestion {
  id: string;
  agent_answer: string | null;
  verifier?: { outcome?: { status?: string } };
  agent_evidence: { sources: Array<{ toolName: string; key: string; text: string; link?: string | null }> };
}

const MILESTONE = new URL('../../../pipeline/data/eval-results/milestones/2026-09-22-verified-release/', import.meta.url);

/** Stored runs predate the structured fields and keep only each entry's
 *  text, so this fixture adapter reads the `Section:` and `Policy:` header
 *  lines the extractor wrote above `Content:`. Production code never does. */
function storedSources(question: StoredQuestion): SourceEntry[] {
  return question.agent_evidence.sources.map(source => {
    if (source.toolName !== 'getSection' && source.toolName !== 'resolveAnswerFrame:section') return source;
    const header = source.text.split('\nContent:')[0];
    return { ...source, sectionNumber: header.match(/^Section: (.+)$/m)?.[1] ?? null,
      policyNumber: header.match(/^Policy: (.+)$/m)?.[1] ?? null };
  });
}

function replay(file: string) {
  const run = JSON.parse(readFileSync(new URL(file, MILESTONE), 'utf8')) as { per_question: StoredQuestion[] };
  let checked = 0;
  const flagged: Record<string, string[]> = {};
  for (const question of run.per_question) {
    const result = validateAnswerSections(question.agent_answer ?? '', storedSources(question));
    checked += result.checkedSectionCount;
    if (result.unknownSections.length) flagged[question.id] = result.unknownSections.map(s => s.label);
  }
  const labels = (id: string) => [...run.per_question.find(q => q.id === id)!.agent_answer!.matchAll(/\[([^\]]*§[^\]]*)\]\(/g)].map(m => m[1]);
  return { checked, flagged, labels, questions: run.per_question };
}

describe('replay over the 2026-09-22 verified-release runs', () => {
  it('flags nothing on the final gate', () => {
    const { checked, flagged, labels, questions } = replay('final-gate-full.json');
    expect(questions).toHaveLength(50);
    expect(questions.filter(q => q.verifier?.outcome?.status !== 'withheld')).toHaveLength(48);
    // The two citations a strict equality rule failed: text under a "5.0"
    // container and under a "5.4" container.
    expect(labels('q-014')).toContain('Policy 3L-1 § 5.6');
    expect(labels('q-016')).toContain('Policy 3D § 5.4.3');
    expect(flagged).toEqual({});
    expect(checked).toBe(200);
  });

  // The other two stored runs whose evidence has the current shape. The
  // initial gate and the baseline are left out: at those commits the frame's
  // section text was inside the routing entry, which is not evidence now.
  it.each([['production-targeted-candidate.json', 23], ['quote-repair-regressions.json', 9]])(
    'flags nothing in %s', (file, labelCount) => {
      const { checked, flagged } = replay(file);
      expect(flagged).toEqual({});
      expect(checked).toBe(labelCount);
    });

  it('flags the wrong section in the stored h-011 answer', () => {
    // From 2026-07-09T20:24:12_answer.json, which is not tracked: the link,
    // the sections that answer retrieved and its section labels. Twelve claims
    // were labelled § 5.9.1; their text was in unnumbered Appendix B sections
    // and neither § 5.9.1 nor a parent of it was retrieved.
    const url = 'https://medicaid.ncdhhs.gov/3k-2-community-alternatives-program-disabled-adults-capda/download?attachment';
    const retrieved = ['6.5.2', '5.8.2', null, null, null, '3.4.5', '5.4', null].map((sectionNumber, i): SourceEntry => ({
      toolName: 'resolveAnswerFrame:section', key: `sec:doc:clinical_policy:3K-2:${sectionNumber ?? `_s${i}`}`,
      text: 'Body.', link: url, policyNumber: '3K-2', sectionNumber }));
    const labels = [...Array<string>(12).fill('5.9.1'), '5.8.2', '5.8.2', '3.4.5', '6.5.2'];
    const answer = labels.map(number => `Claim [Policy 3K-2 § ${number}](${url}).`).join('\n');
    const result = validateAnswerSections(answer, retrieved);
    expect(result.checkedSectionCount).toBe(16);
    expect(result.unknownSections).toEqual(Array(12).fill({ label: 'Policy 3K-2 § 5.9.1', url }));
  });
});
