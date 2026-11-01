/**
 * Replay engine for the verifier benchmark (issue #268): plans the runs,
 * replays each through `runVerificationForAnswer`, says which layer stopped
 * each answer, and reduces the runs to catch and false-withhold rates.
 */
import { getConfig } from '../../src/processors/verifier/config.js';
import { EVIDENCE_OVER_BUDGET, NO_EVIDENCE_FOR_CITATION, NO_SOURCES_RETRIEVED, runVerificationForAnswer, type VerificationRunResult } from '../../src/processors/verifier/run.js';
import { VERIFIER_PROMPT, type UnavailableReason, type VerificationResult, type verifyAnswer } from '../../src/processors/verifier/verify.js';
import { pricingFor } from '../../src/usage/pricing.js';
import { VERIFIER_MARKER, type BenchmarkItem, type Label } from './fixture.js';
import { SEED_KINDS, hasNumber, seedFault, seedSurvives, type SeedKind, type SeededAnswer } from './seeding.js';

export type VerifyFn = typeof verifyAnswer;

/** The three arms: seeded errors, the same answers unseeded, and stored judged-bad answers. */
export type Arm = 'seeded' | 'original' | 'judged_bad';

export interface PlannedCase {
  id: string;
  arm: Arm;
  item: BenchmarkItem;
  answerText: string;
  seed?: SeededAnswer;
  label?: Label;
}

export interface Plan {
  cases: PlannedCase[];
  /** Clean answers with no place to seed each kind of error. */
  unseedable: Record<SeedKind, number>;
}

export function planCases(clean: BenchmarkItem[], judgedBad: BenchmarkItem[], labels: Map<string, Label>): Plan {
  const cases: PlannedCase[] = [];
  const unseedable = Object.fromEntries(SEED_KINDS.map(kind => [kind, 0])) as Record<SeedKind, number>;
  for (const item of clean) {
    cases.push({ id: `${item.id}|original`, arm: 'original', item, answerText: item.answer });
    for (const kind of SEED_KINDS) {
      const seed = seedFault(kind, item.answer, item.sources);
      if (seed) cases.push({ id: `${item.id}|${kind}`, arm: 'seeded', item, answerText: seed.text, seed });
      else unseedable[kind] += 1;
    }
  }
  for (const item of judgedBad) {
    cases.push({ id: `${item.id}|judged_bad`, arm: 'judged_bad', item, answerText: item.answer, label: labels.get(item.id) ?? 'unconfirmed' });
  }
  return { cases, unseedable };
}

// ── Which layer stopped the answer ───────────────────────────────────────────

/**
 * - `deterministic`: no model verdict was needed. The coverage-scope or
 *   no-evidence rule withheld before a call, or pass 1 carried an unknown
 *   link or quotation, or the text carried a verifier marker.
 * - `budget_withhold`: cited section text did not fit the evidence budget.
 * - `model_pass_1`: the model's first verdict rejected the text.
 * - `model_pass_2`: seeded arm only. Pass 1 rejected the text for something
 *   else, its correction kept the seeded error, and the recheck withheld it.
 * - `none`: released as written, or (seeded arm) corrected with the seeded
 *   error still in the released text.
 * - `unavailable`: the verifier call failed; the run measures nothing.
 */
export type Layer = 'deterministic' | 'budget_withhold' | 'model_pass_1' | 'model_pass_2' | 'none' | 'unavailable';

export interface RunRecord {
  caseId: string;
  itemId: string;
  arm: Arm;
  kind?: SeedKind;
  label?: Label;
  repeat: number;
  status: 'passed' | 'corrected' | 'withheld';
  reason: string | null;
  passCount: number;
  modelCalls: number;
  layer: Layer;
  /** What the deterministic layer found, when it is the layer. */
  deterministicDetail?: 'coverage_scope' | 'no_evidence' | 'link_or_quotation' | 'marker';
  /** Seeded arm: the seeded error is in the released text. */
  seedReleased?: boolean;
  /** Seeded arm: the correction removed the seed but also changed text outside
   *  the seeded span, which only the candidate approved. Not a catch. */
  strayCorrection?: boolean;
  /** Unavailable runs: the verifier's own deadline, or any other failure. */
  unavailableReason?: UnavailableReason;
  /** Section labels the measured-only section check did not match. */
  unknownSectionCount: number;
  latencyMs: number;
  /** Private: model-written findings and, when corrected, the released text. */
  findings: VerificationRunResult['findings'];
  correctedAnswer?: string;
}

/** The corrected text equals the clean original everywhere outside the seeded
 *  span (the seed records where it is), whatever the span now holds. */
export function matchesCleanOutsideSeed(planned: PlannedCase, text: string): boolean {
  const { offset, original } = planned.seed!.change;
  const clean = planned.item.answer.trimEnd();
  const before = clean.slice(0, offset);
  const after = clean.slice(offset + original.length);
  const corrected = text.trimEnd();
  return corrected.length >= before.length + after.length && corrected.startsWith(before) && corrected.endsWith(after);
}

export function classifyRun(planned: PlannedCase, result: VerificationRunResult, modelCalls: number, passCandidates: string[]): Pick<RunRecord, 'layer' | 'deterministicDetail' | 'seedReleased' | 'strayCorrection'> {
  const { outcome, findings, telemetry } = result;
  const seedIn = (text: string) => !!planned.seed && seedSurvives(planned.seed, planned.item.answer, text);
  if (telemetry.verifier_unavailable) return { layer: 'unavailable' };
  if (outcome.status === 'passed') return { layer: 'none', ...(planned.seed ? { seedReleased: true } : {}) };

  const seedReleased = planned.seed ? outcome.status === 'corrected' && seedIn(result.finalAnswer) : undefined;
  const stray = seedReleased === false && outcome.status === 'corrected' && !matchesCleanOutsideSeed(planned, result.finalAnswer);
  const seeded = seedReleased === undefined ? {} : { seedReleased, ...(stray ? { strayCorrection: true } : {}) };
  if (seedReleased) return { layer: 'none', ...seeded };

  const first = findings[0];
  const firstReason = first?.unsupportedClaims[0]?.reason;
  if (modelCalls === 0) {
    if (firstReason === EVIDENCE_OVER_BUDGET) return { layer: 'budget_withhold', ...seeded };
    return { layer: 'deterministic', deterministicDetail: firstReason === NO_EVIDENCE_FOR_CITATION || firstReason === NO_SOURCES_RETRIEVED ? 'no_evidence' : 'coverage_scope', ...seeded };
  }
  if (first.unknownUrls.length || first.unknownQuotes.length) return { layer: 'deterministic', deterministicDetail: 'link_or_quotation', ...seeded };
  if (VERIFIER_MARKER.test(planned.answerText)) return { layer: 'deterministic', deterministicDetail: 'marker', ...seeded };
  if (planned.seed && outcome.status === 'withheld' && passCandidates[1] !== undefined && seedIn(passCandidates[1])) return { layer: 'model_pass_2', ...seeded };
  return { layer: 'model_pass_1', ...seeded };
}

export async function replayCase(planned: PlannedCase, repeat: number, verify: VerifyFn, onUsage?: (usage: unknown) => void): Promise<RunRecord> {
  let modelCalls = 0;
  const passCandidates: string[] = [];
  const counted: VerifyFn = (...args) => { modelCalls += 1; return verify(...args); };
  const result = await runVerificationForAnswer({
    question: planned.item.question,
    answerText: planned.answerText,
    sources: planned.item.sources,
    verify: counted,
    onUsage,
    // Always our own collector: the default would write every replay into
    // VERIFIER_PRIVATE_DIAGNOSTICS_DIR when the operator has that set.
    capture: record => { if (record.stage === 'pass') passCandidates[(record.pass as number) - 1] = record.candidate as string; },
  });
  const { outcome } = result;
  return {
    caseId: planned.id, itemId: planned.item.id, arm: planned.arm,
    ...(planned.seed ? { kind: planned.seed.change.kind } : {}),
    ...(planned.label ? { label: planned.label } : {}),
    repeat,
    status: outcome.status,
    reason: outcome.status === 'withheld' ? outcome.reason ?? null : null,
    passCount: outcome.passCount,
    modelCalls,
    ...classifyRun(planned, result, modelCalls, passCandidates),
    ...(result.telemetry.verifier_unavailable_reason ? { unavailableReason: result.telemetry.verifier_unavailable_reason } : {}),
    unknownSectionCount: result.telemetry.unknown_section_count,
    latencyMs: result.telemetry.latency_ms,
    findings: result.findings,
    ...(outcome.status === 'corrected' ? { correctedAnswer: result.finalAnswer } : {}),
  };
}

// ── Rates ────────────────────────────────────────────────────────────────────

/** Wilson 95% score interval for `hits` of `total`. */
export function wilson(hits: number, total: number): [number, number] | null {
  if (total === 0) return null;
  const z = 1.96;
  const p = hits / total;
  const centre = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  const denominator = 1 + (z * z) / total;
  return [Math.max(0, (centre - margin) / denominator), Math.min(1, (centre + margin) / denominator)];
}

export interface GroupSummary {
  group: string;
  items: number;
  /** Runs that reached a verdict; `unavailable` runs are left out of every rate. */
  runs: number;
  unavailableRuns: number;
  /** Seeded and judged-bad arms: the bad text was not released. Original arm: the answer was withheld. */
  hitRuns: number;
  hitRate: number | null;
  /** Wilson 95% interval over runs. Repeats of one item are not independent, so it is narrower than the truth. */
  interval: [number, number] | null;
  /** Items hit on every repeat, on some, and on none. */
  itemsAlways: number;
  itemsSometimes: number;
  itemsNever: number;
  byLayer: Record<Exclude<Layer, 'unavailable'>, number>;
  /** Runs no deterministic layer stopped, so the model's verdict decided them, and how many of those it stopped. */
  modelDecidedRuns: number;
  modelHitRuns: number;
  modelHitRate: number | null;
  modelInterval: [number, number] | null;
  /** Released with a rewrite. Original arm: an unneeded rewrite. Judged-bad arm: released text nobody has judged. */
  correctedRuns: number;
  /** Seeded arm: the seeded error was released inside a "corrected" answer. */
  seedReleasedInCorrection: number;
  /** Seeded arm: corrections that removed the seed but changed other text too. Not catches. */
  strayCorrections: number;
  /** Per run over every run in the group, unavailable ones included. A run may
   *  make two calls, each under its own 30-second deadline. Null when empty. */
  latencyMedianMs: number | null;
  latencyP95Ms: number | null;
  /** Runs that made one model call and took over 25 seconds: drift toward the deadline. */
  onePassOver25s: number;
  /** `unavailableRuns`, split by why. */
  deadlineAborts: number;
  otherFailures: number;
}

/** Nearest-rank percentile of `values`, null when there are none. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

/** Over 25 seconds a single call is within 5 seconds of the verifier's deadline. */
export const DRIFT_MS = 25_000;

/** A run counts as a hit when the bad text was stopped (seeded, judged bad) or a clean answer was withheld (original). */
export function isHit(record: RunRecord): boolean {
  if (record.arm === 'original') return record.status === 'withheld';
  if (record.arm === 'seeded') return record.seedReleased === false && !record.strayCorrection;
  return record.status !== 'passed';
}

export function summarizeGroup(group: string, records: RunRecord[]): GroupSummary {
  const scored = records.filter(record => record.layer !== 'unavailable');
  const hits = scored.filter(isHit);
  const byCase = new Map<string, RunRecord[]>();
  for (const record of scored) byCase.set(record.caseId, [...(byCase.get(record.caseId) ?? []), record]);
  const perCase = [...byCase.values()].map(runs => runs.filter(isHit).length / runs.length);
  const byLayer = { deterministic: 0, budget_withhold: 0, model_pass_1: 0, model_pass_2: 0, none: 0 };
  for (const record of scored) byLayer[record.layer as keyof typeof byLayer] += 1;
  const modelDecided = scored.filter(record => record.layer !== 'deterministic' && record.layer !== 'budget_withhold');
  const modelHits = modelDecided.filter(isHit);
  return {
    group,
    items: new Set(records.map(record => record.caseId)).size,
    runs: scored.length,
    unavailableRuns: records.length - scored.length,
    hitRuns: hits.length,
    hitRate: scored.length ? hits.length / scored.length : null,
    interval: wilson(hits.length, scored.length),
    itemsAlways: perCase.filter(share => share === 1).length,
    itemsSometimes: perCase.filter(share => share > 0 && share < 1).length,
    itemsNever: perCase.filter(share => share === 0).length,
    byLayer,
    modelDecidedRuns: modelDecided.length,
    modelHitRuns: modelHits.length,
    modelHitRate: modelDecided.length ? modelHits.length / modelDecided.length : null,
    modelInterval: wilson(modelHits.length, modelDecided.length),
    correctedRuns: scored.filter(record => record.status === 'corrected').length,
    seedReleasedInCorrection: scored.filter(record => record.status === 'corrected' && record.seedReleased === true).length,
    strayCorrections: scored.filter(record => record.strayCorrection).length,
    latencyMedianMs: percentile(records.map(record => record.latencyMs), 0.5),
    latencyP95Ms: percentile(records.map(record => record.latencyMs), 0.95),
    onePassOver25s: records.filter(record => record.modelCalls === 1 && record.latencyMs > DRIFT_MS).length,
    deadlineAborts: records.filter(record => record.layer === 'unavailable' && record.unavailableReason === 'deadline').length,
    otherFailures: records.filter(record => record.layer === 'unavailable' && record.unavailableReason !== 'deadline').length,
  };
}

export interface Summary {
  seeded: GroupSummary[];
  original: GroupSummary;
  judgedBad: GroupSummary[];
}

export function summarize(records: RunRecord[]): Summary {
  const seeded = records.filter(record => record.arm === 'seeded');
  const bad = records.filter(record => record.arm === 'judged_bad');
  return {
    seeded: [...SEED_KINDS.map(kind => summarizeGroup(kind, seeded.filter(record => record.kind === kind))), summarizeGroup('all kinds', seeded)],
    original: summarizeGroup('unseeded originals', records.filter(record => record.arm === 'original')),
    judgedBad: (['confirmed-bad', 'unconfirmed', 'not-bad'] as const).map(label => summarizeGroup(label, bad.filter(record => record.label === label))),
  };
}

const percent = (rate: number | null) => (rate === null ? 'n/a' : `${(rate * 100).toFixed(1)}%`);
const range = (interval: [number, number] | null) => (interval ? `${(interval[0] * 100).toFixed(1)} to ${(interval[1] * 100).toFixed(1)}%` : 'n/a');

function table(header: string[], rows: string[][]): string {
  const widths = header.map((cell, i) => Math.max(cell.length, ...rows.map(row => row[i].length)));
  const line = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i])).join('  ').trimEnd();
  return [line(header), line(widths.map(width => '-'.repeat(width))), ...rows.map(line)].join('\n');
}

const seconds = (ms: number | null) => (ms === null ? 'n/a' : `${(ms / 1000).toFixed(1)} s`);

function latencyRows(groups: GroupSummary[]): string {
  return table(
    ['group', 'median per run', '95th percentile per run', 'one-pass runs over 25 s', 'deadline aborts', 'other failures'],
    groups.map(g => [g.group, seconds(g.latencyMedianMs), seconds(g.latencyP95Ms), String(g.onePassOver25s), String(g.deadlineAborts), String(g.otherFailures)]),
  );
}

function groupRows(groups: GroupSummary[], hit: string): string {
  return table(
    ['group', 'items', 'runs', hit, 'rate', '95% interval', 'items 3/3', 'some', 'none', 'deterministic', 'budget', 'model p1', 'model p2', 'not stopped', 'model rate (of runs it decided)', 'corrected', 'unavailable'],
    groups.map(g => [
      g.group, String(g.items), String(g.runs), String(g.hitRuns), percent(g.hitRate), range(g.interval),
      String(g.itemsAlways), String(g.itemsSometimes), String(g.itemsNever),
      String(g.byLayer.deterministic), String(g.byLayer.budget_withhold), String(g.byLayer.model_pass_1), String(g.byLayer.model_pass_2), String(g.byLayer.none),
      `${g.modelHitRuns}/${g.modelDecidedRuns} ${percent(g.modelHitRate)} (${range(g.modelInterval)})`,
      String(g.correctedRuns), String(g.unavailableRuns),
    ]),
  );
}

export function formatSummary(summary: Summary, plan: Plan): string {
  const seedReleased = summary.seeded[summary.seeded.length - 1].seedReleasedInCorrection;
  const stray = summary.seeded.map(group => `${group.group} ${group.strayCorrections}`).join(', ');
  return [
    'SEEDED ERRORS: catch rate (a catch is a run that did not release the seeded error)',
    groupRows(summary.seeded, 'caught'),
    `Clean answers with no place to seed: ${SEED_KINDS.map(kind => `${kind} ${plan.unseedable[kind]}`).join(', ')}.`,
    `Runs that released the seeded error inside a "corrected" answer: ${seedReleased}.`,
    `Stray corrections (seed removed, other text changed too; not counted as catches): ${stray}.`,
    '',
    'UNSEEDED ORIGINALS: false-withhold rate (a hit is a clean answer withheld; "corrected" is an unneeded rewrite)',
    groupRows([summary.original], 'withheld'),
    '',
    'STORED JUDGED-BAD ANSWERS: catch rate by label (a catch is a run withheld or corrected; corrected text is not judged)',
    groupRows(summary.judgedBad, 'caught'),
    '',
    'LATENCY AND UNAVAILABLE RUNS (per run, unavailable runs included; a run may make two calls, each under its own 30 s deadline)',
    latencyRows([...summary.seeded, summary.original, ...summary.judgedBad]),
    '',
    'The interval is a Wilson 95% interval over runs. Repeats of one item are not independent, so read it',
    'with the per-item columns: an item caught on some repeats only is the verifier disagreeing with itself.',
  ].join('\n');
}

// ── Mock verifier and cost bound ─────────────────────────────────────────────

const MOCK_FIGURE = /\$\s?(\d[\d,]*(?:\.\d+)?)|\b(\d[\d,]*(?:\.\d+)?)\s?(?:%|percent\b)|\b(\d[\d,]*(?:\.\d+)?)(?=[ -](?:calendar |business )?(?:days?|hours?|visits?|units?|months?|years?)\b)/gi;

/**
 * Offline stand-in for the model, for tests and for showing the report
 * format. It rejects a line that states a dollar amount, percentage or
 * counted quantity absent from the evidence text and returns the answer
 * without that line. It knows nothing else, so its rates mean nothing.
 */
export const mockVerify: VerifyFn = async (_question, answerText, sourceText) => {
  const lines = answerText.split('\n');
  const bad = lines.filter(line => [...line.replace(/\]\([^)]*\)/g, ']').matchAll(MOCK_FIGURE)].some(match => !hasNumber(sourceText, match[1] ?? match[2] ?? match[3])));
  const verdict: VerificationResult = {
    supported: bad.length === 0, relevant: true, citationsComplete: true,
    unsupportedClaims: bad.map(line => ({ claim: line.slice(0, 200), reason: 'mock: figure not found in the evidence text' })),
    missingCitationClaims: [], relevanceIssues: [],
    correctedAnswer: bad.length ? lines.filter(line => !bad.includes(line)).join('\n') : '',
  };
  return verdict;
};

/** Output tokens per call for the bound: findings, a full rewrite and low-effort reasoning.
 *  Live runs send it as the call's output cap, so no call can cost more than the bound assumes. */
export const BOUND_OUTPUT_TOKENS_PER_CALL = 6_000;

export interface CostBound {
  model: string;
  priced: boolean;
  runs: number;
  /** Two passes for every run. */
  maxModelCalls: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxUsd: number;
  /** The most one call can cost, used to stop before the cap is crossed. */
  maxUsdPerCall: number;
}

/**
 * Upper bound on a live run: every run makes both passes, every call sends
 * the whole prompt, the answer and the evidence up to the verifier's budget,
 * at 3 characters per token (the code budgets 4), and returns
 * `BOUND_OUTPUT_TOKENS_PER_CALL` tokens, at uncached input prices.
 */
export function costBound(cases: PlannedCase[], repeats: number): CostBound {
  const { model, maxSourceChars } = getConfig();
  const { pricing, known } = pricingFor(model);
  const overheadChars = VERIFIER_PROMPT.length + 3_000;
  const callTokens = cases.map(planned => {
    const evidenceChars = Math.min(maxSourceChars, planned.item.sources.reduce((sum, source) => sum + source.text.length + 7, 0));
    return Math.ceil((overheadChars + planned.item.question.length + planned.answerText.length + evidenceChars) / 3);
  });
  const usdPerCall = (inputTokens: number) => (inputTokens * pricing.inputPerMTok + BOUND_OUTPUT_TOKENS_PER_CALL * pricing.outputPerMTok) / 1_000_000;
  const runs = cases.length * repeats;
  const maxInputTokens = callTokens.reduce((sum, tokens) => sum + tokens, 0) * repeats * 2;
  return {
    model, priced: known, runs,
    maxModelCalls: runs * 2,
    maxInputTokens,
    maxOutputTokens: runs * 2 * BOUND_OUTPUT_TOKENS_PER_CALL,
    maxUsd: callTokens.reduce((sum, tokens) => sum + usdPerCall(tokens), 0) * repeats * 2,
    maxUsdPerCall: usdPerCall(Math.max(0, ...callTokens)),
  };
}

export interface BenchmarkOptions {
  repeats: number;
  concurrency: number;
  verify: VerifyFn;
  /** Called with each model call's usage; return false to stop starting new runs. */
  onUsage?: (usage: unknown) => boolean;
  /** Asked before each run starts, including the first batch, with the runs still in flight. */
  mayStart?: (runsInFlight: number) => boolean;
  onProgress?: (done: number, total: number) => void;
}

export async function runBenchmark(cases: PlannedCase[], options: BenchmarkOptions): Promise<{ records: RunRecord[]; stoppedEarly: boolean }> {
  const queue = cases.flatMap(planned => Array.from({ length: options.repeats }, (_, i) => ({ planned, repeat: i + 1 })));
  const records: RunRecord[] = [];
  let next = 0;
  let stop = false;
  let inFlight = 0;
  const worker = async () => {
    while (!stop && next < queue.length) {
      if (options.mayStart?.(inFlight) === false) { stop = true; break; }
      const { planned, repeat } = queue[next++];
      inFlight += 1;
      try {
        records.push(await replayCase(planned, repeat, options.verify, usage => { if (options.onUsage?.(usage) === false) stop = true; }));
      } finally {
        inFlight -= 1;
      }
      options.onProgress?.(records.length, queue.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency) }, worker));
  records.sort((a, b) => a.caseId.localeCompare(b.caseId) || a.repeat - b.repeat);
  return { records, stoppedEarly: records.length < queue.length };
}
