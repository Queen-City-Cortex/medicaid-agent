/**
 * Seeded-fault benchmark for the answer verifier (issue #268). Replays
 * `runVerificationForAnswer` over stored answers and reports how often the
 * verifier stops a seeded error or a stored judged-bad answer, and how often
 * it withholds a clean one. How to read the report:
 * docs/operations/verifier-benchmark.md.
 *
 * Usage (from packages/agent):
 *   npx tsx scripts/verifier-benchmark.ts --mock
 *   npx tsx scripts/verifier-benchmark.ts --live --max-usd <dollars>
 *
 * `--mock` is offline: a stand-in replaces the model, so the numbers show the
 * report format and nothing else. `--live` calls the configured
 * VERIFIER_MODEL and costs money. It refuses to start without `--max-usd`,
 * under CI, or when its printed upper bound exceeds `--max-usd`, and it stops
 * starting runs once the spend it has measured could cross that cap, or
 * `--stop-usd` when given. `--stop-usd` holds a run below its printed bound;
 * it may not exceed `--max-usd`.
 *
 * Options: --repeats <n> (3)  --concurrency <n> (4)  --limit <n> items per
 * fixture  --arms seeded,original,judged_bad  --out <file>  --fixtures <dir>
 * --stop-usd <dollars>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ARMS = ['seeded', 'original', 'judged_bad'] as const;

export interface Args {
  mode: 'mock' | 'live';
  maxUsd: number | null;
  /** The measured-spend stop, when it differs from `maxUsd`. */
  stopUsd: number | null;
  repeats: number;
  concurrency: number;
  limit: number | null;
  arms: Array<(typeof ARMS)[number]>;
  out: string | null;
  fixtures: string;
}

/** Parse and vet the command line. Throws with the reason a run may not start. */
export function parseArgs(argv: string[], env: NodeJS.ProcessEnv): Args {
  const value = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const count = (name: string, fallback: number) => {
    const raw = value(name);
    if (raw === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(raw)) throw new Error(`${name} must be a positive integer`);
    return Number(raw);
  };
  const mock = argv.includes('--mock');
  const live = argv.includes('--live');
  if (mock === live) throw new Error('Pass exactly one of --mock (offline stand-in) or --live (paid model calls)');
  const maxUsd = value('--max-usd') === undefined ? null : Number(value('--max-usd'));
  if (live) {
    if (env.CI) throw new Error('--live is refused under CI');
    if (maxUsd === null || !Number.isFinite(maxUsd) || maxUsd <= 0) throw new Error('--live requires --max-usd <dollars>, the most this run may spend');
  }
  const stopUsd = value('--stop-usd') === undefined ? null : Number(value('--stop-usd'));
  if (stopUsd !== null) {
    if (!Number.isFinite(stopUsd) || stopUsd <= 0) throw new Error('--stop-usd must be a positive number of dollars');
    if (maxUsd === null || stopUsd > maxUsd) throw new Error('--stop-usd may not exceed --max-usd');
  }
  const arms = (value('--arms') ?? ARMS.join(',')).split(',') as Args['arms'];
  if (!arms.length || arms.some(arm => !ARMS.includes(arm))) throw new Error(`--arms takes a comma-separated list of: ${ARMS.join(', ')}`);
  return {
    mode: live ? 'live' : 'mock',
    maxUsd,
    stopUsd,
    repeats: count('--repeats', 3),
    concurrency: count('--concurrency', 4),
    limit: value('--limit') === undefined ? null : count('--limit', 0),
    arms,
    out: value('--out') ?? null,
    fixtures: value('--fixtures') ?? join(AGENT_ROOT, 'tests', 'fixtures', 'verifier-benchmark'),
  };
}

/** Whether another run may start. Every run in flight may still make both of
 *  its passes, so reserve two calls at the most one call can cost for each of
 *  them and for the new run. Their spend so far is counted twice, which errs
 *  toward stopping early. */
export function mayStartRun(spentUsd: number, runsInFlight: number, maxUsdPerCall: number, stopUsd: number): boolean {
  return spentUsd + (runsInFlight + 1) * 2 * maxUsdPerCall <= stopUsd;
}

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2), process.env);
  } catch (error) {
    console.error(`${(error as Error).message}\nSee the header of scripts/verifier-benchmark.ts for usage.`);
    return 2;
  }
  // Per-run release and evidence-budget lines would bury the report; the
  // run records carry the same facts. Verifier failures still show.
  process.env.LOG_LEVEL ??= 'error';
  if (args.mode === 'live') await import('../src/load-env.js');

  const { loadFixture, loadLabels } = await import('./verifier-benchmark/fixture.js');
  const { BOUND_OUTPUT_TOKENS_PER_CALL, costBound, formatSummary, mockVerify, planCases, runBenchmark, summarize } = await import('./verifier-benchmark/runner.js');
  const { assertVerifierModelUsable, getConfig } = await import('../src/processors/verifier/config.js');
  const { verifyAnswer } = await import('../src/processors/verifier/verify.js');
  const { estimateCostUsd } = await import('../src/usage/pricing.js');

  const take = <T>(items: T[]) => (args.limit === null ? items : items.slice(0, args.limit));
  const clean = take(loadFixture(join(args.fixtures, 'clean-sample.json')));
  const judgedBad = take(loadFixture(join(args.fixtures, 'judged-bad.json')));
  const labels = loadLabels(join(args.fixtures, 'labels.json'), judgedBad);
  const fullPlan = planCases(clean, judgedBad, labels);
  const plan = { ...fullPlan, cases: fullPlan.cases.filter(planned => args.arms.includes(planned.arm)) };
  const perArm = (arm: string) => plan.cases.filter(planned => planned.arm === arm).length;
  const model = getConfig().model;
  const bound = costBound(plan.cases, args.repeats);

  console.log(`Verifier benchmark: ${args.mode === 'mock' ? 'MOCK verifier (offline; rates mean nothing)' : `LIVE verifier ${model}`}`);
  console.log(`Cases: ${perArm('seeded')} seeded, ${perArm('original')} unseeded originals, ${perArm('judged_bad')} judged bad; ${args.repeats} repeats each = ${bound.runs} runs.`);
  console.log(`Upper bound for ${bound.model}: ${bound.maxModelCalls} model calls, ${bound.maxInputTokens.toLocaleString('en-US')} input and ${bound.maxOutputTokens.toLocaleString('en-US')} output tokens, $${bound.maxUsd.toFixed(2)}${bound.priced ? '' : ' (no price entry for this model)'}.`);

  let spentUsd = 0;
  let modelCalls = 0;
  let onUsage: ((usage: unknown) => boolean) | undefined;
  let mayStart: ((runsInFlight: number) => boolean) | undefined;
  if (args.mode === 'live') {
    assertVerifierModelUsable(process.env);
    if (!getConfig().enabled) throw new Error('VERIFIER_ENABLED=false: nothing to measure');
    if (!bound.priced) throw new Error(`No price entry for ${model} in src/usage/pricing.ts, so the spending cap cannot be enforced`);
    if (bound.maxUsd > args.maxUsd!) {
      throw new Error(`The upper bound $${bound.maxUsd.toFixed(2)} exceeds --max-usd ${args.maxUsd}. Raise the cap or narrow the run with --limit, --arms or --repeats.`);
    }
    const stopUsd = args.stopUsd ?? args.maxUsd!;
    if (!mayStartRun(0, 0, bound.maxUsdPerCall, stopUsd)) {
      throw new Error(`The stop $${stopUsd.toFixed(2)} is below the most one run can cost ($${(2 * bound.maxUsdPerCall).toFixed(2)}), so no run could start.`);
    }
    if (args.stopUsd !== null) console.log(`Measured-spend stop: $${stopUsd.toFixed(2)} (--stop-usd).`);
    onUsage = usage => {
      const { inputTokens, outputTokens, cachedInputTokens } = (usage ?? {}) as Record<string, number | undefined>;
      modelCalls += 1;
      spentUsd += estimateCostUsd({ modelId: model, inputTokens, outputTokens, cachedInputTokens }).costUsd;
      return true;
    };
    mayStart = runsInFlight => mayStartRun(spentUsd, runsInFlight, bound.maxUsdPerCall, stopUsd);
  }

  const started = Date.now();
  const { records, stoppedEarly } = await runBenchmark(plan.cases, {
    repeats: args.repeats,
    concurrency: args.concurrency,
    // The cap is what the cost bound assumes per call. A reply cut off by it
    // fails closed and is reported as an unavailable run.
    verify: args.mode === 'live'
      ? (question, answer, sources, usage, signal, issues) => verifyAnswer(question, answer, sources, usage, signal, issues, { maxOutputTokens: BOUND_OUTPUT_TOKENS_PER_CALL })
      : mockVerify,
    onUsage,
    mayStart,
    onProgress: (done, total) => { if (args.mode === 'live' && done % 25 === 0) console.error(`${done}/${total} runs, $${spentUsd.toFixed(2)} spent`); },
  });
  const summary = summarize(records);
  console.log(`\n${formatSummary(summary, plan)}\n`);
  if (args.mode === 'live') console.log(`Spent about $${spentUsd.toFixed(2)} over ${modelCalls} model calls in ${Math.round((Date.now() - started) / 1000)} s.`);
  if (stoppedEarly) console.log(`STOPPED EARLY at the spending stop: ${records.length} of ${bound.runs} runs finished. The rates above cover those runs only.`);

  // The record holds model-written findings about stored drafts: keep it out of Git.
  const out = args.out ?? (args.mode === 'live' ? join(AGENT_ROOT, 'benchmark-results', `${new Date().toISOString().replace(/[:.]/g, '-')}_${model}.json`) : null);
  if (out) {
    mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
    writeFileSync(out, JSON.stringify({
      schemaVersion: 2, mode: args.mode, model, startedAt: new Date(started).toISOString(), repeats: args.repeats,
      arms: args.arms, limit: args.limit, maxUsd: args.maxUsd, stopUsd: args.stopUsd, stoppedEarly, spentUsd, modelCalls, bound, unseedable: plan.unseedable, summary,
      seeds: plan.cases.filter(planned => planned.seed).map(planned => ({ caseId: planned.id, ...planned.seed!.change })),
      runs: records,
    }, null, 1) + '\n', { mode: 0o600 });
    console.log(`Wrote ${out}`);
  }
  return stoppedEarly ? 3 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(code => { process.exitCode = code; }, error => { console.error((error as Error).message); process.exitCode = 1; });
}
