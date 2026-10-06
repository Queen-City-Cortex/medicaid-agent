import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveCoverageScope } from '@nc-medicaid/policy-corpus';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The model call is the only part replaced: run.ts binds its default `verify`
// to this module's `verifyAnswer`, so everything that builds and prints the
// blocks below is the code the CLI runs.
vi.mock('../src/processors/verifier/verify.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/processors/verifier/verify.js')>()),
  verifyAnswer: vi.fn(async () => ({
    supported: true, relevant: true, citationsComplete: true,
    unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '',
  })),
}));

import { emitAnswer, emitGateRefusal, verifyCliAnswer, type CliRuntimeRecord } from '../src/cli-verification.js';
import { extractSourcesFromToolResults, type ToolResultRecord } from '../src/processors/hallucination-verifier.js';

/**
 * The agent CLI's stdout blocks, as the answer evaluation parses them
 * (`packages/pipeline/src/pipeline/eval/levels/answer.py`). Each file under
 * `tests/fixtures/cli-stdout` is regenerated here from the CLI's printing code
 * and compared byte for byte; `packages/pipeline/tests/test_cli_stdout_contract.py`
 * parses the same files with the production parser. One file per case,
 * because the parser reads the first marker of each kind.
 */
const GOLDEN_DIR = fileURLToPath(new URL('./fixtures/cli-stdout/', import.meta.url));
const UPDATE = process.env.UPDATE_CLI_STDOUT_GOLDEN === '1';
const REGENERATE = 'UPDATE_CLI_STDOUT_GOLDEN=1 npx vitest run tests/cli-stdout-golden.test.ts';

// What cli.ts records from the assembled agent. Written out here; the real
// order is pinned against the running CLI by tests/cli-entry.test.ts.
const RUNTIME: CliRuntimeRecord = {
  input_processors: [
    'message-length-guard', 'coverage-boundary', 'scope-gate', 'openai-responses-dedup',
    'answer-frame-prefetch', 'answer-frame-planning', 'token-limiter',
  ],
  runtime_options: { memory: false, prompt_injection_detector: false },
};

// Values that differ between machines and runs, set to fixed ones so the
// comparison covers every field: the models come from the environment and the
// latency from the clock.
const FIXED: Record<string, unknown> = {
  latency_ms: 1234,
  verifier_model: 'golden-verifier-model',
  agent_model: 'golden-agent-model',
  agent_reasoning_effort: 'medium',
};

function normalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalise);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, key in FIXED ? FIXED[key] : normalise(entry)]));
}

/** Everything `run` prints through console.log, as the bytes stdout receives. */
async function captureStdout(run: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(' ')); });
  await run();
  vi.restoreAllMocks();
  return lines
    .map(line => (line.startsWith('{') ? JSON.stringify(normalise(JSON.parse(line))) : line))
    .map(line => `${line}\n`)
    .join('');
}

function compareWithGolden(name: string, actual: string): void {
  const path = `${GOLDEN_DIR}${name}`;
  if (UPDATE) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  const expected = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (expected !== actual) {
    expect.soft(actual).toBe(expected);
    throw new Error(
      `The CLI's stdout blocks no longer match tests/fixtures/cli-stdout/${name}. ` +
      `If the change is intended, regenerate with \`${REGENERATE}\`, then update ` +
      'packages/pipeline/tests/test_cli_stdout_contract.py and the parser in eval/levels/answer.py to match.',
    );
  }
}

const SECTION_URL = 'https://integration.test/cli-golden/1a-14.pdf';
const CITATION = `[Clinical Coverage Policy 1A-14](${SECTION_URL})`;
const DOCUMENT = {
  id: 'test:cli-golden:doc:1a-14', title: 'Clinical Coverage Policy 1A-14', documentType: 'clinical_policy',
  policyNumber: 'TEST-CLI-1A-14', effectiveDate: '2025-01-01', url: SECTION_URL, citationLink: CITATION,
  status: 'current', authorityTier: 'authoritative', answerRole: 'coverage', sourceFormat: 'pdf', answerReady: true,
  corpusBucket: null, variantGroup: null, variantDate: null, retrievalReady: true,
};
const SECTION_TEXT = 'Medicaid covers the procedure when it is medically necessary and prior approval has been obtained.';
// Tool outputs as Mastra hands them to the CLI's onStepFinish; no graph is read.
const TOOL_RESULTS: ToolResultRecord[] = [
  {
    toolName: 'lookupPolicy', toolCallId: 'call-lookup',
    result: { documents: [{ ...DOCUMENT, sections: [{ id: 'sec:test:cli-golden:doc:1a-14:3.1', number: '3.1', title: 'When the Procedure Is Covered' }], sectionCount: 1, sectionsTruncated: false }] },
  },
  {
    toolName: 'getSection', toolCallId: 'call-section',
    result: { section: {
      id: 'sec:test:cli-golden:doc:1a-14:3.1', title: 'When the Procedure Is Covered', sectionNumber: '3.1',
      content: SECTION_TEXT, contentOffset: 0, totalChars: SECTION_TEXT.length, nextOffset: null, contentNote: null,
      effectiveDate: '2025-01-01', lastRevised: null, federalRegisterCite: null,
      documentId: DOCUMENT.id, documentTitle: DOCUMENT.title, documentType: 'clinical_policy', policyNumber: DOCUMENT.policyNumber,
      url: SECTION_URL, citationLink: CITATION,
    } },
  },
];

afterEach(() => vi.restoreAllMocks());

describe('the CLI stdout blocks the answer evaluation parses', () => {
  it('prints evidence, verifier telemetry and the answer for a released answer', async () => {
    const draft = `Medicaid covers the procedure when it is medically necessary and prior approval has been obtained (${CITATION}).`;
    let released = '';
    const stdout = await captureStdout(async () => {
      released = await verifyCliAnswer({
        question: 'When does clinical coverage policy 1A-14 cover the procedure?',
        answerText: draft,
        getSources: () => extractSourcesFromToolResults(TOOL_RESULTS),
        runtime: RUNTIME,
      });
      emitAnswer(released);
    });
    // The mocked model passed the draft, so the draft itself was released.
    expect(released).toBe(draft);
    compareWithGolden('released-answer.txt', stdout);
  });

  it('prints a withheld verifier block naming the gate for an input-gate refusal', async () => {
    const question = 'What MAGI income table and limits apply in February 2025?';
    const notice = resolveCoverageScope(question)?.notice;
    expect(notice).toEqual(expect.any(String));
    const stdout = await captureStdout(async () => {
      // The tripwire the coverage boundary raises for this question.
      emitAnswer(emitGateRefusal(question, {
        processorId: 'coverage-boundary',
        metadata: { code: 'coverage-limitation', userMessage: notice },
      }, RUNTIME));
    });
    compareWithGolden('gate-refusal.txt', stdout);
  });

  it('does not rewrite the golden files unless asked', () => {
    expect(UPDATE, `unset UPDATE_CLI_STDOUT_GOLDEN after regenerating (${REGENERATE})`).toBe(false);
  });
});
