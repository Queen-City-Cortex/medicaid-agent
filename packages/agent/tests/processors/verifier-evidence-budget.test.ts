import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildSourceText,
  extractSourcesFromToolResults,
  validateAnswerQuotes,
  validateAnswerUrls,
  type SourceEntry,
} from '../../src/processors/hallucination-verifier.js';
import { runVerificationForAnswer } from '../../src/processors/verifier/run.js';
import { log } from '../../src/logger.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const CLEAN = { supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };
const PART_441 = 'https://www.ecfr.gov/current/title-42/part-441';
const BODY = 'The agency must furnish CMS with sufficient information to support the assurances, including licensure standards and financial accountability records.';
const listing = (toolName: string, key: string, filler: string): SourceEntry => ({
  toolName, key, link: PART_441, text: `[${toolName}]\nID: ${key}\nSections (400):\n${filler.repeat(600)}`,
});
// The recorded q-010 shape: every entry shares the cited document link, the
// section listings come first in tool-call order, and the body comes last.
const Q010: SourceEntry[] = [
  listing('lookupPolicy', 'doc:federal_regulation:42-CFR-441', '  441.301 Contents of request for a waiver\n'),
  listing('getDocument', 'doc:federal_regulation:42-CFR-441:toc', '  441.302 State assurances (6524 chars)\n'),
  { toolName: 'getSection', key: 'sec:doc:federal_regulation:42-CFR-441:441.303', link: PART_441,
    text: `[getSection]\nID: sec:doc:federal_regulation:42-CFR-441:441.303\nTitle: Supporting documentation required\n\nContent:\n${BODY}` },
];
const Q010_ANSWER = `States must document licensure standards and financial accountability. [42 CFR § 441.303](${PART_441})`;
// Fits the body and one listing, but not both listings.
const budget = Q010[0].text.length + Q010[2].text.length + 100;

describe('verifier evidence budget', () => {
  it('keeps a cited section body ahead of section listings that share its link', () => {
    expect(Q010[0].text.length + Q010[1].text.length).toBeGreaterThan(budget);
    const evidence = buildSourceText(Q010, Q010_ANSWER, budget);
    expect(evidence.text).toContain(BODY);
    expect(evidence.text.indexOf(BODY)).toBeLessThan(evidence.text.indexOf('[lookupPolicy]'));
    expect(evidence.dropped.map(source => source.toolName)).toEqual(['getDocument']);
    expect(evidence.citedBodyDropped).toBe(false);
    expect(evidence.text).toContain('[1 source(s) omitted for length; claims that depend on omitted sources are unsupported.]');
  });

  it('orders cited bodies, cited other entries, uncited bodies, then the rest', () => {
    const sources: SourceEntry[] = [
      { toolName: 'followReferences', key: 'followReferences:1', text: 'REST' },
      { toolName: 'getSection', key: 'sec:other', link: 'https://example.gov/other', text: 'UNCITED-BODY' },
      { toolName: 'lookupPolicy', key: 'doc:cited', link: 'https://example.gov/cited', text: 'CITED-LISTING' },
      { toolName: 'resolveAnswerFrame:section', key: 'sec:cited', link: 'https://example.gov/cited', text: 'CITED-BODY' },
    ];
    const { text } = buildSourceText(sources, 'A claim. [Policy](https://example.gov/cited)', 10_000);
    const order = ['CITED-BODY', 'CITED-LISTING', 'UNCITED-BODY', 'REST'].map(marker => text.indexOf(marker));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order[0]).toBe(0);
  });

  it('skips an oversized entry instead of stopping at it', () => {
    const sources: SourceEntry[] = [
      { toolName: 'getSection', key: 'sec:huge', text: 'HUGE-' + 'x'.repeat(500) },
      { toolName: 'getSection', key: 'sec:small', text: 'SMALL-BODY' },
    ];
    const evidence = buildSourceText(sources, 'No citations.', 200);
    expect(evidence.text).toContain('SMALL-BODY');
    expect(evidence.text).not.toContain('HUGE-');
    expect(evidence.dropped.map(source => source.key)).toEqual(['sec:huge']);
    expect(evidence.citedBodyDropped).toBe(false);
  });

  it('sends the cited 441.303 body to the verifier when listings exceed the budget', async () => {
    vi.stubEnv('VERIFIER_MAX_SOURCE_TOKENS', String(Math.floor(budget / 4)));
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const verify = vi.fn().mockResolvedValue(CLEAN);
    const result = await runVerificationForAnswer({ question: 'What must a waiver request document?', answerText: Q010_ANSWER, sources: Q010, verify });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0][2]).toContain(BODY);
    expect(result.outcome).toEqual({ status: 'passed', passCount: 1 });
    expect(result.telemetry.evidence_entries_dropped).toBe(1);
    expect(result.telemetry.evidence_chars_sent).toBe(verify.mock.calls[0][2].length);
    expect(result.telemetry.evidence_chars_sent).toBeLessThan(result.telemetry.evidence_bytes);
    expect(warn).toHaveBeenCalledWith('verifier.evidence_dropped', expect.objectContaining({ entriesDropped: 1, citedBodyDropped: false }));
  });

  it('withholds without a model call when a cited section body does not fit', async () => {
    const big: SourceEntry = { toolName: 'getSection', key: 'sec:big', link: PART_441, text: `[getSection]\nContent:\n${'Requirement text. '.repeat(400)}` };
    vi.stubEnv('VERIFIER_MAX_SOURCE_TOKENS', String(Math.floor(big.text.length / 8)));
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    const verify = vi.fn().mockResolvedValue(CLEAN);
    const result = await runVerificationForAnswer({ question: 'What must a waiver request document?', answerText: Q010_ANSWER, sources: [Q010[2], big], verify });
    expect(verify).not.toHaveBeenCalled();
    expect(result.outcome).toEqual({ status: 'withheld', reason: 'unsupported', passCount: 0 });
    expect(result.retryable).toBe(false);
    expect(result.finalAnswer).not.toContain('licensure');
    expect(result.telemetry).toMatchObject({ evidence_entries_dropped: 1, evidence_chars_sent: 0, verifier_unavailable: false });
  });

  it('still verifies when only an uncited body is dropped', async () => {
    const uncited: SourceEntry = { toolName: 'getSection', key: 'sec:uncited', link: 'https://example.gov/unrelated', text: 'Unrelated. '.repeat(400) };
    vi.stubEnv('VERIFIER_MAX_SOURCE_TOKENS', String(Math.floor(uncited.text.length / 8)));
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    const verify = vi.fn().mockResolvedValue(CLEAN);
    const result = await runVerificationForAnswer({ question: 'What must a waiver request document?', answerText: Q010_ANSWER, sources: [uncited, Q010[2]], verify });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(result.outcome.status).toBe('passed');
    expect(result.telemetry.evidence_entries_dropped).toBe(1);
  });

  it.each([
    ['a trailing slash', 'https://www.ecfr.gov/current/title-42/part-441', 'https://www.ecfr.gov/current/title-42/part-441/'],
    ['host case', 'https://WWW.ECFR.GOV/current/title-42/part-441', 'https://www.ecfr.gov/current/title-42/part-441'],
    ['percent-encoding', 'https://medicaid.ncdhhs.gov/clinical%20policy%208C.pdf', 'https://medicaid.ncdhhs.gov/clinical policy 8C.pdf'],
  ])('treats a body as cited when the answer link differs only by %s, and withholds when it does not fit', async (_variant, answerUrl, link) => {
    const big: SourceEntry = { toolName: 'getSection', key: 'sec:big', link, text: `[getSection]\nContent:\n${'Requirement text. '.repeat(400)}` };
    const small: SourceEntry = { toolName: 'getSection', key: 'sec:small', link: 'https://example.gov/other', text: '[getSection]\nContent:\nOther text.' };
    vi.stubEnv('VERIFIER_MAX_SOURCE_TOKENS', String(Math.floor(big.text.length / 8)));
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    const verify = vi.fn().mockResolvedValue(CLEAN);
    const answerText = `The requirement applies. [Policy](${answerUrl})`;
    expect(validateAnswerUrls(answerText, [small, big]).unknownUrls).toEqual([]);
    const result = await runVerificationForAnswer({ question: 'What is required?', answerText, sources: [small, big], verify });
    expect(verify).not.toHaveBeenCalled();
    expect(result.outcome).toEqual({ status: 'withheld', reason: 'unsupported', passCount: 0 });
    expect(result.finalAnswer).not.toContain('requirement applies');
  });

  it('treats a body as cited when the answer uses a link that appears only in its text', () => {
    const body: SourceEntry = { toolName: 'getSection', key: 'sec:8c', link: 'https://example.gov/documents/8c',
      text: `[getSection]\nCitation link: [Policy 8C § 3.2](https://example.gov/8c.pdf?section=3.2)\n\nContent:\n${'x'.repeat(300)}` };
    const evidence = buildSourceText([body], 'Covered. [Policy 8C § 3.2](https://example.gov/8c.pdf?section=3.2)', 100);
    expect(evidence.citedBodyDropped).toBe(true);
  });

  it('withholds a correction that cites a body which does not fit, after one model call', async () => {
    const big: SourceEntry = { toolName: 'getSection', key: 'sec:big', link: 'https://example.gov/big', text: `[getSection]\nContent:\n${'Requirement text. '.repeat(400)}` };
    vi.stubEnv('VERIFIER_MAX_SOURCE_TOKENS', String(Math.floor(big.text.length / 8)));
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    const correction = 'CORRECTED: the requirement applies. [Big](https://example.gov/big)';
    const verify = vi.fn().mockResolvedValue({ ...CLEAN, supported: false, unsupportedClaims: [{ claim: 'licensure', reason: 'absent' }], correctedAnswer: correction });
    const result = await runVerificationForAnswer({ question: 'What must a waiver request document?', answerText: Q010_ANSWER, sources: [Q010[2], big], verify });
    // Pass one drops only the uncited body; the correction then cites it.
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0][2]).toContain(BODY);
    expect(result.outcome).toEqual({ status: 'withheld', reason: 'unsupported', passCount: 1 });
    expect(result.finalAnswer).not.toContain('CORRECTED');
    expect(result.finalAnswer).not.toContain('licensure');
    expect(result.telemetry.evidence_entries_dropped).toBe(1);
  });

  describe('research report evidence', () => {
    const finding = (n: number, size: number): SourceEntry => ({ toolName: 'researchFinding', key: `finding:${n}`, text: `[researchFinding]\nFINDING-${n} ${'Verified finding. '.repeat(size)}` });
    const web: SourceEntry = { evidenceRole: 'supplementary', toolName: 'webSearch', key: 'web:https://example.gov/recent', link: 'https://example.gov/recent', text: 'Recent guidance excerpt.' };
    const report = `Report. [42 CFR § 441.303](${PART_441}) [Guidance](https://example.gov/recent)`;

    it('withholds without a model call when a finding does not fit: a report is never checked against part of its findings', async () => {
      const findings = [finding(1, 5), finding(2, 400)];
      vi.stubEnv('VERIFIER_MAX_SOURCE_TOKENS', String(Math.floor(findings[1].text.length / 8)));
      vi.spyOn(log, 'warn').mockImplementation(() => {});
      const verify = vi.fn().mockResolvedValue(CLEAN);
      const result = await runVerificationForAnswer({ question: 'What must a waiver request document?', answerText: report, sources: [Q010[2], web], verifierSources: [...findings, web], verify });
      expect(verify).not.toHaveBeenCalled();
      expect(result.outcome).toEqual({ status: 'withheld', reason: 'unsupported', passCount: 0 });
      expect(result.retryable).toBe(false);
      expect(result.telemetry.evidence_entries_dropped).toBe(1);
    });

    it('gives findings the budget before cited web excerpts', () => {
      const findings = [finding(1, 5), finding(2, 5)];
      const evidence = buildSourceText([web, ...findings], report, findings[0].text.length + findings[1].text.length + 20);
      expect(evidence.text).toContain('FINDING-1');
      expect(evidence.text).toContain('FINDING-2');
      expect(evidence.dropped).toEqual([web]);
      expect(evidence).toMatchObject({ findingDropped: false, citedBodyDropped: false });
    });

    it('sends a normal-size report to the model with every finding', async () => {
      const findings = [finding(1, 50), finding(2, 50)];
      const verify = vi.fn().mockResolvedValue(CLEAN);
      const result = await runVerificationForAnswer({ question: 'What must a waiver request document?', answerText: report, sources: [Q010[2], web], verifierSources: [...findings, web], verify });
      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify.mock.calls[0][2]).toContain('FINDING-1');
      expect(verify.mock.calls[0][2]).toContain('FINDING-2');
      expect(verify.mock.calls[0][2]).toContain('"evidenceRole":"supplementary"');
      expect(result.outcome).toEqual({ status: 'passed', passCount: 1 });
      expect(result.telemetry.evidence_entries_dropped).toBe(0);
    });
  });

  it('accepts a quoted section title that appears only in a lookupPolicy listing', () => {
    const title = 'Supporting documentation required for a waiver request';
    const sources = extractSourcesFromToolResults([{ toolName: 'lookupPolicy', toolCallId: 'call-1', result: { documents: [{
      id: 'doc:federal_regulation:42-CFR-441', title: '42 CFR Part 441', documentType: 'federal_regulation', policyNumber: null,
      effectiveDate: null, url: PART_441, status: 'active',
      sections: [{ id: 'sec:doc:federal_regulation:42-CFR-441:441.303', number: '441.303', title }],
    }] } }]);
    expect(sources).toHaveLength(1);
    expect(sources[0].text).toContain(`  441.303 ${title} [sec:doc:federal_regulation:42-CFR-441:441.303]`);
    const quotes = validateAnswerQuotes(`Section 441.303 is titled "${title}". [42 CFR Part 441](${PART_441})`, sources);
    expect(quotes).toMatchObject({ checkedQuoteCount: 1, unknownQuotes: [] });
  });
});
