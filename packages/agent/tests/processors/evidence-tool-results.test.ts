import { describe, it, expect } from 'vitest';
import {
  extractSourcesFromToolResults,
  extractSources,
  type ToolResultRecord,
} from '../../src/processors/hallucination-verifier.js';

// extractSourcesFromToolResults is the CLI-runner counterpart of extractSources:
// it consumes the flat { toolName, result } records collected from
// `onStepFinish` rather than Mastra DB message parts. The per-tool extraction
// switch is shared, so these tests focus on the record-shape handling and
// confirm parity with extractSources on an equivalent payload.

const sectionResult = {
  section: {
    id: 'sec:doc:clinical_policy:8C:3.2.1',
    title: 'Coverage Criteria',
    sectionNumber: '3.2.1',
    content: 'Speech therapy is covered when medically necessary.',
    url: 'https://medicaid.ncdhhs.gov/policy/8c#3.2.1',
    policyNumber: '8C',
    documentType: 'clinical_policy',
    effectiveDate: null,
    sourceModifiedDate: '2026-07-15',
    retrievedAt: '2026-07-28T04:18:40Z',
    lastRevised: null,
    federalRegisterCite: null,
    documentId: 'doc:clinical_policy:8C',
    citationLink: null,
  },
};

describe('extractSourcesFromToolResults', () => {
  it('extracts a getSection record into a keyed source entry', () => {
    const [entry, ...rest] = extractSourcesFromToolResults([
      { toolName: 'getSection', toolCallId: 'c1', result: sectionResult },
    ]);
    expect(rest).toHaveLength(0);
    expect(entry.toolName).toBe('getSection');
    expect(entry.key).toBe('sec:doc:clinical_policy:8C:3.2.1');
    expect(entry.link).toBe('https://medicaid.ncdhhs.gov/policy/8c#3.2.1');
    expect(entry.text).toContain('[getSection]');
    expect(entry.text).toContain('Speech therapy is covered');
    expect(entry.text).toContain('Source modified: 2026-07-15');
    expect(entry.text).toContain('Retrieved: 2026-07-28T04:18:40Z');
  });

  it('labels a paged section listing as partial', () => {
    const sections = [{ id: 'sec-1', number: '1.0', title: 'Description', chars: 10 }];
    const meta = { ...sectionResult.section, id: 'doc:clinical_policy:8C', title: 'Policy 8C' };
    const [partial] = extractSourcesFromToolResults([
      { toolName: 'getDocument', result: { document: { ...meta, sections, sectionCount: 2164, sectionsTruncated: true } } },
    ]);
    const [whole] = extractSourcesFromToolResults([
      { toolName: 'lookupPolicy', result: { documents: [{ ...meta, sections, sectionCount: 1, sectionsTruncated: false }] } },
    ]);
    // The last page of a paged listing: nothing follows it, yet it is not the whole document.
    const [lastPage] = extractSourcesFromToolResults([
      { toolName: 'getDocument', result: { document: { ...meta, sections, sectionCount: 101, sectionsTruncated: false } } },
    ]);
    expect(partial.text).toContain('Sections (showing 1 of 2164):');
    expect(lastPage.text).toContain('Sections (showing 1 of 101):');
    expect(whole.text).toContain('Sections (1):');
  });

  it('ignores tools that are not evidence sources', () => {
    const records: ToolResultRecord[] = [
      { toolName: 'searchSections', result: { results: [{ id: 'x' }] } },
      { toolName: 'getSectionContext', result: { context: 'noise' } },
      { toolName: 'findConceptSections', result: { sections: [] } },
    ];
    expect(extractSourcesFromToolResults(records)).toEqual([]);
  });

  it('skips evidence records whose payload is empty', () => {
    expect(
      extractSourcesFromToolResults([{ toolName: 'getSection', result: { section: null } }]),
    ).toEqual([]);
  });

  it('preserves order and count across multiple records', () => {
    const sources = extractSourcesFromToolResults([
      { toolName: 'getSection', toolCallId: 'c1', result: sectionResult },
      { toolName: 'searchSections', result: {} },
      {
        toolName: 'getSection',
        toolCallId: 'c2',
        result: { section: { ...sectionResult.section, id: 'sec:other' } },
      },
    ]);
    expect(sources.map((s) => s.key)).toEqual([
      'sec:doc:clinical_policy:8C:3.2.1',
      'sec:other',
    ]);
  });

  it('falls back to a toolCallId-derived key when no authoritative document exists', () => {
    const [entry] = extractSourcesFromToolResults([
      {
        toolName: 'getAmendments',
        toolCallId: 'call-42',
        result: { amendments: [], baseDocument: null, authoritativeDocument: null },
      },
    ]);
    expect(entry.key).toBe('amendments:call-42');
  });

  it('produces the same source entry as extractSources for an equivalent payload', () => {
    const fromRecords = extractSourcesFromToolResults([
      { toolName: 'getSection', toolCallId: 'c1', result: sectionResult },
    ]);
    const fromMessages = extractSources([
      {
        content: {
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: {
                state: 'result',
                toolName: 'getSection',
                toolCallId: 'c1',
                result: sectionResult,
              },
            },
          ],
        },
      },
    ]);
    expect(fromRecords).toEqual(fromMessages);
  });
});
