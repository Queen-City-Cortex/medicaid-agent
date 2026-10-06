import { describe, expect, it, vi } from 'vitest';
import { buildSourceText, extractSourcesFromToolResults, isCorpusEvidence, type SourceEntry } from '../../src/processors/verifier/evidence.js';
import { sourceUrlSet, validateAnswerUrls } from '../../src/processors/verifier/answer-validation.js';
import { runVerificationForAnswer } from '../../src/processors/verifier/run.js';
import { makeDocument, makeFrame, makeSection } from '../helpers/answer-frame-fixtures.js';

const CLEAN = { supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };
const DOC_URL = 'https://example.gov/policy';
const PRIMARY_URL = 'https://example.gov/policy/limits';
const AVOID_URL = 'https://example.gov/policy/avoid';
const BODY = 'Outpatient therapy is limited to 16 visits per year.';
const frameSources = (content: string | null) => extractSourcesFromToolResults([{ toolName: 'resolveAnswerFrame', toolCallId: 'frame', result: { frame: makeFrame({
  authoritativeDocuments: [makeDocument({ url: DOC_URL })],
  primarySections: [makeSection({ id: 'limits', content, url: PRIMARY_URL })],
  avoidSections: [makeSection({ id: 'avoid', content: null, url: AVOID_URL })],
}) } }]);

describe('the routing hint is not evidence', () => {
  it('vouches for no URL: not its link, not the URLs listed in its text', () => {
    const [hint] = frameSources(null);
    expect(hint).toMatchObject({ toolName: 'resolveAnswerFrame', link: PRIMARY_URL });
    expect(hint.text).toContain(DOC_URL);
    expect(hint.text).toContain(AVOID_URL);
    expect(sourceUrlSet(hint).size).toBe(0);
    const urls = validateAnswerUrls(`A [doc](${DOC_URL}), [primary](${PRIMARY_URL}) and [avoid](${AVOID_URL}).`, [hint]);
    expect(urls).toMatchObject({ unknownUrls: [DOC_URL, PRIMARY_URL, AVOID_URL], retrievedUrlCount: 0 });
  });

  it('still accepts a URL that a section body from the same frame carries', () => {
    const sources = frameSources(BODY);
    expect(sources.map(source => source.toolName)).toEqual(['resolveAnswerFrame', 'resolveAnswerFrame:section']);
    const urls = validateAnswerUrls(`${BODY} [Limits](${PRIMARY_URL}) [avoid](${AVOID_URL})`, sources);
    expect(urls).toMatchObject({ unknownUrls: [AVOID_URL], retrievedUrlCount: 1 });
  });

  it('counts section bodies, listings, findings and web excerpts as evidence, but not the hint or blank text', () => {
    const [hint, body] = frameSources(BODY);
    expect(isCorpusEvidence(hint)).toBe(false);
    expect(isCorpusEvidence(body)).toBe(true);
    expect(isCorpusEvidence({ toolName: 'getSection', key: 's', text: ' \n' })).toBe(false);
    expect(isCorpusEvidence({ toolName: 'lookupPolicy', key: 'd', text: '[lookupPolicy]\nID: d' })).toBe(true);
    expect(isCorpusEvidence({ toolName: 'researchFinding', key: 'finding:1', text: '[researchFinding]\nVerified finding.' })).toBe(true);
    expect(isCorpusEvidence({ evidenceRole: 'supplementary', toolName: 'webSearch', key: 'web:x', text: 'Excerpt.' })).toBe(true);
  });

  it('claims the evidence budget last, even when the answer uses a URL the hint lists', () => {
    const [hint] = frameSources(null);
    const uncitedBody: SourceEntry = { toolName: 'getSection', key: 'sec:other', link: 'https://example.gov/other', text: `[getSection]\nUNCITED-BODY ${'x'.repeat(hint.text.length)}` };
    const listing: SourceEntry = { toolName: 'followReferences', key: 'followReferences:1', text: 'REST' };
    const answer = `A claim. [Policy](${PRIMARY_URL}) [Avoid](${AVOID_URL}) (limits)`;
    const all = buildSourceText([hint, listing, uncitedBody], answer, 100_000);
    const order = ['UNCITED-BODY', 'REST', '[resolveAnswerFrame]'].map(marker => all.text.indexOf(marker));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(all.dropped).toEqual([]);
    // Room for the body alone: the hint is the entry left out, and losing it
    // is not a dropped cited body.
    const tight = buildSourceText([hint, uncitedBody], answer, uncitedBody.text.length + 20);
    expect(tight.text).toContain('UNCITED-BODY');
    expect(tight.dropped).toEqual([hint]);
    expect(tight).toMatchObject({ citedBodyDropped: false, findingDropped: false });
  });

  it('leaves a routing-dropped document out of every entry: no title, number, link or vouched URL', () => {
    const DROPPED_URL = 'https://example.gov/dropped-eyeglasses';
    const dropped = makeDocument({ id: 'dropped', title: 'Dropped Eyeglasses Policy', policyNumber: 'DROP-6A', url: DROPPED_URL });
    const sources = extractSourcesFromToolResults([{ toolName: 'resolveAnswerFrame', toolCallId: 'frame', result: { frame: makeFrame({
      authoritativeDocuments: [makeDocument({ url: DOC_URL })],
      primarySections: [makeSection({ id: 'limits', content: BODY, url: PRIMARY_URL })],
      droppedDocuments: [dropped as Required<typeof dropped>],
    }) } }]);
    expect(sources.map(source => source.toolName)).toEqual(['resolveAnswerFrame', 'resolveAnswerFrame:section']);
    for (const source of sources) {
      for (const marker of ['Dropped Eyeglasses Policy', 'DROP-6A', DROPPED_URL, 'dropped']) {
        expect(source.text).not.toContain(marker);
      }
      expect(source.link).not.toBe(DROPPED_URL);
      expect(sourceUrlSet(source).has(DROPPED_URL)).toBe(false);
    }
    expect(validateAnswerUrls(`[Eyeglasses](${DROPPED_URL})`, sources)).toMatchObject({ unknownUrls: [DROPPED_URL] });
  });

  it('checks a research report against its findings: findings are evidence for the model call', async () => {
    const [hint, body] = frameSources(BODY);
    const finding: SourceEntry = { toolName: 'researchFinding', key: 'finding:1', text: `[researchFinding]\nVerified finding:\n${BODY} [Limits](${PRIMARY_URL})` };
    const verify = vi.fn().mockResolvedValue(CLEAN);
    const report = `${BODY} [Limits](${PRIMARY_URL})`;
    const result = await runVerificationForAnswer({ question: 'q', answerText: report, sources: [hint, body], verifierSources: [finding], verify });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0][2]).toContain('Verified finding');
    expect(result.outcome).toEqual({ status: 'passed', passCount: 1 });
  });

  it('withholds a report whose workers retrieved only routing hints when it cites a link', async () => {
    const [hint] = frameSources(null);
    const finding: SourceEntry = { toolName: 'researchFinding', key: 'finding:1', text: '[researchFinding]\nVerified finding:\nThe corpus was silent.' };
    const verify = vi.fn().mockResolvedValue(CLEAN);
    const cited = await runVerificationForAnswer({ question: 'q', answerText: `${BODY} [Limits](${PRIMARY_URL})`, sources: [hint], verifierSources: [finding], verify });
    expect(verify).not.toHaveBeenCalled();
    expect(cited.outcome).toEqual({ status: 'withheld', reason: 'invalid_citation', passCount: 0 });
    const silent = await runVerificationForAnswer({ question: 'q', answerText: 'The retrieved policy documents do not address this.', sources: [hint], verifierSources: [finding], verify });
    expect(silent.outcome).toEqual({ status: 'passed', passCount: 1 });
  });
});
