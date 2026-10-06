import { WITHHELD_ANSWER } from '@nc-medicaid/contracts';
import { ANSWER_SCOPE_POLICY, resolveCoverageScope, type CoverageScope } from '@nc-medicaid/policy-corpus';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('ai', async original => ({ ...await original<typeof import('ai')>(), generateObject: vi.fn() }));
import { generateObject } from 'ai';

import { HallucinationVerifier } from '../../../src/processors/verifier/processor.js';
import { runVerificationForAnswer, strictestCoverageScope } from '../../../src/processors/verifier/run.js';
import type { SourceEntry } from '../../../src/processors/verifier/evidence.js';
import type { VerificationResult } from '../../../src/processors/verifier/verify.js';
import { CHAT_VERIFICATION_QUESTION } from '../../../src/processors/verifier/context.js';
import { COVERAGE_VERIFICATION_QUERY } from '../../../src/processors/coverage-boundary.js';

const clean: VerificationResult = { supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [],
  missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };

const TABLE_2025 = ANSWER_SCOPE_POLICY.magi_tables.find(table => table.source_url.endsWith('MA-3321-1.pdf'))!.source_url;
const TABLE_2026 = ANSWER_SCOPE_POLICY.magi_tables.find(table => table.source_url.endsWith('MA-3321-MAGI-Income-2.pdf'))!.source_url;

// Spanish wordings the English-only scope code resolves nothing from, and the
// English query the frame tool is called with.
const SPANISH_TABLE = '¿Qué tabla de ingresos MAGI se aplica en junio de 2025?';
const ENGLISH_TABLE = 'What MAGI income table applies in June 2025?';
const SPANISH_COVID = '¿Medicaid cubre las pruebas caseras de COVID-19?';
const ENGLISH_COVID = 'Does Medicaid cover at-home COVID-19 tests?';
const UNRELATED = 'Does Policy 10A cover routine massage therapy for adults?';

const tableSource = (url: string, year: string): SourceEntry => ({ toolName: 'getSection', key: `table-${year}`, link: url,
  text: `[getSection]\nMAGI income limits effective April 1, ${year}. Household of one: $1,735 a month.` });
const ANSWER = `The table effective April 1, 2025 lists $1,735 a month for a household of one. [MA-3321](${TABLE_2025})`;

const required = (urls: string[], requirements: string[] = urls.map(url => `Use ${url}.`)): CoverageScope =>
  ({ policyId: 'p', limitationIds: [], notice: null, requestedDate: '2025-06-01', requiredSourceUrls: urls, requirements });
const refusal = (notice: string, limitationIds: string[] = []): CoverageScope =>
  ({ policyId: 'p', limitationIds, notice, requestedDate: null, requiredSourceUrls: [], requirements: [] });

beforeEach(() => {
  vi.mocked(generateObject).mockReset();
  vi.mocked(generateObject).mockResolvedValue({ object: clean, usage: {} } as never);
});

describe('strictestCoverageScope', () => {
  const a = required(['https://a.example/table']);
  const b = required(['https://b.example/table']);
  const n = refusal('Notice from the user text.');
  const m = refusal('Notice from the frame query.');

  it('is null only when every reading is null', () => {
    expect(strictestCoverageScope([])).toBeNull();
    expect(strictestCoverageScope([null, null])).toBeNull();
  });

  it('keeps required sources over no scope, from either side', () => {
    expect(strictestCoverageScope([a, null])).toEqual(a);
    expect(strictestCoverageScope([null, b])).toEqual(b);
  });

  it('requires the union when both readings require sources', () => {
    expect(strictestCoverageScope([a, b])).toMatchObject({ notice: null, requestedDate: '2025-06-01',
      requiredSourceUrls: ['https://a.example/table', 'https://b.example/table'],
      requirements: ['Use https://a.example/table.', 'Use https://b.example/table.'] });
    // The same reading twice is not doubled.
    expect(strictestCoverageScope([a, a])).toEqual(a);
  });

  it('lets a notice beat required sources and no scope, from either side', () => {
    expect(strictestCoverageScope([n, null])).toBe(n);
    expect(strictestCoverageScope([null, m])).toBe(m);
    expect(strictestCoverageScope([n, b])).toBe(n);
    expect(strictestCoverageScope([a, m])).toBe(m);
  });

  it('keeps the earliest notice when both readings refuse', () => {
    expect(strictestCoverageScope([n, m])).toBe(n);
    expect(strictestCoverageScope([a, m, n])).toBe(m);
  });

  it('never drops an obligation of the first reading whatever the later ones are', () => {
    for (const first of [a, n]) {
      for (const later of [null, b, m]) {
        const result = strictestCoverageScope([first, later])!;
        if (first.notice) expect(result.notice).toBe(first.notice);
        else if (!result.notice) expect(result.requiredSourceUrls).toEqual(expect.arrayContaining(first.requiredSourceUrls));
        expect(result.notice || result.requiredSourceUrls.length).toBeTruthy();
      }
    }
  });
});

describe('the coverage scope of the frame query at release', () => {
  const verifyModel = vi.fn(async () => clean);
  beforeEach(() => verifyModel.mockClear());

  it('resolves nothing from the Spanish wordings themselves', () => {
    expect(resolveCoverageScope(SPANISH_TABLE)).toBeNull();
    expect(resolveCoverageScope(SPANISH_COVID)).toBeNull();
  });

  it('withholds a Spanish dated-table answer when the table the English query requires was not retrieved', async () => {
    const result = await runVerificationForAnswer({ question: SPANISH_TABLE, frameQueries: [ENGLISH_TABLE], answerText: ANSWER,
      sources: [tableSource('https://example.gov/another-table.pdf', '2025')], verify: verifyModel });

    expect(result.outcome).toEqual({ status: 'withheld', reason: 'unsupported', passCount: 0 });
    expect(result.finalAnswer).toBe(WITHHELD_ANSWER);
    expect(result.telemetry.coverage_issue).toBe(`The required dated source was not retrieved: ${TABLE_2025}`);
    expect(verifyModel).not.toHaveBeenCalled();
  });

  it('sends the answer to the model with the table requirement when the required table was retrieved', async () => {
    const result = await runVerificationForAnswer({ question: SPANISH_TABLE, frameQueries: [ENGLISH_TABLE], answerText: ANSWER,
      sources: [tableSource(TABLE_2025, '2025')], verify: verifyModel });

    expect(result.outcome.status).toBe('passed');
    expect(result.telemetry.coverage_issue).toBeNull();
    const options = (verifyModel.mock.calls[0] as unknown[])[5] as { coverageRequirements?: string[] };
    expect(options.coverageRequirements?.[0]).toContain('Use the table effective 2025-04-01 for the requested date 2025-06-01.');
  });

  it('withholds, without the notice as the answer, when the English query is outside supported coverage', async () => {
    const result = await runVerificationForAnswer({ question: SPANISH_COVID, frameQueries: [ENGLISH_COVID], answerText: ANSWER,
      sources: [tableSource(TABLE_2025, '2025')], verify: verifyModel });

    expect(result.outcome).toEqual({ status: 'withheld', reason: 'unsupported', passCount: 0 });
    expect(result.telemetry.coverage_issue).toBe(resolveCoverageScope(ENGLISH_COVID)!.notice);
    // The user sees the generic withheld text; the scope notice stays in telemetry.
    expect(result.finalAnswer).toBe(WITHHELD_ANSWER);
    expect(verifyModel).not.toHaveBeenCalled();
  });

  it('keeps the obligation of the user text when the frame query resolves no scope', async () => {
    const result = await runVerificationForAnswer({ question: ENGLISH_TABLE, frameQueries: [UNRELATED, '   '], answerText: ANSWER,
      sources: [], verify: verifyModel });

    expect(result.telemetry.coverage_issue).toBe(`The required dated source was not retrieved: ${TABLE_2025}`);
    expect(result.outcome.status).toBe('withheld');
  });

  it('keeps the notice of the user text when the frame query names a supported period', async () => {
    const refused = 'What MAGI income limits apply in February 2025?';
    const result = await runVerificationForAnswer({ question: refused, frameQueries: [ENGLISH_TABLE], answerText: ANSWER,
      sources: [tableSource(TABLE_2025, '2025')], verify: verifyModel });

    expect(result.telemetry.coverage_issue).toBe(resolveCoverageScope(refused)!.notice);
    expect(result.outcome.status).toBe('withheld');
    expect(verifyModel).not.toHaveBeenCalled();
  });

  it('requires both tables when the user text and the frame query name different periods', async () => {
    const result = await runVerificationForAnswer({ question: ENGLISH_TABLE, frameQueries: ['What MAGI income table applies in October 2026?'],
      answerText: ANSWER, sources: [tableSource(TABLE_2025, '2025')], verify: verifyModel });

    expect(result.telemetry.coverage_issue).toBe(`The required dated source was not retrieved: ${TABLE_2026}`);
    expect(verifyModel).not.toHaveBeenCalled();
  });

  it('is unchanged without a frame query', async () => {
    const result = await runVerificationForAnswer({ question: SPANISH_TABLE, answerText: ANSWER, sources: [tableSource(TABLE_2025, '2025')], verify: verifyModel });

    expect(result.outcome.status).toBe('passed');
    expect(result.telemetry.coverage_policy_id).toBeNull();
    expect((verifyModel.mock.calls[0] as unknown[])[5]).toMatchObject({ coverageRequirements: undefined });
  });
});

describe('the chat verifier and the frame call the server recorded', () => {
  const OTHER = 'MAGI income limits took effect April 1, 2025. [Other](https://example.gov/other.pdf)';
  const messages = (frameArgs: unknown, text: string) => [
    { id: 'user-message', role: 'user', threadId: 'thread-1', resourceId: 'user-1', createdAt: new Date(),
      content: { format: 2, parts: [{ type: 'text', text: SPANISH_TABLE }] } },
    { id: 'assistant-message', role: 'assistant', threadId: 'thread-1', resourceId: 'user-1', createdAt: new Date(),
      content: { format: 2, parts: [
        ...(frameArgs ? [{ type: 'tool-invocation', toolInvocation: { state: 'result', toolCallId: 'frame', toolName: 'resolveAnswerFrame', args: frameArgs, result: {} } }] : []),
        { type: 'tool-invocation', toolInvocation: { state: 'result', toolCallId: 'read', toolName: 'getSection', args: {},
          result: { section: { id: 'other', title: 'Income', content: 'MAGI income limits effective April 1, 2025.', url: 'https://example.gov/other.pdf', citationLink: '[Other](https://example.gov/other.pdf)' } } } },
        { type: 'text', text },
      ] } },
  ];
  const requestContext = { get: (key: string) => (key === CHAT_VERIFICATION_QUESTION || key === COVERAGE_VERIFICATION_QUERY ? SPANISH_TABLE : undefined) };

  async function release(state: Record<string, unknown>, frameArgs?: unknown, text = ANSWER) {
    const written: Array<{ data: Record<string, unknown> }> = [];
    await new HallucinationVerifier().processOutputStep({ text, finishReason: 'stop', toolCalls: [], messages: messages(frameArgs, text), steps: [],
      requestContext, writer: { custom: async (part: never) => { written.push(part); } }, state } as never);
    return written.at(-1)!.data;
  }

  it('applies the scope of the query captured when the frame tool ran', async () => {
    const verifier = new HallucinationVerifier();
    const state: Record<string, unknown> = {};
    verifier.processToolResult({ toolName: 'resolveAnswerFrame', toolCallId: 'frame', args: { query: ENGLISH_TABLE }, result: {}, state } as never);
    verifier.processToolResult({ toolName: 'searchSections', toolCallId: 'search', args: { query: ENGLISH_COVID }, result: {}, state } as never);
    expect(state.verificationFrameQueries).toEqual([ENGLISH_TABLE]);

    expect(await release(state)).toMatchObject({ status: 'withheld', reason: 'unsupported', answer: WITHHELD_ANSWER });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('applies the scope of the query recorded on this turn\'s messages when the step state was lost', async () => {
    expect(await release({}, { query: ENGLISH_TABLE })).toMatchObject({ status: 'withheld', reason: 'unsupported', answer: WITHHELD_ANSWER });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('has only the model check when the model passed the Spanish text through unchanged', async () => {
    expect(await release({}, { query: SPANISH_TABLE }, OTHER)).toMatchObject({ status: 'passed', answer: OTHER });
    expect(generateObject).toHaveBeenCalledTimes(1);
    // The same answer is withheld once the frame was asked in English.
    expect(await release({}, { query: ENGLISH_TABLE }, OTHER)).toMatchObject({ status: 'withheld', answer: WITHHELD_ANSWER });
    expect(generateObject).toHaveBeenCalledTimes(1);
  });
});
