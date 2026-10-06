import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildFixtureFile, loadFixture, loadLabels, passesDeterministicChecks, replayableTriples, selectCleanSample, selectJudgedBad,
  toSourceEntry, type StoredRun,
} from '../../scripts/verifier-benchmark/fixture.js';
import { loadStoredRuns } from '../../scripts/verifier-benchmark/build-fixture.js';
import { renderReviewSheet, reviewRow, statedDefect } from '../../scripts/verifier-benchmark/review-sheet.js';

const DIR = fileURLToPath(new URL('../fixtures/verifier-benchmark/', import.meta.url));

const LINK = 'https://example.test/policy';
const source = { toolName: 'getSection', key: 'sec:1', text: 'ID: sec:1\nSection: 3.2\nPolicy: 8C\nContent:\nCovered when medically necessary.', link: LINK };
const row = (id: string, scores: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id, question: `Question ${id}?`, agent_answer: `Covered [Policy 8C § 3.2](${LINK}).`, agent_error: null,
  scores: { factual_accuracy: 3, completeness: 3, hallucination: 3, citation_quality: 3, overall: 3, explanation: 'Fine.', ...scores },
  agent_evidence: { sources: [source] }, verifier: { verifier_model: 'gpt-5.4-mini' }, ...extra,
});
const run = (file: string, rows: Array<Record<string, any>>): StoredRun => ({ file, config: { git_sha: 'abc1234' }, rows: rows as StoredRun['rows'] });

describe('selection from stored evaluation results', () => {
  const runs = [
    run('2026-06-12T00:00:00_answer.json', [
      row('q-1', { factual_accuracy: 1 }),
      row('q-2', { hallucination: 1 }),
      row('q-3', { hallucination: 0 }, { verifier: { outcome: { status: 'withheld' } } }),
      row('q-4', { factual_accuracy: 0 }, { agent_error: 'Agent timed out' }),
      row('q-5', { factual_accuracy: 0 }, { agent_evidence: { sources: [] } }),
      row('q-6', { overall: null, factual_accuracy: null, hallucination: null }),
      row('q-7', { factual_accuracy: 2, hallucination: 2 }),
      row('q-8', {}),
    ]),
    run('2026-07-08T00:00:00_answer.json', [row('h-1', {}), row('h-2', {}, { agent_answer: `Covered [unverified: maybe] [Policy 8C § 3.2](${LINK}).` }), row('h-3', {}, { agent_answer: 'Covered [Policy 8C](https://example.test/unknown).' })]),
    run('2026-07-09T00:00:00_answer.json', [row('h-1', {}, { agent_answer: `Later answer [Policy 8C § 3.2](${LINK}).` }), row('h-4', { overall: 2 })]),
  ];

  it('keeps rows with evidence, an answer, a judge score and a released answer', () => {
    expect(replayableTriples(runs).map(triple => triple.row.id)).toEqual(['q-1', 'q-2', 'q-7', 'q-8', 'h-1', 'h-2', 'h-3', 'h-1', 'h-4']);
  });

  it('judged bad is factual accuracy or hallucination of 1 or less', () => {
    expect(selectJudgedBad(runs).map(triple => triple.row.id)).toEqual(['q-1', 'q-2']);
  });

  it('the clean sample is the latest July row per question that is judged clean and passes the deterministic checks', () => {
    const sample = selectCleanSample(runs);
    expect(sample.map(triple => `${triple.run.file}#${triple.row.id}`)).toEqual(['2026-07-09T00:00:00_answer.json#h-1']);
  });

  it('pools identical sources and round-trips through a fixture file', () => {
    const file = buildFixtureFile('judged_bad', 'rule', selectJudgedBad(runs));
    expect(Object.keys(file.sources)).toHaveLength(1);
    expect(file.items.map(item => item.id)).toEqual(['2026-06-12T00:00:00_answer.json#q-1', '2026-06-12T00:00:00_answer.json#q-2']);
    expect(file.items[0]).toMatchObject({ judge: { factual_accuracy: 1 }, stored: { gitSha: 'abc1234', verifierModel: 'gpt-5.4-mini', verifierOutcome: 'advisory', hasMarker: false } });
  });

  it('recovers the section and policy numbers the stored rows only hold as text', () => {
    expect(toSourceEntry(source)).toMatchObject({ sectionNumber: '3.2', policyNumber: '8C', link: LINK });
    // A listing names sections without their text and must vouch for none.
    expect(toSourceEntry({ toolName: 'lookupPolicy', key: 'doc', text: 'Section: 3.2\nPolicy: 8C' })).not.toHaveProperty('sectionNumber');
    // "Section:" inside the body is content, not the header.
    expect(toSourceEntry({ toolName: 'getSection', key: 's', text: 'ID: s\nContent:\nSection: 9.9 says otherwise.' }).sectionNumber).toBeNull();
  });
});

describe('loadStoredRuns', () => {
  it('reads answer-level result files in every subdirectory and counts identical copies once', () => {
    const root = mkdtempSync(join(tmpdir(), 'verifier-benchmark-'));
    try {
      const answerRun = JSON.stringify({ level: 'answer', config: { git_sha: 'abc1234' }, per_question: [row('q-1', {})] });
      mkdirSync(join(root, 'milestones'));
      writeFileSync(join(root, '2026-07-08T00:00:00_answer.json'), answerRun);
      writeFileSync(join(root, 'milestones', 'copy.json'), answerRun);
      writeFileSync(join(root, '2026-07-08T00:00:00_retrieval.json'), JSON.stringify({ level: 'retrieval', per_question: [] }));
      writeFileSync(join(root, 'dataset.json'), JSON.stringify([{ id: 'q-1' }]));
      writeFileSync(join(root, 'broken.json'), '{');
      const runs = loadStoredRuns(root);
      expect(runs.map(stored => stored.file)).toEqual(['2026-07-08T00:00:00_answer.json']);
      expect(runs[0].rows[0].id).toBe('q-1');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('committed fixtures', () => {
  const bad = loadFixture(`${DIR}judged-bad.json`);
  const clean = loadFixture(`${DIR}clean-sample.json`);

  it('match their recorded checksums', () => {
    for (const line of readFileSync(`${DIR}SHA256SUMS`, 'utf8').trim().split('\n')) {
      const [sum, name] = line.split(/\s+/);
      expect(createHash('sha256').update(readFileSync(`${DIR}${name}`)).digest('hex'), name).toBe(sum);
    }
  });

  it('hold the 64 judged-bad answers of the October 2026 review, over 26 questions', () => {
    expect(bad).toHaveLength(64);
    expect(new Set(bad.map(item => item.questionId)).size).toBe(26);
    expect(new Set(bad.map(item => item.id)).size).toBe(64);
    for (const item of bad) {
      expect(item.judge.factual_accuracy! <= 1 || item.judge.hallucination! <= 1, item.id).toBe(true);
      expect(item.answer.trim() && item.sources.length, item.id).toBeTruthy();
    }
    // Both stored wrong-policy answers the review singled out.
    expect(bad.filter(item => item.questionId === 'h-012').map(item => item.runFile)).toEqual(expect.arrayContaining(['2026-06-12T17:43:43_answer.json', '2026-06-12T21:32:14_answer.json']));
  });

  it('label every judged-bad answer, and no label is taken as confirmed until a person sets it', () => {
    const labels = loadLabels(`${DIR}labels.json`, bad);
    expect(labels.size).toBe(64);
    expect(() => loadLabels(`${DIR}labels.json`, [{ ...bad[0], id: 'missing' }])).toThrow('missing needs a label');
  });

  it('give the seeded arm clean answers that reach the model: one per question, no deterministic finding', () => {
    expect(clean.length).toBeGreaterThanOrEqual(40);
    expect(new Set(clean.map(item => item.questionId)).size).toBe(clean.length);
    for (const item of clean) {
      expect(item.judge, item.id).toMatchObject({ factual_accuracy: 3, hallucination: 3, overall: 3 });
      expect(passesDeterministicChecks(item.answer, item.sources), item.id).toBe(true);
    }
  });

  it('have a review sheet with one row per judged-bad answer, generated from the fixture', () => {
    expect(readFileSync(`${DIR}review-sheet.md`, 'utf8')).toBe(renderReviewSheet(bad));
    expect(renderReviewSheet(bad).match(/^### /gm)).toHaveLength(64);
  });
});

describe('review sheet rows', () => {
  it('quotes the judge sentences that state a defect', () => {
    expect(statedDefect('The answer is right about coverage. However, the 45-day limit is not supported by the evidence.'))
      .toBe('However, the 45-day limit is not supported by the evidence.');
    expect(statedDefect('All good here.')).toBe('All good here.');
  });

  it('pairs the defect with the closest answer sentence and evidence line, and reports what the deterministic checks find', () => {
    const [item] = loadFixtureFromRows();
    const sheetRow = reviewRow(item);
    expect(sheetRow.answerSentence).toContain('45 days of therapeutic leave');
    expect(sheetRow.evidenceExcerpt).toEqual({ key: 'sec:2', text: 'A resident may take up to 60 days of therapeutic leave in a calendar year.' });
    expect(sheetRow.checks).toEqual(['link not in the stored evidence: https://example.test/unknown']);
  });
});

function loadFixtureFromRows() {
  const sources = [
    { toolName: 'getSection', key: 'sec:2', text: 'ID: sec:2\nSection: 5.1\nContent:\nA resident may take up to 60 days of therapeutic leave in a calendar year.\nThe facility must record each absence in the resident record.', link: LINK },
  ];
  return [{
    id: 'run#h-012', runFile: 'run', questionId: 'h-012', question: 'How much therapeutic leave?',
    answer: `Leave is available to residents of these facilities.\nA resident may take up to 45 days of therapeutic leave [Policy 8D-2 § 5.1](${LINK}).\nSee also [the form](https://example.test/unknown).`,
    judge: { factual_accuracy: 0, completeness: 1, hallucination: 2, citation_quality: 1, overall: 1, explanation: 'The answer names the facility types. However, it states 45 days of therapeutic leave, which is incorrect: the evidence says 60 days.' },
    stored: { gitSha: 'b12daf8', verifierModel: 'gpt-5.4-mini', verifierOutcome: 'advisory', hasMarker: false },
    sources: sources.map(toSourceEntry),
  }];
}
