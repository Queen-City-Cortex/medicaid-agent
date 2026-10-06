/**
 * The verifier benchmark's fixtures (issue #268): stored question, answer and
 * evidence triples copied out of the answer-evaluation results, and the
 * owner's labels for the judged-bad ones. See
 * tests/fixtures/verifier-benchmark/README.md for provenance.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateAnswerQuotes, validateAnswerUrls } from '../../src/processors/verifier/answer-validation.js';
import { buildSourceText, type SourceEntry } from '../../src/processors/verifier/evidence.js';

export const FIXTURE_SCHEMA_VERSION = 1;

/** A stored source, as the evaluation results hold it. */
export interface StoredSource {
  toolName: string;
  key: string;
  text: string;
  link?: string | null;
}

export interface JudgeScores {
  factual_accuracy: number | null;
  completeness: number | null;
  hallucination: number | null;
  citation_quality: number | null;
  overall: number | null;
  explanation: string;
}

export interface FixtureItem {
  /** `<result file>#<question id>`: one stored answer. */
  id: string;
  runFile: string;
  questionId: string;
  question: string;
  answer: string;
  /** Keys into the fixture's `sources` pool, in tool-call order. */
  sourceRefs: string[];
  judge: JudgeScores;
  stored: {
    gitSha: string | null;
    verifierModel: string | null;
    /** The stored run's release outcome; "advisory" when the run had no enforced gate. */
    verifierOutcome: string;
    /** The stored answer carries a verifier marker such as `[unverified: …]`. */
    hasMarker: boolean;
  };
}

export interface FixtureFile {
  schemaVersion: number;
  set: 'judged_bad' | 'clean_sample';
  selection: string;
  sources: Record<string, StoredSource>;
  items: FixtureItem[];
}

export interface BenchmarkItem extends Omit<FixtureItem, 'sourceRefs'> {
  sources: SourceEntry[];
}

type StoredScores = Partial<Record<Exclude<keyof JudgeScores, 'explanation'>, number | null>> & { explanation?: string };

/** The fields of a stored per-question row that the fixtures read. */
export interface StoredRow {
  id: string;
  question: string;
  agent_answer?: string | null;
  agent_error?: string | null;
  scores?: StoredScores | null;
  agent_evidence?: { sources?: StoredSource[] } | null;
  verifier?: { verifier_model?: string | null; outcome?: { status?: string } | null } | null;
}

/** One answer-level evaluation result file. */
export interface StoredRun {
  file: string;
  config: Record<string, unknown>;
  rows: StoredRow[];
}

const SECTION_BODY_TOOLS = new Set(['getSection', 'resolveAnswerFrame:section']);
export const VERIFIER_MARKER = /\[(?:unverified|wrong source|missing citation):/i;

/**
 * The stored rows predate the structured `sectionNumber` and `policyNumber`
 * fields on a source entry, which `validateAnswerSections` reads. Both are in
 * the header of the serialized section text, so recover them from there.
 */
export function toSourceEntry(source: StoredSource): SourceEntry {
  const entry: SourceEntry = { toolName: source.toolName, key: source.key, text: source.text, link: source.link ?? null };
  if (!SECTION_BODY_TOOLS.has(source.toolName)) return entry;
  const bodyAt = source.text.indexOf('\nContent:\n');
  const header = bodyAt === -1 ? source.text : source.text.slice(0, bodyAt);
  const field = (label: string) => header.match(new RegExp(`^${label}: (.+)$`, 'm'))?.[1].trim() ?? null;
  return { ...entry, sectionNumber: field('Section'), policyNumber: field('Policy') };
}

export function loadFixture(path: string): BenchmarkItem[] {
  const file = JSON.parse(readFileSync(path, 'utf8')) as FixtureFile;
  if (file.schemaVersion !== FIXTURE_SCHEMA_VERSION) throw new Error(`${path}: unsupported fixture schema ${file.schemaVersion}`);
  return file.items.map(({ sourceRefs, ...item }) => ({
    ...item,
    sources: sourceRefs.map(ref => {
      if (!file.sources[ref]) throw new Error(`${path}: ${item.id} names a missing source ${ref}`);
      return toSourceEntry(file.sources[ref]);
    }),
  }));
}

// ── Selection from stored evaluation results ────────────────────────────────

interface Triple {
  run: StoredRun;
  row: StoredRow;
  answer: string;
  scores: StoredScores;
  sources: StoredSource[];
}

/**
 * Stored rows that can be replayed: an answer-level row with evidence, a
 * non-empty answer, no agent error, a judge score and an answer that was not
 * withheld. This is the inventory of the October 2026 review (finding
 * r2-critic-stored-run-incidence-04): its 1,693 triples less the 17 withheld.
 */
export function replayableTriples(runs: StoredRun[]): Triple[] {
  const triples: Triple[] = [];
  for (const run of runs) {
    for (const row of run.rows) {
      const sources = row.agent_evidence?.sources ?? [];
      const answer = row.agent_answer ?? '';
      if (!sources.length || !answer.trim() || row.agent_error) continue;
      if (!row.scores || row.scores.overall == null) continue;
      if (row.verifier?.outcome?.status === 'withheld') continue;
      triples.push({ run, row, answer, scores: row.scores, sources });
    }
  }
  return triples;
}

/** Judged bad: the judge scored factual accuracy or hallucination 1 or less (of 3). */
export function isJudgedBad(scores: StoredScores): boolean {
  const low = (score: number | null | undefined) => typeof score === 'number' && score <= 1;
  return low(scores.factual_accuracy) || low(scores.hallucination);
}

/** Judged clean: 3 of 3 on factual accuracy, hallucination and overall. */
export function isJudgedClean(scores: StoredScores): boolean {
  return scores.factual_accuracy === 3 && scores.hallucination === 3 && scores.overall === 3;
}

/**
 * True when the deterministic layer alone would let the stored answer through
 * to the model today: no marker, no unknown link or quotation, and no cited
 * section text dropped by the evidence budget. The seeded arm uses only such
 * answers, so that a withheld seeded answer is the model's doing.
 */
export function passesDeterministicChecks(answer: string, sources: SourceEntry[]): boolean {
  if (VERIFIER_MARKER.test(answer)) return false;
  if (validateAnswerUrls(answer, sources).unknownUrls.length || validateAnswerQuotes(answer, sources).unknownQuotes.length) return false;
  const evidence = buildSourceText(sources, answer);
  return !evidence.citedBodyDropped && !evidence.findingDropped;
}

export const JUDGED_BAD_SELECTION = 'Every replayable stored row (answer-level result, evidence present, non-empty answer, no agent error, '
  + 'judge score present, not withheld) whose judge score for factual_accuracy or hallucination is 1 or less, over all result files '
  + 'under packages/pipeline/data/eval-results including milestones/, with byte-identical files counted once.';

export const CLEAN_SAMPLE_SELECTION = 'From the July 2026 result files (advisory verifier, no enforced gate): for each question, the latest '
  + 'replayable row the judge scored 3 on factual_accuracy, hallucination and overall, whose stored answer has no verifier marker and '
  + 'passes today\'s deterministic link, quotation and evidence-budget checks against its stored evidence.';

export function selectJudgedBad(runs: StoredRun[]): Triple[] {
  return replayableTriples(runs).filter(({ scores }) => isJudgedBad(scores));
}

export function selectCleanSample(runs: StoredRun[]): Triple[] {
  const latest = new Map<string, Triple>();
  const july = replayableTriples(runs)
    .filter(({ run }) => /^2026-07-/.test(run.file))
    .sort((a, b) => a.run.file.localeCompare(b.run.file));
  for (const triple of july) {
    if (!isJudgedClean(triple.scores)) continue;
    if (!passesDeterministicChecks(triple.answer, triple.sources.map(toSourceEntry))) continue;
    latest.set(triple.row.id, triple);
  }
  return [...latest.values()].sort((a, b) => a.row.id.localeCompare(b.row.id));
}

export function itemId(triple: Triple): string {
  return `${triple.run.file}#${triple.row.id}`;
}

export function buildFixtureFile(set: FixtureFile['set'], selection: string, triples: Triple[]): FixtureFile {
  const sources: Record<string, StoredSource> = {};
  const items = triples.map((triple): FixtureItem => {
    const { run, row, answer, scores } = triple;
    const sourceRefs = triple.sources.map(source => {
      const stored: StoredSource = { toolName: source.toolName, key: source.key, text: source.text, ...(source.link ? { link: source.link } : {}) };
      const ref = createHash('sha256').update(JSON.stringify(stored)).digest('hex').slice(0, 16);
      sources[ref] = stored;
      return ref;
    });
    return {
      id: itemId(triple),
      runFile: run.file,
      questionId: row.id,
      question: row.question,
      answer,
      sourceRefs,
      judge: {
        factual_accuracy: scores.factual_accuracy ?? null, completeness: scores.completeness ?? null,
        hallucination: scores.hallucination ?? null, citation_quality: scores.citation_quality ?? null,
        overall: scores.overall ?? null, explanation: scores.explanation ?? '',
      },
      stored: {
        gitSha: (run.config.implementation_commit ?? run.config.git_sha ?? null) as string | null,
        verifierModel: row.verifier?.verifier_model ?? null,
        verifierOutcome: row.verifier?.outcome?.status ?? 'advisory',
        hasMarker: VERIFIER_MARKER.test(answer),
      },
    };
  });
  return { schemaVersion: FIXTURE_SCHEMA_VERSION, set, selection, sources, items };
}

// ── Labels ───────────────────────────────────────────────────────────────────

export const LABELS = ['unconfirmed', 'confirmed-bad', 'not-bad'] as const;
export type Label = (typeof LABELS)[number];
export type LabelFile = Record<string, { label: Label; note: string }>;

/** Labels for the judged-bad set. Every item must have one; a person sets it. */
export function loadLabels(path: string, items: BenchmarkItem[]): Map<string, Label> {
  const file = JSON.parse(readFileSync(path, 'utf8')) as LabelFile;
  const labels = new Map<string, Label>();
  for (const item of items) {
    const label = file[item.id]?.label;
    if (!label || !LABELS.includes(label)) throw new Error(`${path}: ${item.id} needs a label, one of ${LABELS.join(', ')}`);
    labels.set(item.id, label);
  }
  return labels;
}
