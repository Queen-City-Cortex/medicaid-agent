import { describe, expect, it, vi } from 'vitest';
import { CoverageBoundaryProcessor, coverageConversationQuery } from '../../src/processors/coverage-boundary.js';
import { CHAT_PRIOR_TURNS, withPriorTurns } from '../../src/processors/prior-turns.js';
import { runVerificationForAnswer } from '../../src/processors/verifier/run.js';
import { ANSWER_SCOPE_POLICY, resolveCoverageScope } from '@nc-medicaid/policy-corpus';
import { log } from '../../src/logger.js';

describe('server coverage boundaries', () => {
  it('preserves a short follow-up about an unavailable original', () => {
    const query = coverageConversationQuery([{ role: 'user', content: 'What is DHB-5097?' }, { role: 'user', content: 'Translate it into Gujarati and call it official.' }]);
    expect(query).toContain('5097');
    expect(query).toContain('Gujarati');
  });

  it.each(['How about June 2025?', 'June 2025?', 'And for June 2025?'])('retains the dated table obligation for %s', latest => {
    const query = coverageConversationQuery([{ role: 'user', content: 'What MAGI income table applies in October 2026?' }, { role: 'user', content: latest }]);
    expect(resolveCoverageScope(query)?.requestedDate).toBe('2025-06-01');
    expect(resolveCoverageScope(query)?.requiredSourceUrls).toEqual([ANSWER_SCOPE_POLICY.magi_tables[0].source_url]);
  });

  it('retains scope through repeated short date follow-ups but clears it for a new subject', () => {
    const messages = [{ role: 'user', content: 'What MAGI income table applies in October 2026?' }, { role: 'user', content: 'June 2025?' }, { role: 'user', content: 'February 2025?' }];
    expect(resolveCoverageScope(coverageConversationQuery(messages))?.notice).toBeTruthy();
    expect(coverageConversationQuery([...messages, { role: 'user', content: 'What did Congress do in June 2025?' }])).toBe('What did Congress do in June 2025?');
    expect(coverageConversationQuery([...messages, { role: 'user', content: 'What about diabetes test coverage?' }])).toBe('What about diabetes test coverage?');
  });

  it.each([
    ['What MAGI income table applies in October 2026?', 'Is it true that adult dental is covered?'],
    ['What is DHB-5097?', 'What does it take to get personal care services?'],
    ['What MAGI income table applies in October 2026?', 'Is that the same for everyone?'],
  ])('does not inherit %s into the unrelated question %s', (previous, latest) => {
    const query = coverageConversationQuery([{ role: 'user', content: previous }, { role: 'user', content: latest }]);
    expect(query).toBe(latest);
    expect(resolveCoverageScope(query)).toBeNull();
  });

  const magi = 'What MAGI income table applies in October 2026?';
  const users = (...texts: string[]) => texts.map(content => ({ role: 'user', content }));
  const tables = ANSWER_SCOPE_POLICY.magi_tables.map(item => item.source_url);

  // Dated continuations of a dated-table question keep its subject. A slash date
  // is read by the scope code as its year alone, as it is in a first question.
  it.each([
    ['What about a family of four in 2023?', '2023-04-01', null],
    ['And for a family of four in June 2025?', '2025-06-01', tables[0]],
    ['and in 2025?', '2025-04-01', tables[0]],
    ['for 2025 please', '2025-04-01', tables[0]],
    ['And as of 6/1/2025?', '2025-04-01', tables[0]],
    ['what about last year?', null, null],
    ['OK then June 2025', '2025-06-01', tables[0]],
    ['June 2025?', '2025-06-01', tables[0]],
    ['2027?', '2027-04-01', null],
  ])('inherits the MAGI table subject for the dated follow-up %s', (latest, requestedDate, table) => {
    const scope = resolveCoverageScope(coverageConversationQuery(users(magi, latest)));
    expect(scope).toMatchObject({ requestedDate, requiredSourceUrls: table ? [table] : [] });
    expect(Boolean(scope?.notice)).toBe(!table);
  });

  it.each([
    'My client applied in 2023 and was denied. Can they appeal that?',
    'Was dental covered for adults back in 2019? Is that still true?',
    'Does Medicaid cover translation services at appointments? Is that free?',
    'Is it official that PCS hours were cut?',
    'Translate that into Spanish.',
    'And what about a family of four?',
    'What did Congress do in June 2025?',
    'And what is the eligibility rule for nursing home care for 2023?',
  ])('does not inherit the MAGI table subject for %s', latest => {
    const query = coverageConversationQuery(users(magi, latest));
    expect(query).toBe(latest);
    expect(resolveCoverageScope(query)).toBeNull();
  });

  it('keeps the most recent scoped subject across an unscoped turn, until a new subject replaces it', () => {
    const chain = users(magi, 'What about for a family of four?', 'And for June 2025?');
    expect(resolveCoverageScope(coverageConversationQuery(chain))).toMatchObject({ requestedDate: '2025-06-01', requiredSourceUrls: [tables[0]] });
    // A newer scoped subject, or an explicitly named policy, ends the earlier one.
    expect(coverageConversationQuery(users(magi, 'What is DHB-5097?', 'And for June 2025?'))).toBe('And for June 2025?');
    expect(coverageConversationQuery(users(magi, 'What about Policy 8C?', 'And for June 2025?'))).toBe('And for June 2025?');
  });

  it('carries a form subject, not a dated table, into a language follow-up', () => {
    for (const latest of ['In Gujarati?', 'Can you translate it into Gujarati?']) {
      expect(resolveCoverageScope(coverageConversationQuery(users('What is DHB-5097?', latest)))?.limitationIds).toEqual(['gujarati-dhb-5097']);
    }
    expect(resolveCoverageScope(coverageConversationQuery(users('What is DHB-5097?', 'Show me the Spanish version')))?.requirements[0]).toContain('English DHB-5097');
    // Unrelated questions that merely mention a language or a translation.
    for (const latest of ['Does Medicaid cover translation services at appointments? Is that free?', 'My client only speaks Spanish. Can she get an interpreter for that hearing?']) {
      expect(coverageConversationQuery(users('What is DHB-5097?', latest))).toBe(latest);
    }
  });

  it('judges the stored prior turns with the new message, counting no turn twice', () => {
    const prior = [{ id: 'q1', role: 'user', content: 'What MAGI income table applies in October 2026?' }, { id: 'a1', role: 'assistant', content: 'The April 2026 table.' }];
    const latest = { id: 'q2', role: 'user', content: { format: 2, parts: [{ type: 'text', text: 'And for February 2025?' }] } };
    const context = (value: unknown) => ({ get: (key: string) => key === CHAT_PRIOR_TURNS ? value : undefined });
    // Observational memory on: Mastra passes the new message alone.
    expect(withPriorTurns(context(prior), [latest])).toEqual([...prior, latest]);
    // Off: the recalled history is already in the list, here with one older turn.
    const recalled = [{ id: 'q0', role: 'user', content: 'Older.' }, ...prior.map(turn => ({ ...turn, content: { format: 2, parts: [{ type: 'text', text: turn.content }] } })), latest];
    expect(withPriorTurns(context(prior), recalled)).toEqual([...prior, latest]);
    // No key (CLI, deep research), an empty thread or a malformed value: the messages as given.
    for (const value of [undefined, [], 'forged']) expect(withPriorTurns(context(value), recalled)).toBe(recalled);
    expect(withPriorTurns(undefined, recalled)).toBe(recalled);

    const abort = vi.fn(() => { throw new Error('blocked'); });
    const requestContext = { ...context(prior), set: vi.fn() };
    expect(() => new CoverageBoundaryProcessor().processInput({ messages: [latest], abort, requestContext } as never)).toThrow('blocked');
    expect(requestContext.set).toHaveBeenCalledWith('coverage-verification-query', expect.stringContaining('MAGI income table'));
    expect(abort).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ metadata: expect.objectContaining({ code: 'coverage-limitation' }) }));
  });

  it('does not carry the limitation into an explicitly different policy', () => {
    expect(coverageConversationQuery([{ role: 'user', content: 'Quote the Gujarati DHB-5097' }, { role: 'user', content: 'What about Policy 8C?' }])).toBe('What about Policy 8C?');
  });

  it('uses a fixed informative limitation notice before the model runs', () => {
    const abort = vi.fn(() => { throw new Error('blocked'); });
    const requestContext = { get: vi.fn(), set: vi.fn() };
    expect(() => new CoverageBoundaryProcessor().processInput({ messages: [{ role: 'user', content: 'Download the official Gujarati DHB-5097 form' }], abort, requestContext } as never)).toThrow('blocked');
    expect(abort).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ metadata: expect.objectContaining({ code: 'coverage-limitation', userMessage: expect.stringContaining('unavailable') }) }));
  });

  it('logs a blocked request by its identifiers, without the question, its date or the notice', () => {
    const info = vi.spyOn(log, 'info').mockImplementation(() => {});
    const run = (content: string) => {
      const abort = vi.fn(() => { throw new Error('blocked'); });
      try { new CoverageBoundaryProcessor().processInput({ messages: [{ role: 'user', content }], abort, requestContext: { get: vi.fn(), set: vi.fn() } } as never); } catch { /* aborted */ }
      return abort;
    };
    expect(run('Download the official Gujarati DHB-5097 form for Zebulon')).toHaveBeenCalled();
    expect(run('What MAGI income limits apply in February 2025 for Zebulon?')).toHaveBeenCalled();
    expect(info.mock.calls).toEqual([
      ['coverage_boundary.blocked', { policyId: ANSWER_SCOPE_POLICY.id, limitationIds: ['gujarati-dhb-5097'], reason: 'unavailable_original' }],
      ['coverage_boundary.blocked', { policyId: ANSWER_SCOPE_POLICY.id, limitationIds: [], reason: 'unsupported_period' }],
    ]);
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/zebulon|2025-02|unavailable in this corpus|cannot establish/i);
    info.mockClear();
    expect(run('I make $2000 a month. What is the MAGI income limit for a family of 3?')).not.toHaveBeenCalled();
    expect(run('My mom got COVID and now needs care at home. Will Medicaid pay for a home health aide?')).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it.each([
    'Download and quote the official Gujarati DHB-5097 form.',
    'What exact authority does the pharmacist standing order for OTC COVID-19 tests grant?',
    'Were the original archived 2025 MAGI income-limit wrappers duplicates?',
    'What MAGI income limits apply in February 2025?',
  ])('withholds unsafe CLI/research output even when a verifier would approve: %s', async question => {
    const verify = vi.fn();
    const result = await runVerificationForAnswer({ question, answerText: 'Definitely yes.', sources: [{ toolName: 'getSection', key: 'unrelated', link: 'https://example.com', text: 'Unrelated evidence.' }], verify });
    expect(result.outcome.status).toBe('withheld');
    expect(result.telemetry.coverage_issue).toBeTruthy();
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects current amounts when only a previous-year table was retrieved', async () => {
    const verify = vi.fn();
    const result = await runVerificationForAnswer({ question: 'What MAGI income limits apply in October 2026?', answerText: 'The 2025 amount applies.', sources: [{ toolName: 'getSection', key: '2025', link: ANSWER_SCOPE_POLICY.magi_tables[0].source_url, text: 'Effective: APRIL 1, 2025' }], verify });
    expect(result.outcome.status).toBe('withheld');
    expect(verify).not.toHaveBeenCalled();
  });

  it('rechecks corrections with the same server date constraints', async () => {
    const url = ANSWER_SCOPE_POLICY.magi_tables[1].source_url;
    const verify = vi.fn().mockResolvedValueOnce({ supported: false, relevant: true, citationsComplete: true, unsupportedClaims: [{ claim: 'Wrong amount', reason: 'Wrong year' }], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: `The listed amount is $1,769. [Table](${url})` }).mockResolvedValueOnce({ supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' });
    const result = await runVerificationForAnswer({ question: 'What MAGI income limits apply in October 2026?', answerText: `The amount is $1,735. [Table](${url})`, sources: [{ toolName: 'getSection', key: '2026', link: url, text: 'Effective: APRIL 1, 2026\n133% MXP-N 1769' }], verify });
    expect(result.outcome.status).toBe('corrected');
    expect(verify).toHaveBeenCalledTimes(2);
    for (const call of verify.mock.calls) expect(call[5].coverageRequirements[0]).toContain('2026-04-01');
    expect(result.finalAnswer).toContain('1,769');
  });
});
