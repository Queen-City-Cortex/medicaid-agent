import { describe, it, expect } from 'vitest';
import {
  buildSourceText,
  extractSources,
  extractSourcesFromToolResults,
  type ToolResultRecord,
} from '../../src/processors/verifier/evidence.js';
import { validateAnswerQuotes, validateAnswerSections } from '../../src/processors/verifier/answer-validation.js';

// getSection returns a window of a section's text. Each window that was read
// must reach the verifier labelled with its range; windows that touch are one
// entry, so a quotation across the boundary can be checked; and nothing may
// suggest that text outside the windows was read.

const URL = 'https://www.ecfr.gov/current/title-42/part-438';
const SECTION_ID = 'sec:doc:federal_regulation:42-438:438.8';
// 18,400 characters with one sentence across the 6,000 boundary and one near the end.
const BOUNDARY_SENTENCE = 'the numerator of the MLR is the sum of incurred claims and quality expenditures';
const LATE_SENTENCE = 'the MCO must remit the difference to the State for that MLR reporting year';
const TEXT = [
  'a'.repeat(5960),
  BOUNDARY_SENTENCE,
  'b'.repeat(9040 - BOUNDARY_SENTENCE.length + 40),
  LATE_SENTENCE,
  'c'.repeat(18400 - 15040 - LATE_SENTENCE.length),
].join('');

function windowResult(offset: number, length = 6000, text = TEXT, id = SECTION_ID) {
  const chars = Array.from(text);
  const end = Math.min(offset + length, chars.length);
  return {
    section: {
      id,
      title: 'Medical loss ratio (MLR) standards',
      sectionNumber: '438.8',
      content: chars.slice(offset, end).join(''),
      contentOffset: offset,
      totalChars: chars.length,
      nextOffset: end < chars.length ? end : null,
      contentNote: null,
      effectiveDate: null,
      lastRevised: null,
      federalRegisterCite: null,
      documentId: 'doc:federal_regulation:42-438',
      documentType: 'federal_regulation',
      policyNumber: null,
      url: URL,
      citationLink: null,
    },
  };
}

const read = (offset: number, length?: number): ToolResultRecord =>
  ({ toolName: 'getSection', toolCallId: `c${offset}`, result: windowResult(offset, length) });

describe('section windows as verifier evidence', () => {
  it('has the fixture the tests assume', () => {
    expect(TEXT).toHaveLength(18400);
    expect(TEXT.indexOf(BOUNDARY_SENTENCE)).toBeLessThan(6000);
    expect(TEXT.indexOf(BOUNDARY_SENTENCE) + BOUNDARY_SENTENCE.length).toBeGreaterThan(6000);
    expect(TEXT.indexOf(LATE_SENTENCE)).toBeGreaterThan(12000);
  });

  it('shows the read note of a heading read as the sections under it, so omitted sections are visible', () => {
    const container = windowResult(0, 6000, '### 4.2.1\nFirst criterion.\n### 4.2.2\nSecond criterion.');
    container.section.contentNote = 'This heading has no text of its own. The text is that of the 2 sections under it, each below a "###" line with its title: 4.2.1; 4.2.2. 3 more sections under it are not included; getDocument lists every section of the document, to read by id.' as never;
    const [entry] = extractSourcesFromToolResults([{ toolName: 'getSection', toolCallId: 'c', result: container }]);

    expect(entry.text).toContain('Read note: This heading has no text of its own.');
    expect(entry.text).toContain('3 more sections under it are not included');
    // An ordinary whole read carries no note line.
    expect(extractSourcesFromToolResults([read(0, 20000)])[0].text).not.toContain('Read note:');
  });

  it('labels a partial read with its range and keys it by that range', () => {
    const [entry] = extractSourcesFromToolResults([read(0)]);

    expect(entry.key).toBe(`${SECTION_ID}#chars=0-6000`);
    expect(entry.text).toContain("Chars: 0-6000 of 18400 (partial: the rest of this section's text was not retrieved)");
    expect(entry.text.endsWith(TEXT.slice(0, 6000))).toBe(true);
    expect(entry).toMatchObject({ toolName: 'getSection', sectionNumber: '438.8', link: URL });
  });

  it('leaves a read of a whole section unlabelled under its bare id', () => {
    const [entry] = extractSourcesFromToolResults([
      { toolName: 'getSection', result: windowResult(0, 6000, 'Short section.') },
    ]);

    expect(entry.key).toBe(SECTION_ID);
    expect(entry.text).not.toContain('Chars:');
  });

  it('keeps two separate windows of one section as two entries that both reach the verifier', () => {
    const sources = extractSourcesFromToolResults([read(0), read(12000)]);

    expect(sources.map(source => source.key)).toEqual([`${SECTION_ID}#chars=0-6000`, `${SECTION_ID}#chars=12000-18000`]);
    // Deep research keeps the first entry per key; distinct keys keep both windows.
    expect(new Map(sources.map(source => [source.key, source])).size).toBe(2);
    const evidence = buildSourceText(sources, `See [42 CFR § 438.8](${URL}).`);
    expect(evidence.dropped).toEqual([]);
    expect(evidence.text).toContain('Chars: 0-6000 of 18400');
    expect(evidence.text).toContain('Chars: 12000-18000 of 18400');
    expect(evidence.text).toContain(LATE_SENTENCE);
    // Characters 6000-12000 were never read and are not in the evidence.
    expect(evidence.text).not.toContain(BOUNDARY_SENTENCE);
  });

  it('joins windows that touch so a quotation across the boundary can be checked', () => {
    const answer = `The rule says "${BOUNDARY_SENTENCE}" [42 CFR § 438.8](${URL}).`;

    const both = extractSourcesFromToolResults([read(0), read(6000)]);
    expect(both).toHaveLength(1);
    expect(both[0].key).toBe(`${SECTION_ID}#chars=0-12000`);
    expect(both[0].text).toContain('Chars: 0-12000 of 18400 (partial');
    expect(both[0].text.endsWith(TEXT.slice(0, 12000))).toBe(true);
    expect(validateAnswerQuotes(answer, both)).toEqual({ unknownQuotes: [], checkedQuoteCount: 1 });

    // With one window the quotation is not in the evidence, in either order of reading.
    expect(validateAnswerQuotes(answer, extractSourcesFromToolResults([read(0)])).unknownQuotes).toEqual([BOUNDARY_SENTENCE]);
    expect(validateAnswerQuotes(answer, extractSourcesFromToolResults([read(6000)])).unknownQuotes).toEqual([BOUNDARY_SENTENCE]);
    // Two windows with a gap between them do not make the quotation checkable either.
    expect(validateAnswerQuotes(answer, extractSourcesFromToolResults([read(0, 5990), read(6010)])).unknownQuotes)
      .toEqual([BOUNDARY_SENTENCE]);
  });

  it('joins windows read out of order, overlapping or repeated, and a full set becomes the whole section', () => {
    const outOfOrder = extractSourcesFromToolResults([read(6000), read(0)]);
    expect(outOfOrder).toHaveLength(1);
    expect(outOfOrder[0].text.endsWith(TEXT.slice(0, 12000))).toBe(true);

    const overlapping = extractSourcesFromToolResults([read(0), read(4000, 5000), read(0)]);
    expect(overlapping).toHaveLength(1);
    expect(overlapping[0].key).toBe(`${SECTION_ID}#chars=0-9000`);
    expect(overlapping[0].text.endsWith(TEXT.slice(0, 9000))).toBe(true);

    const all = extractSourcesFromToolResults([read(12000, 12000), read(0), read(6000)]);
    expect(all).toHaveLength(1);
    expect(all[0].key).toBe(SECTION_ID);
    expect(all[0].text).not.toContain('Chars:');
    expect(all[0].text.endsWith(TEXT)).toBe(true);
  });

  it('joins on Unicode characters, the unit the offsets count', () => {
    // Each "𝔘" is one character for Neo4j and two UTF-16 units for JavaScript.
    const text = `${'𝔘'.repeat(6)}the quoted words run across the window boundary here${'𝔘'.repeat(6)}`;
    const answer = '"the quoted words run across the window boundary here"';
    const sources = extractSourcesFromToolResults([
      { toolName: 'getSection', result: windowResult(0, 20, text) },
      { toolName: 'getSection', result: windowResult(20, 100, text) },
    ]);

    expect(sources).toHaveLength(1);
    expect(sources[0].text.endsWith(text)).toBe(true);
    expect(validateAnswerQuotes(answer, sources).unknownQuotes).toEqual([]);
  });

  it('does not join windows of different sections', () => {
    const sources = extractSourcesFromToolResults([
      read(0),
      { toolName: 'getSection', result: windowResult(6000, 6000, TEXT, 'sec:doc:federal_regulation:42-438:438.6') },
    ]);
    expect(sources).toHaveLength(2);
  });

  it('gives no entry to a read past the end, which read nothing', () => {
    expect(extractSourcesFromToolResults([read(99999)])).toEqual([]);
  });

  it('counts a section read in two windows once for the section-citation check', () => {
    const sources = extractSourcesFromToolResults([read(0), read(12000)]);
    const cited = validateAnswerSections(`[42 CFR § 438.8](${URL}) and [42 CFR § 438.9](${URL})`, sources);

    expect(cited.checkedSectionCount).toBe(2);
    expect(cited.unknownSections.map(section => section.label)).toEqual(['42 CFR § 438.9']);
  });

  it('shows the verifier only the window that was read when the answer cites the section', () => {
    const answer = `Under [42 CFR § 438.8](${URL}), "${LATE_SENTENCE}".`;
    const sources = extractSourcesFromToolResults([read(0)]);

    const evidence = buildSourceText(sources, answer);
    expect(evidence.text).toContain('Chars: 0-6000 of 18400 (partial');
    expect(evidence.text).not.toContain(LATE_SENTENCE);
    // The label names the section, so the citation check accepts it; the
    // words beyond the window are still not evidence.
    expect(validateAnswerSections(answer, sources).unknownSections).toEqual([]);
    expect(validateAnswerQuotes(answer, sources).unknownQuotes).toEqual([LATE_SENTENCE]);
  });

  it('treats a windowed entry as cited when an answer names the raw section id', () => {
    const sources = extractSourcesFromToolResults([read(0)]);
    const evidence = buildSourceText(sources, `See ${SECTION_ID}.`, 100);

    expect(evidence.citedBodyDropped).toBe(true);
  });

  it('joins the frame\'s first window with a later getSection continuation', () => {
    const frameSection = { ...windowResult(0).section, reason: 'Matched.' };
    const frame = {
      questionType: 'federal_authority',
      route: { lane: 'federal', rationale: 'r', widening_policy: 'none', determinism_hints: {} },
      authoritativeDocuments: [],
      primarySections: [frameSection],
      supportingSections: [],
      avoidSections: [],
      latestRevision: null,
      variantReasoning: null,
    };
    const sources = extractSourcesFromToolResults([
      { toolName: 'resolveAnswerFrame', toolCallId: 'f1', result: { frame } },
      read(6000),
    ]);

    expect(sources.map(source => source.toolName)).toEqual(['resolveAnswerFrame', 'resolveAnswerFrame:section']);
    // The routing entry says the frame holds only the first window.
    expect(sources[0].text).toContain('Text: first 6000 of 18400 characters');
    expect(sources[1].key).toBe(`${SECTION_ID}#chars=0-12000`);
    expect(sources[1].text).toContain('[corpusSection]');
    expect(sources[1].text.endsWith(TEXT.slice(0, 12000))).toBe(true);
  });

  it('extracts the same entries from stored messages', () => {
    const records = [read(0), read(6000), read(15000)];
    const messages = [{
      content: {
        parts: records.map(record => ({
          type: 'tool-invocation',
          toolInvocation: { state: 'result', toolName: record.toolName, toolCallId: record.toolCallId, result: record.result },
        })),
      },
    }];

    expect(extractSources(messages)).toEqual(extractSourcesFromToolResults(records));
    expect(extractSources(messages).map(source => source.key)).toEqual([
      `${SECTION_ID}#chars=0-12000`,
      `${SECTION_ID}#chars=15000-18400`,
    ]);
  });

  it('reads a result stored before reads were windowed as one whole entry', () => {
    const { contentOffset: _offset, totalChars: _total, nextOffset: _next, contentNote: _note, ...legacy } = windowResult(0).section;
    const [entry] = extractSourcesFromToolResults([{ toolName: 'getSection', result: { section: legacy } }]);

    expect(entry.key).toBe(SECTION_ID);
    expect(entry.text).not.toContain('Chars:');
  });
});
