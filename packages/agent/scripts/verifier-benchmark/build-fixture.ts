/**
 * Copy the verifier benchmark's fixtures out of the answer-evaluation results
 * (issue #268). Offline: it reads result files and writes fixtures, and makes
 * no model call.
 *
 * Usage (from packages/agent):
 *   npx tsx scripts/verifier-benchmark/build-fixture.ts [--results <dir>] [--out <dir>]
 *
 * `--results` defaults to packages/pipeline/data/eval-results, whose loose
 * files are gitignored and exist only on the machine that ran the
 * evaluations. `--out` defaults to tests/fixtures/verifier-benchmark. Labels
 * already set in labels.json are kept; new rows start `unconfirmed`.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLEAN_SAMPLE_SELECTION, JUDGED_BAD_SELECTION, buildFixtureFile, loadFixture, replayableTriples, selectCleanSample,
  selectJudgedBad, type LabelFile, type StoredRow, type StoredRun,
} from './fixture.js';
import { renderReviewSheet, sheetOrder } from './review-sheet.js';

const AGENT_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Answer-level result files under `root`, byte-identical copies counted once. */
export function loadStoredRuns(root: string): StoredRun[] {
  const files = (readdirSync(root, { recursive: true }) as string[]).filter(file => file.endsWith('.json')).sort();
  const seen = new Set<string>();
  const runs: StoredRun[] = [];
  for (const file of files) {
    const raw = readFileSync(join(root, file));
    let data: { level?: unknown; per_question?: unknown; config?: Record<string, unknown> } | null;
    try { data = JSON.parse(raw.toString('utf8')); } catch { continue; }
    if (!data || Array.isArray(data) || data.level !== 'answer' || !Array.isArray(data.per_question)) continue;
    const hash = createHash('sha256').update(raw).digest('hex');
    if (seen.has(hash)) continue;
    seen.add(hash);
    runs.push({ file, config: data.config ?? {}, rows: data.per_question as StoredRow[] });
  }
  return runs;
}

function main(): void {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const results = option('--results', join(AGENT_ROOT, '..', 'pipeline', 'data', 'eval-results'));
  const out = option('--out', join(AGENT_ROOT, 'tests', 'fixtures', 'verifier-benchmark'));

  const runs = loadStoredRuns(results);
  const bad = selectJudgedBad(runs);
  const clean = selectCleanSample(runs);
  console.log(`${runs.length} answer result files, ${replayableTriples(runs).length} replayable rows`);
  console.log(`judged bad: ${bad.length} rows over ${new Set(bad.map(({ row }) => row.id)).size} questions`);
  console.log(`clean sample: ${clean.length} rows`);

  mkdirSync(out, { recursive: true });
  const write = (name: string, value: unknown) => writeFileSync(join(out, name), JSON.stringify(value, null, 1) + '\n');
  write('judged-bad.json', buildFixtureFile('judged_bad', JUDGED_BAD_SELECTION, bad));
  write('clean-sample.json', buildFixtureFile('clean_sample', CLEAN_SAMPLE_SELECTION, clean));

  const items = loadFixture(join(out, 'judged-bad.json'));
  const labelPath = join(out, 'labels.json');
  const previous: LabelFile = existsSync(labelPath) ? JSON.parse(readFileSync(labelPath, 'utf8')) : {};
  const labels: LabelFile = Object.fromEntries(sheetOrder(items).map(item => [item.id, previous[item.id] ?? { label: 'unconfirmed', note: '' }]));
  writeFileSync(labelPath, JSON.stringify(labels, null, 2) + '\n');
  writeFileSync(join(out, 'review-sheet.md'), renderReviewSheet(items));

  const sums = ['judged-bad.json', 'clean-sample.json'].map(name => `${createHash('sha256').update(readFileSync(join(out, name))).digest('hex')}  ${name}`);
  writeFileSync(join(out, 'SHA256SUMS'), sums.join('\n') + '\n');
  console.log(`wrote ${relative(process.cwd(), out) || '.'}:\n${sums.join('\n')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
