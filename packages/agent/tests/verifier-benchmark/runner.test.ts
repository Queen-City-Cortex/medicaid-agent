import { afterEach, describe, expect, it, vi } from 'vitest';
import { toSourceEntry, type BenchmarkItem } from '../../scripts/verifier-benchmark/fixture.js';
import {
  costBound, formatSummary, isHit, mockVerify, percentile, planCases, replayCase, runBenchmark, summarize, summarizeGroup, wilson,
  type PlannedCase, type RunRecord, type VerifyFn,
} from '../../scripts/verifier-benchmark/runner.js';
import { mayStartRun, parseArgs } from '../../scripts/verifier-benchmark.js';
import { VERIFICATION_UNAVAILABLE, type VerificationResult } from '../../src/processors/verifier/verify.js';

const LINK = 'https://example.test/8c';
const sources = [
  { toolName: 'getSection', key: 'sec:8c:3.2.1', link: LINK, text: 'ID: sec:8c:3.2.1\nSection: 3.2.1\nContent:\nThe provider must submit the request within 30 calendar days.' },
  { toolName: 'getSection', key: 'sec:8c:5.3', link: LINK, text: 'ID: sec:8c:5.3\nSection: 5.3\nContent:\nThe plan was revised April 15, 2025.' },
].map(toSourceEntry);
const item = (id: string, answer: string, itemSources = sources): BenchmarkItem => ({
  id, runFile: 'run.json', questionId: id, question: 'When must the provider submit the request?', answer, sources: itemSources,
  judge: { factual_accuracy: 3, completeness: 3, hallucination: 3, citation_quality: 3, overall: 3, explanation: '' },
  stored: { gitSha: null, verifierModel: null, verifierOutcome: 'advisory', hasMarker: false },
});
const ANSWER = `The provider must submit the request within 30 calendar days [Policy 8C § 3.2.1](${LINK}).\nThe plan was revised April 15, 2025 [Policy 8C § 5.3](${LINK}).`;
const cleanItem = item('clean-1', ANSWER);

const verdict = (overrides: Partial<VerificationResult> = {}): VerificationResult => ({
  supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '', ...overrides,
});
const reject = (correctedAnswer: string) => verdict({ supported: false, unsupportedClaims: [{ claim: 'claim', reason: 'not in the sources' }], correctedAnswer });
const scripted = (...verdicts: VerificationResult[]): VerifyFn => {
  let call = 0;
  return async () => verdicts[Math.min(call++, verdicts.length - 1)];
};
const seededCase = (kind: string) => planCases([cleanItem], [], new Map()).cases.find(planned => planned.id.endsWith(`|${kind}`))!;

afterEach(() => vi.unstubAllEnvs());

describe('planCases', () => {
  it('plans the unseeded original and one case per kind that can be seeded', () => {
    const noDate = item('clean-2', `The provider must submit the request [Policy 8C § 3.2.1](${LINK}).`);
    const { cases, unseedable } = planCases([cleanItem, noDate], [item('bad-1', 'Wrong.')], new Map([['bad-1', 'confirmed-bad']]));
    expect(cases.map(planned => planned.id)).toEqual([
      'clean-1|original', 'clean-1|figure', 'clean-1|date', 'clean-1|qualifier', 'clean-1|section_label',
      'clean-2|original', 'clean-2|qualifier', 'clean-2|section_label', 'bad-1|judged_bad',
    ]);
    expect(unseedable).toEqual({ figure: 1, date: 1, qualifier: 0, section_label: 0 });
    expect(cases.find(planned => planned.arm === 'judged_bad')!.label).toBe('confirmed-bad');
    // A judged-bad answer nobody has labelled is unconfirmed, never confirmed.
    expect(planCases([], [item('bad-2', 'Wrong.')], new Map()).cases[0].label).toBe('unconfirmed');
  });
});

describe('which layer stopped the answer', () => {
  it('none: the model passed the seeded text and it was released', async () => {
    const record = await replayCase(seededCase('figure'), 1, scripted(verdict()));
    expect(record).toMatchObject({ arm: 'seeded', kind: 'figure', status: 'passed', layer: 'none', seedReleased: true, modelCalls: 1, passCount: 1 });
    expect(isHit(record)).toBe(false);
  });

  it('model pass 1: the model rejected the seeded text and its correction, without the seed, passed the recheck', async () => {
    const record = await replayCase(seededCase('figure'), 1, scripted(reject(ANSWER), verdict()));
    expect(record).toMatchObject({ status: 'corrected', layer: 'model_pass_1', seedReleased: false, modelCalls: 2, correctedAnswer: ANSWER });
    expect(isHit(record)).toBe(true);
  });

  it('model pass 1: the model rejected the seeded text and offered no usable correction', async () => {
    const record = await replayCase(seededCase('date'), 1, scripted(reject('')));
    expect(record).toMatchObject({ status: 'withheld', reason: 'unusable_correction', layer: 'model_pass_1', seedReleased: false, modelCalls: 1 });
  });

  it('model pass 2: the correction kept the seeded error and the recheck withheld it', async () => {
    const planned = seededCase('figure');
    const keptSeed = planned.answerText.replace('The plan was revised', 'The plan was last revised');
    const record = await replayCase(planned, 1, scripted(reject(keptSeed), reject('Another rewrite.')));
    expect(record).toMatchObject({ status: 'withheld', layer: 'model_pass_2', seedReleased: false, modelCalls: 2 });
    expect(isHit(record)).toBe(true);
  });

  it('none: a "corrected" answer that still carries the seeded error is a miss', async () => {
    const planned = seededCase('figure');
    const keptSeed = planned.answerText.replace('The plan was revised', 'The plan was last revised');
    const record = await replayCase(planned, 1, scripted(reject(keptSeed), verdict()));
    expect(record).toMatchObject({ status: 'corrected', layer: 'none', seedReleased: true });
    expect(isHit(record)).toBe(false);
  });

  it('deterministic: an unknown link is found before the model is asked', async () => {
    const planned: PlannedCase = { id: 'bad|judged_bad', arm: 'judged_bad', label: 'unconfirmed', item: cleanItem, answerText: `${ANSWER}\nSee [the form](https://example.test/unknown).` };
    const record = await replayCase(planned, 1, scripted(reject('')));
    expect(record).toMatchObject({ status: 'withheld', layer: 'deterministic', deterministicDetail: 'link_or_quotation' });
  });

  it('deterministic: a verifier marker in the stored text fails it whatever the model says', async () => {
    const planned: PlannedCase = { id: 'bad|judged_bad', arm: 'judged_bad', label: 'unconfirmed', item: cleanItem, answerText: `${ANSWER} [unverified: maybe]` };
    const record = await replayCase(planned, 1, scripted(verdict()));
    expect(record).toMatchObject({ status: 'withheld', layer: 'deterministic', deterministicDetail: 'marker', modelCalls: 1 });
  });

  it('deterministic: an answer citing a link with no evidence retrieved is withheld without a model call', async () => {
    const hintOnly = [{ toolName: 'resolveAnswerFrame', key: 'frame', text: `Routing hint ${LINK}`, link: LINK }];
    const verify = vi.fn(scripted(verdict()));
    const record = await replayCase({ id: 'x|judged_bad', arm: 'judged_bad', label: 'unconfirmed', item: item('x', ANSWER, hintOnly), answerText: ANSWER }, 1, verify);
    expect(verify).not.toHaveBeenCalled();
    expect(record).toMatchObject({ status: 'withheld', layer: 'deterministic', deterministicDetail: 'no_evidence', modelCalls: 0, passCount: 0 });
  });

  it('budget withhold: cited section text that does not fit the evidence budget is withheld without a model call', async () => {
    vi.stubEnv('VERIFIER_MAX_SOURCE_TOKENS', '10');
    const verify = vi.fn(scripted(verdict()));
    const record = await replayCase({ id: 'clean-1|original', arm: 'original', item: cleanItem, answerText: ANSWER }, 1, verify);
    expect(verify).not.toHaveBeenCalled();
    expect(record).toMatchObject({ status: 'withheld', layer: 'budget_withhold', modelCalls: 0 });
    expect(isHit(record)).toBe(true);
  });

  it('unavailable: a failed verifier call measures nothing', async () => {
    const outage = verdict({ supported: false, unsupportedClaims: [{ claim: 'Full answer', reason: VERIFICATION_UNAVAILABLE }], unavailableReason: 'other' });
    const record = await replayCase(seededCase('figure'), 1, scripted(outage));
    expect(record).toMatchObject({ status: 'withheld', reason: 'unavailable', layer: 'unavailable', unavailableReason: 'other' });
    expect(summarizeGroup('figure', [record])).toMatchObject({ runs: 0, unavailableRuns: 1, hitRate: null, deadlineAborts: 0, otherFailures: 1 });
  });

  it('unavailable: the run records a deadline abort as such', async () => {
    const outage = verdict({ supported: false, unsupportedClaims: [{ claim: 'Full answer', reason: VERIFICATION_UNAVAILABLE }], unavailableReason: 'deadline' });
    const record = await replayCase(seededCase('figure'), 1, scripted(outage));
    expect(record).toMatchObject({ layer: 'unavailable', unavailableReason: 'deadline' });
    expect(summarizeGroup('figure', [record])).toMatchObject({ unavailableRuns: 1, deadlineAborts: 1, otherFailures: 0 });
  });

  it('available runs carry no unavailable reason', async () => {
    const record = await replayCase(seededCase('figure'), 1, scripted(verdict()));
    expect(record).not.toHaveProperty('unavailableReason');
  });

  it('stray correction: the seed is gone but other text changed too, so it is not a catch', async () => {
    const planned = seededCase('figure');
    const rewritten = ANSWER.replace('The provider must submit', 'Providers submit');
    const record = await replayCase(planned, 1, scripted(reject(rewritten), verdict()));
    expect(record).toMatchObject({ status: 'corrected', seedReleased: false, strayCorrection: true });
    expect(isHit(record)).toBe(false);
    expect(summarizeGroup('figure', [record])).toMatchObject({ hitRuns: 0, strayCorrections: 1 });
  });

  it('a correction that restores the clean original, or changes only the seeded span, is a catch', async () => {
    const planned = seededCase('figure');
    const { offset, original } = planned.seed!.change;
    const spanOnly = ANSWER.slice(0, offset) + 'about a month' + ANSWER.slice(offset + original.length);
    for (const corrected of [ANSWER, `${ANSWER}\n`, spanOnly]) {
      const record = await replayCase(planned, 1, scripted(reject(corrected), verdict()));
      expect(record).toMatchObject({ status: 'corrected', seedReleased: false });
      expect(record).not.toHaveProperty('strayCorrection');
      expect(isHit(record)).toBe(true);
    }
  });

  it('never writes to the private diagnostics directory', async () => {
    // A relative path makes the default capture throw; the benchmark passes its own.
    vi.stubEnv('VERIFIER_PRIVATE_DIAGNOSTICS_DIR', 'relative/path');
    await expect(replayCase(seededCase('figure'), 1, scripted(verdict()))).resolves.toMatchObject({ status: 'passed' });
  });
});

describe('rates', () => {
  it('Wilson 95% interval', () => {
    expect(wilson(0, 0)).toBeNull();
    const [low, high] = wilson(8, 10)!;
    expect(low).toBeCloseTo(0.4902, 3);
    expect(high).toBeCloseTo(0.9433, 3);
    expect(wilson(0, 10)![0]).toBe(0);
    expect(wilson(10, 10)![1]).toBe(1);
  });

  const record = (caseId: string, repeat: number, overrides: Partial<RunRecord>): RunRecord => ({
    caseId, itemId: caseId, arm: 'seeded', kind: 'figure', repeat, status: 'passed', reason: null, passCount: 1, modelCalls: 1,
    layer: 'none', seedReleased: true, unknownSectionCount: 0, latencyMs: 1, findings: [], ...overrides,
  });
  const caught = { status: 'withheld' as const, layer: 'model_pass_1' as const, seedReleased: false };

  it('counts catches per run and per item, by layer, and the model rate over the runs it decided', () => {
    const records = [
      record('a', 1, caught), record('a', 2, caught), record('a', 3, caught),
      record('b', 1, caught), record('b', 2, {}), record('b', 3, {}),
      record('c', 1, {}), record('c', 2, {}), record('c', 3, {}),
      record('d', 1, { ...caught, layer: 'deterministic' }), record('d', 2, { ...caught, layer: 'deterministic' }), record('d', 3, { ...caught, layer: 'unavailable' }),
    ];
    expect(summarizeGroup('figure', records)).toMatchObject({
      items: 4, runs: 11, unavailableRuns: 1, hitRuns: 6, itemsAlways: 2, itemsSometimes: 1, itemsNever: 1,
      byLayer: { deterministic: 2, budget_withhold: 0, model_pass_1: 4, model_pass_2: 0, none: 5 },
      modelDecidedRuns: 9, modelHitRuns: 4,
    });
    expect(summarizeGroup('figure', records).hitRate).toBeCloseTo(6 / 11);
    expect(summarizeGroup('figure', records).modelHitRate).toBeCloseTo(4 / 9);
  });

  it('a false withhold is a clean original withheld; a correction is counted beside it', () => {
    const original = { arm: 'original' as const, kind: undefined, seedReleased: undefined };
    const summary = summarizeGroup('unseeded originals', [
      record('a', 1, original), record('a', 2, { ...original, status: 'corrected', layer: 'model_pass_1' }), record('a', 3, { ...original, status: 'withheld', layer: 'model_pass_1' }),
    ]);
    expect(summary).toMatchObject({ runs: 3, hitRuns: 1, correctedRuns: 1, itemsSometimes: 1 });
  });

  it('reports latency per run and splits unavailable runs by reason', () => {
    const records = [
      record('a', 1, { latencyMs: 1_000 }), record('a', 2, { latencyMs: 26_000 }), record('a', 3, { latencyMs: 40_000, modelCalls: 2 }),
      record('b', 1, { latencyMs: 30_000, layer: 'unavailable', unavailableReason: 'deadline' }),
      record('b', 2, { latencyMs: 2_000, layer: 'unavailable', unavailableReason: 'other' }),
    ];
    expect(summarizeGroup('figure', records)).toMatchObject({
      unavailableRuns: 2, deadlineAborts: 1, otherFailures: 1,
      latencyMedianMs: 26_000, latencyP95Ms: 40_000,
      // The two-call 40 s run is two deadlines, not drift; the 30 s abort is one call past 25 s.
      onePassOver25s: 2,
    });
    expect(summarizeGroup('figure', [])).toMatchObject({ latencyMedianMs: null, latencyP95Ms: null, onePassOver25s: 0 });
  });

  it('nearest-rank percentiles', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([5], 0.95)).toBe(5);
    expect(percentile([4, 1, 3, 2], 0.5)).toBe(2);
    expect(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 0.95)).toBe(19);
  });

  it('reports confirmed, unconfirmed and rejected judged-bad labels separately', () => {
    const bad = (label: RunRecord['label'], status: RunRecord['status']) => record(`${label}-${status}`, 1, { arm: 'judged_bad', kind: undefined, seedReleased: undefined, label, status, layer: status === 'passed' ? 'none' : 'model_pass_1' });
    const summary = summarize([bad('confirmed-bad', 'withheld'), bad('confirmed-bad', 'passed'), bad('unconfirmed', 'corrected'), bad('not-bad', 'passed')]);
    expect(summary.judgedBad.map(group => [group.group, group.runs, group.hitRuns])).toEqual([['confirmed-bad', 2, 1], ['unconfirmed', 1, 1], ['not-bad', 1, 0]]);
  });
});

describe('end to end against the mock verifier', () => {
  it('replays every case three times and prints each arm', async () => {
    const badItem = item('bad-1', `The provider has 90 calendar days [Policy 8C § 3.2.1](${LINK}).`);
    const plan = planCases([cleanItem], [badItem], new Map());
    const { records, stoppedEarly } = await runBenchmark(plan.cases, { repeats: 3, concurrency: 2, verify: mockVerify });
    expect(stoppedEarly).toBe(false);
    expect(records).toHaveLength(plan.cases.length * 3);
    const summary = summarize(records);
    // The mock only knows figures: it stops the seeded figure and the wrong
    // figure in the judged-bad answer, and misses the other three kinds. It
    // corrects by dropping the whole line, which changes text outside the
    // seeded span, so its figure corrections are stray, not catches.
    expect(summary.seeded.map(group => [group.group, group.hitRuns, group.strayCorrections, group.runs])).toEqual([
      ['figure', 0, 3, 3], ['date', 0, 0, 3], ['qualifier', 0, 0, 3], ['section_label', 0, 0, 3], ['all kinds', 0, 3, 12],
    ]);
    expect(summary.original).toMatchObject({ runs: 3, hitRuns: 0 });
    expect(summary.judgedBad[1]).toMatchObject({ group: 'unconfirmed', runs: 3, hitRuns: 3 });
    const report = formatSummary(summary, plan);
    expect(report).toContain('SEEDED ERRORS');
    expect(report).toContain('UNSEEDED ORIGINALS: false-withhold rate');
    expect(report).toContain('STORED JUDGED-BAD ANSWERS');
    expect(report).toMatch(/figure\s+1\s+3\s+0\s+0\.0%/);
    // The latency, abort and stray lines print under the mock too, so the shape can be checked for free.
    expect(report).toContain('LATENCY AND UNAVAILABLE RUNS');
    expect(report).toMatch(/median per run\s+95th percentile per run\s+one-pass runs over 25 s\s+deadline aborts\s+other failures/);
    expect(report).toMatch(/unseeded originals\s+\d+\.\d s\s+\d+\.\d s\s+0\s+0\s+0/);
    expect(report).toContain('Stray corrections (seed removed, other text changed too; not counted as catches): figure 3, date 0, qualifier 0, section_label 0, all kinds 3.');
    // The JSON output is the summary itself, so it carries the same figures.
    expect(JSON.parse(JSON.stringify(summary)).original).toMatchObject({ deadlineAborts: 0, otherFailures: 0, onePassOver25s: 0, strayCorrections: 0 });
    expect(typeof summary.original.latencyMedianMs).toBe('number');
  });

  it('stops starting runs once the usage callback says the cap is reached', async () => {
    const plan = planCases([cleanItem], [], new Map());
    const spending: VerifyFn = async (_q, _a, _s, onUsage) => { onUsage?.({ inputTokens: 1, outputTokens: 1 }); return verdict(); };
    let calls = 0;
    const { records, stoppedEarly } = await runBenchmark(plan.cases, { repeats: 3, concurrency: 1, verify: spending, onUsage: () => ++calls < 4 });
    expect(stoppedEarly).toBe(true);
    expect(records).toHaveLength(4);
  });

  it('asks before every run, the first batch included, with the runs still in flight', async () => {
    const plan = planCases([cleanItem], [], new Map());
    const seen: number[] = [];
    const { records, stoppedEarly } = await runBenchmark(plan.cases, { repeats: 3, concurrency: 4, verify: mockVerify,
      mayStart: inFlight => { seen.push(inFlight); return inFlight < 1; } });
    // The second worker of the first batch is refused while the first run is in flight.
    expect(seen.slice(0, 2)).toEqual([0, 1]);
    expect(stoppedEarly).toBe(true);
    expect(records.length).toBeLessThan(plan.cases.length * 3);
  });
});

describe('cost bound', () => {
  it('assumes two passes per run at the evidence budget and prices them for the configured model', () => {
    vi.stubEnv('VERIFIER_MODEL', '');
    const plan = planCases([cleanItem], [], new Map());
    const bound = costBound(plan.cases, 3);
    expect(bound).toMatchObject({ model: 'gpt-5.6-terra', priced: true, runs: 15, maxModelCalls: 30, maxOutputTokens: 180_000 });
    expect(bound.maxUsd).toBeGreaterThan(0);
    expect(bound.maxUsd).toBeLessThan(30 * bound.maxUsdPerCall + 1e-9);
  });

  it('says so when the model has no price, so a live run can refuse', () => {
    vi.stubEnv('VERIFIER_MODEL', 'gpt-unpriced');
    expect(costBound([], 3)).toMatchObject({ priced: false, maxUsd: 0 });
  });
});

describe('command line', () => {
  it('needs exactly one of --mock and --live', () => {
    expect(() => parseArgs([], {})).toThrow('exactly one of --mock');
    expect(() => parseArgs(['--mock', '--live', '--max-usd', '5'], {})).toThrow('exactly one of --mock');
    expect(parseArgs(['--mock'], {})).toMatchObject({ mode: 'mock', repeats: 3, concurrency: 4, arms: ['seeded', 'original', 'judged_bad'] });
  });

  it('refuses a paid run without a spending cap, and under CI', () => {
    expect(() => parseArgs(['--live'], {})).toThrow('--live requires --max-usd');
    expect(() => parseArgs(['--live', '--max-usd', '0'], {})).toThrow('--live requires --max-usd');
    expect(() => parseArgs(['--live', '--max-usd', '50'], { CI: 'true' })).toThrow('--live is refused under CI');
    expect(parseArgs(['--live', '--max-usd', '50', '--repeats', '1', '--arms', 'judged_bad'], {})).toMatchObject({ mode: 'live', maxUsd: 50, repeats: 1, arms: ['judged_bad'] });
  });

  it('takes a measured-spend stop no higher than the cap', () => {
    expect(parseArgs(['--live', '--max-usd', '121', '--stop-usd', '60'], {})).toMatchObject({ maxUsd: 121, stopUsd: 60 });
    expect(parseArgs(['--live', '--max-usd', '121'], {})).toMatchObject({ maxUsd: 121, stopUsd: null });
    expect(() => parseArgs(['--live', '--max-usd', '50', '--stop-usd', '60'], {})).toThrow('--stop-usd may not exceed --max-usd');
    expect(() => parseArgs(['--mock', '--stop-usd', '5'], {})).toThrow('--stop-usd may not exceed --max-usd');
    expect(() => parseArgs(['--live', '--max-usd', '50', '--stop-usd', '0'], {})).toThrow('--stop-usd must be a positive number');
  });

  it('reserves both passes of every run in flight and of the new run before starting it', () => {
    // $50 spent, 3 runs in flight, $1 a call: 50 + 4 runs x 2 calls x $1 = 58.
    expect(mayStartRun(50, 3, 1, 58)).toBe(true);
    expect(mayStartRun(50.01, 3, 1, 58)).toBe(false);
    // Four two-pass runs at $0.10 a call need $0.80, so a $0.71 stop admits only three.
    expect([0, 1, 2, 3].map(inFlight => mayStartRun(0, inFlight, 0.1, 0.71))).toEqual([true, true, true, false]);
    // A stop below one run's two calls admits nothing.
    expect(mayStartRun(0, 0, 1, 1.99)).toBe(false);
  });

  it('rejects malformed options', () => {
    expect(() => parseArgs(['--mock', '--repeats', '0'], {})).toThrow('--repeats must be a positive integer');
    expect(() => parseArgs(['--mock', '--arms', 'everything'], {})).toThrow('--arms takes');
  });
});
